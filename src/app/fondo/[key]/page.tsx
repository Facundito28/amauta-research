/**
 * Ficha completa de un fondo.
 * URL: /fondo/[key]  donde key = encodeURIComponent(nombre del fondo).
 * Fuente: fonditos.ar (MCP) · ficha_fondo + composicion_fondo + serie_fondo
 *         + tenencias_fondo + metricas_renta_fija.
 */
import Link from "next/link";
import { fonditos } from "@/lib/fonditos";
import { fmtNumber, fmtReturn } from "@/lib/utils/format";
import { compactArs, titleCase } from "@/lib/fci/constants";
import FciTabs from "@/components/fci/FciTabs";
import { Section, StatTile, Chip, ErrorBox, EmptyBox } from "@/components/fci/ui";
import SeriesChart from "@/components/fci/charts/SeriesChart";
import type {
  FichaFondo,
  ComposicionFondo,
  SerieFondo,
  TenenciasFondo,
  MetricasRentaFija,
} from "@/lib/fci/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Colores de barras de composición por familia de activo.
const TIPO_COLOR: Record<string, string> = {
  "Tasa Dual": "bg-blue-500",
  "Tasa CER ARS": "bg-purple-500",
  "Tasa Fija ARS": "bg-blue-400",
  "Tasa Flotante ARS": "bg-sky-400",
  "Bono Soberano USD": "bg-cyan-500",
  "Bono Provincial": "bg-teal-500",
  "Dólar Linked": "bg-amber-400",
  Acciones: "bg-orange-400",
  FCI: "bg-pink-400",
  Otros: "bg-slate-400",
  "Resto de Activos": "bg-slate-300",
};
const tipoColor = (t: string) => TIPO_COLOR[t] ?? "bg-slate-400";

export default async function FichaPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const nombre = decodeURIComponent(key);

  const ficha = await fonditos<FichaFondo>("ficha_fondo", { fondo: nombre }).catch(() => null);

  if (!ficha) {
    return (
      <div className="min-h-full">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
          <ErrorBox
            title="No se encontró el fondo"
            message={`No pudimos cargar “${nombre}”. Puede que el nombre haya cambiado o la fuente no responda.`}
          />
          <div className="mt-6 text-center">
            <Link
              href="/fondos"
              className="inline-block rounded-sm bg-amauta-yellow text-amauta-dark font-extrabold uppercase tracking-wider text-xs px-5 py-2.5 hover:bg-amauta-yellow-hover transition-colors"
            >
              ← Volver a Fondos
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const canonical = ficha.fondo;
  const d = ficha.datos_actuales;
  const m = ficha.metricas;

  // Datos secundarios en paralelo (todos tolerantes a fallo).
  const [comp, serie, ten, rf] = await Promise.all([
    fonditos<ComposicionFondo>("composicion_fondo", { fondo: canonical }).catch(() => null),
    fonditos<SerieFondo>("serie_fondo", { fondo: canonical, dias: 365 }).catch(() => null),
    fonditos<TenenciasFondo>("tenencias_fondo", { fondo: canonical }).catch(() => null),
    fonditos<MetricasRentaFija>("metricas_renta_fija", { fondo: canonical }).catch(() => null),
  ]);

  const serieData = (serie?.data ?? []).map((p) => ({ x: p.fecha, y: p.vcp_norm }));

  const rfMetrics = rf
    ? [
        { label: "Duration", value: numOrDash(rf.duration, "d") },
        { label: "TIR", value: pctOrDash(rf.tir_pct ?? (rf.tir != null ? rf.tir * 100 : null)) },
      ].filter((x) => x.value !== "—")
    : [];

  return (
    <div className="min-h-full">
      <div className="space-y-6">
        {/* ── Hero plano ───────────────────────────────────────────────── */}
        <div>
          <nav className="text-xs text-text-tertiary font-medium mb-3">
            <Link href="/fondos" className="hover:text-amauta-yellow transition-colors">
              Fondos
            </Link>
            <span className="mx-2 text-text-tertiary/60">/</span>
            <span className="text-text-secondary">Ficha</span>
          </nav>

          <p className="text-[11px] uppercase tracking-[0.18em] text-amauta-yellow font-extrabold mb-2">
            Ficha del fondo · Cierre {d.fecha}
          </p>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold leading-tight text-text-primary">
            {canonical}
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            {ficha.gestora && <span className="font-bold text-text-primary">{ficha.gestora}</span>}
            {d.sociedad_depositaria && (
              <>
                <span className="mx-2 text-text-tertiary/60">·</span>
                <span>Depositaria: {d.sociedad_depositaria}</span>
              </>
            )}
            {ficha.clase && (
              <>
                <span className="mx-2 text-text-tertiary/60">·</span>
                <span>Clase {ficha.clase}</span>
              </>
            )}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {d.categoria && <Chip tone="yellow">{titleCase(d.categoria)}</Chip>}
            {ficha.subcategoria && <ChipDark>{titleCase(ficha.subcategoria)}</ChipDark>}
            {d.moneda && <ChipDark>{d.moneda}</ChipDark>}
            {d.calificacion && <ChipDark>Cal. {d.calificacion}</ChipDark>}
            {d.horizonte && <ChipDark>{d.horizonte}</ChipDark>}
          </div>

        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <HeroKpi label="VCP" value={fmtNumber(d.vcp, 2)} />
          <HeroKpi label="Patrimonio" value={compactArs(d.patrimonio)} />
          <HeroKpi label="TNA" value={pctOrDash(m.tna)} />
          <HeroKpi label="Sharpe" value={m.sharpe != null ? fmtNumber(m.sharpe, 2) : "—"} />
        </div>

        <div className="border-b border-brand-border">
          <FciTabs />
        </div>

        {/* ── Contenido ──────────────────────────────────────────────── */}
        <div className="space-y-6">
        {/* Rendimientos */}
        <Section title="Rendimientos" subtitle={`Historial: ${m.dias_historico ?? "—"} días · desde ${m.fecha_inicio ?? "—"}`}>
          <div className="p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <ReturnTile label="7 días" v={m.rend_7d} />
            <ReturnTile label="30 días" v={m.rend_30d} />
            <ReturnTile label="90 días" v={m.rend_90d} />
            <ReturnTile label="YTD" v={m.rend_ytd} />
            <ReturnTile label="1 año" v={m.rend_1y} />
          </div>
          <div className="px-4 sm:px-5 pb-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatTile label="TNA" value={pctOrDash(m.tna)} />
            <StatTile label="Volatilidad" value={pctOrDash(m.volatilidad)} />
            <StatTile label="Sharpe" value={m.sharpe != null ? fmtNumber(m.sharpe, 2) : "—"} />
          </div>
        </Section>

        {/* Evolución del VCP */}
        <Section
          title="Evolución del VCP"
          subtitle={serie ? `Base 100 · ${serie.from} → ${serie.to}` : undefined}
        >
          <div className="p-4 sm:p-5">
            {serieData.length > 1 ? (
              <SeriesChart data={serieData} mode="index" color="#F3CF11" gradientId="fichaVcp" />
            ) : (
              <EmptyBox icon="📈" title="Serie no disponible" message="No hay suficientes puntos para graficar la evolución." />
            )}
          </div>
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Composición */}
          <Section title="Composición de cartera" subtitle={comp ? `Por tipo de activo` : undefined}>
            {comp && comp.summary.length > 0 ? (
              <div className="p-4 sm:p-5 space-y-3">
                {comp.summary.map((s) => (
                  <div key={s.tipo_activo} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 text-sm mb-1.5">
                        <span className="font-bold text-text-primary truncate">{s.tipo_activo}</span>
                        <span className="text-xs text-text-tertiary shrink-0">
                          {s.n_activos} activo{s.n_activos === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="h-2.5 bg-surface-overlay rounded-xs overflow-hidden">
                        <div
                          className={`h-full ${tipoColor(s.tipo_activo)}`}
                          style={{ width: `${Math.min(100, s.peso_pct)}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-extrabold tabular-nums text-amauta-yellow w-14 text-right">
                      {s.peso_pct.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyBox icon="🧩" title="Sin composición publicada" message="Este fondo no tiene desglose de cartera disponible en la fuente." />
            )}
          </Section>

          {/* Tenencias */}
          <Section
            title="Principales tenencias"
            subtitle={ten ? `Actualizado hace ${ten.age_hours}h` : undefined}
          >
            {ten && ten.holdings.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-text-tertiary border-b border-brand-border">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-extrabold uppercase tracking-wider text-[10px]">Activo</th>
                      <th className="px-3 py-2.5 text-left font-extrabold uppercase tracking-wider text-[10px] hidden sm:table-cell">Tipo</th>
                      <th className="px-4 py-2.5 text-right font-extrabold uppercase tracking-wider text-[10px]">Peso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ten.holdings.map((h, i) => (
                      <tr key={`${h.name}-${i}`} className={`border-b border-brand-border ${i % 2 ? "bg-white/[0.02]" : ""}`}>
                        <td className="px-4 py-2.5 font-medium text-text-primary">{h.name}</td>
                        <td className="px-3 py-2.5 hidden sm:table-cell">
                          <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                            <span className={`w-2 h-2 rounded-full ${tipoColor(h.type)}`} />
                            {h.type}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-bold text-amauta-yellow">
                          {h.weight.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyBox icon="📋" title="Sin tenencias disponibles" message="No hay detalle de tenencias para este fondo." />
            )}
          </Section>
        </div>

        {/* Métricas de renta fija (solo si aplican) */}
        {rfMetrics.length > 0 && (
          <Section title="Métricas de renta fija">
            <div className="p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {rfMetrics.map((x) => (
                <StatTile key={x.label} label={x.label} value={x.value} />
              ))}
            </div>
          </Section>
        )}

        {/* Datos generales */}
        <Section title="Datos generales">
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="Sociedad gerente" value={d.sociedad_gerente} />
            <Info label="Depositaria" value={d.sociedad_depositaria} />
            <Info label="Calificación" value={d.calificacion} />
            <Info label="Hon. gestión" value={pctOrDash(d.fee_gestion)} />
            <Info label="Hon. depositaria" value={pctOrDash(d.fee_depositaria)} />
            <Info label="Com. rescate" value={pctOrDash(d.com_rescate)} />
            <Info label="Com. ingreso" value={pctOrDash(d.com_ingreso)} />
            <Info label="Plazo de rescate" value={d.plazo_rescate != null ? `${d.plazo_rescate} día${d.plazo_rescate === 1 ? "" : "s"}` : null} />
            <Info label="Cuotapartes" value={d.ccp != null ? fmtNumber(d.ccp, 0) : null} />
          </dl>
        </Section>

        {/* Acciones */}
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/fondos/comparar?fondos=${encodeURIComponent(canonical)}`}
            className="inline-flex items-center rounded-sm bg-amauta-yellow text-amauta-dark font-extrabold uppercase tracking-wider text-xs px-5 py-2.5 hover:bg-amauta-yellow-hover transition-colors"
          >
            Comparar este fondo →
          </Link>
          <Link
            href="/fondos"
            className="inline-flex items-center rounded-sm border border-brand-border bg-surface-overlay text-text-secondary font-bold text-sm px-5 py-2.5 hover:text-text-primary hover:border-amauta-yellow transition-colors"
          >
            ← Volver al listado
          </Link>
        </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function ChipDark({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block border border-brand-border text-text-secondary text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-xs">
      {children}
    </span>
  );
}

function HeroKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-raised border border-brand-border border-t-2 border-t-amauta-yellow rounded-lg px-5 py-4">
      <p className="text-[10px] uppercase tracking-[0.14em] text-text-tertiary font-extrabold mb-1.5">{label}</p>
      <p className="text-xl sm:text-2xl font-extrabold text-text-primary leading-none tabular-nums">
        {value}
      </p>
    </div>
  );
}

function ReturnTile({ label, v }: { label: string; v: number | null | undefined }) {
  const r = fmtReturn(v ?? null, 2);
  const tone = v == null ? "default" : v > 0 ? "pos" : v < 0 ? "neg" : "default";
  return <StatTile label={label} value={r.text} tone={tone} />;
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="px-5 py-3.5 border-t border-brand-border sm:odd:border-r lg:[&:not(:nth-child(3n))]:border-r border-brand-border">
      <dt className="text-[11px] uppercase tracking-wider font-extrabold text-text-tertiary mb-0.5">
        {label}
      </dt>
      <dd className="text-sm font-bold text-text-primary">{value ?? "—"}</dd>
    </div>
  );
}

function pctOrDash(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  return `${v.toLocaleString("es-AR", { maximumFractionDigits: 2 })}%`;
}

function numOrDash(v: number | null | undefined, suffix = ""): string {
  if (v == null || isNaN(v)) return "—";
  return `${v.toLocaleString("es-AR", { maximumFractionDigits: 2 })}${suffix}`;
}
