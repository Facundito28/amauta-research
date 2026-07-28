import EmbedFrame from "@/components/EmbedFrame";

export const metadata = { title: "Financiamiento · Amauta" };

// Web app de Apps Script (Tablero de Seguimiento de Financiamiento).
const FIN_URL =
  "https://script.google.com/a/macros/amautainversiones.com/s/AKfycbxhsH6wNn284AvawR6a6_jpq5OX21sPA8HFFDYMrbaQb80t2t5lfsm7v_PcX74APPr7cQ/exec";

export default function FinanciamientoPage() {
  return <EmbedFrame src={FIN_URL} title="Tablero de Financiamiento" />;
}
