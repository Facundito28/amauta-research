export const metadata = { title: "Financiamiento · Amauta" };

// Tablero de Seguimiento de Financiamiento: es una PLANILLA de Google (Apps
// Script bound con menú Amauta → Nueva/Actualizar gestión), no un web app.
// Se abre en pestaña nueva (no se puede embeber por X-Frame-Options de Google).
const FIN_URL =
  "https://docs.google.com/spreadsheets/d/16ECmQqfa_aXT3Qy6GAb7CeWDGiQZu65uwwTCM-_41R4/edit";

export default function FinanciamientoPage() {
  return (
    <div className="min-h-full grid place-items-center bg-surface-base px-6 py-16">
      <div className="w-full max-w-xl text-center">
        <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-surface-raised border border-brand-border text-3xl">
          🏦
        </div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-amauta-yellow font-extrabold mb-2">
          Amauta · Gestiones
        </p>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-text-primary leading-tight">
          Tablero de Financiamiento
        </h1>
        <p className="mt-3 text-[15px] text-text-secondary leading-relaxed max-w-md mx-auto">
          Seguimiento de gestiones de financiamiento: cargá y actualizá pedidos
          (SGR / BCO / ALyC), con cierre automático a Aprobadas e Histórico.
        </p>

        <a
          href={FIN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-amauta-yellow text-amauta-dark font-extrabold uppercase tracking-wider text-sm px-7 py-3.5 hover:bg-amauta-yellow-hover transition-colors"
        >
          Abrir tablero (Google Sheets) →
        </a>

        <p className="mt-5 text-xs text-text-tertiary max-w-md mx-auto leading-relaxed">
          Se abre la planilla en una pestaña nueva (con tu cuenta{" "}
          <span className="text-text-secondary font-semibold">@amautainversiones.com</span>). Cargá o
          actualizá gestiones desde el menú <span className="text-text-secondary font-semibold">Amauta →
          Nueva / Actualizar gestión</span>.
        </p>
      </div>
    </div>
  );
}
