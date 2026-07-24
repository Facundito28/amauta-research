"use client";

import { useState } from 'react';

export default function EmbedFrame({
  src,
  title,
}: {
  src: string;
  title: string;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      className="embed-wrap"
      style={{
        // Llenar el content-area (que YA descuenta el disclaimer del pie), no
        // 100vh. Con 100vh el iframe se dibujaba toda la pantalla y su borde
        // inferior — donde el CRM ancla su toast (bottom:24px) — quedaba
        // clippeado detrás del disclaimer. height:100% lo hace calzar justo.
        width: '100%',
        height: '100%',
        background: 'var(--surface-base, #1C1819)',
        borderRadius: 10,
        border: '1px solid var(--border, #3A3433)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'stretch',
      }}
    >
      {!loaded && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            background: 'linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0.2))',
            color: 'var(--color-text-secondary, #B8B2B3)',
            zIndex: 5,
            padding: 20,
            textAlign: 'center',
          }}
        >
          <svg width="36" height="36" viewBox="0 0 50 50" aria-hidden>
            <circle cx="25" cy="25" r="20" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
            <path d="M25 5 A20 20 0 0 1 45 25" fill="none" stroke="var(--accent, #F3CF11)" strokeWidth="6">
              <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite" />
            </path>
          </svg>
          <div style={{fontSize:14, color:'var(--color-text-secondary, #B8B2B3)'}}>Cargando…</div>
        </div>
      )}

      <iframe
        className="embed-frame"
        src={src}
        title={title}
        allow="clipboard-read; clipboard-write; fullscreen"
        referrerPolicy="no-referrer-when-downgrade"
        onLoad={() => setLoaded(true)}
        style={{
          border: 0,
          flex: 1,
          width: '100%',
          height: '100%',
          display: 'block',
          background: 'transparent',
        }}
      />
    </div>
  );
}
