# Amauta Research Browser — Project Brief for Claude Code

## What is this project?

A **single-file HTML dashboard** (`Amauta_Research.html`, ~1760 lines) that serves as Amauta Inversiones Financieras' internal research browser. It displays the firm's investment views across multiple asset classes, with interactive charts. It's branded, mobile-responsive, and requires no backend or hosting costs — just open the `.html` file in any browser.

**Owner**: Facundo Argañaraz (@FacundoArg28) — Amauta Inversiones Financieras (Multifamily Office, CNV matrícula 1029, Tucumán, Argentina).

---

## Architecture

### Single-file approach
- Everything lives in one HTML file: CSS, JS, data, and content
- Dependencies loaded from CDN: **Chart.js 4.4.1**, **Fira Sans** (Google Fonts)
- TradingView widget embedded for live price bar (top of instrument view) — note: only works when opened via HTTP, not `file://` protocol
- No backend, no database, no API calls for data. All instrument data is hardcoded in a JS object and updated manually through conversation with Facu

### Key data structure
```javascript
const INSTRUMENTS = {
  "NU":            { status: "ready",  category: "Equity US",     render: renderNU },
  "MSFT":          { status: "ready",  category: "Equity US",     render: renderMSFT },
  "UBER":          { status: "empty",  category: "Equity US",     render: renderEmpty },
  "V":             { status: "empty",  category: "Equity US",     render: renderEmpty },
  "SOBERANOS_USD": { status: "empty",  category: "Renta Fija AR", render: renderEmpty },
  "LECAPS":        { status: "empty",  category: "Renta Fija AR", render: renderEmpty },
  "CER":           { status: "empty",  category: "Renta Fija AR", render: renderEmpty },
  "ONS":           { status: "empty",  category: "Renta Fija AR", render: renderEmpty },
};
```

Each instrument with `status: "ready"` has a dedicated `render[TICKER]()` function and a `render[TICKER]Charts(tabIdx)` function for its Chart.js visualizations.

### Key functions
| Function | Purpose |
|---|---|
| `buildSidebar()` | Renders sidebar nav with instrument list grouped by category |
| `filterInstruments()` | Filters sidebar by search input and category buttons |
| `selectInstrument(key)` | Loads an instrument into the main panel |
| `switchTab(idx)` | Switches between tabs within an instrument, destroys/recreates charts |
| `destroyCharts()` | Cleans up Chart.js instances to prevent memory leaks |
| `toggleAdmin()` / `checkAdmin()` | Password-protected admin mode (password: `Amauta2026`) |
| `renderNU(container, inst)` | Full NU Holdings analysis (6 tabs) |
| `renderNUCharts(tabIdx)` | Chart.js charts for NU (financials, growth, valuation) |
| `renderMSFT(container, inst)` | Full Microsoft analysis (5 tabs) |
| `renderMSFTCharts(tabIdx)` | Chart.js charts for MSFT |
| `renderEmpty(container, inst)` | Placeholder for instruments without content yet |

### Critical pattern: adding a new instrument
When adding a new instrument (e.g., UBER):
1. Update the `INSTRUMENTS` object: change `status` to `"ready"`, define `tabs` array, set `render: renderUBER`
2. Write `renderUBER(container, inst)` function with all tab HTML
3. Write `renderUBERCharts(tabIdx)` function for Chart.js visualizations
4. **Update `switchTab()`** to call `renderUBERCharts(idx)` when `activeInstrument === 'UBER'`
5. Update `topMetrics`, `price`, `change`, `updated` fields in the INSTRUMENTS object

**IMPORTANT**: The `switchTab()` function must have an explicit `if` clause for every "ready" instrument, otherwise charts won't render when switching tabs. This was a bug that already happened once.

---

## Branding (mandatory)

| Element | Value |
|---|---|
| Primary color (yellow) | `#F3CF11` — hero, CTAs, accents, icons |
| Bordo/violet | `#621044` — section titles, emphasis |
| Black | `#231F20` — navbar, footer, dark backgrounds |
| Font | **Fira Sans** (all weights: 300, 400, 600, 700, 800) |
| Fallback | Arial |
| Tone | Formal "usted", client-facing, prudent, benefit-oriented |
| Disclaimer | **OBLIGATORIO** in all client-facing docs (see branding skill) |

CSS variables already defined:
```css
:root {
  --am-yellow: #F3CF11;
  --am-bordo: #621044;
  --am-black: #231F20;
  --am-pure-black: #000000;
  --am-white: #FFFFFF;
  --am-gray: #666666;
  --am-gray-light: #F1F1F1;
  --am-gray-dark: #58585A;
  --am-green: #27AE60;
  --am-red: #C0392B;
  --am-blue: #2980B9;
}
```

---

## Layout structure

```
┌─────────────────────────────────────────────────┐
│ [Mobile only] Top bar: ☰ AMAVTA | Research      │
├──────────┬──────────────────────────────────────┤
│ SIDEBAR  │  MAIN CONTENT                        │
│ 280px    │                                      │
│          │  ┌─ TradingView price bar ─────────┐ │
│ Logo     │  │ (topbar widget, not chart)       │ │
│ Search   │  └─────────────────────────────────┘ │
│ Filters  │  ┌─ Instrument header ─────────────┐ │
│          │  │ Name, metrics, price, change     │ │
│ NU    ●  │  └─────────────────────────────────┘ │
│ MSFT  ●  │  ┌─ Tab bar ──────────────────────┐ │
│ UBER  ○  │  │ Tesis | Financieros | ...       │ │
│ V     ○  │  └─────────────────────────────────┘ │
│          │  ┌─ Tab content ───────────────────┐ │
│ —Renta—  │  │ HTML + Chart.js canvases        │ │
│ GD/AL ○  │  │                                  │ │
│ LECAP ○  │  │                                  │ │
│ CER   ○  │  └─────────────────────────────────┘ │
│ ONs   ○  │  ┌─ Disclaimer footer ────────────┐ │
│          │  │ CNV 1029 · legal text            │ │
│ [Admin]  │  └─────────────────────────────────┘ │
├──────────┴──────────────────────────────────────┤
│ Footer: Amauta branding                         │
└─────────────────────────────────────────────────┘

● = ready (has full analysis)    ○ = empty (placeholder)
```

### Mobile responsive (≤768px)
- Sidebar becomes full-screen overlay, toggled via top bar `<a>` links
- Top bar shows "☰ AMAVTA" + "Research" label
- Close button (✕) inside sidebar
- Uses `<a href="javascript:void(0)">` instead of `<button>` for iOS Safari compatibility
- JS listeners: `mobileMenuLink` (open) and `sidebarCloseLink` (close)

---

## Completed instruments

### NU Holdings (Nubank) — 6 tabs
1. **Tesis**: Investment thesis, bull case, key catalysts, Facu's personal thesis (@FacundoArg28)
2. **Financieros**: Revenue/net income/EPS bar charts (2021-2026E), margins table
3. **Crecimiento**: Customer growth (100M+), ARPAC, engagement metrics, geographic expansion
4. **Valuación**: P/E, P/S, PEG, DCF range, comp table vs StoneCo/MercadoLibre/Inter
5. **Riesgos**: Regulatory, credit, competition, FX, concentration
6. **Modelo 2028**: Facu's proprietary "Modelo 2028" projection — target $18.45 (29.7% upside)

### Microsoft (MSFT) — 5 tabs
1. **Tesis**: Cloud+AI dominance thesis, target $585 (39% upside)
2. **Financieros**: Revenue/operating income/FCF charts, margin expansion narrative
3. **Segmentos & AI**: Intelligent Cloud, Productivity, Personal Computing breakdown + Azure AI ramp
4. **Valuación**: P/E, EV/EBITDA, DCF, comp table vs Apple/Google/Amazon
5. **Riesgos**: Antitrust, AI capex, cloud competition, valuation premium

---

## Pending work

### Instruments to populate
- **UBER** — needs full analysis like NU/MSFT
- **V (Visa)** — needs full analysis
- **SOBERANOS_USD (Soberanos Hard Dollar)** — GD30, GD35, GD38, GD41, GD46, AL30, AL35, AL41 (USD sovereign bonds Argentina). Different format than equities: price/yield tables, spread curves, duration analysis
- **LECAPS** — Letras Capitalizables (ARS fixed income). Tab structure TBD: current rates, curve, rollover analysis
- **CER** — Inflation-linked bonds (TX26, TX28, DICP, etc.). CER curve, breakeven inflation, real yield
- **ONS** — Obligaciones Negociables (corporate bonds AR). Yield comparison table, credit quality, duration

### Features to build
- **Admin mode expansion**: Currently admin just toggles a visual badge. Future: authorized users can edit content, others view-only. Facu mentioned possibly password-gating an edit interface
- **Data loading workflow**: Currently all data is hardcoded in JS. Facu loads data by chatting with Claude and regenerating the file. No automated data feeds
- **Live prices**: TradingView topbar widget works for equities when served over HTTP but not `file://`. Could explore alternatives or suggest simple local HTTP server

### Known issues / gotchas
- **TradingView widgets don't load from `file://` protocol** — works fine if served from a local HTTP server (`python -m http.server`)
- **iOS Safari mobile**: Was historically problematic with `<button>` elements not responding to touch. Solved by using `<a href="javascript:void(0)">` tags with both `click` and `touchend` listeners
- **Chart.js cleanup is critical**: Must call `destroyCharts()` before rendering new charts, or Chart.js throws "Canvas is already in use" errors
- **switchTab must be updated for every new instrument**: Add an `if (activeInstrument === 'TICKER')` clause — forgetting this causes charts to not render

---

## How to work on this file

1. **Always read the full file first** — it's ~1760 lines, everything is interconnected
2. **Use Edit tool for targeted changes** — don't rewrite the whole file
3. **When adding an instrument**: follow the pattern of renderNU/renderMSFT exactly. Copy the structure, update data, add to switchTab()
4. **Test chart rendering**: every Chart.js canvas needs a unique ID, and `chartInstances.push()` must be called for cleanup
5. **Maintain branding**: use CSS variables (`var(--am-yellow)`, etc.), Fira Sans font, formal "usted" tone in Spanish text
6. **Disclaimer is mandatory** at the bottom of every instrument view

---

## File location
```
C:\Users\AMAUTA\OneDrive\Escritorio\Claude Code\Amauta_Research.html
```
(Mounted workspace — this is the user's actual desktop folder)
