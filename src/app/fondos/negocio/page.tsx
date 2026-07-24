/**
 * Negocio de la industria de FCIs (facturación y AUM).
 * Fuente: fonditos.ar (MCP) · ranking_facturacion + serie_aum.
 */
import { fonditos } from "@/lib/fonditos";
import FciShell from "@/components/fci/FciShell";
import { Section, ErrorBox, EmptyBox, Chip } from "@/components/fci/ui";
import SeriesChart from "@/components/fci/charts/SeriesChart";
import { compactArs } from "@/lib/fci/constants";
import type { RankingFacturacion, SerieAum, FlujoPorGestora } from "@/lib/fci/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const metadata = { title: "Negocio · Monitor FCIs · Amauta" };

const PERIODS = [
  { value: "30d", label: "30 días" },
  { value: "mtd", label: "MTD" },
  { value: "ytd", label: "YTD" },
  { value: "current", label: "Actual" },
];

interface SP {
  period?: string;
}

export default async function NegocioPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const period = PERIODS.some((p) => p.value === sp.period) ? sp.period! : "30d";

  const [fact, aum, flujo] = await Promise.all([
    fonditos<RankingFacturacion>("ranking_facturacion", { period }).catch(() => null),
    fonditos<SerieAum>("serie_aum", { compresion: "mensual" }).catch(() => null),
    fonditos<FlujoPorGestora>("flujo_por_gestora", { tipo: "neto" }).catch(() => null),
  ]);

  const rows = fact?.rows ?? [];
  const maxFact = Math.max(1, ...rows.map((r) => r.facturacion_periodo));
  const topManager = rows[0];

  // Flujos netos por gestora (suscripciones − rescates), ordenados de mayor a menor.
  const flujoRows = flujo?.rows ?? [];
  const maxAbsFlujo = Math.max(1, ...flujoRows.map((r) => Math.abs(r.flujo_ars)));

  // AUM total de la industria por bucket = suma de todas las gestoras.
  const aumSeries =
    aum?.buckets.map((b, i) => {
      const total = aum.managers.reduce((acc, mgr) => acc + (aum.data[mgr]?.[i] ?? 0), 0);
      return { x: b, y: total };
    }) ?? [];
  const lastAum = aumSeries[aumSeries.length - 1];

  const buildHref = (p: string) => (p === "30d" ? "/fondos/negocio" : `/fondos/negocio?period=${p}`);

  return (
    <FciShell
      kicker="Industria · fonditos · CAFCI"
      title="El negocio de los FCIs"
      subtitle="Patrimonio total administrado y facturación estimada por gestora. La foto competitiva de la industria."
      kpis={[
        { label: "AUM industria", value: lastAum ? compactArs(lastAum.y) : "—", sub: lastAum?.x },
        { label: "Top facturación", value: topManager ? compactArs(topManager.facturacion_periodo) : "—", sub: topManager?.manager },
        { label: "Gestoras", value: rows.length ? String(rows.length) : "—" },
        { label: "Período", value: PERIODS.find((p) => p.value === period)?.label ?? period },
      ]}
    >
      <div className="space-y-6">
        {/* Evolución del AUM */}
        <Section title="Evolución del patrimonio administrado" subtitle="AUM total de la industria · mensual">
          {!aum ? (
            <div className="p-4">
              <ErrorBox message="La serie de AUM no está disponible." />
            </div>
          ) : aumSeries.length < 2 ? (
            <EmptyBox icon="📈" title="Sin datos de AUM" />
          ) : (
            <div className="p-4 sm:p-5">
              <SeriesChart data={aumSeries} currency color="#F3CF11" gradientId="aumArea" height={320} />
            </div>
          )}
        </Section>

        {/* Flujos netos por gestora — quién capta y quién pierde plata */}
        <Section
          title="Flujos netos por gestora"
          subtitle={flujo ? `${flujoRows.length} gestoras · suscripciones − rescates` : undefined}
        >
          {!flujo ? (
            <div className="p-4">
              <ErrorBox message="Los flujos por gestora no están disponibles." />
            </div>
          ) : flujoRows.length === 0 ? (
            <EmptyBox icon="💸" title="Sin datos de flujos" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="text-text-tertiary border-b border-brand-border">
                  <tr>
                    <th className="px-4 py-3 text-left font-extrabold uppercase tracking-wider text-[10px] w-10">#</th>
                    <th className="px-4 py-3 text-left font-extrabold uppercase tracking-wider text-[10px]">Gestora</th>
                    <th className="px-3 py-3 text-center font-extrabold uppercase tracking-wider text-[10px] hidden sm:table-cell">Tipo</th>
                    <th className="px-3 py-3 text-right font-extrabold uppercase tracking-wider text-[10px] hidden md:table-cell">Fondos</th>
                    <th className="px-4 py-3 text-right font-extrabold uppercase tracking-wider text-[10px]">Flujo neto</th>
                  </tr>
                </thead>
                <tbody>
                  {flujoRows.map((r, i) => {
                    const pos = r.flujo_ars >= 0;
                    const w = (Math.abs(r.flujo_ars) / maxAbsFlujo) * 100;
                    return (
                      <tr key={r.manager} className={`border-b border-brand-border hover:bg-surface-overlay transition-colors ${i % 2 ? "bg-white/[0.02]" : ""}`}>
                        <td className="px-4 py-3 text-xs tabular-nums text-text-tertiary">{i + 1}</td>
                        <td className="px-4 py-3 font-extrabold text-text-primary">{r.manager}</td>
                        <td className="px-3 py-3 text-center hidden sm:table-cell">
                          <Chip tone={r.type === "BANK" ? "blue" : "gray"}>
                            {r.type === "BANK" ? "Banco" : "Indep."}
                          </Chip>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums hidden md:table-cell text-text-secondary">
                          {r.n_fondos}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className={`tabular-nums font-bold ${pos ? "text-emerald-400" : "text-rose-400"}`}>
                              {pos ? "+" : ""}
                              {compactArs(r.flujo_ars)}
                            </span>
                            <span className="hidden md:block w-24 h-2 bg-surface-overlay rounded-xs overflow-hidden">
                              <span
                                className={`block h-full ${pos ? "bg-emerald-400" : "bg-rose-400"}`}
                                style={{ width: `${w}%` }}
                              />
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Ranking de facturación */}
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-text-tertiary mr-1">
            Período de facturación
          </span>
          {PERIODS.map((p) => (
            <a
              key={p.value}
              href={buildHref(p.value)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                period === p.value
                  ? "bg-amauta-yellow text-amauta-dark border-amauta-yellow"
                  : "bg-surface-raised text-text-secondary border-brand-border hover:border-amauta-yellow hover:text-text-primary"
              }`}
            >
              {p.label}
            </a>
          ))}
        </div>

        <Section title="Facturación por gestora" subtitle={fact ? `${rows.length} gestoras · honorarios de gestión` : undefined}>
          {!fact ? (
            <div className="p-4">
              <ErrorBox message="El ranking de facturación no está disponible." />
            </div>
          ) : rows.length === 0 ? (
            <EmptyBox icon="🏦" title="Sin datos" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead className="text-text-tertiary border-b border-brand-border">
                  <tr>
                    <th className="px-4 py-3 text-left font-extrabold uppercase tracking-wider text-[10px] w-10">#</th>
                    <th className="px-4 py-3 text-left font-extrabold uppercase tracking-wider text-[10px]">Gestora</th>
                    <th className="px-3 py-3 text-center font-extrabold uppercase tracking-wider text-[10px] hidden sm:table-cell">Tipo</th>
                    <th className="px-3 py-3 text-right font-extrabold uppercase tracking-wider text-[10px] hidden md:table-cell">Fondos</th>
                    <th className="px-3 py-3 text-right font-extrabold uppercase tracking-wider text-[10px] hidden lg:table-cell">AUM</th>
                    <th className="px-3 py-3 text-right font-extrabold uppercase tracking-wider text-[10px] hidden sm:table-cell">Fee prom.</th>
                    <th className="px-4 py-3 text-right font-extrabold uppercase tracking-wider text-[10px]">Facturación</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const w = (r.facturacion_periodo / maxFact) * 100;
                    return (
                      <tr key={r.manager} className={`border-b border-brand-border hover:bg-surface-overlay transition-colors ${i % 2 ? "bg-white/[0.02]" : ""}`}>
                        <td className="px-4 py-3 text-xs tabular-nums text-text-tertiary">{i + 1}</td>
                        <td className="px-4 py-3 font-extrabold text-text-primary">{r.manager}</td>
                        <td className="px-3 py-3 text-center hidden sm:table-cell">
                          <Chip tone={r.type === "BANK" ? "blue" : "gray"}>
                            {r.type === "BANK" ? "Banco" : "Indep."}
                          </Chip>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums hidden md:table-cell text-text-secondary">
                          {r.n_fondos}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums hidden lg:table-cell text-text-secondary">
                          {compactArs(r.aum_ars)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums hidden sm:table-cell text-text-secondary">
                          {r.fee_avg.toFixed(2)}%
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="tabular-nums font-bold text-amauta-yellow">
                              {compactArs(r.facturacion_periodo)}
                            </span>
                            <span className="hidden md:block w-24 h-2 bg-surface-overlay rounded-xs overflow-hidden">
                              <span className="block h-full bg-amauta-yellow" style={{ width: `${w}%` }} />
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>

      <p className="mt-4 text-xs text-text-tertiary leading-relaxed max-w-3xl">
        La facturación es una estimación a partir del AUM promedio del período y el fee de gestión promedio.
        Fuente: fonditos · CAFCI.
      </p>
    </FciShell>
  );
}
