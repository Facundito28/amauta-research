import EmbedFrame from "@/components/EmbedFrame";

export const metadata = { title: "Órdenes · Amauta" };

// OrdenBot servido por Apps Script (crea el borrador leyendo la firma real de
// Gmail del asesor → sale con logo). Embebido full-size dentro del portal
// (el web app tiene XFrameOptionsMode.ALLOWALL, por eso se puede embeber).
const ORDENBOT_URL =
  "https://script.google.com/a/macros/amautainversiones.com/s/AKfycbzTpnsSXbkMV27aYe-MZQpp9dwTB3mT5iouMSryWevdS9IMXyGa9aCRNkJkAPKQ7deK/exec";

export default function OrdenesPage() {
  return <EmbedFrame src={ORDENBOT_URL} title="OrdenBot — Generador de órdenes" />;
}
