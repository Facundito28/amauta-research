/**
 * Cliente del servidor MCP de fonditos.ar (fuente de datos de FCIs).
 *
 * fonditos expone ~23 "tools" (funds/flow/commercial/aum/holdings) vía MCP
 * sobre HTTP. Soporta llamadas STATELESS: alcanza con POST tools/call + Bearer,
 * sin handshake de sesión. La respuesta viene como SSE (event: message / data: {...})
 * y trae `result.structuredContent` (JSON ya parseado) — eso devolvemos.
 *
 * Server-only: usa FONDITOS_API_KEY (secreta). Nunca importar desde el cliente.
 */

// Endpoint por defecto: el Cloudflare Worker que fonditos habilitó para
// server-to-server. El endpoint directo (mcp.fonditos.ar) queda detrás de Bot
// Fight Mode y desafía a las IPs de datacenter de Vercel (403 "Just a moment"),
// y su plan de Cloudflare no permite exceptuarlo por WAF. Este Worker evita esa
// capa. Se puede override con FONDITOS_MCP_URL (p.ej. si migran a key
// institucional, que sí pasa Cloudflare en el endpoint directo).
const MCP_URL =
  process.env.FONDITOS_MCP_URL ||
  "https://fonditos-mcp.gonzagiardino.workers.dev/mcp";
const API_KEY = process.env.FONDITOS_API_KEY;

export class FonditosError extends Error {}

export async function fonditos<T = unknown>(
  tool: string,
  args: Record<string, unknown> = {},
  opts: { revalidate?: number } = {}
): Promise<T> {
  if (!API_KEY) throw new FonditosError("Falta FONDITOS_API_KEY");

  // Caché: por defecto NO cacheamos (`no-store`). El Data Cache de Vercel
  // sobrevive a los redeploys y guarda también respuestas de error (p.ej. un
  // 401 con la key vieja), así que un fallo transitorio "envenena" la vista por
  // hasta `revalidate` segundos incluso después de arreglar la key. Tráfico
  // interno bajo → preferimos dato fresco. Un caller puede pedir cache pasando
  // `opts.revalidate` explícito.
  const cacheOpt = opts.revalidate
    ? { next: { revalidate: opts.revalidate } }
    : { cache: "no-store" as const };

  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      // fonditos acepta ambas formas server-to-server. Desde los servidores de
      // Vercel el gate rechazaba (401) si solo iba `Authorization: Bearer`;
      // mandamos también `X-API-Key` (la alternativa que ellos confirmaron que
      // ya funcionaba desde Vercel). Belt-and-suspenders: si una variante del
      // gate falla, la otra pasa.
      Authorization: `Bearer ${API_KEY}`,
      "X-API-Key": API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: tool, arguments: args },
    }),
    ...cacheOpt,
  });

  if (!res.ok) {
    let errBody = "";
    try {
      errBody = (await res.text()).slice(0, 200);
    } catch {
      /* ignore */
    }
    console.error(`[fonditos] ${tool} → HTTP ${res.status} | ${errBody}`);
    throw new FonditosError(`${tool}: HTTP ${res.status}`);
  }

  const raw = await res.text();
  // La respuesta es SSE: buscamos la línea `data: {...}` con el JSON-RPC.
  const dataLine = raw
    .split(/\r?\n/)
    .find((l) => l.startsWith("data:"));
  const payload = dataLine ? dataLine.slice(5).trim() : raw;

  let json: {
    error?: { message?: string };
    result?: {
      isError?: boolean;
      structuredContent?: unknown;
      content?: Array<{ type: string; text?: string }>;
    };
  };
  try {
    json = JSON.parse(payload);
  } catch {
    throw new FonditosError(`${tool}: respuesta no parseable`);
  }

  if (json.error) throw new FonditosError(`${tool}: ${json.error.message}`);
  const result = json.result;
  if (result?.isError) {
    throw new FonditosError(`${tool}: ${result.content?.[0]?.text ?? "error"}`);
  }

  if (result?.structuredContent !== undefined) return result.structuredContent as T;
  const txt = result?.content?.[0]?.text;
  if (txt) {
    try {
      return JSON.parse(txt) as T;
    } catch {
      return txt as unknown as T;
    }
  }
  return result as unknown as T;
}
