import { ImageResponse } from "next/og";

// Tarjeta de vista previa al compartir el link (WhatsApp, Slack, etc.)
export const alt = "Amauta Local — Portal de Amauta Inversiones Financieras";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#1C1819",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Marca */}
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {/* Diamante + asterisco */}
          <div
            style={{
              position: "relative",
              width: 96,
              height: 96,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                position: "absolute",
                width: 74,
                height: 74,
                background: "#F3CF11",
                transform: "rotate(45deg)",
                borderRadius: 8,
              }}
            />
            <div style={{ position: "absolute", width: 44, height: 5, background: "#231F20", borderRadius: 3 }} />
            <div style={{ position: "absolute", width: 44, height: 5, background: "#231F20", borderRadius: 3, transform: "rotate(90deg)" }} />
            <div style={{ position: "absolute", width: 44, height: 5, background: "#231F20", borderRadius: 3, transform: "rotate(45deg)" }} />
            <div style={{ position: "absolute", width: 44, height: 5, background: "#231F20", borderRadius: 3, transform: "rotate(135deg)" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 30, letterSpacing: 8, color: "#B8B2B3", textTransform: "uppercase" }}>
              Inversiones Financieras
            </div>
            <div style={{ fontSize: 40, fontWeight: 800, color: "#F5F2F0", letterSpacing: 2 }}>AMAUTA</div>
          </div>
        </div>

        {/* Título */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 84, fontWeight: 800, color: "#F5F2F0", lineHeight: 1.05, display: "flex" }}>
            Amauta&nbsp;<span style={{ color: "#F3CF11" }}>Local</span>
          </div>
          <div style={{ fontSize: 34, color: "#B8B2B3", lineHeight: 1.35, maxWidth: 900 }}>
            Portal del equipo · CEDEARs, FCIs, Financiamiento, CRM, informes y chat financiero.
          </div>
        </div>

        {/* Barra inferior */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 26, color: "#8A8487" }}>amautainversiones.com · CNV Mat. 1029</div>
          <div style={{ width: 180, height: 8, background: "#621044", borderRadius: 4 }} />
        </div>
      </div>
    ),
    { ...size }
  );
}
