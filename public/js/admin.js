import { AmautaDB, adminWrite } from './supabase-client.js';
import { AmautaRenderer } from './renderer.js';

const BLOCK_TYPES = ['paragraph', 'thesis_box', 'stat_grid', 'chart', 'risk_list', 'html_raw'];

const SKILL_CONTENT = `---
name: add-instrument
description: Crea o actualiza instrumentos en el Research Browser de Amauta Inversiones (amauta-research.vercel.app). Detecta MODO CREAR vs ACTUALIZAR. Entrega un unico JSON array para carga directa en el panel admin.
---

Sos el asistente de Amauta Inversiones Financieras para el Research Browser (amauta-research.vercel.app, backend Supabase).

## Detectar modo

- Prompt incluye [BLOQUES ACTUALES] -> MODO ACTUALIZAR
- Sin bloques actuales -> MODO CREAR

## MODO CREAR

1. Lee el research adjunto (PDFs, screenshots, notas)
2. Identifica el anio fiscal mas reciente con datos reales vs estimaciones
3. Construi bloques para TODOS los tabs desde cero
4. Marca estimaciones con E (FY26E, nunca FY26 solo)
5. Disclaimer CNV obligatorio como ultimo bloque del array

Tabs estandar Equity: Tesis | Financieros | Crecimiento | Valuacion | Riesgos
Tabs estandar Renta Fija AR: Overview | Curva y TIR | Duration y Spreads | Estrategia

## MODO ACTUALIZAR

1. Mapea lo actual: lista datos existentes y sus periodos antes de modificar nada
2. Compara: [ACTUAL] Revenue FY25 $15.2B -> [NUEVO] $15.8B (Q4 earnings Feb 2026)
3. Regla anti-regresion: NUNCA reemplaces datos con informacion de periodos anteriores
4. Scope quirurgico: solo modifica los tabs que el usuario indico explicitamente
5. Preserva el target price: no toques change_text salvo indicacion explicita del usuario

## Formato de entrega - MUY IMPORTANTE

Escribe tu analisis primero. Al final, UN UNICO bloque json con todos los bloques en un solo array.
No uses multiples bloques json separados. Todo junto al final.

Estructura de cada elemento:
{ "tab_index": N, "block_order": 10, "block_type": "tipo", "data": { ... } }

- tab_index: 0 = primer tab, 1 = segundo, etc.
- block_order: multiplos de 10 (10, 20, 30...)
- block_type: thesis_box | stat_grid | chart | paragraph | risk_list | html_raw

En MODO ACTUALIZAR: incluye solo los bloques de los tabs que cambian.

## Tipos de bloques

thesis_box data: { "title": "Tesis de inversion", "intro_html": "Parrafo.", "points": [{ "num": 1, "html": "detalle" }] }

stat_grid data: { "items": [{ "label": "Revenue FY25", "value": "$15.8B", "detail": "+37% YoY", "badge": { "variant": "green", "text": "37%" } }] }
Badges: green | red | blue | yellow

chart data: { "title": "Revenue", "chart_type": "bar", "labels": ["FY23","FY24","FY25","FY26E"], "datasets": [{ "label": "Revenue", "data": [7.9,11.5,15.8,20.1], "backgroundColor": "#621044" }], "options": { "scales": { "y": { "tickPrefix": "$", "tickSuffix": "B" } } }, "note": "Fuente: earnings reports." }
Benchmark opcional (solo en graficos de retorno % o precio, NO en revenue/EPS): agrega un segundo dataset con "benchmark": true y el renderer lo muestra como linea punteada automaticamente. Ejemplo: { "label": "SPY (ref.)", "data": [8,15,22,30], "benchmark": true }

risk_list data: { "items": [{ "level": "high", "level_label": "Alto", "title": "Riesgo", "description": "Descripcion y mitigantes." }] }

paragraph data: { "html": "Texto HTML libre." }

## Disclaimer CNV - ultimo elemento del array siempre

{ "tab_index": N, "block_order": 999, "block_type": "paragraph", "data": { "html": "<em style='font-size:11px;color:#666;'>Este material es preparado por Amauta Inversiones Financieras (Matricula CNV 1029) con fines informativos y no constituye una recomendacion de inversion. La informacion proviene de fuentes consideradas confiables, sin garantizar su exactitud ni completitud. Las inversiones en mercados financieros implican riesgos, incluyendo la posible perdida del capital invertido. Rentabilidades pasadas no garantizan resultados futuros.</em>" } }

Reemplaza N con el tab_index del ultimo tab.

## Reglas generales

- Espanol formal (usted), tono prudente orientado al cliente
- Estimaciones con E (FY26E)
- Fuentes en campo note de charts o como paragraph al final del tab
- Target price: expresar como +XX.X% al target en change_text (vision propia de Amauta)
`;

export function downloadSkill() {
  const blob = new Blob([SKILL_CONTENT], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'add-instrument.md';
  a.click();
  URL.revokeObjectURL(url);
}

function generatePromptText(inst, blocks) {
  const isReady = inst.status === 'ready';
  const tabs = inst.tabs || [];
  const tabsInfo = tabs.length
    ? 'Tabs actuales: ' + tabs.map((t, i) => `${i}. ${t}`).join(' | ')
    : 'Tabs a definir: Tesis | Financieros | Crecimiento | Valuación | Riesgos';

  let currentBlocksSection = '';
  if (isReady && blocks && blocks.length) {
    const blocksJson = blocks.map(b => ({
      id: b.id,
      tab_index: b.tab_index,
      tab_name: tabs[b.tab_index] || `Tab ${b.tab_index}`,
      block_order: b.block_order,
      block_type: b.block_type,
      data: b.data
    }));
    currentBlocksSection = `
--- BLOQUES ACTUALES (contenido vigente en Supabase) ---
IMPORTANTE: Estos son los datos que están ACTUALMENTE en la web.
Antes de modificar cualquier cosa, revisá qué datos ya existen y verificá
que el nuevo research sea más reciente. No reemplaces datos con información
de períodos anteriores.

${JSON.stringify(blocksJson, null, 2)}

--- FIN BLOQUES ACTUALES ---
`;
  }

  const modeLabel = isReady ? '🔄 MODO: ACTUALIZAR instrumento existente' : '➕ MODO: CREAR instrumento nuevo';
  const modeInstructions = isReady
    ? `Seguí el protocolo MODO ACTUALIZAR del skill:
1. Listá brevemente qué datos financieros hay actualmente y de qué período son
2. Comparé el nuevo research contra los datos actuales — marcá con ⚠️ cualquier dato más viejo
3. Solo modificá los bloques que el nuevo research explícitamente actualiza
4. Mostrá el diferencial: qué cambia, por qué, y de dónde viene el dato nuevo
5. No toques el target price (change_text) salvo que yo lo indique explícitamente`
    : `Seguí el protocolo MODO CREAR del skill:
1. Construí bloques para todos los tabs desde cero con el research adjunto
2. Marcá estimaciones con "E" (ej. FY26E) y datos reales sin sufijo
3. Incluí la fuente de cada dato importante en el campo "note" de los charts
4. Disclaimer CNV obligatorio al final del último tab`;

  return `=== PROMPT PARA CLAUDE — ${inst.ticker} ===
${modeLabel}

📌 Instrumento: ${inst.ticker} — ${inst.name}
🏷️  Categoría: ${inst.category || 'Equity US'}
📊 Status: ${inst.status}
${inst.tv_symbol ? '📈 TradingView: ' + inst.tv_symbol : ''}
${inst.change_text ? '🎯 Target actual: ' + inst.change_text : ''}
${inst.updated_text ? '📅 Última actualización: ' + inst.updated_text : ''}
${tabsInfo}

--- INSTRUCCIONES ---
${modeInstructions}

--- FORMATO DE ENTREGA — MUY IMPORTANTE ---
Al final de tu respuesta, entregá UN ÚNICO bloque de código JSON con todos los bloques.
El usuario lo pegará en el panel admin y se cargarán solos con un click.
No separes los bloques, no uses texto entre ellos. Un solo array al final.

Estructura de cada elemento:
  { "tab_index": N, "block_order": 10, "block_type": "tipo", "data": { ... } }

- tab_index: número de tab (0 = ${tabs[0] || 'primer tab'}, 1 = ${tabs[1] || 'segundo tab'}, etc.)
- block_order: 10, 20, 30... (múltiplos de 10)
- block_type: thesis_box | stat_grid | chart | paragraph | risk_list | html_raw

Ejemplo de formato final:
\`\`\`json
[
  { "tab_index": 0, "block_order": 10, "block_type": "thesis_box", "data": { ... } },
  { "tab_index": 0, "block_order": 20, "block_type": "stat_grid", "data": { ... } },
  { "tab_index": 1, "block_order": 10, "block_type": "chart", "data": { ... } }
]
\`\`\`
${currentBlocksSection}
--- MI RESEARCH (adjuntá aquí tus PDFs, notas, balances, screenshots) ---
[PEGÁ O ADJUNTÁ TU RESEARCH AQUÍ]

--- TARGET PRICE DE AMAUTA ---
${isReady ? '(Solo completá si querés cambiar el target vigente)' : '(Opcional para instrumento nuevo)'}
Nuevo target: $___  |  Precio actual: $___  |  Upside: ___%`;
}

function copyPromptToClipboard() {
  const ta = document.getElementById('ad-prompt-text');
  if (!ta) return;
  navigator.clipboard.writeText(ta.value).then(() => {
    const btn = document.getElementById('ad-copy-prompt');
    if (btn) { btn.textContent = '✓ Copiado!'; setTimeout(() => { btn.textContent = '📋 Copiar prompt'; }, 2500); }
  }).catch(() => {
    ta.select(); document.execCommand('copy');
    const btn = document.getElementById('ad-copy-prompt');
    if (btn) { btn.textContent = '✓ Copiado!'; setTimeout(() => { btn.textContent = '📋 Copiar prompt'; }, 2500); }
  });
}

function todayAsText() {
  const d = new Date();
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function calcAndFillUpside() {
  const cur = parseFloat(document.getElementById('f-cur-price').value);
  const tgt = parseFloat(document.getElementById('f-tgt-price').value);
  const result = document.getElementById('ad-upside-result');
  if (!cur || !tgt) { result.textContent = ''; return; }
  const pct = ((tgt / cur) - 1) * 100;
  const sign = pct >= 0 ? '+' : '';
  const text = `${sign}${pct.toFixed(1)}% al target`;
  result.textContent = text;
  result.style.color = pct >= 0 ? 'var(--am-green)' : 'var(--am-red)';
  document.getElementById('f-change').value = text;
  document.getElementById('f-dir').value = pct >= 0 ? 'up' : 'down';
}

async function fetchYahooPrice(ticker) {
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(yahooUrl)}`,
  ];
  let lastErr;
  for (const proxyUrl of proxies) {
    try {
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (!price) throw new Error('Precio no encontrado en respuesta');
      return price;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Todos los proxies fallaron');
}

async function fetchAndFillLivePrice() {
  const ticker = document.getElementById('f-ticker')?.value?.trim();
  if (!ticker) return;
  const btn = document.getElementById('ad-fetch-price');
  const lbl = document.getElementById('ad-live-price-lbl');
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
  if (lbl) { lbl.textContent = 'Buscando...'; lbl.style.color = 'var(--am-gray)'; }
  try {
    const price = await fetchYahooPrice(ticker);
    document.getElementById('f-cur-price').value = price.toFixed(2);
    if (lbl) { lbl.textContent = `Live: $${price.toFixed(2)}`; lbl.style.color = 'var(--am-green)'; }
    calcAndFillUpside();
  } catch (e) {
    if (lbl) { lbl.textContent = 'No disponible — ingresalo manualmente'; lbl.style.color = 'var(--am-red)'; }
  }
  if (btn) { btn.textContent = '🔄 Precio live'; btn.disabled = false; }
}

let state = {
  instrumentId: null,
  instrument: null,
  blocks: [],
  activeTab: 0,
  allInstruments: [],
};

export function openPanel() {
  AmautaDB.clearCache();
  const container = document.getElementById('contentArea');
  if (!container) return;
  document.getElementById('welcomeScreen')?.remove();
  document.getElementById('topbar').style.display = 'none';

  container.innerHTML = `
    <div class="admin-panel">
      <h2>Panel de administración</h2>
      <p class="admin-sub">Crear instrumentos nuevos, editar existentes, cargar bloques de contenido.</p>

      <div class="admin-section">
        <h3>📊 Estado de instrumentos</h3>
        <div id="ad-estado-list"><p style="color:var(--am-gray);font-size:13px;">Cargando...</p></div>
      </div>

      <div class="admin-section">
        <h3>📂 Editar instrumento existente</h3>
        <div class="admin-row">
          <div class="admin-field full">
            <label>Seleccioná uno para editar su contenido</label>
            <select id="ad-select"></select>
          </div>
        </div>
      </div>

      <div class="admin-section" style="border:2px dashed #d0d0d0;">
        <h3>➕ Nuevo instrumento</h3>
        <p style="font-size:13px;color:var(--am-gray);margin-bottom:14px;">Completá los datos y generá el prompt para Claude. Cuando tengas el JSON listo, hacé clic en "Crear en Supabase" para guardar.</p>
        <div class="admin-row">
          <div class="admin-field">
            <label>Ticker</label>
            <input id="ad-new-ticker" placeholder="Ej: NVDA">
          </div>
          <div class="admin-field">
            <label>Nombre completo</label>
            <input id="ad-new-name" placeholder="Ej: Nvidia Corp">
          </div>
          <div class="admin-field">
            <label>Tipo</label>
            <select id="ad-new-tipo">
              <option value="equity">Equity</option>
              <option value="renta-fija">Renta Fija</option>
            </select>
          </div>
          <div class="admin-field">
            <label>Categoría</label>
            <input id="ad-new-cat" value="Equity US">
          </div>
        </div>
        <div class="admin-row">
          <div class="admin-field full">
            <label>Tabs (uno por línea)</label>
            <textarea id="ad-new-tabs" rows="4">Tesis
Financieros
Crecimiento
Valuación
Riesgos</textarea>
          </div>
        </div>
        <div class="admin-actions">
          <button class="admin-btn yellow" id="ad-gen-prompt">⚡ Generar prompt para Claude</button>
          <button class="admin-btn secondary" id="ad-new">+ Crear en Supabase</button>
        </div>
      </div>

      <div class="admin-section admin-section-ia">
        <h3>🤖 Herramientas para Claude</h3>
        <p class="admin-sub" style="margin-bottom:14px;">Descargá el skill para que Claude entienda la arquitectura del proyecto, y generá el prompt con el instrumento seleccionado para cargar research.</p>
        <div class="admin-row" style="align-items:flex-start;gap:12px;">
          <div style="flex:1;">
            <p style="font-size:12px;color:var(--am-gray-dark);margin-bottom:8px;">
              <strong>Paso 1</strong> — Descargá el skill e instalalo en Claude Code (<code style="font-size:11px;">.claude/skills/</code>)
            </p>
            <button class="admin-btn yellow" id="ad-dl-skill">⬇ Descargar add-instrument.md</button>
          </div>
          <div style="flex:2;" id="ad-ia-prompt-wrap">
            <p style="font-size:12px;color:var(--am-gray-dark);margin-bottom:8px;">
              <strong>Paso 2</strong> — Seleccioná un instrumento arriba para generar el prompt
            </p>
            <div id="ad-prompt-section" style="display:none;">
              <textarea id="ad-prompt-text" rows="7" style="width:100%;font-size:11px;font-family:monospace;border:1px solid #ddd;border-radius:6px;padding:10px;resize:vertical;" readonly></textarea>
              <div class="admin-actions" style="margin-top:8px;">
                <button class="admin-btn" id="ad-copy-prompt">📋 Copiar prompt</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="ad-editor"></div>
    </div>
  `;

  document.getElementById('ad-select').addEventListener('change', e => loadInstrument(e.target.value));
  document.getElementById('ad-new').addEventListener('click', newInstrument);
  document.getElementById('ad-gen-prompt').addEventListener('click', generateNewInstPrompt);
  document.getElementById('ad-dl-skill').addEventListener('click', downloadSkill);
  document.getElementById('ad-new-tipo').addEventListener('change', function () {
    const isRF = this.value === 'renta-fija';
    const tabsTA = document.getElementById('ad-new-tabs');
    const catIn  = document.getElementById('ad-new-cat');
    if (tabsTA) tabsTA.value = isRF
      ? 'Overview\nCurva y TIR\nDuration y Spreads\nEstrategia'
      : 'Tesis\nFinancieros\nCrecimiento\nValuación\nRiesgos';
    if (catIn) catIn.value = isRF ? 'Renta Fija AR' : 'Equity US';
  });
  document.getElementById('ad-copy-prompt')?.addEventListener('click', copyPromptToClipboard);
  populateSelect();
}

async function populateSelect() {
  const sel = document.getElementById('ad-select');
  const list = await AmautaDB.listInstruments();
  state.allInstruments = list;
  const badge = s => s === 'ready' ? ' ✓' : s === 'wip' ? ' ⚠' : ' ○';
  sel.innerHTML = '<option value="">— elegir —</option>' +
    list.map(i => `<option value="${i.id}">${i.id} — ${i.name}${badge(i.status)}</option>`).join('');
  if (state.instrumentId) sel.value = state.instrumentId;
  buildEstadoList(list);
}

async function generateNewInstPrompt() {
  const ticker = (document.getElementById('ad-new-ticker')?.value || '').trim().toUpperCase();
  const name   = (document.getElementById('ad-new-name')?.value || '').trim();
  const tipo   = document.getElementById('ad-new-tipo')?.value || 'equity';
  const cat    = (document.getElementById('ad-new-cat')?.value || '').trim();
  const tabsRaw = (document.getElementById('ad-new-tabs')?.value || '').trim();

  if (!ticker || !name) {
    alert('Completá el Ticker y el Nombre del instrumento para generar el prompt.');
    return;
  }

  const existing = state.allInstruments.find(i => i.id.toUpperCase() === ticker || i.ticker.toUpperCase() === ticker);
  if (existing) {
    const cont = confirm(`ℹ️ "${ticker}" ya existe en la base de datos (status: ${existing.status}).\n\nSe generará el prompt en MODO ACTUALIZAR.\n¿Continuar?`);
    if (!cont) return;
    await loadInstrument(existing.id);
    return;
  }

  const tabs = tabsRaw
    ? tabsRaw.split('\n').map(s => s.trim()).filter(Boolean)
    : (tipo === 'equity'
        ? ['Tesis', 'Financieros', 'Crecimiento', 'Valuación', 'Riesgos']
        : ['Overview', 'Curva y TIR', 'Duration y Spreads', 'Estrategia']);

  const inst = {
    ticker, name, type: tipo,
    category: cat || (tipo === 'equity' ? 'Equity US' : 'Renta Fija AR'),
    status: 'empty', tabs, tv_symbol: null, change_text: null, updated_text: null,
  };

  const ta = document.getElementById('ad-prompt-text');
  const ps = document.getElementById('ad-prompt-section');
  if (ta && ps) {
    ta.value = generatePromptText(inst, []);
    ps.style.display = 'block';
    ps.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Resetear state para instrumento nuevo y mostrar el editor con el área de JSON
  state.instrumentId = null;   // ← clave: limpia el ID del instrumento anterior
  state.instrument = {
    ...inst,
    id: ticker,
    price: '', change_dir: 'up', top_metrics: {}, sort_order: 100,
  };
  state.blocks = [];
  state.activeTab = 0;
  const editor = document.getElementById('ad-editor');
  if (editor) {
    renderEditor();
    setTimeout(() => {
      document.getElementById('ad-bulk-json')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }
}

function buildEstadoList(list) {
  const el = document.getElementById('ad-estado-list');
  if (!el) return;
  const statusLabels = { ready: 'Completo', wip: 'En desarrollo', empty: 'Pendiente' };
  const statusColors = { ready: '#d4edda;color:#155724', wip: '#fff3cd;color:#856404', empty: '#e9ecef;color:#6c757d' };
  el.innerHTML = list.map(inst => {
    const s = inst.status || 'empty';
    const badgeStyle = statusColors[s] || statusColors.empty;
    return `<div style="display:flex;align-items:center;padding:9px 12px;border-radius:8px;margin-bottom:5px;background:#f9f9f9;gap:12px;">
      <span style="font-weight:700;font-size:14px;min-width:60px;">${esc(inst.ticker)}</span>
      <span style="font-size:12px;color:var(--am-gray);flex:1;">${esc(inst.name)}</span>
      <span style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px;background:${badgeStyle.split(';')[0]};${badgeStyle.split(';')[1] || ''};">${statusLabels[s] || s}</span>
      <span style="font-size:11px;color:var(--am-gray-dark);min-width:100px;text-align:right;">${esc(inst.change_text || '—')}</span>
    </div>`;
  }).join('');
}

async function loadInstrument(id) {
  if (!id) {
    document.getElementById('ad-editor').innerHTML = '';
    const ps = document.getElementById('ad-prompt-section');
    if (ps) ps.style.display = 'none';
    return;
  }
  state.instrumentId = id;
  state.instrument = await AmautaDB.getInstrument(id);
  state.blocks = await AmautaDB.getBlocks(id);
  state.activeTab = 0;
  renderEditor();
  const ps = document.getElementById('ad-prompt-section');
  const ta = document.getElementById('ad-prompt-text');
  if (ps && ta) {
    ta.value = generatePromptText(state.instrument, state.blocks);
    ps.style.display = 'block';
  }
}

function newInstrument() {
  const ticker  = (document.getElementById('ad-new-ticker')?.value || '').trim().toUpperCase();
  const name    = (document.getElementById('ad-new-name')?.value || '').trim();
  const tipo    = document.getElementById('ad-new-tipo')?.value || 'equity';
  const cat     = (document.getElementById('ad-new-cat')?.value || '').trim();
  const tabsRaw = (document.getElementById('ad-new-tabs')?.value || '').trim();
  const tabs    = tabsRaw.split('\n').map(s => s.trim()).filter(Boolean);

  const existing = state.allInstruments.find(i => i.id.toUpperCase() === ticker || i.ticker.toUpperCase() === ticker);
  if (existing) {
    alert(`⚠️ Ya existe un instrumento "${existing.id} — ${existing.name}" en la base de datos.\n\nUsa "Editar instrumento existente" en el selector de arriba para modificarlo.`);
    const sel = document.getElementById('ad-select');
    if (sel && existing.status !== 'empty') sel.value = existing.id;
    return;
  }

  state.instrumentId = null;
  state.instrument = {
    id: ticker || '', ticker, name, type: tipo,
    category: cat || (tipo === 'equity' ? 'Equity US' : 'Renta Fija AR'),
    status: 'empty', tv_symbol: '', price: '', change_text: '', change_dir: 'up',
    updated_text: '', top_metrics: {}, tabs, sort_order: 100,
  };
  state.blocks = [];
  state.activeTab = 0;
  renderEditor();
}

function renderEditor() {
  const inst = state.instrument;
  const editor = document.getElementById('ad-editor');

  editor.innerHTML = `
    <div class="admin-section">
      <h3>${state.instrumentId ? 'Editar metadata' : 'Nuevo instrumento'}</h3>
      <div class="admin-row">
        <div class="admin-field"><label>ID único</label>
          <input id="f-id" value="${esc(inst.id)}" ${state.instrumentId ? 'disabled' : ''} placeholder="Ej: NVDA"></div>
        <div class="admin-field"><label>Ticker visible</label>
          <input id="f-ticker" value="${esc(inst.ticker)}" placeholder="Ej: NVDA"></div>
        <div class="admin-field"><label>Nombre</label>
          <input id="f-name" value="${esc(inst.name)}"></div>
      </div>
      <div class="admin-row">
        <div class="admin-field"><label>Tipo</label>
          <select id="f-type">
            <option value="equity" ${inst.type === 'equity' ? 'selected' : ''}>Equity</option>
            <option value="renta-fija" ${inst.type === 'renta-fija' ? 'selected' : ''}>Renta Fija</option>
          </select></div>
        <div class="admin-field"><label>Categoría</label>
          <input id="f-category" value="${esc(inst.category)}" placeholder="Equity US / Renta Fija AR"></div>
        <div class="admin-field"><label>Status</label>
          <select id="f-status">
            <option value="ready" ${inst.status === 'ready' ? 'selected' : ''}>Ready</option>
            <option value="wip" ${inst.status === 'wip' ? 'selected' : ''}>WIP</option>
            <option value="empty" ${inst.status === 'empty' ? 'selected' : ''}>Empty</option>
          </select></div>
      </div>
      <div class="admin-row">
        <div class="admin-field"><label>TradingView symbol</label>
          <input id="f-tv" value="${esc(inst.tv_symbol || '')}" placeholder="NYSE:NU"></div>
        <div class="admin-field"><label>Precio (texto)</label>
          <input id="f-price" value="${esc(inst.price || '')}"></div>
        <div class="admin-field"><label>Change (texto)</label>
          <input id="f-change" value="${esc(inst.change_text || '')}" placeholder="Ej: +29.7% al target"></div>
        <div class="admin-field"><label>Change dir</label>
          <select id="f-dir">
            <option value="up" ${inst.change_dir === 'up' ? 'selected' : ''}>Up</option>
            <option value="down" ${inst.change_dir === 'down' ? 'selected' : ''}>Down</option>
          </select></div>
      </div>
      <div class="admin-row">
        <div class="admin-field full">
          <label>Calculadora de upside → completa "Change" automáticamente</label>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <input id="f-cur-price" type="number" placeholder="Precio actual $" step="0.01" style="max-width:130px;">
            <button class="admin-btn secondary" id="ad-fetch-price" style="white-space:nowrap;font-size:12px;">🔄 Precio live</button>
            <span id="ad-live-price-lbl" style="font-size:11px;color:var(--am-gray);"></span>
            <input id="f-tgt-price" type="number" placeholder="Target price $" step="0.01" style="max-width:130px;margin-left:8px;">
            <button class="admin-btn secondary" id="ad-calc-upside" style="white-space:nowrap;">Calcular %</button>
            <span id="ad-upside-result" style="font-weight:800;font-size:15px;"></span>
          </div>
        </div>
      </div>
      <div class="admin-row">
        <div class="admin-field"><label>Updated (texto)</label>
          <div style="display:flex;gap:6px;align-items:center;">
            <input id="f-updated" value="${esc(inst.updated_text || '')}" style="flex:1;">
            <button class="admin-btn secondary" id="ad-fill-today" style="white-space:nowrap;font-size:11px;padding:8px 10px;" title="Llenar con fecha de hoy">📅 Hoy</button>
          </div></div>
        <div class="admin-field"><label>Orden</label>
          <input id="f-sort" type="number" value="${inst.sort_order || 100}"></div>
      </div>
      <div class="admin-row">
        <div class="admin-field full"><label>Tabs (uno por línea)</label>
          <textarea id="f-tabs" rows="4">${esc((inst.tabs || []).join('\n'))}</textarea></div>
        <div class="admin-field full"><label>Top metrics (JSON)</label>
          <textarea id="f-metrics" rows="3">${esc(JSON.stringify(inst.top_metrics || {}, null, 2))}</textarea></div>
      </div>
      <div class="admin-actions">
        <button class="admin-btn" id="ad-save-meta">💾 Guardar metadata</button>
        ${state.instrumentId ? '<button class="admin-btn danger" id="ad-delete">🗑 Eliminar instrumento</button>' : ''}
      </div>
      <div class="admin-status" id="ad-meta-status"></div>
    </div>

    ${state.instrumentId ? renderBlocksSection() : renderNewInstJsonSection()}
  `;

  document.getElementById('ad-save-meta').addEventListener('click', saveMetadata);
  document.getElementById('ad-calc-upside')?.addEventListener('click', calcAndFillUpside);
  document.getElementById('ad-fetch-price')?.addEventListener('click', fetchAndFillLivePrice);
  document.getElementById('ad-fill-today')?.addEventListener('click', () => {
    const el = document.getElementById('f-updated');
    if (el) el.value = todayAsText();
  });
  if (state.instrumentId) {
    document.getElementById('ad-delete')?.addEventListener('click', deleteInstrument);
    wireBlockEditor();
  } else {
    // Instrumento nuevo: conectar el botón de carga que primero guarda metadata
    document.getElementById('ad-bulk-load')?.addEventListener('click', bulkLoadNewInstrument);
  }
}

// Sección de carga JSON para instrumentos nuevos (aún no guardados en Supabase)
function renderNewInstJsonSection() {
  if (!state.instrument) return '';
  return `
  <div class="admin-section admin-section-ia">
    <h3>📥 Cargar bloques desde Claude</h3>
    <p style="font-size:13px;color:#7a6500;margin:0 0 12px;">
      Pegá el JSON que te dio Claude. Al hacer clic en <strong>Cargar bloques</strong>, el instrumento
      se guarda automáticamente en Supabase y los bloques se cargan en un solo paso.
    </p>
    <textarea id="ad-bulk-json" rows="7"
      placeholder='Pegá aquí el JSON de Claude. Puede tener markdown (\`\`\`json ... \`\`\`) — lo extrae automáticamente.&#10;&#10;Formato esperado: [ { "tab_index": 0, "block_order": 10, "block_type": "...", "data": {...} }, ... ]'
      style="font-family:monospace;font-size:12px;width:100%;box-sizing:border-box;"></textarea>
    <div style="display:flex;align-items:center;gap:12px;margin-top:10px;flex-wrap:wrap;">
      <button class="admin-btn yellow" id="ad-bulk-load" style="font-size:14px;padding:10px 22px;">📥 Guardar instrumento y cargar bloques</button>
      <span id="ad-bulk-status" class="admin-status" style="display:inline-block;"></span>
    </div>
  </div>`;
}

function renderBlocksSection() {
  const tabs = state.instrument.tabs || [];
  if (!tabs.length) {
    return `<div class="admin-section">
      <h3>Bloques de contenido</h3>
      <p style="color:var(--am-gray);font-size:13px;">Definí los tabs primero (arriba) y guardá la metadata para poder agregar bloques.</p>
    </div>`;
  }
  const tabChips = tabs.map((t, i) => {
    const count = state.blocks.filter(b => b.tab_index === i).length;
    const badge = count > 0
      ? `<span style="background:${i === state.activeTab ? 'rgba(255,255,255,0.25)' : 'rgba(98,16,68,0.12)'};color:${i === state.activeTab ? '#fff' : 'var(--am-bordo)'};border-radius:10px;padding:1px 6px;font-size:10px;font-weight:700;margin-left:5px;">${count}</span>`
      : '';
    return `<div class="tab-chip ${i === state.activeTab ? 'active' : ''}" data-idx="${i}">${esc(t)}${badge}</div>`;
  }).join('');
  const blocksInTab = state.blocks.filter(b => b.tab_index === state.activeTab)
    .sort((a, b) => a.block_order - b.block_order);
  const blockCards = blocksInTab.map(renderBlockCard).join('') ||
    `<p style="color:var(--am-gray);font-size:13px;">No hay bloques en este tab. Agregá uno abajo.</p>`;

  return `<div class="admin-section admin-section-ia" style="margin-bottom:0;border-radius:10px 10px 0 0;border-bottom:none;">
    <h3>📥 Cargar bloques desde Claude</h3>
    <p style="font-size:13px;color:#7a6500;margin:0 0 10px;">1. Copiá el prompt de arriba → pegalo en Claude con tu research adjunto<br>2. Claude te devuelve un JSON → pegalo acá → click Cargar. Listo.</p>
    <textarea id="ad-bulk-json" rows="6" placeholder='Pegá aquí el JSON que te dio Claude. Debe ser un array: [ { "tab_index": 0, "block_order": 10, "block_type": "...", "data": {...} }, ... ]' style="font-family:monospace;font-size:12px;width:100%;box-sizing:border-box;"></textarea>
    <div style="display:flex;align-items:center;gap:12px;margin-top:8px;flex-wrap:wrap;">
      <button class="admin-btn yellow" id="ad-bulk-load" style="font-size:14px;padding:10px 22px;">📥 Cargar bloques</button>
      <span id="ad-bulk-status" class="admin-status" style="display:inline-block;"></span>
    </div>
  </div>

  <div class="admin-section" style="border-radius:0 0 10px 10px;">
    <div class="tab-editor-head">
      <h3>Bloques de contenido</h3>
    </div>
    <div class="tab-chip-bar">${tabChips}</div>
    <div class="block-list" id="ad-blocks">${blockCards}</div>

    <div class="admin-row" style="margin-top:18px;">
      <div class="admin-field"><label>Nuevo bloque — tipo</label>
        <select id="ad-new-type">
          ${BLOCK_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select></div>
      <div class="admin-field" style="align-self:end;">
        <button class="admin-btn yellow" id="ad-add-block">+ Agregar bloque al tab</button>
      </div>
    </div>
  </div>`;
}

function renderBlockCard(b) {
  return `<div class="block-card" data-bid="${b.id}">
    <div class="block-card-head">
      <div style="display:flex;gap:10px;align-items:center;">
        <span class="block-type-tag">${esc(b.block_type)}</span>
        <span style="font-size:11px;color:var(--am-gray);">orden ${b.block_order}</span>
      </div>
      <div class="block-actions">
        <button class="block-icon-btn" data-act="preview" title="Preview">👁</button>
        <button class="block-icon-btn" data-act="up" title="Subir">▲</button>
        <button class="block-icon-btn" data-act="down" title="Bajar">▼</button>
        <button class="block-icon-btn danger" data-act="del" title="Borrar">🗑</button>
      </div>
    </div>
    <div class="admin-field">
      <label>Data (JSON)</label>
      <textarea class="block-data-ta" rows="8">${esc(JSON.stringify(b.data, null, 2))}</textarea>
    </div>
    <div class="block-preview-area" style="display:none;border-top:1px solid #eee;margin-top:12px;padding-top:12px;"></div>
    <div class="admin-actions">
      <button class="admin-btn" data-act="save">💾 Guardar</button>
    </div>
  </div>`;
}

function wireBlockEditor() {
  document.querySelectorAll('.tab-chip').forEach(c => {
    c.addEventListener('click', () => {
      state.activeTab = +c.dataset.idx;
      renderEditor();
    });
  });
  document.getElementById('ad-bulk-load')?.addEventListener('click', bulkLoadBlocks);
  document.getElementById('ad-add-block')?.addEventListener('click', addBlock);
  document.querySelectorAll('.block-card').forEach(card => {
    const bid = card.dataset.bid;
    card.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', () => blockAction(bid, btn.dataset.act, card));
    });
  });
}

function statusMsg(id, ok, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `admin-status ${ok ? 'ok' : 'err'}`;
  el.textContent = msg;
  setTimeout(() => { if (el.textContent === msg) el.className = 'admin-status'; }, 4000);
}

async function saveMetadata() {
  try {
    const tabsRaw = document.getElementById('f-tabs').value;
    const metricsRaw = document.getElementById('f-metrics').value.trim() || '{}';
    const payload = {
      id: document.getElementById('f-id').value.trim(),
      ticker: document.getElementById('f-ticker').value.trim(),
      name: document.getElementById('f-name').value.trim(),
      type: document.getElementById('f-type').value,
      category: document.getElementById('f-category').value.trim(),
      status: document.getElementById('f-status').value,
      tv_symbol: document.getElementById('f-tv').value.trim() || null,
      price: document.getElementById('f-price').value,
      change_text: document.getElementById('f-change').value,
      change_dir: document.getElementById('f-dir').value,
      updated_text: document.getElementById('f-updated').value,
      sort_order: +document.getElementById('f-sort').value || 100,
      tabs: tabsRaw.split('\n').map(s => s.trim()).filter(Boolean),
      top_metrics: JSON.parse(metricsRaw),
    };
    if (!payload.id || !payload.name || !payload.ticker) throw new Error('ID, ticker y nombre son obligatorios');

    const action = state.instrumentId ? 'update_instrument' : 'create_instrument';
    await adminWrite( action, payload);
    statusMsg('ad-meta-status', true, '✓ Metadata guardada');
    state.instrumentId = payload.id;
    state.instrument = { ...payload };
    await populateSelect();
    document.getElementById('ad-select').value = payload.id;
    state.blocks = await AmautaDB.getBlocks(payload.id);
    renderEditor();
  } catch (e) {
    statusMsg('ad-meta-status', false, `✗ ${e.message}`);
  }
}

async function deleteInstrument() {
  if (!confirm(`¿Eliminar ${state.instrumentId}? Esto borra también todos los bloques.`)) return;
  try {
    await adminWrite( 'delete_instrument', { id: state.instrumentId });
    statusMsg('ad-meta-status', true, '✓ Instrumento eliminado');
    state.instrumentId = null;
    state.instrument = null;
    state.blocks = [];
    await populateSelect();
    document.getElementById('ad-editor').innerHTML = '';
  } catch (e) {
    statusMsg('ad-meta-status', false, `✗ ${e.message}`);
  }
}

async function addBlock() {
  try {
    const type = document.getElementById('ad-new-type').value;
    const defaults = defaultDataFor(type);
    const tabBlocks = state.blocks.filter(b => b.tab_index === state.activeTab);
    const nextOrder = tabBlocks.length ? Math.max(...tabBlocks.map(b => b.block_order)) + 10 : 10;
    const created = await adminWrite( 'upsert_block', {
      instrument_id: state.instrumentId,
      tab_index: state.activeTab,
      block_order: nextOrder,
      block_type: type,
      data: defaults,
    });
    state.blocks.push(created.block);
    renderEditor();
  } catch (e) {
    alert(`Error: ${e.message}`);
  }
}

function validateBlocks(blocks, tabs) {
  const VALID_TYPES = ['paragraph', 'thesis_box', 'stat_grid', 'chart', 'risk_list', 'html_raw'];
  const errors = [];
  blocks.forEach((b, i) => {
    const p = `Bloque ${i + 1}`;
    if (typeof b.tab_index !== 'number') errors.push(`${p}: falta tab_index (debe ser número)`);
    else if (b.tab_index < 0 || b.tab_index >= tabs.length) errors.push(`${p}: tab_index ${b.tab_index} no existe — este instrumento tiene ${tabs.length} tab(s)`);
    if (typeof b.block_order !== 'number') errors.push(`${p}: falta block_order (debe ser número)`);
    if (!VALID_TYPES.includes(b.block_type)) errors.push(`${p}: block_type inválido "${b.block_type}" — valores válidos: ${VALID_TYPES.join(', ')}`);
    if (!b.data || typeof b.data !== 'object' || Array.isArray(b.data)) errors.push(`${p}: falta data (debe ser un objeto {})`);
    else {
      if (b.block_type === 'chart') {
        if (!Array.isArray(b.data.labels)) errors.push(`${p} (chart): falta data.labels (array de etiquetas)`);
        if (!Array.isArray(b.data.datasets)) errors.push(`${p} (chart): falta data.datasets (array de series)`);
      }
      if (b.block_type === 'stat_grid' && !Array.isArray(b.data.items)) errors.push(`${p} (stat_grid): falta data.items (array)`);
      if (b.block_type === 'thesis_box' && !Array.isArray(b.data.points)) errors.push(`${p} (thesis_box): falta data.points (array)`);
      if (b.block_type === 'risk_list' && !Array.isArray(b.data.items)) errors.push(`${p} (risk_list): falta data.items (array)`);
    }
  });
  return errors;
}

// Extrae el JSON aunque Claude lo envuelva en ```json ... ``` u otro markdown
function extractJsonFromClaudeOutput(raw) {
  // 1. Intentar parsear directo
  try { return JSON.parse(raw); } catch (_) {}
  // 2. Buscar bloque ```json ... ``` o ``` ... ```
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch (_) {}
  }
  // 3. Buscar el primer [ ... ] en el texto
  const arrayMatch = raw.match(/(\[[\s\S]*\])/);
  if (arrayMatch) {
    try { return JSON.parse(arrayMatch[1]); } catch (_) {}
  }
  throw new Error('No se encontró un JSON válido. Copiá el bloque JSON completo que entregó Claude.');
}

// Para instrumentos nuevos: guarda metadata + carga bloques en un solo paso
async function bulkLoadNewInstrument() {
  const raw = (document.getElementById('ad-bulk-json')?.value || '').trim();
  if (!raw) { alert('Pegá el JSON de Claude primero.'); return; }

  // Validar JSON antes de hacer nada
  let blocks;
  try {
    blocks = extractJsonFromClaudeOutput(raw);
    if (!Array.isArray(blocks)) throw new Error('Debe ser un array [ ... ]');
    if (!blocks.length) throw new Error('El array está vacío');
  } catch (e) {
    alert('JSON inválido: ' + e.message);
    return;
  }

  const statusEl = document.getElementById('ad-bulk-status');
  const btn = document.getElementById('ad-bulk-load');
  if (btn) { btn.textContent = 'Guardando instrumento…'; btn.disabled = true; }

  try {
    // Paso 1: guardar metadata del instrumento nuevo
    await saveMetadataInternal();
    if (!state.instrumentId) throw new Error('No se pudo crear el instrumento en Supabase');

    // Paso 2: validar bloques contra los tabs
    const tabs = state.instrument.tabs || [];
    const errors = validateBlocks(blocks, tabs);
    if (errors.length) {
      alert('Errores en el JSON:\n\n' + errors.join('\n'));
      return;
    }

    // Paso 3: cargar bloques
    if (btn) btn.textContent = 'Cargando bloques…';
    let loaded = 0;
    for (const block of blocks) {
      const created = await adminWrite('upsert_block', {
        instrument_id: state.instrumentId,
        tab_index: block.tab_index,
        block_order: block.block_order,
        block_type: block.block_type,
        data: block.data,
      });
      if (created?.block) state.blocks.push(created.block);
      loaded++;
      if (statusEl) statusEl.textContent = `Cargando ${loaded}/${blocks.length}…`;
    }

    if (statusEl) { statusEl.className = 'admin-status ok'; statusEl.textContent = `✓ Instrumento creado y ${loaded} bloques cargados`; }

    // Recargar el editor completo ahora que el instrumento existe
    await populateSelect();
    document.getElementById('ad-select').value = state.instrumentId;
    renderEditor();
    wireBlockEditor();

  } catch (e) {
    if (statusEl) { statusEl.className = 'admin-status err'; statusEl.textContent = `✗ ${e.message}`; statusEl.style.display = 'block'; }
    alert('Error: ' + e.message);
  } finally {
    if (btn) { btn.textContent = '📥 Guardar instrumento y cargar bloques'; btn.disabled = false; }
  }
}

// Versión interna de saveMetadata que retorna y actualiza state.instrumentId sin UI extra
async function saveMetadataInternal() {
  const tabsRaw = document.getElementById('f-tabs').value;
  const metricsRaw = document.getElementById('f-metrics').value.trim() || '{}';
  const payload = {
    id: document.getElementById('f-id').value.trim(),
    ticker: document.getElementById('f-ticker').value.trim(),
    name: document.getElementById('f-name').value.trim(),
    type: document.getElementById('f-type').value,
    category: document.getElementById('f-category').value.trim(),
    status: document.getElementById('f-status').value,
    tv_symbol: document.getElementById('f-tv').value.trim() || null,
    price: document.getElementById('f-price').value,
    change_text: document.getElementById('f-change').value,
    change_dir: document.getElementById('f-dir').value,
    updated_text: document.getElementById('f-updated').value,
    sort_order: +document.getElementById('f-sort').value || 100,
    tabs: tabsRaw.split('\n').map(s => s.trim()).filter(Boolean),
    top_metrics: JSON.parse(metricsRaw),
  };
  if (!payload.id || !payload.name || !payload.ticker) throw new Error('ID, ticker y nombre son obligatorios');
  const action = state.instrumentId ? 'update_instrument' : 'create_instrument';
  await adminWrite(action, payload);
  state.instrumentId = payload.id;
  state.instrument = { ...state.instrument, ...payload };
}

async function bulkLoadBlocks() {
  const raw = (document.getElementById('ad-bulk-json')?.value || '').trim();
  if (!raw) { alert('Pegá el JSON de Claude primero.'); return; }

  let blocks;
  try {
    blocks = extractJsonFromClaudeOutput(raw);
    if (!Array.isArray(blocks)) throw new Error('Debe ser un array [ ... ]');
    if (!blocks.length) throw new Error('El array está vacío');
  } catch (e) {
    alert('JSON inválido: ' + e.message + '\n\nAsegurate de pegar el output de Claude (con o sin markdown, lo detecta automáticamente).');
    return;
  }

  const tabs = state.instrument.tabs || [];
  const errors = validateBlocks(blocks, tabs);
  if (errors.length) {
    alert('Se encontraron errores en el JSON — no se guardó nada:\n\n' + errors.join('\n'));
    return;
  }

  const tabIndexes = [...new Set(blocks.map(b => b.tab_index))];
  const tabNames = tabIndexes.map(i => state.instrument.tabs?.[i] || `Tab ${i}`).join(', ');
  const hasExisting = state.blocks.some(b => tabIndexes.includes(b.tab_index));

  if (hasExisting) {
    if (!confirm(`Esto reemplazará los bloques actuales en: ${tabNames}.\n\n¿Continuar?`)) return;
    const toDelete = state.blocks.filter(b => tabIndexes.includes(b.tab_index));
    for (const b of toDelete) {
      await adminWrite( 'delete_block', { id: b.id });
    }
    state.blocks = state.blocks.filter(b => !tabIndexes.includes(b.tab_index));
  }

  const statusEl = document.getElementById('ad-bulk-status');
  if (statusEl) { statusEl.className = 'admin-status'; statusEl.textContent = 'Cargando...'; }

  let loaded = 0;
  for (const block of blocks) {
    const created = await adminWrite( 'upsert_block', {
      instrument_id: state.instrumentId,
      tab_index: block.tab_index,
      block_order: block.block_order,
      block_type: block.block_type,
      data: block.data,
    });
    if (created?.block) state.blocks.push(created.block);
    loaded++;
    if (statusEl) statusEl.textContent = `Cargando ${loaded}/${blocks.length}...`;
  }

  if (statusEl) { statusEl.className = 'admin-status ok'; statusEl.textContent = `✓ ${loaded} bloques cargados`; }
  renderEditor();
}

async function blockAction(bid, act, card) {
  const block = state.blocks.find(b => b.id === bid);
  if (!block) return;
  try {
    if (act === 'preview') {
      const previewArea = card.querySelector('.block-preview-area');
      const ta = card.querySelector('.block-data-ta');
      if (!previewArea) return;
      // Toggle: si ya está visible, lo cierra
      if (previewArea.style.display !== 'none') {
        previewArea.style.display = 'none';
        previewArea.innerHTML = '';
        return;
      }
      // Leer data actual del textarea (puede tener edits sin guardar)
      let previewData;
      try { previewData = JSON.parse(ta.value); } catch (_) { previewData = block.data; }
      const previewBlock = { ...block, data: previewData };
      // Usar el renderer para construir el HTML del bloque
      const html = AmautaRenderer.renderBlockHtml(previewBlock);
      previewArea.innerHTML = `
        <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--am-gray-dark);margin-bottom:10px;">Preview</p>
        ${html}`;
      previewArea.style.display = 'block';
      // Renderizar charts si es un chart block
      if (previewBlock.block_type === 'chart') {
        AmautaRenderer.renderBlockChart(previewBlock);
      }
      return;
    }
    if (act === 'save') {
      const raw = card.querySelector('.block-data-ta').value;
      const data = JSON.parse(raw);
      await adminWrite( 'upsert_block', { ...block, data });
      block.data = data;
      // Cerrar preview si estaba abierto (datos cambiaron)
      const previewArea = card.querySelector('.block-preview-area');
      if (previewArea) { previewArea.style.display = 'none'; previewArea.innerHTML = ''; }
      card.querySelector('.admin-actions').insertAdjacentHTML(
        'beforeend', '<span style="color:var(--am-green);font-size:12px;margin-left:10px;">✓ guardado</span>'
      );
      setTimeout(() => {
        const marker = card.querySelector('.admin-actions span[style]');
        if (marker) marker.remove();
      }, 2000);
    } else if (act === 'del') {
      if (!confirm('¿Borrar este bloque?')) return;
      await adminWrite( 'delete_block', { id: bid });
      state.blocks = state.blocks.filter(b => b.id !== bid);
      renderEditor();
    } else if (act === 'up' || act === 'down') {
      const tabBlocks = state.blocks.filter(b => b.tab_index === state.activeTab)
        .sort((a, b) => a.block_order - b.block_order);
      const idx = tabBlocks.findIndex(b => b.id === bid);
      const swap = act === 'up' ? tabBlocks[idx - 1] : tabBlocks[idx + 1];
      if (!swap) return;
      const tmp = block.block_order;
      block.block_order = swap.block_order;
      swap.block_order = tmp;
      await adminWrite( 'upsert_block', { ...block });
      await adminWrite( 'upsert_block', { ...swap });
      renderEditor();
    }
  } catch (e) {
    alert(`Error: ${e.message}`);
  }
}

function defaultDataFor(type) {
  switch (type) {
    case 'paragraph':    return { html: 'Texto del párrafo...' };
    case 'thesis_box':   return { title: 'Tesis de inversión', intro_html: '...', points: [{ num: 1, html: '<strong>Punto:</strong> detalle.' }], variant: 'default' };
    case 'stat_grid':    return { items: [{ label: 'Métrica', value: '$0', detail: '', badge: { variant: 'green', text: 'OK' } }] };
    case 'chart':        return { title: 'Gráfico', chart_type: 'bar', labels: ['A','B'], datasets: [{ label: 'X', data: [1,2], backgroundColor: '#621044' }], options: { plugins: { legend: { display: false } } } };
    case 'risk_list':    return { items: [{ level: 'medium', level_label: 'Medio', title: 'Riesgo', description: 'Descripción...' }] };
    case 'html_raw':     return { html: '<div class="card"><h3>Título</h3><p>Contenido HTML libre.</p></div>' };
    default: return {};
  }
}

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export const AmautaAdmin = { openPanel };
