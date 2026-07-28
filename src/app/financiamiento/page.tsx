export const metadata = { title: "Financiamiento · Amauta" };

// Web app de Apps Script (Tablero de Seguimiento de Financiamiento).
// Google no permite embeberlo en iframe (X-Frame-Options), así que lo abrimos
// en una pestaña nueva desde un launcher branded dentro del portal.
const FIN_URL =
  "https://script.google.com/a/macros/amautainversiones.com/s/AKfycbxhsH6wNn284AvawR6a6_jpq5OX21sPA8HFFDYMrbaQb80t2t5lfsm7v_PcX74APPr7cQ/exec";

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
          Abrir tablero →
        </a>

        <p className="mt-5 text-xs text-text-tertiary max-w-sm mx-auto leading-relaxed">
          Se abre en una pestaña nueva, con tu cuenta{" "}
          <span className="text-text-secondary font-semibold">@amautainversiones.com</span>. La
          herramienta vive en Google (Apps Script), por eso no se muestra embebida acá.
        </p>
      </div>
    </div>
  );
}
