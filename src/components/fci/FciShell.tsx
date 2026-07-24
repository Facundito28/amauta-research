/**
 * Shell reutilizable de la sección FCIs (tema oscuro del portal).
 *
 * - Encabezado plano (kicker amarillo + título + subtítulo), estilo CEDEARs.
 * - Franja de resumen UNIFICADA: una sola tarjeta con celdas separadas por
 *   divisores finos (no 4 cajitas sueltas). El KPI con `highlight` va en amarillo.
 * - Debajo, la sub-nav de tabs y el contenedor de la vista.
 *
 * Server component: recibe los datos ya fetcheados como props.
 */
import type { ReactNode } from "react";
import FciTabs from "./FciTabs";

export interface Kpi {
  label: string;
  value: string;
  sub?: string;
  /** Resalta el valor en amarillo (ej. "mejor del período"). */
  highlight?: boolean;
  /** Marca el sub en verde (ej. "datos al día"). */
  subTone?: "pos";
}

// Bordes por celda para una grilla de 4: divisores finos, sin doble borde al
// envolver en mobile (2 columnas).
const CELL_BORDERS = [
  "",
  "border-l border-brand-border",
  "border-t border-brand-border sm:border-t-0 sm:border-l",
  "border-t border-l border-brand-border sm:border-t-0",
];

export default function FciShell({
  kicker,
  title,
  subtitle,
  kpis,
  children,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  kpis?: Kpi[];
  children: ReactNode;
}) {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ── Encabezado ───────────────────────────────────────────────── */}
      <div>
        {kicker && (
          <p className="text-[11px] uppercase tracking-[0.18em] text-amauta-yellow font-extrabold mb-2">
            {kicker}
          </p>
        )}
        <h1 className="text-2xl sm:text-3xl lg:text-[34px] font-extrabold leading-[1.1] tracking-tight text-text-primary text-balance">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2.5 text-[14.5px] text-text-secondary max-w-[60ch] leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>

      {/* ── Franja de resumen (una tarjeta, celdas con divisores) ─────── */}
      {kpis && kpis.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 bg-surface-raised border border-brand-border rounded-lg overflow-hidden">
          {kpis.map((k, i) => (
            <div
              key={k.label}
              className={`px-5 py-4 ${CELL_BORDERS[i] ?? "border-l border-brand-border"}`}
            >
              <p className="text-[10px] uppercase tracking-[0.13em] text-text-tertiary font-extrabold mb-2">
                {k.label}
              </p>
              <p
                className={`text-[22px] sm:text-[23px] font-extrabold leading-none tabular-nums ${
                  k.highlight ? "text-amauta-yellow" : "text-text-primary"
                }`}
              >
                {k.value}
              </p>
              {k.sub && (
                <p
                  className={`text-[11.5px] mt-2 truncate ${
                    k.subTone === "pos"
                      ? "text-emerald-400 font-bold"
                      : "text-text-tertiary"
                  }`}
                >
                  {k.sub}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Sub-nav ──────────────────────────────────────────────────── */}
      <div className="border-b border-brand-border">
        <FciTabs />
      </div>

      {/* ── Contenido ────────────────────────────────────────────────── */}
      <div className="space-y-6">{children}</div>
    </div>
  );
}
