/**
 * Primitivas de UI compartidas por las vistas de FCIs (tema oscuro del portal).
 * Todos son server components sin estado.
 */
import type { ReactNode } from "react";
import { titleCase } from "@/lib/fci/constants";

/** Tarjeta plana surface-raised con header de título + cuadradito bordó. */
export function Section({
  title,
  subtitle,
  right,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`bg-surface-raised border border-brand-border rounded-[14px] overflow-hidden ${className}`}
    >
      <header className="px-5 py-4 border-b border-brand-border flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-[9px] h-[9px] rounded-sm bg-amauta-bordo shrink-0" aria-hidden />
          <h2 className="font-bold text-sm uppercase tracking-wider text-text-primary">{title}</h2>
        </div>
        {subtitle && <p className="text-[11px] text-text-tertiary font-medium">{subtitle}</p>}
        {right && <div className="ml-auto">{right}</div>}
      </header>
      {children}
    </section>
  );
}

/** Tile de estadística (borde superior amarillo). */
export function StatTile({
  label,
  value,
  tone = "default",
  sub,
}: {
  label: string;
  value: string;
  tone?: "default" | "pos" | "neg";
  sub?: string;
}) {
  const valueColor =
    tone === "pos"
      ? "text-emerald-400"
      : tone === "neg"
        ? "text-rose-400"
        : "text-text-primary";
  return (
    <div className="bg-surface-raised rounded-[14px] border border-brand-border border-t-[3px] border-t-amauta-yellow px-5 py-4">
      <p className="text-[10px] uppercase tracking-[0.12em] font-extrabold text-text-tertiary mb-1">
        {label}
      </p>
      <p className={`text-xl sm:text-2xl font-extrabold leading-none tabular-nums ${valueColor}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-text-tertiary mt-1">{sub}</p>}
    </div>
  );
}

/** Chip / badge de texto. */
export function Chip({
  children,
  tone = "bordo",
}: {
  children: ReactNode;
  tone?: "bordo" | "yellow" | "blue" | "green" | "gray";
}) {
  const cls: Record<string, string> = {
    bordo: "bg-amauta-bordo/25 text-[#C77DA6]",
    yellow: "bg-amauta-yellow/15 text-amauta-yellow",
    blue: "bg-blue-500/15 text-blue-300",
    green: "bg-emerald-500/15 text-emerald-300",
    gray: "bg-surface-overlay text-text-secondary",
  };
  return (
    <span
      className={`inline-block text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-xs ${cls[tone]}`}
    >
      {children}
    </span>
  );
}

/** Badge de puesto para el ranking (#1 amarillo, #2/#3 sutiles). */
export function RankBadge({ n }: { n: number }) {
  const tone =
    n === 1
      ? "bg-amauta-yellow text-amauta-dark"
      : n === 2
        ? "bg-[#4A4446] text-text-primary"
        : n === 3
          ? "bg-[#3A2F34] text-[#C77DA6]"
          : "bg-surface-overlay text-text-secondary";
  return (
    <span
      className={`inline-grid place-items-center w-7 h-7 rounded-full text-xs font-extrabold tabular-nums ${tone}`}
    >
      {n}
    </span>
  );
}

/** Chip de categoría con color por tipo (para escaneo rápido del ranking). */
export function CategoryChip({ categoria }: { categoria: string | null | undefined }) {
  const c = (categoria ?? "").toUpperCase();
  const tone = c.includes("MERCADO DE DINERO")
    ? "bg-[rgba(47,191,113,0.13)] text-[#43C77E]"
    : c.includes("RENTA FIJA")
      ? "bg-[rgba(90,140,220,0.14)] text-[#8FB4EC]"
      : c.includes("RENTA VARIABLE")
        ? "bg-[rgba(198,125,166,0.16)] text-[#C77DA6]"
        : c.includes("RENTA MIXTA") || c.includes("RETORNO TOTAL")
          ? "bg-[rgba(232,181,74,0.14)] text-[#E8B54A]"
          : "bg-surface-overlay text-text-secondary";
  return (
    <span
      className={`inline-block text-[10.5px] font-extrabold uppercase tracking-[0.04em] px-2 py-[3px] rounded-[5px] ${tone}`}
    >
      {titleCase(c)}
    </span>
  );
}

/** Estado de error prolijo (no crashea la página). */
export function ErrorBox({
  title = "No se pudieron cargar los datos",
  message,
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="bg-surface-raised rounded-lg border border-brand-border p-8 sm:p-10 text-center">
      <div className="text-4xl mb-3" aria-hidden>
        ⚠️
      </div>
      <h3 className="text-base font-extrabold text-amauta-yellow">{title}</h3>
      <p className="mt-2 text-sm text-text-secondary max-w-md mx-auto">
        {message ??
          "La fuente de datos no respondió. Volvé a intentar en unos minutos."}
      </p>
    </div>
  );
}

/** Estado vacío. */
export function EmptyBox({
  icon = "🔍",
  title,
  message,
}: {
  icon?: string;
  title: string;
  message?: string;
}) {
  return (
    <div className="px-6 py-12 text-center">
      <div className="text-4xl mb-3 opacity-40" aria-hidden>
        {icon}
      </div>
      <p className="text-base font-extrabold text-text-primary">{title}</p>
      {message && (
        <p className="mt-1.5 text-sm text-text-secondary max-w-sm mx-auto">
          {message}
        </p>
      )}
    </div>
  );
}
