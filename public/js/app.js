import { AMAUTA_CONFIG } from './config.js';
import { AmautaDB, signIn, signOut, clearCache, subscribeRealtime, onInstrumentsChanged } from './supabase-client.js';
import { AmautaRenderer } from './renderer.js';
import { AmautaAdmin } from './admin.js';

const CFG = AMAUTA_CONFIG;
let instruments = [];
let active = null;
let isAdmin = false;

// -------------- URL routing --------------
function getUrlInstrument() {
  return new URLSearchParams(location.search).get('inst') || null;
}

function pushUrlInstrument(id, tabIdx) {
  const params = new URLSearchParams();
  if (id) params.set('inst', id);
  if (tabIdx != null && tabIdx > 0) params.set('tab', tabIdx);
  const qs = params.toString();
  history.pushState({ inst: id, tab: tabIdx ?? 0 }, '', qs ? `?${qs}` : location.pathname);
}

function replaceUrlInstrument(id, tabIdx) {
  const params = new URLSearchParams();
  if (id) params.set('inst', id);
  if (tabIdx != null && tabIdx > 0) params.set('tab', tabIdx);
  const qs = params.toString();
  history.replaceState({ inst: id, tab: tabIdx ?? 0 }, '', qs ? `?${qs}` : location.pathname);
}

// Manejar botones atrás/adelante del browser
window.addEventListener('popstate', (e) => {
  const inst = e.state?.inst || getUrlInstrument();
  if (inst) {
    selectInstrument(inst, e.state?.tab ?? 0, false);
  } else {
    // Volver a bienvenida
    AmautaRenderer.destroyCharts();
    document.querySelectorAll('.instrument-item').forEach(i => i.classList.remove('active'));
    const content = document.getElementById('contentArea');
    const topbar = document.getElementById('topbar');
    if (topbar) topbar.style.display = 'none';
    content.innerHTML = '';
    const welcome = document.createElement('div');
    welcome.className = 'welcome';
    welcome.id = 'welcomeScreen';
    welcome.innerHTML = `
      <div class="welcome-logo">✦</div>
      <h2>Amauta Research</h2>
      <p>Seleccioná un instrumento del panel izquierdo para ver el análisis completo.</p>
      <div class="legend">
        <div class="legend-item"><span class="status-dot ready" style="display:inline-block;width:8px;height:8px;border-radius:50%;"></span> Análisis completo</div>
        <div class="legend-item"><span class="status-dot wip" style="display:inline-block;width:8px;height:8px;border-radius:50%;"></span> En desarrollo</div>
        <div class="legend-item"><span class="status-dot empty" style="display:inline-block;width:8px;height:8px;border-radius:50%;"></span> Pendiente</div>
      </div>`;
    content.appendChild(welcome);
    buildWelcome();
    active = null;
  }
});

// -------------- Sidebar --------------
async function init() {
  const topbar = document.getElementById('topbar');
  topbar.style.display = 'none';
  try {
    instruments = await AmautaDB.listInstruments();
    buildSidebar();
    // Restaurar instrumento desde URL al cargar la página
    const instFromUrl = getUrlInstrument();
    const tabFromUrl  = parseInt(new URLSearchParams(location.search).get('tab') || '0', 10);
    if (instFromUrl) {
      selectInstrument(instFromUrl, tabFromUrl, false);
    }
  } catch (e) {
    console.error('Error loading instruments', e);
    document.getElementById('sidebarNav').innerHTML =
      `<div style="padding:20px;color:var(--am-red);font-size:13px;">Error cargando instrumentos: ${escapeHtml(e.message)}</div>`;
  }
}

function buildWelcome() {
  const welcome = document.getElementById('welcomeScreen');
  if (!welcome) return;
  // Limpiar cards previas
  welcome.querySelector('.welcome-title')?.remove();
  welcome.querySelector('.welcome-instruments')?.remove();

  const readyInsts = instruments.filter(i => i.status === 'ready');
  if (!readyInsts.length) return;

  const title = document.createElement('div');
  title.className = 'welcome-title';
  title.textContent = 'Instrumentos disponibles';
  welcome.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'welcome-instruments';
  grid.innerHTML = readyInsts.map(inst => `
    <div class="welcome-inst-card" data-inst-id="${escapeHtml(inst.id)}">
      <span class="wi-ticker">${escapeHtml(inst.ticker)}</span>
      <span class="wi-name">${escapeHtml(inst.name)}</span>
      <span class="wi-category"><span class="wi-dot"></span>${escapeHtml(inst.category)}</span>
    </div>`).join('');
  welcome.appendChild(grid);

  grid.querySelectorAll('.welcome-inst-card').forEach(card => {
    card.addEventListener('click', () => selectInstrument(card.dataset.instId));
  });
}

function buildSidebar() {
  const nav = document.getElementById('sidebarNav');
  const categories = {};
  const order = CFG.CATEGORY_ORDER;
  const visible = isAdmin ? instruments : instruments.filter(i => i.status === 'ready');
  visible.forEach(inst => {
    (categories[inst.category] = categories[inst.category] || []).push(inst);
  });
  const orderedCats = order.filter(c => categories[c]).concat(Object.keys(categories).filter(c => !order.includes(c)));
  let html = '';
  orderedCats.forEach(cat => {
    html += `<div class="category open" id="cat-${cssId(cat)}">
      <div class="category-header">
        <span>${escapeHtml(cat)}</span><span class="arrow">▶</span>
      </div>
      <div class="instrument-list">`;
    categories[cat].forEach(inst => {
      html += `<div class="instrument-item" data-inst-id="${escapeHtml(inst.id)}">
        <span class="ticker">${escapeHtml(inst.ticker)}</span>
        <span class="inst-name">${escapeHtml(inst.name)}</span>
        <span class="status-dot ${escapeHtml(inst.status)}"></span>
      </div>`;
    });
    html += `</div></div>`;
  });
  nav.innerHTML = html;

  nav.querySelectorAll('.category-header').forEach(h => {
    h.addEventListener('click', () => h.parentElement.classList.toggle('open'));
  });
  nav.querySelectorAll('.instrument-item').forEach(item => {
    item.addEventListener('click', () => selectInstrument(item.dataset.instId));
  });

  const adminEntry = document.getElementById('sidebarAdminEntry');
  if (adminEntry) {
    adminEntry.addEventListener('click', () => {
      document.querySelectorAll('.instrument-item').forEach(i => i.classList.remove('active'));
      adminEntry.classList.add('active');
      document.getElementById('sidebar').classList.remove('open');
      AmautaAdmin.openPanel();
    });
  }

  const countEl = document.getElementById('sidebarInstrumentCount');
  if (countEl) {
    const readyCount = instruments.filter(i => i.status === 'ready').length;
    countEl.textContent = `${readyCount} de ${instruments.length} instrumentos con análisis`;
  }

  buildWelcome();
}

let _filterTimer;
function filterInstruments() {
  clearTimeout(_filterTimer);
  _filterTimer = setTimeout(() => {
    const q = document.getElementById('searchInput').value.toLowerCase();
    document.querySelectorAll('.instrument-item').forEach(item => {
      const text = (item.dataset.ticker || item.textContent).toLowerCase();
      item.style.display = text.includes(q) ? '' : 'none';
    });
  }, 200);
}

// pushHistory=true cuando el usuario hace clic; false cuando se restaura desde URL/popstate
async function selectInstrument(id, initialTab = 0, pushHistory = true) {
  AmautaRenderer.destroyCharts();
  document.querySelectorAll('.instrument-item').forEach(i => i.classList.remove('active'));
  document.querySelector(`.instrument-item[data-inst-id="${cssEscape(id)}"]`)?.classList.add('active');
  document.getElementById('sidebarAdminEntry')?.classList.remove('active');

  const welcome = document.getElementById('welcomeScreen');
  if (welcome) welcome.remove();
  document.getElementById('sidebar').classList.remove('open');

  const content = document.getElementById('contentArea');
  content.innerHTML = `<div class="loading"><div class="spinner"></div><div>Cargando ${escapeHtml(id)}…</div></div>`;

  // Actualizar URL
  if (pushHistory) {
    pushUrlInstrument(id, initialTab > 0 ? initialTab : null);
  } else {
    replaceUrlInstrument(id, initialTab > 0 ? initialTab : null);
  }

  try {
    const [inst, blocks] = await Promise.all([
      AmautaDB.getInstrument(id),
      AmautaDB.getBlocks(id),
    ]);
    if (!inst) throw new Error('Instrumento no encontrado');

    const topbar = document.getElementById('topbar');
    topbar.style.display = 'flex';
    topbar.innerHTML = `
      <div class="topbar-left">
        <span class="topbar-ticker">${escapeHtml(inst.ticker)}</span>
        <span class="topbar-name">${escapeHtml(inst.name)}</span>
        <span class="topbar-type type-${escapeHtml(inst.type)}">${inst.type === 'equity' ? 'Equity' : 'Renta Fija'}</span>
      </div>
      <div class="topbar-right">
        ${inst.tv_symbol ? `<div class="tv-price-widget" id="tvPriceWidget"></div>` : `<span class="topbar-price">${escapeHtml(inst.price || '')}</span>`}
        ${inst.change_text ? `<span class="topbar-change ${inst.change_dir === 'down' ? 'change-down' : 'change-up'}">${escapeHtml(inst.change_text)}</span>` : ''}
        ${inst.updated_text ? `<span class="topbar-updated">Actualizado: ${escapeHtml(inst.updated_text)}</span>` : ''}
      </div>
    `;
    if (inst.tv_symbol) loadTVTickerWidget(inst.tv_symbol);

    active = { id, instrument: inst, blocks };
    const res = AmautaRenderer.renderInstrument(content, inst, blocks, initialTab);
    active.switchTab = res.switchTab;

    // Sincronizar URL cuando el usuario cambia de tab
    if (res.onTabChange) {
      res.onTabChange((tabIdx) => {
        pushUrlInstrument(id, tabIdx > 0 ? tabIdx : null);
      });
    }
  } catch (e) {
    content.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h2>Error</h2><p>${escapeHtml(e.message)}</p></div>`;
  }
}

// -------------- TradingView --------------
function loadTVTickerWidget(symbol) {
  const container = document.getElementById('tvPriceWidget');
  if (!container) return;
  container.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'tradingview-widget-container';
  div.innerHTML = `<div class="tradingview-widget-container__widget"></div>`;
  container.appendChild(div);
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-single-quote.js';
  script.async = true;
  script.textContent = JSON.stringify({
    symbol, width: '320', isTransparent: true, colorTheme: 'light', locale: 'es'
  });
  div.appendChild(script);
}

// -------------- Admin gate --------------
function toggleAdmin() {
  if (isAdmin) {
    isAdmin = false;
    document.body.classList.remove('admin-mode');
    signOut();
    clearCache();
    buildSidebar();
    return;
  }
  document.getElementById('adminModal').classList.add('show');
  document.getElementById('adminEmail').focus();
}
async function checkAdmin() {
  const email = document.getElementById('adminEmail').value.trim();
  const pass  = document.getElementById('adminPass').value;
  const errEl = document.getElementById('adminError');
  const btn   = document.querySelector('.modal-btn');
  if (!email || !pass) { errEl.textContent = 'Ingresá email y contraseña'; errEl.style.display = 'block'; return; }
  if (btn) { btn.textContent = '…'; btn.disabled = true; }
  try {
    await signIn(email, pass);
    isAdmin = true;
    document.body.classList.add('admin-mode');
    document.getElementById('adminModal').classList.remove('show');
    document.getElementById('adminEmail').value = '';
    document.getElementById('adminPass').value = '';
    errEl.style.display = 'none';
    clearCache();
    buildSidebar();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  } finally {
    if (btn) { btn.textContent = 'Ingresar'; btn.disabled = false; }
  }
}
function closeAdminModal() {
  document.getElementById('adminModal').classList.remove('show');
  document.getElementById('adminEmail').value = '';
  document.getElementById('adminPass').value = '';
  document.getElementById('adminError').style.display = 'none';
}

// -------------- Home --------------
function goHome() {
  AmautaRenderer.destroyCharts();
  active = null;
  document.querySelectorAll('.instrument-item').forEach(i => i.classList.remove('active'));
  document.getElementById('sidebarAdminEntry')?.classList.remove('active');
  document.getElementById('sidebar').classList.remove('open');
  const topbar = document.getElementById('topbar');
  if (topbar) topbar.style.display = 'none';
  history.pushState({}, '', location.pathname);
  const content = document.getElementById('contentArea');
  content.innerHTML = `
    <div class="welcome" id="welcomeScreen">
      <div class="welcome-hero">
        <span class="welcome-hero-icon">✦</span>
        <h2>Amauta <span>Research</span></h2>
        <p>Análisis institucional de instrumentos financieros — equities, renta fija y más. Tesis de inversión, financials, valuación y modelos propios.</p>
        <div class="welcome-legend">
          <div class="legend-item"><span class="status-dot ready" style="display:inline-block;width:7px;height:7px;border-radius:50%;flex-shrink:0;"></span> Análisis completo</div>
          <div class="legend-item"><span class="status-dot wip" style="display:inline-block;width:7px;height:7px;border-radius:50%;flex-shrink:0;"></span> En desarrollo</div>
          <div class="legend-item"><span class="status-dot empty" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,0.2);flex-shrink:0;"></span> Pendiente</div>
        </div>
      </div>
    </div>`;
  buildWelcome();
}

// -------------- Utils --------------
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function cssId(s) { return String(s).replace(/\s+/g, ''); }
function cssEscape(s) {
  if (window.CSS && window.CSS.escape) return window.CSS.escape(s);
  return String(s).replace(/[^a-zA-Z0-9_-]/g, c => `\\${c}`);
}

// -------------- Mobile menu --------------
function wireMobileMenu() {
  const menuLink = document.getElementById('mobileMenuLink');
  const closeLink = document.getElementById('sidebarCloseLink');
  if (menuLink) {
    const open = e => { e.preventDefault(); e.stopPropagation(); document.getElementById('sidebar').classList.add('open'); };
    menuLink.addEventListener('click', open);
    menuLink.addEventListener('touchend', open);
  }
  if (closeLink) {
    const close = e => { e.preventDefault(); document.getElementById('sidebar').classList.remove('open'); };
    closeLink.addEventListener('click', close);
    closeLink.addEventListener('touchend', close);
  }
}

// -------------- Inline handler replacements --------------
function wireStaticHandlers() {
  document.getElementById('searchInput')?.addEventListener('input', filterInstruments);
  document.querySelector('.sidebar-logo')?.addEventListener('click', goHome);
  document.querySelector('.admin-toggle')?.addEventListener('click', toggleAdmin);
  document.getElementById('adminEmail')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('adminPass')?.focus(); });
  document.getElementById('adminPass')?.addEventListener('keydown', e => { if (e.key === 'Enter') checkAdmin(); });
  document.querySelector('.modal-btn')?.addEventListener('click', checkAdmin);
  document.querySelector('.modal-cancel')?.addEventListener('click', closeAdminModal);
}

wireMobileMenu();
wireStaticHandlers();
init();

// Real-time: si admin publica/actualiza, el sidebar se actualiza solo
subscribeRealtime();
onInstrumentsChanged(async () => {
  instruments = await AmautaDB.listInstruments().catch(() => instruments);
  buildSidebar();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
