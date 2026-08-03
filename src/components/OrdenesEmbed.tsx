"use client";

import { useEffect, useState } from "react";

// OrdenBot — generador de órdenes (Apps Script web app).
const ORDENES_URL =
  "https://script.google.com/a/macros/amautainversiones.com/s/AKfycbzTpnsSXbkMV27aYe-MZQpp9dwTB3mT5iouMSryWevdS9IMXyGa9aCRNkJkAPKQ7deK/exec";

export default function OrdenesEmbed() {
  const [loaded, setLoaded] = useState(false);
  const [maybeBlocked, setMaybeBlocked] = useState(false);

  // Si en ~6s no cargó, probablemente Google bloqueó el embed (X-Frame-Options).
  useEffect(() => {
    const t = setTimeout(() => {
      if (!loaded) setMaybeBlocked(true);
    }, 6000);
    return () => clearTimeout(t);
  }, [loaded]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--surface-base)" }}>
      {/* Barra superior */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "12px 18px",
          borderBottom: "1px solid var(--brand-border)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>🧾</span>
          <div>
            <div style={{ fontWeight: 800, color: "var(--text-primary)", fontSize: 15, lineHeight: 1.1 }}>
              Órdenes
            </div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Generador de órdenes · Amauta</div>
          </div>
        </div>
        <a
          href={ORDENES_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            background: "var(--accent)",
            color: "var(--on-accent)",
            border: "none",
            borderRadius: 9,
            fontWeight: 800,
            fontSize: 13,
            padding: "9px 15px",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Abrir en pestaña nueva ↗
        </a>
      </div>

      {/* Contenido */}
      <div style={{ position: "relative", flex: 1 }}>
        {!loaded && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              textAlign: "center",
              padding: 24,
              color: "var(--text-secondary)",
              zIndex: 2,
            }}
          >
            {!maybeBlocked ? (
              <>
                <svg width="38" height="38" viewBox="0 0 50 50" aria-hidden>
                  <circle cx="25" cy="25" r="20" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
                  <path d="M25 5 A20 20 0 0 1 45 25" fill="none" stroke="var(--accent)" strokeWidth="6">
                    <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite" />
                  </path>
                </svg>
                <div style={{ fontSize: 14 }}>Cargando Órdenes…</div>
              </>
            ) : (
              <div style={{ maxWidth: 460 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
                  Si ves “rechazó la conexión”, abrilo en una pestaña nueva 👇
                </div>
                <p style={{ fontSize: 13.5, lineHeight: 1.55, marginBottom: 16 }}>
                  Google no permite mostrar esta herramienta embebida por defecto. Usá el botón para abrirla, o pedile a
                  soporte que active el modo embebido (1 línea en el Apps Script).
                </p>
                <a
                  href={ORDENES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: "var(--accent)",
                    color: "var(--on-accent)",
                    border: "none",
                    borderRadius: 10,
                    fontWeight: 800,
                    fontSize: 14,
                    padding: "12px 20px",
                    textDecoration: "none",
                    display: "inline-block",
                  }}
                >
                  Abrir Órdenes ↗
                </a>
              </div>
            )}
          </div>
        )}

        <iframe
          src={ORDENES_URL}
          title="Órdenes — Generador de órdenes"
          allow="clipboard-read; clipboard-write; fullscreen"
          referrerPolicy="no-referrer-when-downgrade"
          onLoad={() => setLoaded(true)}
          style={{ border: 0, width: "100%", height: "100%", display: "block", background: "transparent" }}
        />
      </div>
    </div>
  );
}
