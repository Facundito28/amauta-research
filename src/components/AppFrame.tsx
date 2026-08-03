"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  sendOtp,
  verifyOtp,
  captureHashSession,
  ensureSession,
  getTeamMember,
  signOut,
  LEGACY_CONFIG,
  type Member,
} from "@/lib/portal-supabase";

const TOOLS = [
  { href: "/cedears", title: "Monitor CEDEARs", sub: "Cotizaciones y fundamentals en vivo", icon: "📈", short: "CEDEARs", live: true },
  { href: "/fondos", title: "Monitor FCIs", sub: "Fondos Comunes · CAFCI", icon: "📊", short: "FCIs" },
  { href: "/chat", title: "Chat + Noticias", sub: "Asistente IA + noticias de Argentina", icon: "💬", short: "Chat" },
  { href: "/simulador", title: "Simulador", sub: "Comparador CPD · Banco vs Mercado", icon: "🧮", short: "Simulador" },
  { href: "/informes", title: "Generador de Informes", sub: "Informes de rendimiento para clientes", icon: "📄", short: "Informes" },
  { href: "/financiamiento", title: "Financiamiento", sub: "Seguimiento de gestiones (SGR/BCO)", icon: "🏦", short: "Financiamiento" },
  { href: "/ordenes", title: "Órdenes", sub: "Generador de órdenes", icon: "🧾", short: "Órdenes" },
  { href: "/crm", title: "CRM", sub: "Gestión comercial y clientes", icon: "🤝", short: "CRM" },
];

const AmautaMark = ({ size = 36 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
    <polygon points="20,2.5 37.5,20 20,37.5 2.5,20" fill="#F3CF11" />
    <g stroke="#231F20" strokeWidth="1.9" strokeLinecap="round">
      <line x1="20" y1="10.4" x2="20" y2="29.6" />
      <line x1="10.4" y1="20" x2="29.6" y2="20" />
      <line x1="13.6" y1="13.6" x2="26.4" y2="26.4" />
      <line x1="26.4" y1="13.6" x2="13.6" y2="26.4" />
    </g>
  </svg>
);

type Status = "loading" | "login" | "authed";

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<Status>("loading");
  const [, setMember] = useState<Member | null>(null);
  const [email, setEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Puente para los módulos legacy (cedears.js / news.js)
  useEffect(() => {
    (window as unknown as { AmautaCedearsBridge?: unknown }).AmautaCedearsBridge = {
      config: LEGACY_CONFIG,
      navigate: () => {},
    };
  }, []);

  // Bootstrap: sesión persistente + allowlist
  useEffect(() => {
    let cancelled = false;
    (async () => {
      captureHashSession();
      try {
        const s = await ensureSession();
        if (s) {
          const m = await getTeamMember();
          if (!cancelled && m) {
            setMember(m);
            setStatus("authed");
            return;
          }
          if (m === null && s) await signOut();
          if (!cancelled)
            setError("Tu correo no está autorizado para este portal. Escribí a tu administrador.");
        }
      } catch {
        /* cae a login */
      }
      if (!cancelled) setStatus("login");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Clases de vista en <body> (reusan el CSS del portal)
  useEffect(() => {
    const b = document.body;
    b.classList.remove("view-hub", "view-cedears", "view-news", "view-fci", "view-fin", "embedding");
    if (status !== "authed") return;
    const isFci =
      pathname === "/fondos" ||
      pathname.startsWith("/fondo") ||
      pathname === "/comparar" ||
      pathname === "/rankings";
    if (pathname === "/") b.classList.add("view-hub");
    else if (pathname === "/cedears") b.classList.add("view-cedears");
    else if (pathname === "/noticias") b.classList.add("view-news");
    else if (isFci) b.classList.add("view-fci"); // nativo, ocupa todo el ancho
    else if (pathname === "/financiamiento") b.classList.add("view-fin"); // nativo, ancho completo
    else b.classList.add("embedding"); // chat, simulador (iframe)

    // Colapsar el panel al entrar a una herramienta; expandir en el hub (desktop)
    if (pathname === "/") b.classList.remove("nav-collapsed");
    else if (window.innerWidth > 768) b.classList.add("nav-collapsed");
    setMobileOpen(false);
  }, [pathname, status]);

  const handleSend = useCallback(async () => {
    const e = email.trim().toLowerCase();
    if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
      setError("Ingresá un correo válido.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendOtp(e);
      setPendingEmail(e);
      setStep("code");
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el código");
    } finally {
      setBusy(false);
    }
  }, [email]);

  const handleVerify = useCallback(async () => {
    if (!code.trim()) {
      setError("Ingresá el código que recibiste.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await verifyOtp(pendingEmail, code);
      const m = await getTeamMember();
      if (!m) {
        await signOut();
        setStep("email");
        setError("Tu correo no está autorizado para este portal. Escribí a tu administrador.");
        return;
      }
      setMember(m);
      setStatus("authed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Código inválido o expirado");
    } finally {
      setBusy(false);
    }
  }, [code, pendingEmail]);

  async function handleLogout() {
    await signOut();
    location.reload();
  }

  function toggleNav() {
    if (window.innerWidth <= 768) setMobileOpen((o) => !o);
    else document.body.classList.toggle("nav-collapsed");
  }

  // ---------- LOGIN ----------
  if (status !== "authed") {
    return (
      <div className="login-view" id="loginView" style={{ display: "flex" }}>
        <div className="login-card">
          <div className="login-brand">
            <div className="login-lockup">
              <AmautaMark size={44} />
              <span className="login-wordmark">
                AMAUTA<span>Inversiones Financieras</span>
              </span>
            </div>
            <span className="login-pill">Amauta Local</span>
          </div>
          <h1 className="login-title">Acceso del equipo</h1>
          <p className="login-sub">
            {step === "email" ? (
              "Ingresá tu correo y te enviamos un código de acceso."
            ) : (
              <>
                Enviamos un código a <strong>{pendingEmail}</strong>. Revisá tu correo.
              </>
            )}
          </p>

          {step === "email" ? (
            <div className="login-step">
              <input
                type="email"
                placeholder="tu@amautainversiones.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
              />
              <button className="login-btn" disabled={busy} onClick={handleSend}>
                {busy ? "Enviando…" : "Enviar código"}
              </button>
            </div>
          ) : (
            <div className="login-step">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Código de 6 dígitos"
                maxLength={10}
                id="loginCode"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleVerify()}
              />
              <button className="login-btn" disabled={busy} onClick={handleVerify}>
                {busy ? "Ingresando…" : "Ingresar"}
              </button>
              <span
                className="login-link"
                onClick={() => {
                  setStep("email");
                  setError("");
                }}
              >
                ← Usar otro correo
              </span>
            </div>
          )}

          {error && (
            <div className="login-error" style={{ display: "block" }}>
              {error}
            </div>
          )}
          <div className="login-legal">
            Amauta Inversiones Financieras · CNV Mat. 1029 · amautainversiones.com
          </div>
        </div>
      </div>
    );
  }

  // ---------- APP ----------
  return (
    <>
      <button className="nav-toggle" onClick={toggleNav} title="Mostrar panel" aria-label="Mostrar panel">
        ☰
      </button>

      <aside className={`sidebar${mobileOpen ? " open" : ""}`} id="sidebar">
        <div className="sidebar-header">
          <Link href="/" className="sidebar-logo" title="Ir al inicio">
            <AmautaMark size={36} />
            <h1>
              AMAUTA<span>Local</span>
            </h1>
          </Link>
          <button
            className="nav-collapse-btn"
            onClick={() => {
              if (window.innerWidth <= 768) setMobileOpen(false);
              else document.body.classList.add("nav-collapsed");
            }}
            title="Ocultar panel"
            aria-label="Ocultar panel"
          >
            «
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-group-label">Herramientas</div>
          {TOOLS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`cedears-nav-entry tool-nav-entry${
                (t.href === "/fondos"
                  ? pathname === "/fondos" ||
                    pathname.startsWith("/fondo") ||
                    pathname === "/comparar" ||
                    pathname === "/rankings"
                  : pathname === t.href)
                  ? " active"
                  : ""
              }`}
            >
              {t.live ? <span className="cedears-live-dot" /> : <span className="news-nav-ico">{t.icon}</span>}
              <span className="ticker">{t.short}</span>
              <span className="inst-name">{t.sub}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-box">
            <span className="user-avatar">👤</span>
            <span className="user-email" id="userEmail">
              {/* email se muestra desde el estado si se desea */}
            </span>
            <button className="logout-btn" onClick={handleLogout}>
              Salir
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 10 }}>CNV Mat. 1029 · amautainversiones.com</div>
        </div>
      </aside>

      <div className="main" id="mainArea">
        <div className="content-area" id="contentArea">
          {children}
        </div>
        <div className="disclaimer">
          Este material es preparado por Amauta Inversiones Financieras (Matrícula CNV 1029) con fines
          informativos y no constituye una recomendación de inversión. La información proviene de fuentes
          consideradas confiables, sin garantizar su exactitud ni completitud. Las inversiones en mercados
          financieros implican riesgos, incluyendo la posible pérdida del capital invertido. Rentabilidades
          pasadas no garantizan resultados futuros.
        </div>
      </div>
    </>
  );
}
