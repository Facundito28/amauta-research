import { redirect } from "next/navigation";

// Noticias se fusionó en el Chat ("Chat + Noticias"): el chat responde noticias
// de Argentina (Reuters NEWS MONITOR 2.0 vía worker). Redirigimos los links viejos.
export default function NoticiasPage() {
  redirect("/chat");
}
