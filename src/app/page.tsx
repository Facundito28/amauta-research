import Link from "next/link";

const TOOLS = [
  { href: "/cedears", title: "Monitor CEDEARs", sub: "Cotizaciones y fundamentals en vivo", icon: "📈" },
  { href: "/fondos", title: "Monitor FCIs", sub: "Fondos Comunes · CAFCI", icon: "📊" },
  { href: "/chat", title: "Chat + Noticias", sub: "Asistente IA + noticias de Argentina", icon: "💬" },
  { href: "/simulador", title: "Simulador", sub: "Comparador CPD · Banco vs Mercado", icon: "🧮" },
  { href: "/informes", title: "Generador de Informes", sub: "Informes de rendimiento para clientes", icon: "📄" },
];

export default function Home() {
  return (
    <div className="hub">
      <div className="hub-hero">
        <div className="hub-hero-top">
          <svg className="hub-hero-mark" width={48} height={48} viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <polygon points="20,2.5 37.5,20 20,37.5 2.5,20" fill="#F3CF11" />
            <g stroke="#231F20" strokeWidth="1.9" strokeLinecap="round">
              <line x1="20" y1="10.4" x2="20" y2="29.6" />
              <line x1="10.4" y1="20" x2="29.6" y2="20" />
              <line x1="13.6" y1="13.6" x2="26.4" y2="26.4" />
              <line x1="26.4" y1="13.6" x2="13.6" y2="26.4" />
            </g>
          </svg>
          <div>
            <span className="hub-hero-kicker">Portal del equipo</span>
            <h2>
              Amauta <span>Local</span>
            </h2>
          </div>
        </div>
        <p>
          Todas las herramientas de Amauta en un solo lugar: monitor de CEDEARs, fondos comunes, simulador,
          generador de informes, CRM y un chat financiero con noticias de Argentina.
        </p>
      </div>
      <div className="hub-title">Herramientas</div>
      <div className="hub-grid">
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href} className="hub-card">
            <span className="hub-card-ico">{t.icon}</span>
            <span className="hub-card-body">
              <span className="hub-card-name">{t.title}</span>
              <span className="hub-card-sub">{t.sub}</span>
            </span>
            <span className="hub-card-arrow">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
