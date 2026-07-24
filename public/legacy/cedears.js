/* =============================================================
   AMAUTA RESEARCH — Monitor CEDEARs (vista en vivo)
   Módulo autocontenido. No ejecuta nada al cargar: solo define
   window.CedearsView = { mount(containerEl), unmount() }.

   Config de Supabase y navegación SPA se leen de window.AmautaCedearsBridge,
   que app.js publica antes de montar la vista.
   ============================================================= */
(function () {
  'use strict';

  // -------------- Puente con la app (config + navegación) --------------
  function bridge() { return window.AmautaCedearsBridge || {}; }
  function cfg() { return bridge().config || {}; }
  function REST() { return `${cfg().SUPABASE_URL}/rest/v1`; }
  function headers() {
    const key = cfg().SUPABASE_KEY;
    return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  }

  // -------------- Utilidades de texto / seguridad --------------
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function cssEscape(s) {
    if (window.CSS && window.CSS.escape) return window.CSS.escape(String(s));
    return String(s).replace(/[^a-zA-Z0-9_-]/g, c => `\\${c}`);
  }

  // -------------- Formatos (locale es-AR) --------------
  const DASH = '—';
  const nfPrice = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nfInt   = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
  const nfPct   = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'always' });
  const nfMult  = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf1     = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  function isNum(v) { return v != null && v !== '' && !isNaN(Number(v)); }
  function fmtPrice(v) { return isNum(v) ? `$ ${nfPrice.format(Number(v))}` : DASH; }
  function fmtInt(v)   { return isNum(v) ? nfInt.format(Math.round(Number(v))) : DASH; }
  function fmtPct(v)   { return isNum(v) ? `${nfPct.format(Number(v) * 100)}%` : DASH; }        // fracción → %
  function fmtPctRaw(v){ return isNum(v) ? `${nfPct.format(Number(v))}%` : DASH; }              // ya en %
  function fmtMargin(v){ return isNum(v) ? `${nf1.format(Number(v))}%` : DASH; }                // margen ya en %, sin signo
  function fmtDivY(v)  { return isNum(v) ? `${nfPrice.format(Number(v))}%` : DASH; }            // div yield ya en %
  function fmtMult(v)  { return isNum(v) ? `${nfMult.format(Number(v))}x` : DASH; }
  function fmtNum2(v)  { return isNum(v) ? nfPrice.format(Number(v)) : DASH; }

  // Semáforo de recomendación de analistas (TR.RecMean 1-5): ≤2,5 verde (comprar) ·
  // 2,5-3,5 amarillo (mantener) · ≥3,5 rojo (vender). Igual criterio que el Excel.
  function recSemaforo(v, label) {
    if (!isNum(v)) return DASH;
    const n = Number(v);
    const cls = n <= 2.5 ? 'ced-sem-green' : n < 3.5 ? 'ced-sem-amber' : 'ced-sem-red';
    const title = label ? ` title="${escapeHtml(label)}"` : '';
    return `<span class="ced-sem ${cls}"${title}><span class="ced-sem-dot"></span>${nfPrice.format(n)}</span>`;
  }

  function signClass(v) {
    if (!isNum(v)) return '';
    const n = Number(v);
    return n > 0 ? 'ced-up' : n < 0 ? 'ced-down' : '';
  }
  // Dif % semántica invertida: negativo (barato) = verde, positivo (caro) = rojo
  function difClass(v) {
    if (!isNum(v)) return '';
    const n = Number(v);
    return n < 0 ? 'ced-up' : n > 0 ? 'ced-down' : '';
  }

  function fmtTime(iso) {
    if (!iso) return DASH;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return DASH;
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }
  function minutesSince(iso) {
    if (!iso) return Infinity;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return Infinity;
    return (Date.now() - d.getTime()) / 60000;
  }

  // -------------- Estado interno --------------
  const SECTOR_ORDER = ['Tecnologia', 'Comunicacion', 'Cons. Discrecional', 'Cons. Defensivo',
    'Salud', 'Industria', 'Energia', 'Materiales', 'Bancos', 'ETFs'];

  // Columnas del monitor — paridad con la hoja FULL del Excel. `render` devuelve el HTML
  // de la celda; `cls` una clase extra según el valor (color). `group` agrupa en el
  // selector de columnas; `def` = visible por defecto. Todas ordenables.
  const COLS = [
    { key: 'nombre',     label: 'Nombre',      group: 'General',    def: true,  type: 'str', render: e => escapeHtml(e.nombre || DASH) },
    { key: 'sector',     label: 'Sector',      group: 'General',    def: true,  type: 'str', render: e => escapeHtml(e.sector || DASH) },
    { key: 'precio_usd', label: 'Precio USD',  group: 'Precios',    def: false, type: 'num', render: e => fmtPrice(e.precio_usd) },
    { key: 'precio_ars', label: 'Precio ARS',  group: 'Precios',    def: true,  type: 'num', render: e => fmtPrice(e.precio_ars) },
    { key: 'var',        label: 'Var %',       group: 'Precios',    def: true,  type: 'num', render: e => fmtPct(e.var),        cls: e => signClass(e.var) },
    { key: 'volumen',    label: 'Volumen',     group: 'Precios',    def: false, type: 'num', render: e => fmtInt(e.volumen) },
    { key: 'ratio',      label: 'Ratio',       group: 'Precios',    def: false, type: 'num', render: e => fmtNum2(e.ratio) },
    { key: 'ccl',        label: 'CCL',         group: 'Precios',    def: true,  type: 'num', render: e => fmtPrice(e.ccl) },
    { key: 'pe',         label: 'P/E',         group: 'Valuación',  def: false, type: 'num', render: e => fmtMult(e.pe) },
    { key: 'pb',         label: 'P/B',         group: 'Valuación',  def: false, type: 'num', render: e => fmtMult(e.pb) },
    { key: 'ev_ebitda',  label: 'EV/EBITDA',   group: 'Valuación',  def: false, type: 'num', render: e => fmtMult(e.ev_ebitda) },
    { key: 'pe_fwd',     label: 'P/E Fwd',     group: 'Valuación',  def: false, type: 'num', render: e => fmtMult(e.pe_fwd) },
    { key: 'mg_op',      label: 'Mg Op %',     group: 'Valuación',  def: false, type: 'num', render: e => fmtMargin(e.mg_op) },
    { key: 'mg_net',     label: 'Mg Net %',    group: 'Valuación',  def: false, type: 'num', render: e => fmtMargin(e.mg_net) },
    { key: 'div_yield',  label: 'Div Yield %', group: 'Valuación',  def: false, type: 'num', render: e => fmtDivY(e.div_yield) },
    { key: 'vs_sector',  label: 'vs Sector',   group: 'Valuación',  def: false, type: 'num', render: e => fmtPct(e.vs_sector),  cls: e => difClass(e.vs_sector) },
    { key: 'vs_hist',    label: 'vs Hist',     group: 'Valuación',  def: false, type: 'num', render: e => fmtPct(e.vs_hist),    cls: e => difClass(e.vs_hist) },
    { key: 'valuacion',  label: 'Valuación',   group: 'Valuación',  def: true,  type: 'str', render: e => valuacionChip(e.valuacion) },
    { key: 'ret_1m',     label: 'Ret 1M',      group: 'Retornos',   def: false, type: 'num', render: e => fmtPct(e.ret_1m),   cls: e => signClass(e.ret_1m) },
    { key: 'ret_3m',     label: 'Ret 3M',      group: 'Retornos',   def: false, type: 'num', render: e => fmtPct(e.ret_3m),   cls: e => signClass(e.ret_3m) },
    { key: 'ret_ytd',    label: 'Ret YTD',     group: 'Retornos',   def: true,  type: 'num', render: e => fmtPct(e.ret_ytd),  cls: e => signClass(e.ret_ytd) },
    { key: 'ret_1y',     label: 'Ret 1A',      group: 'Retornos',   def: false, type: 'num', render: e => fmtPct(e.ret_1y),   cls: e => signClass(e.ret_1y) },
    { key: 'rec',        label: 'Rec. (1-5)',  group: 'Consenso',   def: true,  type: 'num', render: e => recSemaforo(e.rec, e.rec_label) },
    { key: 'rec_label',  label: 'Consenso',    group: 'Consenso',   def: false, type: 'str', render: e => e.rec_label ? escapeHtml(e.rec_label) : DASH },
    { key: 'target',     label: 'Target USD',  group: 'Consenso',   def: false, type: 'num', render: e => fmtPrice(e.target) },
    { key: 'upside',     label: 'Upside %',    group: 'Consenso',   def: true,  type: 'num', render: e => fmtPct(e.upside),   cls: e => signClass(e.upside) },
    { key: 'fair_value', label: 'Fair Value',  group: 'Arbitraje CCL', def: true, type: 'num', render: e => fmtPrice(e.fair_value) },
    { key: 'dif_fv',     label: 'Dif %',       group: 'Arbitraje CCL', def: true, type: 'num', render: e => fmtPct(e.dif_fv),   cls: e => difClass(e.dif_fv) },
    { key: 'estado_fv',  label: 'Estado',      group: 'Arbitraje CCL', def: true, type: 'str', render: e => estadoChip(e.estado_fv) },
    { key: 'semaforo',   label: 'Semáforo',    group: 'Señal',      def: true,  type: 'str', render: e => semaforoChip(e), sortVal: e => semaforoScore(e) },
  ];

  const COL_GROUPS = ['General', 'Precios', 'Valuación', 'Retornos', 'Consenso', 'Arbitraje CCL', 'Señal'];
  const COLS_STORAGE_KEY = 'amr:cedears:cols';
  // Versión del esquema de columnas. Al subirla, las columnas listadas en
  // COLS_ADDED_BY_VERSION se agregan automáticamente a las selecciones ya guardadas
  // (para que quien ya usó el selector vea las columnas nuevas sin re-elegir).
  const COLS_SCHEMA_VERSION = 3;
  const COLS_ADDED_BY_VERSION = { 2: ['semaforo'], 3: ['ret_ytd', 'upside'] };

  // Presets rápidos: listas de keys visibles (Especie siempre va fija aparte).
  const COL_PRESETS = {
    'Resumen':   ['nombre', 'sector', 'precio_ars', 'var', 'ccl', 'ret_ytd', 'upside', 'rec', 'valuacion', 'fair_value', 'dif_fv', 'estado_fv', 'semaforo'],
    'Valuación': ['nombre', 'sector', 'pe', 'pb', 'ev_ebitda', 'pe_fwd', 'div_yield', 'vs_sector', 'vs_hist', 'valuacion', 'target', 'upside', 'rec', 'rec_label', 'semaforo'],
    'Retornos':  ['nombre', 'sector', 'precio_ars', 'var', 'ret_1m', 'ret_3m', 'ret_ytd', 'ret_1y', 'upside', 'semaforo'],
    'Precios':   ['nombre', 'sector', 'precio_usd', 'precio_ars', 'var', 'volumen', 'ratio', 'ccl', 'fair_value', 'dif_fv', 'estado_fv'],
    'Todo':      COLS.map(c => c.key),
  };

  function defaultVisibleCols() {
    return new Set(COLS.filter(c => c.def).map(c => c.key));
  }
  function loadVisibleCols() {
    try {
      const raw = localStorage.getItem(COLS_STORAGE_KEY);
      if (!raw) return defaultVisibleCols();
      const parsed = JSON.parse(raw);
      // formato viejo = array de keys (v1); nuevo = { v, cols }
      let arr, ver;
      if (Array.isArray(parsed)) { arr = parsed; ver = 1; }
      else { arr = parsed.cols || []; ver = parsed.v || 1; }
      const valid = arr.filter(k => COLS.some(c => c.key === k));
      if (!valid.length) return defaultVisibleCols();
      // migración: sumar columnas nuevas introducidas después de la versión guardada
      for (let v = ver + 1; v <= COLS_SCHEMA_VERSION; v++) {
        (COLS_ADDED_BY_VERSION[v] || []).forEach(k => {
          if (!valid.includes(k) && COLS.some(c => c.key === k)) valid.push(k);
        });
      }
      return new Set(valid);
    } catch { return defaultVisibleCols(); }
  }
  function saveVisibleCols(set) {
    try {
      localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify({ v: COLS_SCHEMA_VERSION, cols: [...set] }));
    } catch {}
  }
  // Columnas visibles en el orden canónico de COLS.
  function visibleColList() {
    return COLS.filter(c => state.visibleCols.has(c.key));
  }

  let state = null;

  function freshState() {
    return {
      container: null,
      especies: [],
      params: null,
      instrumentIds: new Set(),
      filterSector: 'Todos',
      search: '',
      sortKey: 'dif_fv',
      sortDir: 'asc',
      visibleCols: loadVisibleCols(),
      colPickerOpen: false,
      // detalle expandible (gráfico Reuters)
      expandedKey: null,
      seriesCache: {},
      chart: null,
      detailPeriod: '6M',
      detailMoneda: 'ARS',
      // comparador de especies
      compareMode: false,
      compareSel: new Set(),
      compareOpen: false,
      cmpChart: null,
      cmpPeriod: '6M',
      cmpMoneda: 'ARS',
      // recursos a limpiar
      unsubRealtime: null,
      pollTimer: null,
      refetchTimer: null,
      visibilityHandler: null,
      destroyed: false,
    };
  }

  // -------------- Fetch de datos --------------
  async function fetchEspecies() {
    const r = await fetch(`${REST()}/cedears_live?select=*`, { headers: headers() });
    if (!r.ok) throw new Error(`cedears_live ${r.status}`);
    return r.json();
  }
  async function fetchParams() {
    const r = await fetch(`${REST()}/cedears_params?id=eq.1&select=*`, { headers: headers() });
    if (!r.ok) throw new Error(`cedears_params ${r.status}`);
    const rows = await r.json();
    return rows[0] || null;
  }
  async function fetchInstrumentIds() {
    // Research se removió del portal → sin links "ver research" en el monitor.
    return new Set();
  }

  // -------------- Freshness --------------
  function freshnessBadge(params) {
    if (!params) return `<span class="ced-fresh ced-fresh-off">Sin datos</span>`;
    const mins = minutesSince(params.updated_at);
    const hhmm = fmtTime(params.updated_at);
    if (!params.market_open) {
      return `<span class="ced-fresh ced-fresh-closed">Mercado cerrado — último dato ${escapeHtml(hhmm)}</span>`;
    }
    if (mins > 15) {
      return `<span class="ced-fresh ced-fresh-off"><span class="ced-dot ced-dot-red"></span>Colector offline</span>`;
    }
    return `<span class="ced-fresh ced-fresh-live"><span class="ced-dot ced-dot-green"></span>En vivo ${escapeHtml(hhmm)}</span>`;
  }

  // -------------- Chips de estado / valuación --------------
  function estadoChip(estado) {
    if (!estado) return DASH;
    const map = { 'Barato': 'ced-chip-green', 'Justo': 'ced-chip-gray', 'Caro': 'ced-chip-red' };
    const cls = map[estado] || 'ced-chip-gray';
    return `<span class="ced-chip ${cls}">${escapeHtml(estado)}</span>`;
  }
  function valuacionChip(val) {
    if (!val) return DASH;
    const map = {
      'Barata': 'ced-chip-green',
      'Justa': 'ced-chip-gray',
      'Cara': 'ced-chip-orange',
      'Muy cara': 'ced-chip-red',
    };
    const cls = map[val] || 'ced-chip-gray';
    return `<span class="ced-chip ${cls}">${escapeHtml(val)}</span>`;
  }

  // Semáforo de acción — réplica exacta de la columna "Puntaje"/"Semáforo" del Excel.
  // Puntaje = señal(Valuación) + señal(Estado) + señal(Rec):
  //   Valuación: Barata +1 · Cara/Muy cara −1 · resto 0
  //   Estado:    Barato +1 · Caro −1 · resto 0
  //   Rec (1-5): ≤2 +1 · ≤3,5 0 · >3,5 −1  (si no es número: 0)
  // Veredicto: ≥2 COMPRAR · ≤−2 REDUCIR · resto MONITOREAR. Nulo si faltan las tres señales.
  function semaforoScore(e) {
    const hasVal = e.valuacion != null && e.valuacion !== '';
    const hasEst = e.estado_fv != null && e.estado_fv !== '';
    const hasRec = isNum(e.rec);
    if (!hasVal && !hasEst && !hasRec) return null;
    let s = 0;
    if (e.valuacion === 'Barata') s += 1;
    else if (e.valuacion === 'Cara' || e.valuacion === 'Muy cara') s -= 1;
    if (e.estado_fv === 'Barato') s += 1;
    else if (e.estado_fv === 'Caro') s -= 1;
    if (hasRec) { const n = Number(e.rec); s += n <= 2 ? 1 : n <= 3.5 ? 0 : -1; }
    return s;
  }
  function semaforoChip(e) {
    const s = semaforoScore(e);
    if (s == null) return DASH;
    const v = s >= 2 ? 'COMPRAR' : s <= -2 ? 'REDUCIR' : 'MONITOREAR';
    const map = { 'COMPRAR': 'ced-sig-buy', 'REDUCIR': 'ced-sig-sell', 'MONITOREAR': 'ced-sig-hold' };
    return `<span class="ced-sig ${map[v]}" title="Puntaje ${s}">${v}</span>`;
  }

  // -------------- KPIs --------------
  function renderKpis() {
    const p = state.params || {};
    let barato = 0, justo = 0, caro = 0;
    state.especies.forEach(e => {
      if (e.estado_fv === 'Barato') barato++;
      else if (e.estado_fv === 'Justo') justo++;
      else if (e.estado_fv === 'Caro') caro++;
    });
    return `
      <div class="ced-kpis">
        <div class="ced-kpi">
          <div class="ced-kpi-label">CCL ref</div>
          <div class="ced-kpi-value">${fmtPrice(p.ccl_ref)}</div>
        </div>
        <div class="ced-kpi">
          <div class="ced-kpi-label">MEP</div>
          <div class="ced-kpi-value">${fmtPrice(p.mep)}</div>
        </div>
        <div class="ced-kpi ced-kpi-chips">
          <div class="ced-kpi-label">Fair Value</div>
          <div class="ced-kpi-chiprow">
            <span class="ced-chip ced-chip-green">${barato} Barato</span>
            <span class="ced-chip ced-chip-gray">${justo} Justo</span>
            <span class="ced-chip ced-chip-red">${caro} Caro</span>
          </div>
        </div>
        <div class="ced-kpi ced-kpi-fresh">
          <div class="ced-kpi-label">Estado del colector</div>
          <div class="ced-kpi-freshwrap">${freshnessBadge(state.params)}</div>
        </div>
      </div>`;
  }

  // -------------- Controles (filtros / búsqueda) --------------
  function renderControls() {
    const sectors = ['Todos'].concat(
      SECTOR_ORDER.filter(s => state.especies.some(e => e.sector === s))
    );
    // sectores presentes que no estén en el orden conocido
    const extra = [...new Set(state.especies.map(e => e.sector).filter(Boolean))]
      .filter(s => !sectors.includes(s));
    const allSectors = sectors.concat(extra);

    const chips = allSectors.map(s =>
      `<button class="ced-sector-chip ${s === state.filterSector ? 'active' : ''}" data-sector="${escapeHtml(s)}">${escapeHtml(s)}</button>`
    ).join('');

    return `
      <div class="ced-controls">
        <div class="ced-sector-chips">${chips}</div>
        <div class="ced-controls-right">
          <div class="ced-search">
            <span class="ced-search-icon">🔍</span>
            <input type="text" id="cedSearch" placeholder="Buscar especie o nombre…" value="${escapeHtml(state.search)}">
          </div>
          <button class="ced-cols-btn ${state.compareMode ? 'active' : ''}" id="cedCmpBtn">
            <span class="ced-cols-ico">⇄</span> Comparar${state.compareSel.size ? ` <span class="ced-cols-count">${state.compareSel.size}</span>` : ''}
          </button>
          <button class="ced-cols-btn" id="cedPdfBtn" title="Exportar a PDF (imprimir)">
            <span class="ced-cols-ico">⎙</span> PDF
          </button>
          ${renderColPicker()}
        </div>
      </div>`;
  }

  // -------------- Selector de columnas --------------
  function renderColPicker() {
    const count = visibleColList().length;
    const presetBtns = Object.keys(COL_PRESETS).map(name =>
      `<button class="ced-preset-btn" data-preset="${escapeHtml(name)}">${escapeHtml(name)}</button>`
    ).join('');

    const groups = COL_GROUPS.map(g => {
      const items = COLS.filter(c => c.group === g).map(c => {
        const on = state.visibleCols.has(c.key);
        return `
          <label class="ced-colopt">
            <input type="checkbox" data-col="${escapeHtml(c.key)}" ${on ? 'checked' : ''}>
            <span>${escapeHtml(c.label)}</span>
          </label>`;
      }).join('');
      return `<div class="ced-colgroup"><div class="ced-colgroup-title">${escapeHtml(g)}</div>${items}</div>`;
    }).join('');

    return `
      <div class="ced-colpicker">
        <button class="ced-cols-btn ${state.colPickerOpen ? 'active' : ''}" id="cedColsBtn" aria-expanded="${state.colPickerOpen}">
          <span class="ced-cols-ico">▦</span> Columnas <span class="ced-cols-count">${count}</span>
        </button>
        <div class="ced-colpanel ${state.colPickerOpen ? 'open' : ''}" id="cedColPanel">
          <div class="ced-colpanel-head">
            <span class="ced-colpanel-title">Vistas rápidas</span>
            <div class="ced-preset-row">${presetBtns}</div>
          </div>
          <div class="ced-colpanel-grid">${groups}</div>
          <div class="ced-colpanel-note">La columna <b>Especie</b> queda siempre fija. Tu selección se recuerda en este navegador.</div>
        </div>
      </div>`;
  }

  // -------------- Tabla --------------
  function sortedFilteredRows() {
    let rows = state.especies.slice();
    if (state.filterSector !== 'Todos') {
      rows = rows.filter(e => e.sector === state.filterSector);
    }
    const q = state.search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(e =>
        String(e.nombre || '').toLowerCase().includes(q) ||
        String(e.especie || e.ric_usd || '').toLowerCase().includes(q)
      );
    }
    const col = COLS.find(c => c.key === state.sortKey) || { type: 'num' };
    const dir = state.sortDir === 'asc' ? 1 : -1;
    const getv = e => col.sortVal ? col.sortVal(e) : e[state.sortKey];
    const numeric = col.type === 'num' || !!col.sortVal;
    rows.sort((a, b) => {
      let av = getv(a), bv = getv(b);
      if (numeric) {
        const an = isNum(av) ? Number(av) : (dir === 1 ? Infinity : -Infinity);
        const bn = isNum(bv) ? Number(bv) : (dir === 1 ? Infinity : -Infinity);
        return (an - bn) * dir;
      }
      av = (av == null ? '' : String(av)).toLowerCase();
      bv = (bv == null ? '' : String(bv)).toLowerCase();
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    return rows;
  }

  function especieKey(e) {
    return String(e.especie || e.ric_usd || e.nombre || '').toUpperCase();
  }
  function especieLabel(e) {
    return e.especie || e.ric_usd || e.nombre || DASH;
  }

  function especieCell(e) {
    const label = especieLabel(e);
    const key = especieKey(e);
    if (key && state.instrumentIds.has(key)) {
      return `<a href="?inst=${encodeURIComponent(key)}" class="ced-especie-link" data-inst="${escapeHtml(key)}">${escapeHtml(label)}</a>`;
    }
    return `<span class="ced-especie">${escapeHtml(label)}</span>`;
  }

  // ============ Detalle expandible con gráfico de Reuters ============
  const PERIODS = [
    { key: '1M', label: '1M', days: 22 },
    { key: '3M', label: '3M', days: 66 },
    { key: '6M', label: '6M', days: 132 },
    { key: '1A', label: '1A', days: 9999 },
  ];
  function periodDays(k) { return (PERIODS.find(p => p.key === k) || PERIODS[2]).days; }

  async function fetchSeries(especie) {
    if (state.seriesCache[especie]) return state.seriesCache[especie];
    const url = `${REST()}/cedears_series?especie=eq.${encodeURIComponent(especie)}&order=fecha.asc&select=fecha,close_ars,vol_ars,close_usd`;
    const r = await fetch(url, { headers: headers() });
    if (!r.ok) throw new Error(`cedears_series ${r.status}`);
    const data = await r.json();
    state.seriesCache[especie] = data;
    return data;
  }

  // Fila de detalle (colspan completo) con toggles, canvas del gráfico y grilla de stats.
  function detailRow(e, colspan) {
    const key = especieKey(e);
    const nombre = escapeHtml(e.nombre || '');
    const periodBtns = PERIODS.map(p =>
      `<button class="ced-dt-btn ${state.detailPeriod === p.key ? 'active' : ''}" data-period="${p.key}">${p.label}</button>`
    ).join('');
    const monBtns = ['ARS', 'USD'].map(m =>
      `<button class="ced-dt-btn ${state.detailMoneda === m ? 'active' : ''}" data-moneda="${m}">${m}</button>`
    ).join('');
    const research = (key && state.instrumentIds.has(key))
      ? `<a class="ced-dt-research" href="?inst=${encodeURIComponent(key)}" data-inst="${escapeHtml(key)}">Ver research completo →</a>`
      : '';
    return `
      <tr class="ced-detail-row" data-detail-for="${escapeHtml(key)}">
        <td colspan="${colspan}">
          <div class="ced-detail">
            <div class="ced-detail-top">
              <div class="ced-detail-title">
                <span class="ced-detail-especie">${escapeHtml(key)}</span>
                <span class="ced-detail-nombre">${nombre}</span>
              </div>
              <div class="ced-detail-toggles">
                <div class="ced-dt-group" data-group="moneda">${monBtns}</div>
                <div class="ced-dt-group" data-group="period">${periodBtns}</div>
              </div>
            </div>
            <div class="ced-detail-body">
              <div class="ced-chart-box"><canvas id="cedChart-${escapeHtml(key)}"></canvas></div>
              <div class="ced-detail-stats" id="cedStats-${escapeHtml(key)}"></div>
            </div>
            <div class="ced-detail-foot">
              <span class="ced-detail-src">Fuente: LSEG Refinitiv · serie diaria (cierre) hasta último día hábil</span>
              ${research}
            </div>
          </div>
        </td>
      </tr>`;
  }

  function statItem(label, value) {
    return `<div class="ced-st"><span class="ced-st-l">${escapeHtml(label)}</span><span class="ced-st-v">${value}</span></div>`;
  }

  // Rellena la grilla de stats: 52 semanas (de la serie) + fundamentals (de cedears_live).
  function fillDetailStats(e) {
    const key = especieKey(e);
    const box = state.container.querySelector(`#cedStats-${cssEscape(key)}`);
    if (!box) return;
    const series = state.seriesCache[key] || [];
    const moneda = state.detailMoneda;
    const pk = moneda === 'USD' ? 'close_usd' : 'close_ars';
    const closes = series.map(d => d[pk]).filter(isNum).map(Number);
    const hi = closes.length ? Math.max(...closes) : null;
    const lo = closes.length ? Math.min(...closes) : null;
    const last = isNum(e[moneda === 'USD' ? 'precio_usd' : 'precio_ars']) ? Number(e[moneda === 'USD' ? 'precio_usd' : 'precio_ars']) : (closes.length ? closes[closes.length - 1] : null);
    const targetTitle = (isNum(e.target_high) && isNum(e.target_low))
      ? ` <span class="ced-st-sub">(${fmtNum2(e.target_low)}–${fmtNum2(e.target_high)})</span>` : '';
    const items = [
      ['Precio ' + moneda, fmtPrice(last)],
      ['Máx 52s', fmtPrice(hi)],
      ['Mín 52s', fmtPrice(lo)],
      ['Volumen', fmtInt(e.volumen)],
      ['Target USD', isNum(e.target) ? `${fmtPrice(e.target)}${targetTitle}` : DASH],
      ['Upside', `<span class="${signClass(e.upside)}">${fmtPct(e.upside)}</span>`],
      ['Ret 1M / 3M', `<span class="${signClass(e.ret_1m)}">${fmtPct(e.ret_1m)}</span> · <span class="${signClass(e.ret_3m)}">${fmtPct(e.ret_3m)}</span>`],
      ['Ret YTD / 1A', `<span class="${signClass(e.ret_ytd)}">${fmtPct(e.ret_ytd)}</span> · <span class="${signClass(e.ret_1y)}">${fmtPct(e.ret_1y)}</span>`],
      ['CCL impl.', fmtPrice(e.ccl)],
      ['Fair Value', fmtPrice(e.fair_value)],
      ['Dif %', fmtPct(e.dif_fv)],
      ['P/E', fmtMult(e.pe)],
      ['P/E Fwd', fmtMult(e.pe_fwd)],
      ['P/B', fmtMult(e.pb)],
      ['EV/EBITDA', fmtMult(e.ev_ebitda)],
      ['Mg Op %', fmtMargin(e.mg_op)],
      ['Mg Net %', fmtMargin(e.mg_net)],
      ['Div Yield %', fmtDivY(e.div_yield)],
      ['Rec. (1-5)', isNum(e.rec) ? recSemaforo(e.rec, e.rec_label) : DASH],
      ['Consenso', e.rec_label ? escapeHtml(e.rec_label) : DASH],
      ['Valuación', valuacionChip(e.valuacion)],
      ['Semáforo', semaforoChip(e)],
    ];
    box.innerHTML = items.map(([l, v]) => statItem(l, v)).join('');
  }

  function drawDetailChart(e) {
    const key = especieKey(e);
    const canvas = state.container.querySelector(`#cedChart-${cssEscape(key)}`);
    if (!canvas || typeof Chart === 'undefined') return;
    const full = state.seriesCache[key] || [];
    const moneda = state.detailMoneda;
    const pk = moneda === 'USD' ? 'close_usd' : 'close_ars';
    // Solo días con precio en la moneda elegida: evita los huecos que aparecen cuando
    // BYMA y NYSE tienen feriados distintos (una serie queda en null ese día).
    const data = full.filter(d => isNum(d[pk])).slice(-periodDays(state.detailPeriod));
    const labels = data.map(d => d.fecha);
    const prices = data.map(d => Number(d[pk]));
    const vols = data.map(d => (isNum(d.vol_ars) ? Number(d.vol_ars) : null));
    const maxVol = vols.reduce((m, v) => (v != null && v > m ? v : m), 0);

    if (state.chart) { try { state.chart.destroy(); } catch (_) {} state.chart = null; }
    const BORDO = '#621044', YELLOW = '#F3CF11', LINE = '#F5F2F0';
    state.chart = new Chart(canvas, {
      data: {
        labels,
        datasets: [
          {
            type: 'line', label: `Precio ${moneda}`, data: prices, yAxisID: 'y',
            borderColor: LINE, backgroundColor: 'rgba(245,242,240,0.06)',
            borderWidth: 2, pointRadius: 0, tension: 0.25, fill: true, order: 1, spanGaps: true,
          },
          {
            type: 'bar', label: 'Volumen', data: vols, yAxisID: 'yv',
            backgroundColor: 'rgba(243,207,17,0.55)', borderWidth: 0, order: 2,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { ticks: { maxTicksLimit: 8, autoSkip: true, font: { size: 10 } }, grid: { display: false } },
          y: { position: 'left', ticks: { font: { size: 10 }, callback: v => (moneda === 'USD' ? '$' + v : '$' + nfInt.format(v)) } },
          yv: { position: 'right', display: false, grid: { drawOnChartArea: false }, max: maxVol * 4, beginAtZero: true },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ctx.dataset.type === 'bar'
                ? `Vol: ${nfInt.format(ctx.parsed.y || 0)}`
                : `${moneda}: ${fmtPrice(ctx.parsed.y)}`,
            },
          },
        },
      },
    });
  }

  // Tras (re)construir la tabla, si hay fila expandida: cargar serie, dibujar y llenar stats.
  async function hydrateDetail() {
    if (!state.expandedKey) return;
    const e = state.especies.find(x => especieKey(x) === state.expandedKey);
    if (!e) return;
    try {
      await fetchSeries(state.expandedKey);
      if (state.destroyed || state.expandedKey !== especieKey(e)) return;
      drawDetailChart(e);
      fillDetailStats(e);
    } catch (err) {
      const box = state.container.querySelector(`#cedStats-${cssEscape(state.expandedKey)}`);
      if (box) box.innerHTML = `<div class="ced-st-err">No se pudo cargar el histórico: ${escapeHtml(err.message)}</div>`;
    }
  }

  // ============ Comparador de especies (2-4, base 100) ============
  const CMP_MAX = 4;
  const CMP_COLORS = ['#621044', '#C7A50B', '#231F20', '#8A8487'];

  function renderCompareBar() {
    if (!state.compareMode || state.compareOpen) return '';
    const sel = [...state.compareSel];
    const chips = sel.map(k =>
      `<span class="ced-cmp-chip">${escapeHtml(k)}<button class="ced-cmp-chip-x" data-uncmp="${escapeHtml(k)}" aria-label="Quitar">✕</button></span>`
    ).join('');
    const hint = sel.length < 2
      ? `<span class="ced-cmp-hint">Marcá de 2 a ${CMP_MAX} especies en la tabla…</span>` : '';
    return `
      <div class="ced-cmp-bar">
        <span class="ced-cmp-bar-label">Comparar:</span>
        ${chips}${hint}
        <button class="ced-cmp-go" id="cedCmpGo" ${sel.length < 2 ? 'disabled' : ''}>Ver comparación</button>
      </div>`;
  }

  // Filas de la tabla comparativa: [etiqueta, render(especie)]
  const CMP_ROWS = [
    ['Precio ARS',  e => fmtPrice(e.precio_ars)],
    ['Var %',       e => `<span class="${signClass(e.var)}">${fmtPct(e.var)}</span>`],
    ['Ret 1M',      e => `<span class="${signClass(e.ret_1m)}">${fmtPct(e.ret_1m)}</span>`],
    ['Ret YTD',     e => `<span class="${signClass(e.ret_ytd)}">${fmtPct(e.ret_ytd)}</span>`],
    ['Ret 1A',      e => `<span class="${signClass(e.ret_1y)}">${fmtPct(e.ret_1y)}</span>`],
    ['P/E',         e => fmtMult(e.pe)],
    ['P/E Fwd',     e => fmtMult(e.pe_fwd)],
    ['EV/EBITDA',   e => fmtMult(e.ev_ebitda)],
    ['Div Yield %', e => fmtDivY(e.div_yield)],
    ['Target USD',  e => fmtPrice(e.target)],
    ['Upside %',    e => `<span class="${signClass(e.upside)}">${fmtPct(e.upside)}</span>`],
    ['Rec. (1-5)',  e => isNum(e.rec) ? recSemaforo(e.rec, e.rec_label) : DASH],
    ['Valuación',   e => valuacionChip(e.valuacion)],
    ['Fair Value',  e => fmtPrice(e.fair_value)],
    ['Dif %',       e => `<span class="${difClass(e.dif_fv)}">${fmtPct(e.dif_fv)}</span>`],
    ['Estado',      e => estadoChip(e.estado_fv)],
    ['Semáforo',    e => semaforoChip(e)],
  ];

  function renderComparePanel() {
    const sel = [...state.compareSel];
    const monBtns = ['ARS', 'USD'].map(m =>
      `<button class="ced-dt-btn ${state.cmpMoneda === m ? 'active' : ''}" data-cmp-moneda="${m}">${m}</button>`).join('');
    const perBtns = PERIODS.map(p =>
      `<button class="ced-dt-btn ${state.cmpPeriod === p.key ? 'active' : ''}" data-cmp-period="${p.key}">${p.label}</button>`).join('');
    const legend = sel.map((k, i) =>
      `<span class="ced-cmp-leg"><span class="ced-cmp-leg-dot" style="background:${CMP_COLORS[i % CMP_COLORS.length]}"></span>${escapeHtml(k)}</span>`).join('');

    const espMap = {};
    state.especies.forEach(e => { espMap[especieKey(e)] = e; });
    const head = `<th></th>${sel.map(k => `<th>${escapeHtml(k)}</th>`).join('')}`;
    const body = CMP_ROWS.map(([label, fn]) =>
      `<tr><td class="ced-cmpt-label">${escapeHtml(label)}</td>${sel.map(k => `<td>${espMap[k] ? fn(espMap[k]) : DASH}</td>`).join('')}</tr>`
    ).join('');

    return `
      <div class="ced-cmp-panel">
        <div class="ced-cmp-head">
          <div class="ced-cmp-title">Comparación <span>base 100</span> · ${sel.map(escapeHtml).join(' vs ')}</div>
          <div class="ced-detail-toggles">
            <div class="ced-dt-group">${monBtns}</div>
            <div class="ced-dt-group">${perBtns}</div>
            <button class="ced-cmp-close" id="cedCmpClose">✕ Cerrar</button>
          </div>
        </div>
        <div class="ced-cmp-legend">${legend}</div>
        <div class="ced-cmp-chart"><canvas id="cedCmpChart"></canvas></div>
        <div class="ced-cmp-tablewrap">
          <table class="ced-cmpt"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
        </div>
        <p class="ced-legend-note">Retornos indexados a 100 al inicio del período (${escapeHtml(state.cmpMoneda)}). Fuente: LSEG Refinitiv.</p>
      </div>`;
  }

  async function hydrateCompare() {
    if (!state.compareOpen) return;
    const sel = [...state.compareSel];
    try {
      await Promise.all(sel.map(k => fetchSeries(k)));
    } catch (e) {
      console.error('Comparador: error cargando series', e);
      return;
    }
    if (state.destroyed || !state.compareOpen) return;
    drawCompareChart(sel);
  }

  function drawCompareChart(sel) {
    const canvas = state.container.querySelector('#cedCmpChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const pk = state.cmpMoneda === 'USD' ? 'close_usd' : 'close_ars';
    const nDays = periodDays(state.cmpPeriod);

    // series filtradas por moneda y período + unión de fechas (feriados dispares)
    const per = {};
    const dateSet = new Set();
    sel.forEach(k => {
      const rows = (state.seriesCache[k] || []).filter(d => isNum(d[pk])).slice(-nDays);
      const map = new Map(rows.map(d => [d.fecha, Number(d[pk])]));
      per[k] = map;
      rows.forEach(d => dateSet.add(d.fecha));
    });
    const labels = [...dateSet].sort();

    const datasets = sel.map((k, i) => {
      const map = per[k];
      let base = null;
      for (const d of labels) { if (map.has(d)) { base = map.get(d); break; } }
      const data = labels.map(d => (map.has(d) && base) ? (map.get(d) / base) * 100 : null);
      return {
        type: 'line', label: k, data,
        borderColor: CMP_COLORS[i % CMP_COLORS.length],
        borderWidth: 2, pointRadius: 0, tension: 0.25, spanGaps: true, fill: false,
      };
    });

    if (state.cmpChart) { try { state.cmpChart.destroy(); } catch (_) {} state.cmpChart = null; }
    state.cmpChart = new Chart(canvas, {
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { ticks: { maxTicksLimit: 8, autoSkip: true, font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { font: { size: 10 }, callback: v => v.toFixed(0) } },
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y == null ? '—' : ctx.parsed.y.toFixed(1)}` } },
        },
      },
    });
  }

  function wireCompareBar() {
    // quitar especie desde el chip
    state.container.querySelectorAll('[data-uncmp]').forEach(b => {
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        state.compareSel.delete(b.dataset.uncmp);
        render();
      });
    });
    const go = state.container.querySelector('#cedCmpGo');
    if (go) go.addEventListener('click', () => { state.compareOpen = true; render(); });
  }

  function wireCompareEvents() {
    wireCompareBar();
    const close = state.container.querySelector('#cedCmpClose');
    if (close) close.addEventListener('click', () => {
      state.compareOpen = false;
      if (state.cmpChart) { try { state.cmpChart.destroy(); } catch (_) {} state.cmpChart = null; }
      render();
    });
    // toggles del panel
    state.container.querySelectorAll('[data-cmp-moneda],[data-cmp-period]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.cmpMoneda) state.cmpMoneda = btn.dataset.cmpMoneda;
        if (btn.dataset.cmpPeriod) state.cmpPeriod = btn.dataset.cmpPeriod;
        const grp = btn.parentElement;
        if (grp) grp.querySelectorAll('.ced-dt-btn').forEach(b => b.classList.toggle('active', b === btn));
        drawCompareChart([...state.compareSel]);
      });
    });
    // checkboxes de las filas
    state.container.querySelectorAll('input.ced-cmp-check').forEach(cb => {
      cb.addEventListener('click', ev => ev.stopPropagation());
      cb.addEventListener('change', () => {
        const k = cb.dataset.cmp;
        if (cb.checked) {
          if (state.compareSel.size >= CMP_MAX) { cb.checked = false; return; }
          state.compareSel.add(k);
        } else {
          state.compareSel.delete(k);
        }
        // refrescar solo la barra (los checkboxes ya reflejan su estado)
        const bar = state.container.querySelector('.ced-cmp-bar');
        if (bar) {
          const tmp = document.createElement('div');
          tmp.innerHTML = renderCompareBar();
          bar.replaceWith(tmp.firstElementChild);
          wireCompareBar();
        }
      });
    });
  }

  // ============ Export PDF branded (print CSS) ============
  const DISCLAIMER = 'Este material es preparado por Amauta Inversiones Financieras (Matrícula CNV 1029) con fines informativos y no constituye una recomendación de inversión. La información proviene de fuentes consideradas confiables, sin garantizar su exactitud ni completitud. Las inversiones en mercados financieros implican riesgos, incluyendo la posible pérdida del capital invertido. Rentabilidades pasadas no garantizan resultados futuros.';

  function exportPdf() {
    const old = document.getElementById('cedPrint');
    if (old) old.remove();
    const rows = sortedFilteredRows();
    const cols = visibleColList();
    const p = state.params || {};
    const now = new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
    const filtro = state.filterSector !== 'Todos' ? ` · Sector: ${escapeHtml(state.filterSector)}` : '';

    const head = `<th class="esp">Especie</th>` + cols.map(c =>
      `<th class="${c.type === 'num' ? 'num' : ''}">${escapeHtml(c.label)}</th>`).join('');
    const body = rows.map(e => {
      const cells = cols.map(c => {
        const extra = c.cls ? c.cls(e) : '';
        return `<td class="${c.type === 'num' ? 'num' : ''}${extra ? ' ' + extra : ''}">${c.render(e)}</td>`;
      }).join('');
      return `<tr><td class="esp">${escapeHtml(especieLabel(e))}</td>${cells}</tr>`;
    }).join('');

    const el = document.createElement('div');
    el.id = 'cedPrint';
    el.innerHTML = `
      <div class="cp-head">
        <img src="/assets/amauta-logo-horizontal.png" alt="Amauta Inversiones Financieras" class="cp-logo">
        <div class="cp-title">
          <h1>Monitor CEDEARs</h1>
          <div class="cp-sub">${rows.length} especies${filtro} · ${escapeHtml(now)} · CCL ref ${fmtPrice(p.ccl_ref)} · MEP ${fmtPrice(p.mep)}</div>
        </div>
      </div>
      <table class="cp-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
      <div class="cp-foot">
        <p class="cp-disclaimer">${escapeHtml(DISCLAIMER)}</p>
        <p class="cp-brand">Amauta Inversiones Financieras · Matrícula CNV 1029 · amautainversiones.com · Fuente de datos: LSEG Refinitiv</p>
      </div>`;
    document.body.appendChild(el);
    window.addEventListener('afterprint', () => { try { el.remove(); } catch (_) {} }, { once: true });
    window.print();
  }

  function renderTable() {
    const rows = sortedFilteredRows();
    const cols = visibleColList();
    const colspan = cols.length + 1 + (state.compareMode ? 1 : 0); // especie + cols (+ checkbox)

    const cmpTh = state.compareMode ? '<th class="ced-th ced-th-cmp"></th>' : '';
    const head = `
      ${cmpTh}
      <th class="ced-th ced-sortable ced-th-especie" data-sort="especie">Especie${sortArrow('especie')}</th>
      ${cols.map(c => c.sortable
        ? `<th class="ced-th ced-sortable ${c.type === 'num' ? 'ced-num' : ''}" data-sort="${c.key}">${escapeHtml(c.label)}${sortArrow(c.key)}</th>`
        : `<th class="ced-th ${c.type === 'num' ? 'ced-num' : ''}">${escapeHtml(c.label)}</th>`
      ).join('')}`;

    let body = '';
    if (!rows.length) {
      body = `<tr><td colspan="${colspan}" class="ced-empty">No hay especies que coincidan con el filtro.</td></tr>`;
    } else {
      rows.forEach(e => {
        const key = especieKey(e);
        const isOpen = state.expandedKey === key;
        const cmpTd = state.compareMode
          ? `<td class="ced-td-cmp"><input type="checkbox" class="ced-cmp-check" data-cmp="${escapeHtml(key)}" ${state.compareSel.has(key) ? 'checked' : ''}></td>`
          : '';
        const cells = cols.map(c => {
          const extra = c.cls ? c.cls(e) : '';
          const klass = `${c.type === 'num' ? 'ced-num' : ''}${extra ? ' ' + extra : ''}`.trim();
          return `<td${klass ? ` class="${klass}"` : ''}>${c.render(e)}</td>`;
        }).join('');
        body += `
          <tr class="ced-row ${isOpen ? 'open' : ''}" data-especie="${escapeHtml(key)}">
            ${cmpTd}
            <td class="ced-td-especie">${especieCell(e)}</td>
            ${cells}
          </tr>`;
        if (isOpen) body += detailRow(e, colspan);
      });
    }

    return `
      <div class="ced-table-wrap">
        <table class="ced-table">
          <thead><tr>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }

  function sortArrow(key) {
    if (state.sortKey !== key) return '<span class="ced-sort-arrow">↕</span>';
    return `<span class="ced-sort-arrow active">${state.sortDir === 'asc' ? '▲' : '▼'}</span>`;
  }

  // -------------- Render completo --------------
  function render() {
    if (!state || !state.container) return;
    state.container.innerHTML = `
      <div class="ced-view">
        <div class="ced-header">
          <h2 class="ced-title">Monitor <span>CEDEARs</span></h2>
          <p class="ced-subtitle">Precios y valuación en vivo · ${state.especies.length} especies</p>
        </div>
        ${renderKpis()}
        ${renderControls()}
        ${renderCompareBar()}
        ${state.compareOpen ? renderComparePanel() : renderTable()}
        <p class="ced-legend-note">Hacé clic en una especie para ver su <b>gráfico</b>, volumen e histórico de Reuters. Dif % negativa = cotiza por debajo del fair value (barato). Usá <b>Columnas</b> para elegir qué mostrar.</p>
      </div>`;
    wireEvents();
    hydrateDetail();
    hydrateCompare();
  }

  // Re-render sólo del cuerpo de tabla (para sort/filtros sin perder foco de búsqueda)
  function rerenderTable() {
    const wrap = state.container.querySelector('.ced-table-wrap');
    if (!wrap) { render(); return; }
    const tmp = document.createElement('div');
    tmp.innerHTML = renderTable();
    wrap.replaceWith(tmp.firstElementChild);
    wireTableEvents();
    hydrateDetail();
  }

  function wireEvents() {
    // Chips de sector
    state.container.querySelectorAll('.ced-sector-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        state.filterSector = chip.dataset.sector;
        render();
      });
    });
    // Búsqueda
    const search = state.container.querySelector('#cedSearch');
    if (search) {
      search.addEventListener('input', () => {
        state.search = search.value;
        rerenderTable();
      });
    }
    // Botón Comparar (toggle del modo)
    const cmpBtn = state.container.querySelector('#cedCmpBtn');
    if (cmpBtn) {
      cmpBtn.addEventListener('click', () => {
        state.compareMode = !state.compareMode;
        if (!state.compareMode) { state.compareSel.clear(); state.compareOpen = false; }
        render();
      });
    }
    // Botón PDF (vista imprimible branded)
    const pdfBtn = state.container.querySelector('#cedPdfBtn');
    if (pdfBtn) pdfBtn.addEventListener('click', exportPdf);
    wireColPicker();
    wireCompareEvents();
    wireTableEvents();
  }

  function wireColPicker() {
    const btn = state.container.querySelector('#cedColsBtn');
    const panel = state.container.querySelector('#cedColPanel');
    if (!btn || !panel) return;

    // Abrir/cerrar (sin re-render, para no perder scroll)
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      state.colPickerOpen = !state.colPickerOpen;
      panel.classList.toggle('open', state.colPickerOpen);
      btn.classList.toggle('active', state.colPickerOpen);
      btn.setAttribute('aria-expanded', String(state.colPickerOpen));
    });
    // Clic dentro del panel no lo cierra
    panel.addEventListener('click', (ev) => ev.stopPropagation());

    // Checkboxes: activar/desactivar columna
    panel.querySelectorAll('input[data-col]').forEach(cb => {
      cb.addEventListener('change', () => {
        const key = cb.dataset.col;
        if (cb.checked) state.visibleCols.add(key);
        else state.visibleCols.delete(key);
        // No permitir dejar la tabla sin ninguna columna
        if (state.visibleCols.size === 0) { state.visibleCols.add(key); cb.checked = true; return; }
        saveVisibleCols(state.visibleCols);
        updateColCount();
        rerenderTable();
      });
    });

    // Presets
    panel.querySelectorAll('.ced-preset-btn').forEach(pb => {
      pb.addEventListener('click', () => {
        const preset = COL_PRESETS[pb.dataset.preset];
        if (!preset) return;
        state.visibleCols = new Set(preset);
        saveVisibleCols(state.visibleCols);
        // reflejar en los checkboxes sin rebuild completo
        panel.querySelectorAll('input[data-col]').forEach(cb => {
          cb.checked = state.visibleCols.has(cb.dataset.col);
        });
        updateColCount();
        rerenderTable();
      });
    });
  }

  function updateColCount() {
    const el = state.container && state.container.querySelector('.ced-cols-count');
    if (el) el.textContent = String(visibleColList().length);
  }

  function wireTableEvents() {
    // Orden por columna
    state.container.querySelectorAll('.ced-sortable').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortKey = key;
          state.sortDir = 'asc';
        }
        rerenderTable();
      });
    });
    // Links de especie → navegación SPA (research completo). No expande la fila.
    state.container.querySelectorAll('.ced-especie-link, .ced-dt-research').forEach(link => {
      link.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const inst = link.dataset.inst;
        const nav = bridge().navigate;
        if (typeof nav === 'function') nav(inst);
        else location.search = `?inst=${encodeURIComponent(inst)}`;
      });
    });
    // Click en una fila → expandir/colapsar el detalle con gráfico
    state.container.querySelectorAll('.ced-row').forEach(row => {
      row.addEventListener('click', (ev) => {
        if (ev.target.closest('.ced-especie-link')) return; // el link navega
        const key = row.dataset.especie;
        state.expandedKey = (state.expandedKey === key) ? null : key;
        if (state.chart) { try { state.chart.destroy(); } catch (_) {} state.chart = null; }
        rerenderTable();
        if (state.expandedKey) {
          const dr = state.container.querySelector(`.ced-detail-row[data-detail-for="${cssEscape(state.expandedKey)}"]`);
          if (dr && dr.scrollIntoView) dr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      });
    });
    // Clicks dentro del panel de detalle no colapsan la fila
    state.container.querySelectorAll('.ced-detail-row').forEach(dr => {
      dr.addEventListener('click', (ev) => ev.stopPropagation());
    });
    // Toggles de período y moneda dentro del detalle
    state.container.querySelectorAll('.ced-dt-btn').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (btn.dataset.period) state.detailPeriod = btn.dataset.period;
        if (btn.dataset.moneda) state.detailMoneda = btn.dataset.moneda;
        const grp = btn.parentElement;
        if (grp) grp.querySelectorAll('.ced-dt-btn').forEach(b => b.classList.toggle('active', b === btn));
        const e = state.especies.find(x => especieKey(x) === state.expandedKey);
        if (e) { drawDetailChart(e); fillDetailStats(e); }
      });
    });
  }

  // -------------- Refetch (debounced) --------------
  async function refetchData() {
    // Con un detalle o comparación abiertos, no re-renderizamos toda la vista
    // (destruiría los gráficos). Los precios de la tabla se retoman al cerrarlos.
    if (state.expandedKey || state.compareOpen) return;
    try {
      const [especies, params] = await Promise.all([fetchEspecies(), fetchParams()]);
      if (state.destroyed) return;
      state.especies = especies || [];
      state.params = params;
      render();
    } catch (e) {
      console.error('CEDEARs refetch error', e);
    }
  }
  function scheduleRefetch() {
    clearTimeout(state.refetchTimer);
    state.refetchTimer = setTimeout(() => { if (!state.destroyed) refetchData(); }, 500);
  }

  // -------------- Realtime (UPDATE en cedears_params) --------------
  function subscribeParamsRealtime() {
    const conf = cfg();
    if (!conf.SUPABASE_URL || !conf.SUPABASE_KEY) return null;
    const wsUrl = conf.SUPABASE_URL.replace('https://', 'wss://') +
      '/realtime/v1/websocket?apikey=' + conf.SUPABASE_KEY + '&vsn=1.0.0';
    let ws, heartbeat, retryTimer, closed = false;

    function connect() {
      if (closed) return;
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        ws.send(JSON.stringify({
          topic: 'realtime:public:cedears_params',
          event: 'phx_join',
          payload: { config: { broadcast: { self: false }, presence: { key: '' } } },
          ref: '1',
        }));
        heartbeat = setInterval(() => {
          try { ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: null })); } catch (_) {}
        }, 25000);
      };
      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          const ev = data?.payload?.data;
          if (ev && ['INSERT', 'UPDATE'].includes(ev.type)) scheduleRefetch();
        } catch (_) {}
      };
      ws.onclose = () => {
        clearInterval(heartbeat);
        if (!closed) retryTimer = setTimeout(connect, 5000);
      };
      ws.onerror = () => { try { ws.close(); } catch (_) {} };
    }
    connect();

    return () => {
      closed = true;
      clearTimeout(retryTimer);
      clearInterval(heartbeat);
      try { ws && ws.close(); } catch (_) {}
    };
  }

  // -------------- Polling fallback (solo visible) --------------
  function startPolling() {
    state.pollTimer = setInterval(() => {
      if (state.destroyed) return;
      if (document.visibilityState === 'visible') refetchData();
    }, 60000);
  }

  // -------------- API pública --------------
  async function mount(containerEl) {
    unmount(); // por si quedó algo montado
    state = freshState();
    state.container = containerEl;
    containerEl.innerHTML = `<div class="loading"><div class="spinner"></div><div>Cargando Monitor CEDEARs…</div></div>`;

    try {
      const [especies, params, instrumentIds] = await Promise.all([
        fetchEspecies(),
        fetchParams(),
        fetchInstrumentIds().catch(() => new Set()),
      ]);
      if (state.destroyed) return;
      state.especies = especies || [];
      state.params = params;
      state.instrumentIds = instrumentIds || new Set();
      render();
    } catch (e) {
      containerEl.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h2>Error</h2><p>No se pudo cargar el Monitor CEDEARs: ${escapeHtml(e.message)}</p></div>`;
      return;
    }

    // Cerrar el panel de columnas al hacer clic afuera
    state.docClickHandler = (ev) => {
      if (!state || !state.colPickerOpen) return;
      if (ev.target.closest && ev.target.closest('.ced-colpicker')) return;
      state.colPickerOpen = false;
      const panel = state.container && state.container.querySelector('#cedColPanel');
      const btn = state.container && state.container.querySelector('#cedColsBtn');
      if (panel) panel.classList.remove('open');
      if (btn) { btn.classList.remove('active'); btn.setAttribute('aria-expanded', 'false'); }
    };
    document.addEventListener('click', state.docClickHandler);

    // Realtime + polling
    state.unsubRealtime = subscribeParamsRealtime();
    startPolling();
  }

  function unmount() {
    if (!state) return;
    state.destroyed = true;
    try { state.chart && state.chart.destroy(); } catch (_) {}
    try { state.cmpChart && state.cmpChart.destroy(); } catch (_) {}
    try { state.unsubRealtime && state.unsubRealtime(); } catch (_) {}
    clearInterval(state.pollTimer);
    clearTimeout(state.refetchTimer);
    if (state.visibilityHandler) document.removeEventListener('visibilitychange', state.visibilityHandler);
    if (state.docClickHandler) document.removeEventListener('click', state.docClickHandler);
    state = null;
  }

  window.CedearsView = { mount, unmount };
})();
