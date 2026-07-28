// Tablero de Financiamiento — nativo en el portal.
// Reemplaza la planilla de Google + Apps Script: los datos viven en el Supabase
// del portal (tabla financiamiento_gestiones) y los clientes salen del CRM.

import { ensureSession, getSession } from "./portal-supabase";
import clientesRaw from "@/data/clientesFinanciamiento.json";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const REST = `${SUPABASE_URL}/rest/v1`;
const TABLE = "financiamiento_gestiones";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export type Flujo = "PROCESO" | "APROBADA" | "HISTORICO";

export interface Gestion {
  id: number;
  flujo: Flujo;
  cliente: string;
  cliente_nuevo: boolean;
  asesor: string | null;
  operacion: string | null;
  entidad: string | null;
  monto: number | null;
  moneda: string;
  f_pedido: string | null;
  f_recep: string | null;
  f_envio: string | null;
  f_resol: string | null;
  estado: string | null;
  uso: string | null;
  motivo: string | null;
  obs: string | null;
  creada_por: string | null;
  cerrada_por: string | null;
  created_at: string;
  updated_at: string;
  f_cierre: string | null;
}

export interface NuevaGestion {
  cliente: string;
  cliente_nuevo?: boolean;
  asesor?: string;
  operacion?: string;
  entidad?: string;
  monto?: number | null;
  moneda?: string;
  f_pedido?: string | null;
  f_recep?: string | null;
  f_envio?: string | null;
  estado?: string;
  obs?: string;
}

export interface CambioGestion {
  f_recep?: string | null;
  f_envio?: string | null;
  f_resol?: string | null;
  operacion?: string;
  entidad?: string;
  asesor?: string;
  monto?: number | null;
  moneda?: string;
  estado?: string;
  uso?: string;
  motivo?: string;
  obs?: string;
}

// ---------------------------------------------------------------------------
// Configuración (equivalente a la solapa LISTAS de la planilla original)
// ---------------------------------------------------------------------------
export const ESTADOS_PROCESO = [
  "PENDIENTE CLIENTE",
  "PENDIENTE ASESOR",
  "EN ESPERA DICTAMEN",
  "OBSERVADA - SGR/BCO",
];
export const ESTADOS_CIERRE_APR = ["CALIFICADA", "FINANCIADA"];
export const ESTADOS_CIERRE_HIST = ["RECHAZADA", "CAÍDA"];
export const ESTADOS = [
  ...ESTADOS_PROCESO,
  ...ESTADOS_CIERRE_APR,
  ...ESTADOS_CIERRE_HIST,
];

export const OPERACIONES = [
  "CPD TERCEROS",
  "CPD PROPIOS",
  "CHEQUES / ECHEQ",
  "PAGARÉ BURSÁTIL",
  "PRÉSTAMO",
  "LEASING",
  "DESCUENTO DE FACTURAS",
];
export const ENTIDADES = [
  "ACINDAR",
  "BALANZ",
  "BST",
  "CAMPO AVAL",
  "COMAFI",
  "CONSULTATIO",
  "FIDAVAL",
  "GARANTIZAR",
  "SyC",
  "THE CAPITA",
];
export const MOTIVOS_CIERRE = [
  "No calificó",
  "Desistió el cliente",
  "Documentación incompleta",
  "Condiciones no convenientes",
  "Otro",
];
export const MONEDAS = ["ARS", "USD"];

/** Carga rápida: setean operación + entidad de un toque. */
export const ACCIONES_RAPIDAS: { label: string; operacion: string; entidad: string }[] = [
  { label: "CPD TERCEROS · ACINDAR", operacion: "CPD TERCEROS", entidad: "ACINDAR" },
  { label: "CPD TERCEROS · FIDAVAL", operacion: "CPD TERCEROS", entidad: "FIDAVAL" },
];

export function cierraA(estado?: string | null): "APR" | "HIST" | null {
  if (!estado) return null;
  if (ESTADOS_CIERRE_APR.includes(estado)) return "APR";
  if (ESTADOS_CIERRE_HIST.includes(estado)) return "HIST";
  return null;
}

// ---------------------------------------------------------------------------
// Clientes (padrón del CRM) — [nombre, codigoAsesor]
// ---------------------------------------------------------------------------
const MASTER: [string, string][] = clientesRaw as [string, string][];

export const ASESORES: string[] = [...new Set(MASTER.map((r) => r[1]))].sort();

export function clientesDeAsesor(asesor: string): string[] {
  if (!asesor) return [];
  return MASTER.filter((r) => r[1] === asesor)
    .map((r) => r[0])
    .sort((a, b) => a.localeCompare(b, "es"));
}

export function todosLosClientes(): string[] {
  return MASTER.map((r) => r[0]).sort((a, b) => a.localeCompare(b, "es"));
}

export function esClienteDelPadron(nombre: string): boolean {
  const n = nombre.trim().toUpperCase();
  return MASTER.some((r) => r[0].toUpperCase() === n);
}

// ---------------------------------------------------------------------------
// Helpers de fecha / número / días
// ---------------------------------------------------------------------------
export function fmtMonto(n: number | null | undefined, moneda?: string | null): string {
  if (n === null || n === undefined || isNaN(Number(n))) return "—";
  const s = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Number(n));
  return moneda ? `${moneda === "USD" ? "US$" : "$"} ${s}` : `$ ${s}`;
}

export function parseMonto(txt: string): number | null {
  if (!txt) return null;
  const s = String(txt).replace(/\s|\$|US\$/g, "").replace(/\./g, "").replace(/,/g, ".");
  const n = Number(s);
  return isNaN(n) ? null : n;
}

export function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const p = String(iso).slice(0, 10).split("-");
  if (p.length !== 3) return "—";
  return `${p[2]}/${p[1]}/${p[0]}`;
}

function hoy0(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function diasEntre(desde: string | null, hasta: string | null): number | null {
  if (!desde) return null;
  const d = new Date(desde + "T12:00:00").getTime();
  const h = hasta ? new Date(hasta + "T12:00:00").getTime() : hoy0();
  return Math.round((h - d) / 86400000);
}

/** Días que el cliente lleva pendiente de responder (pedido → recepción / hoy). */
export function diasCliente(g: Gestion): number | null {
  return diasEntre(g.f_pedido, g.f_recep);
}
/** Días de gestión en la entidad (envío → resolución / hoy). */
export function diasGestion(g: Gestion): number | null {
  return diasEntre(g.f_envio, g.f_resol);
}
/** Días sin uso de una línea aprobada (resolución → hoy), si está SIN USO. */
export function diasSinUso(g: Gestion): number | null {
  if (g.uso !== "SIN USO") return null;
  return diasEntre(g.f_resol, null);
}

// ---------------------------------------------------------------------------
// Acceso a datos (Supabase REST)
// ---------------------------------------------------------------------------
async function authHeaders(write = false): Promise<Record<string, string>> {
  const s = (await ensureSession()) || getSession();
  const h: Record<string, string> = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${s?.access_token || SUPABASE_KEY}`,
  };
  if (write) {
    h["Content-Type"] = "application/json";
    h["Prefer"] = "return=representation";
  }
  return h;
}

export async function listarGestiones(): Promise<Gestion[]> {
  const r = await fetch(`${REST}/${TABLE}?select=*&order=updated_at.desc`, {
    headers: await authHeaders(),
  });
  if (!r.ok) throw new Error("No se pudieron cargar las gestiones.");
  return (await r.json()) as Gestion[];
}

function stamp(obs: string | undefined, email: string | null): string | null {
  const t = (obs || "").trim();
  if (!t) return null;
  const f = new Date();
  const dd = `${String(f.getDate()).padStart(2, "0")}/${String(
    f.getMonth() + 1
  ).padStart(2, "0")}/${f.getFullYear()}`;
  return `[${dd} · ${email || "usuario"}] ${t}`;
}

export async function crearGestion(d: NuevaGestion): Promise<Gestion> {
  if (!d.cliente?.trim()) throw new Error("Falta el nombre del cliente.");
  if (!d.f_pedido) throw new Error("Falta la fecha de pedido de documentación.");
  if (!d.asesor) throw new Error("Falta el asesor.");
  if (!d.estado) throw new Error("Falta el estado actual.");
  if (cierraA(d.estado))
    throw new Error(
      `El estado "${d.estado}" cierra la gestión. Cargala en curso y cerrala después desde "Actualizar", así queda el registro completo.`
    );

  const s = getSession();
  const email = s?.email || null;
  let obs = stamp(d.obs, email);
  if (d.cliente_nuevo) {
    const aviso = stamp("Cliente no figuraba en el padrón al momento de cargar.", email);
    obs = obs ? `${obs}\n${aviso}` : aviso;
  }

  const row = {
    flujo: "PROCESO",
    cliente: d.cliente.trim(),
    cliente_nuevo: !!d.cliente_nuevo,
    asesor: d.asesor,
    operacion: d.operacion || null,
    entidad: d.entidad || null,
    monto: d.monto ?? null,
    moneda: d.moneda || "ARS",
    f_pedido: d.f_pedido || null,
    f_recep: d.f_recep || null,
    f_envio: d.f_envio || null,
    estado: d.estado,
    obs,
    creada_por: email,
  };

  const r = await fetch(`${REST}/${TABLE}`, {
    method: "POST",
    headers: await authHeaders(true),
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(await errMsg(r, "No se pudo cargar la gestión."));
  const rows = (await r.json()) as Gestion[];
  return rows[0];
}

export async function actualizarGestion(g: Gestion, d: CambioGestion): Promise<Gestion> {
  const estado = d.estado || g.estado || undefined;
  const cierre = cierraA(estado);
  if (cierre === "APR" && !d.f_resol && !g.f_resol)
    throw new Error(`Para marcar ${estado} hace falta la fecha de resolución.`);
  if (cierre === "HIST" && !(d.motivo || g.motivo)?.trim())
    throw new Error(`Para marcar ${estado} hace falta indicar el motivo de cierre.`);

  const s = getSession();
  const email = s?.email || null;

  const patch: Record<string, unknown> = {};
  if (d.f_recep !== undefined) patch.f_recep = d.f_recep || null;
  if (d.f_envio !== undefined) patch.f_envio = d.f_envio || null;
  if (d.f_resol !== undefined) patch.f_resol = d.f_resol || null;
  if (d.operacion) patch.operacion = d.operacion;
  if (d.entidad) patch.entidad = d.entidad;
  if (d.asesor) patch.asesor = d.asesor;
  if (d.monto !== undefined && d.monto !== null) patch.monto = d.monto;
  if (d.moneda) patch.moneda = d.moneda;
  if (estado) patch.estado = estado;
  if (d.uso) patch.uso = d.uso;

  const nueva = stamp(d.obs, email);
  if (nueva) patch.obs = g.obs ? `${g.obs}\n${nueva}` : nueva;

  if (cierre === "APR") {
    patch.flujo = "APROBADA";
    patch.uso = d.uso || g.uso || "SIN USO";
    patch.motivo = d.motivo || null;
    patch.cerrada_por = email;
    patch.f_cierre = new Date().toISOString();
  } else if (cierre === "HIST") {
    patch.flujo = "HISTORICO";
    patch.motivo = d.motivo || g.motivo || null;
    patch.cerrada_por = email;
    patch.f_cierre = new Date().toISOString();
  }

  const r = await fetch(`${REST}/${TABLE}?id=eq.${g.id}`, {
    method: "PATCH",
    headers: await authHeaders(true),
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(await errMsg(r, "No se pudo actualizar la gestión."));
  const rows = (await r.json()) as Gestion[];
  return rows[0];
}

/** Marca una línea aprobada como ACTIVO / SIN USO. */
export async function setUso(g: Gestion, uso: string): Promise<Gestion> {
  const r = await fetch(`${REST}/${TABLE}?id=eq.${g.id}`, {
    method: "PATCH",
    headers: await authHeaders(true),
    body: JSON.stringify({ uso }),
  });
  if (!r.ok) throw new Error(await errMsg(r, "No se pudo actualizar el uso."));
  const rows = (await r.json()) as Gestion[];
  return rows[0];
}

export async function eliminarGestion(id: number): Promise<void> {
  const r = await fetch(`${REST}/${TABLE}?id=eq.${id}`, {
    method: "DELETE",
    headers: await authHeaders(true),
  });
  if (!r.ok) throw new Error(await errMsg(r, "No se pudo eliminar la gestión."));
}

async function errMsg(r: Response, fallback: string): Promise<string> {
  try {
    const j = await r.json();
    return j.message || j.hint || j.details || fallback;
  } catch {
    return fallback;
  }
}
