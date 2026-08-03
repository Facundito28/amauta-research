import EmbedFrame from "@/components/EmbedFrame";

export const metadata = { title: "Órdenes · Amauta" };

// OrdenBot nativo del portal (HTML propio, sin Apps Script/Google). Full-size.
// El mail se genera para copiar/pegar o abrir en Gmail; la firma con logo la
// pone el asesor (Gmail no la inserta por link, es limitación de Gmail).
export default function OrdenesPage() {
  return <EmbedFrame src="/ordenes/index.html" title="OrdenBot — Generador de órdenes" />;
}
