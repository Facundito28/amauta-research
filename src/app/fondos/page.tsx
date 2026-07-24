/**
 * Landing de FCIs — buscador + rankings.
 * Fuente: fonditos.ar (MCP) · buscar_fondos + ranking_fondos.
 */
import Link from "next/link";
import { fonditos } from "@/lib/fonditos";
import { fmtNumber, fmtPercent, fmtReturn } from "@/lib/utils/format";
import FciShell from "@/components/fci/FciShell";
import { Section, ErrorBox, EmptyBox, RankBadge, CategoryChip } from "@/components/fci/ui";
import {
  PERIODOS,
  CATEGORIAS,
  CLASES,
  periodoLabel,
  compactArs,
  titleCase,
} from "@/lib/fci/constants";

/** Etiqueta corta para el segmented control de período. */
const PERIODO_CORTO: Record<string, string> = {
  "1d": "1D",
  "7d": "7D",
  "30d": "30D",
  "90d": "90D",
  ytd: "YTD",
  "1y": "1A",
};
import type { RankingFondos, BuscarFondos } from "@/lib/fci/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const metadata = {
  title: "Fondos · Monitor FCIs · Amauta",
  description: "Buscador y rankings de Fondos Comunes de Inversión argentinos.",
};

interface SP {
  q?: string;
  periodo?: string;
  categoria?: string;
  clase?: string;
  moneda?: string;
  subcategoria?: string;
}

export default async function FondosPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const periodo = PERIODOS.some((p) => p.value === sp.periodo) ? sp.periodo! : "30d";
  const categoria = (sp.categoria ?? "").trim();
  // Clase B por defecto: deduplica las clases (A/B/C/E) del mismo fondo, así el
  // ranking muestra ~un fondo por fila y entra prácticamente todo el universo.
  // "todas" = ver todas las clases.
  const claseRaw = (sp.clase ?? "B").trim();
  const clase = claseRaw === "todas" ? "" : claseRaw;
  const moneda = (sp.moneda ?? "").trim();
  const subcategoria = (sp.subcategoria ?? "").trim();

  // ranking_fondos está capeado en 200 filas por consulta (límite de fonditos).
  // Para cubrir el universo con "Todas", pedimos el ranking de cada categoría en
  // paralelo y los unimos (hasta ~200 por categoría). Con una categoría puntual,
  // una sola consulta alcanza. Cacheamos 1h para no quemar la cuota de la key.
  const baseArgs: Record<string, unknown> = { periodo, limite: 200 };
  if (clase) baseArgs.clase = clase;

  const rankingP: Promise<RankingFondos | null> = categoria
    ? fonditos<RankingFondos>("ranking_fondos", { ...baseArgs, categoria }, { revalidate: 3600 }).catch(() => null)
    : Promise.all(
        CATEGORIAS.map((cat) =>
          fonditos<RankingFondos>("ranking_fondos", { ...baseArgs, categoria: cat }, { revalidate: 3600 }).catch(
            () => null,
          ),
        ),
      ).then((parts) => {
        const ok = parts.filter(Boolean) as RankingFondos[];
        if (ok.length === 0) return null;
        const merged = ok
          .flatMap((p) => p.rows)
          .sort((a, b) => (b.return_pct ?? -1e9) - (a.return_pct ?? -1e9));
        return { ...ok[0], rows: merged, count: merged.length, category: "TODOS" } as RankingFondos;
      });

  const [ranking, search] = await Promise.all([
    rankingP,
    q
      ? fonditos<BuscarFondos>("buscar_fondos", { q, limite: 12 }).catch(() => null)
      : Promise.resolve(null),
  ]);

  // Filas que devuelve la fuente (ya filtradas por categoría/clase en el server).
  const allRows = ranking?.rows ?? [];
  // Opciones de los filtros client-side, derivadas de los datos disponibles.
  const monedasDisponibles = [...new Set(allRows.map((r) => r.moneda).filter(Boolean))] as string[];
  const subcatsDisponibles = [...new Set(allRows.map((r) => r.subcategoria).filter(Boolean))].sort() as string[];
  // Aplicamos moneda + subcategoría en el cliente.
  const rows = allRows.filter(
    (r) =>
      (!moneda || r.moneda === moneda) &&
      (!subcategoria || r.subcategoria === subcategoria),
  );
  const best = rows[0];
  // Máximo retorno positivo → escala de la barra de magnitud del ranking.
  const maxRet = rows.reduce((m, r) => Math.max(m, r.return_pct ?? 0), 0) || 1;

  const buildHref = (ov: Partial<SP>) => {
    const merged: SP = { q, periodo, categoria, clase: claseRaw, moneda, subcategoria, ...ov };
    const p = new URLSearchParams();
    if (merged.q) p.set("q", merged.q);
    if (merged.periodo && merged.periodo !== "30d") p.set("periodo", merged.periodo);
    if (merged.categoria) p.set("categoria", merged.categoria);
    // "B" es el default → no ensuciamos la URL; sí persistimos A/C/todas.
    if (merged.clase && merged.clase !== "B") p.set("clase", merged.clase);
    if (merged.moneda) p.set("moneda", merged.moneda);
    if (merged.subcategoria) p.set("subcategoria", merged.subcategoria);
    const qs = p.toString();
    return qs ? `/fondos?${qs}` : "/fondos";
  };

  return (
    <FciShell
      kicker="Mercado argentino · fonditos · CAFCI"
      title="Fondos Comunes de Inversión"
      subtitle="Buscá cualquier fondo o explorá los rankings de rendimiento por período, categoría y clase. Datos oficiales con actualización diaria."
      kpis={[
        {
          label: "Mejor del período",
          value: best ? fmtReturn(best.return_pct, 2).text : "—",
          sub: best?.fondo,
          highlight: true,
        },
        {
          label: "Fondos rankeados",
          value: ranking ? String(rows.length) : "—",
          sub:
            moneda || subcategoria
              ? [moneda, subcategoria && titleCase(subcategoria)].filter(Boolean).join(" · ")
              : categoria
                ? titleCase(categoria)
                : "todas las categorías",
        },
        {
          label: "Período",
          value: periodoLabel(periodo),
          sub: ranking ? `${ranking.from} → ${ranking.to}` : undefined,
        },
        {
          label: "Categoría",
          value: categoria ? titleCase(categoria) : "Todas",
          sub: moneda ? `moneda ${moneda}` : undefined,
        },
      ]}
    >
      {/* ── Buscador ──────────────────────────────────────────────────── */}
      <form method="get" action="/fondos" className="mb-6">
        {periodo !== "30d" && <input type="hidden" name="periodo" value={periodo} />}
        {categoria && <input type="hidden" name="categoria" value={categoria} />}
        {clase && <input type="hidden" name="clase" value={clase} />}
        <label
          htmlFor="q"
          className="block text-[11px] font-extrabold uppercase tracking-[0.14em] text-amauta-yellow mb-1.5"
        >
          Buscar fondo
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="q"
            name="q"
            type="text"
            defaultValue={q}
            placeholder="Ej: Galileo Renta Fija, Delta Pesos, Mercado Pago…"
            className="flex-1 rounded-sm border border-brand-border bg-surface-raised text-text-primary px-4 py-3 text-sm font-medium placeholder:text-text-tertiary focus:outline-none focus:border-amauta-yellow focus:ring-2 focus:ring-amauta-yellow/30 transition-colors"
          />
          <button
            type="submit"
            className="rounded-sm bg-amauta-yellow text-amauta-dark font-extrabold uppercase tracking-wider text-xs px-6 py-3 hover:bg-amauta-yellow-hover transition-colors"
          >
            Buscar
          </button>
        </div>
      </form>

      {/* ── Resultados de búsqueda ────────────────────────────────────── */}
      {q && (
        <div className="mb-6">
          <Section
            title="Resultados de búsqueda"
            subtitle={search ? `${search.total} coincidencia${search.total === 1 ? "" : "s"} para “${q}”` : undefined}
          >
            {!search ? (
              <div className="p-4">
                <ErrorBox message="No se pudo ejecutar la búsqueda." />
              </div>
            ) : search.data.length === 0 ? (
              <EmptyBox
                title="Sin coincidencias"
                message={`No encontramos fondos que coincidan con “${q}”. Probá otro término.`}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="text-text-tertiary border-b border-brand-border">
                    <tr>
                      <Th className="text-left">Fondo</Th>
                      <Th className="text-left hidden sm:table-cell">Categoría</Th>
                      <Th className="text-right">VCP</Th>
                      <Th className="text-right">Patrimonio</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {search.data.map((r, i) => (
                      <tr
                        key={r.fondo}
                        className={`border-b border-brand-border hover:bg-surface-overlay transition-colors ${i % 2 ? "bg-white/[0.02]" : ""}`}
                      >
                        <td className="px-5 py-3">
                          <Link
                            href={`/fondo/${encodeURIComponent(r.fondo)}`}
                            className="font-bold text-text-primary hover:text-amauta-yellow transition-colors"
                          >
                            {r.fondo}
                          </Link>
                          <div className="mt-0.5 text-xs text-text-tertiary sm:hidden">
                            {titleCase(r.categoria)} · {r.moneda}
                          </div>
                        </td>
                        <td className="px-5 py-3 hidden sm:table-cell">
                          <CategoryChip categoria={r.categoria} />
                          <span className="ml-2 text-xs text-text-tertiary">{r.moneda}</span>
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums font-medium text-text-primary">{fmtNumber(r.vcp, 2)}</td>
                        <td className="px-5 py-3 text-right tabular-nums font-medium text-text-primary">{compactArs(r.patrimonio)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      )}

      {/* ── Filtros del ranking ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {/* Período: segmented control */}
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-text-tertiary">
            Período
          </span>
          <div className="inline-flex bg-surface-raised border border-brand-border rounded-lg p-[3px] gap-[2px]">
            {PERIODOS.map((p) => (
              <Link
                key={p.value}
                href={buildHref({ periodo: p.value })}
                className={`px-3 py-1.5 rounded-md text-xs font-bold tabular-nums transition-colors ${
                  periodo === p.value
                    ? "bg-amauta-yellow text-amauta-dark"
                    : "text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
                }`}
              >
                {PERIODO_CORTO[p.value] ?? p.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Moneda: segmented (client-side) */}
        {monedasDisponibles.length > 1 && (
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-text-tertiary">
              Moneda
            </span>
            <div className="inline-flex bg-surface-raised border border-brand-border rounded-lg p-[3px] gap-[2px]">
              <Link
                href={buildHref({ moneda: "" })}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                  !moneda ? "bg-amauta-yellow text-amauta-dark" : "text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
                }`}
              >
                Todas
              </Link>
              {[...monedasDisponibles].sort().map((mo) => (
                <Link
                  key={mo}
                  href={buildHref({ moneda: mo })}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold tabular-nums transition-colors ${
                    moneda === mo ? "bg-amauta-yellow text-amauta-dark" : "text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
                  }`}
                >
                  {mo}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Categoría / clase / subcategoría */}
        <form method="get" action="/fondos" className="flex flex-wrap items-end gap-2.5">
          {q && <input type="hidden" name="q" value={q} />}
          {periodo !== "30d" && <input type="hidden" name="periodo" value={periodo} />}
          {moneda && <input type="hidden" name="moneda" value={moneda} />}
          <FilterSelect id="categoria" label="Categoría" value={categoria} options={[...CATEGORIAS]} render={titleCase} />
          {subcatsDisponibles.length > 0 && (
            <FilterSelect id="subcategoria" label="Subcategoría" value={subcategoria} options={subcatsDisponibles} render={titleCase} />
          )}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="clase"
              className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-text-tertiary"
            >
              Clase
            </label>
            <select
              id="clase"
              name="clase"
              defaultValue={claseRaw}
              className="rounded-sm border border-brand-border bg-surface-overlay text-text-primary px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-amauta-yellow focus:ring-2 focus:ring-amauta-yellow/30 transition-colors min-w-[9rem] [color-scheme:dark]"
            >
              {CLASES.map((c) => (
                <option key={c} value={c}>
                  Clase {c}
                </option>
              ))}
              <option value="todas">Todas las clases</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded-md bg-surface-overlay border border-brand-border text-text-primary font-extrabold uppercase tracking-wider text-xs px-4 py-2.5 hover:border-amauta-yellow transition-colors"
          >
            Aplicar
          </button>
          {(categoria || subcategoria || moneda || claseRaw !== "B") && (
            <Link
              href={buildHref({ categoria: "", clase: "B", subcategoria: "", moneda: "" })}
              className="text-xs font-bold text-text-tertiary hover:text-amauta-yellow transition-colors py-2.5"
            >
              Limpiar
            </Link>
          )}
        </form>
      </div>

      {/* ── Tabla de ranking ──────────────────────────────────────────── */}
      <Section
        title="Ranking por rendimiento"
        subtitle={ranking ? `${periodoLabel(periodo)} · ${rows.length} fondos` : undefined}
      >
        {!ranking ? (
          <div className="p-4">
            <ErrorBox message="El ranking no está disponible en este momento." />
          </div>
        ) : rows.length === 0 ? (
          <EmptyBox icon="📊" title="Sin resultados" message="Probá con otra categoría o clase." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border/70">
                  <Th className="text-left w-16">#</Th>
                  <Th className="text-left">Fondo</Th>
                  <Th className="text-left hidden lg:table-cell">Categoría</Th>
                  <Th className="text-center hidden md:table-cell">Clase</Th>
                  <Th className="text-center hidden md:table-cell">Moneda</Th>
                  <Th className="text-right hidden lg:table-cell">VCP</Th>
                  <Th className="text-right">Rendimiento</Th>
                  <Th className="text-right hidden sm:table-cell">TNA</Th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 300).map((r, i) => {
                  const ret = fmtReturn(r.return_pct, 2);
                  const pos = (r.return_pct ?? 0) > 0;
                  const barW = pos ? Math.max(4, Math.min(100, (r.return_pct / maxRet) * 100)) : 0;
                  return (
                    <tr
                      key={r.fondo}
                      className="group border-b border-brand-border/60 hover:bg-surface-overlay transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <RankBadge n={i + 1} />
                      </td>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/fondo/${encodeURIComponent(r.fondo)}`}
                          className="font-bold text-text-primary group-hover:text-amauta-yellow transition-colors leading-snug"
                        >
                          {r.fondo}
                        </Link>
                        {/* Tags inline solo cuando las columnas propias están ocultas */}
                        <div className="flex items-center gap-2 mt-1 lg:hidden">
                          <CategoryChip categoria={r.categoria} />
                          {r.moneda && (
                            <span className="text-[11px] font-semibold text-text-tertiary md:hidden">
                              {r.moneda}
                            </span>
                          )}
                          {r.clase && (
                            <span className="text-[11px] text-text-tertiary md:hidden">· {r.clase}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        <CategoryChip categoria={r.categoria} />
                      </td>
                      <td className="px-5 py-3.5 text-center hidden md:table-cell tabular-nums font-medium text-text-secondary">
                        {r.clase ?? "—"}
                      </td>
                      <td className="px-5 py-3.5 text-center hidden md:table-cell font-medium text-text-secondary">
                        {r.moneda ?? "—"}
                      </td>
                      <td className="px-5 py-3.5 text-right hidden lg:table-cell tabular-nums text-text-secondary">
                        {fmtNumber(r.vcp_to, 2)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-3">
                          {pos && (
                            <div className="hidden lg:block h-1.5 rounded-full bg-surface-overlay w-28 overflow-hidden">
                              <span
                                className="block h-full rounded-full bg-emerald-400/80"
                                style={{ width: `${barW}%` }}
                              />
                            </div>
                          )}
                          <span
                            className={`text-[15px] tabular-nums text-right inline-block min-w-[5.5rem] ${ret.colorClass}`}
                          >
                            {ret.text}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right hidden sm:table-cell tabular-nums text-xs font-bold text-text-secondary">
                        {fmtPercent(r.tna_pct, 1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length > 300 && (
              <p className="px-5 py-3.5 border-t border-brand-border/60 text-xs text-text-tertiary">
                Mostrando los primeros <strong className="text-text-secondary">300</strong> de{" "}
                <strong className="text-text-secondary">{rows.length}</strong> fondos (ordenados por
                rendimiento). Usá los filtros de categoría, subcategoría o moneda para acotar.
              </p>
            )}
          </div>
        )}
      </Section>

      <p className="mt-4 text-xs text-text-tertiary leading-relaxed max-w-3xl">
        <strong className="text-text-secondary">Retorno:</strong> variación del VCP en el período ·{" "}
        <strong className="text-text-secondary">TNA:</strong> tasa nominal anualizada (para períodos
        cortos puede resultar poco representativa). Fuente: fonditos · CAFCI. Este material es informativo y no
        constituye recomendación de inversión.
      </p>
    </FciShell>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-5 py-3 font-extrabold uppercase tracking-[0.11em] text-[10px] text-text-tertiary whitespace-nowrap ${className}`}>
      {children}
    </th>
  );
}

function FilterSelect({
  id,
  label,
  value,
  options,
  render,
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  render?: (s: string) => string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-text-tertiary"
      >
        {label}
      </label>
      <select
        id={id}
        name={id}
        defaultValue={value}
        className="rounded-sm border border-brand-border bg-surface-overlay text-text-primary px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-amauta-yellow focus:ring-2 focus:ring-amauta-yellow/30 transition-colors min-w-[9rem] [color-scheme:dark]"
      >
        <option value="">Todas</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {render ? render(o) : o}
          </option>
        ))}
      </select>
    </div>
  );
}
