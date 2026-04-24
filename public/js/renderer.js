const chartInstances = [];

export function destroyCharts() {
  while (chartInstances.length) {
    try { chartInstances.pop().destroy(); } catch (_) {}
  }
}

function normalizeScaleAxis(axis) {
  if (!axis) return axis;
  const out = { ...axis };
  const prefix = axis.tickPrefix, suffix = axis.tickSuffix;
  if (prefix || suffix) {
    out.ticks = {
      ...(axis.ticks || {}),
      callback: function (v) { return `${prefix || ''}${v}${suffix || ''}`; }
    };
  }
  delete out.tickPrefix; delete out.tickSuffix;
  return out;
}

function normalizeOptions(opts) {
  const o = JSON.parse(JSON.stringify(opts || {}));
  o.responsive = true;
  o.maintainAspectRatio = false;
  if (o.scales) {
    Object.keys(o.scales).forEach(k => { o.scales[k] = normalizeScaleAxis(o.scales[k]); });
  }
  if (o.tooltipUnit) {
    o.plugins = o.plugins || {};
    o.plugins.tooltip = {
      callbacks: { label: c => `${c.label}: $${c.raw}${o.tooltipUnit}` }
    };
    delete o.tooltipUnit;
  }
  return o;
}

function buildChart(canvas, spec) {
  Chart.defaults.color = '#666666';
  Chart.defaults.borderColor = '#e8e8e8';
  Chart.defaults.font.family = "'Fira Sans', Arial, sans-serif";
  const datasets = (spec.datasets || []).map(ds => {
    if (!ds.benchmark) return ds;
    return {
      ...ds,
      type: 'line',
      borderColor: ds.borderColor || '#94a3b8',
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderDash: [4, 3],
      pointRadius: 2,
      fill: false,
      tension: 0.3,
    };
  });
  const cfg = {
    type: spec.chart_type,
    data: { labels: spec.labels, datasets },
    options: normalizeOptions(spec.options),
  };
  return new Chart(canvas, cfg);
}

function sanitize(html) {
  if (typeof DOMPurify !== 'undefined') return DOMPurify.sanitize(html);
  return html;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const renderers = {
  heading(b) {
    const level = b.data.level === 3 ? 3 : 2;
    return `<h${level} style="color:var(--am-bordo);margin-bottom:12px;">${escapeHtml(b.data.text || '')}</h${level}>`;
  },
  paragraph(b) {
    return `<p style="font-size:14px;line-height:1.6;margin-bottom:12px;">${sanitize(b.data.html || '')}</p>`;
  },
  thesis_box(b) {
    const d = b.data;
    const points = (d.points || []).map(p =>
      `<div class="thesis-point"><div class="num">${escapeHtml(p.num || '•')}</div><div class="tp-text">${sanitize(p.html || '')}</div></div>`
    ).join('');
    const borderColor = d.variant === 'blue' ? 'var(--am-blue)'
                      : d.variant === 'yellow' ? 'var(--am-yellow)'
                      : '';
    const headColor = d.variant === 'blue' ? 'var(--am-blue)'
                    : d.variant === 'yellow' ? '#9a8300'
                    : 'var(--am-bordo)';
    const style = borderColor ? `style="border-color:${borderColor}"` : '';
    const h3style = borderColor ? `style="color:${headColor}"` : '';
    return `<div class="thesis-box" ${style}>
      <h3 ${h3style}>${escapeHtml(d.title || 'Tesis')}</h3>
      ${d.intro_html ? `<p>${sanitize(d.intro_html)}</p>` : ''}
      ${points}
    </div>`;
  },
  stat_grid(b) {
    const items = (b.data.items || []).map(i => {
      const badge = i.badge ? `<span class="stat-badge badge-${i.badge.variant || 'blue'}">${escapeHtml(i.badge.text || '')}</span>` : '';
      return `<div class="stat-card">
        <div class="stat-label">${escapeHtml(i.label || '')}</div>
        <div class="stat-value">${i.value || ''}</div>
        ${i.detail ? `<div class="stat-detail">${i.detail}</div>` : ''}
        ${badge}
      </div>`;
    }).join('');
    return `<div class="card-grid">${items}</div>`;
  },
  chart(b) {
    const id = `chart_${b.id.replace(/-/g, '')}`;
    const note = b.data.note ? `<p class="chart-note">${escapeHtml(b.data.note)}</p>` : '';
    return `<div class="chart-card">
      <h4>${escapeHtml(b.data.title || '')}</h4>
      <canvas id="${id}"></canvas>
      ${note}
    </div>`;
  },
  risk_list(b) {
    const items = (b.data.items || []).map(i => `
      <div class="risk-item ${i.level || 'medium'}">
        <div class="risk-header">
          <span class="risk-level-tag tag-${i.level || 'medium'}">${escapeHtml(i.level_label || '')}</span>
          <strong>${escapeHtml(i.title || '')}</strong>
        </div>
        <p>${escapeHtml(i.description || '')}</p>
      </div>`).join('');
    return items;
  },
  html_raw(b) {
    return sanitize(b.data.html || '');
  },
};

export function renderInstrument(container, instrument, blocks, initialTab = 0) {
  destroyCharts();
  const tabs = instrument.tabs || [];

  if (instrument.status !== 'ready' || !tabs.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <h2>Análisis pendiente</h2>
        <p>El research de <strong>${escapeHtml(instrument.name)}</strong> aún no fue cargado. Próximamente se agregará el análisis completo${instrument.type === 'renta-fija' ? ' con curvas, TIR, duration y spreads' : ' con tesis, financials, valuación y modelo'}.</p>
      </div>`;
    return { switchTab: () => {}, onTabChange: () => {} };
  }

  // Clamp initialTab al rango válido
  const startTab = Math.min(Math.max(0, initialTab), tabs.length - 1);

  let html = '<div class="tabs">';
  tabs.forEach((t, i) => {
    html += `<button class="tab-btn ${i === startTab ? 'active' : ''}" data-tab-idx="${i}">${escapeHtml(t)}</button>`;
  });
  html += '</div>';

  for (let i = 0; i < tabs.length; i++) {
    html += `<div class="tab-panel ${i === startTab ? 'active' : ''}" data-tab-panel="${i}">`;
    html += buildTabHtml(blocks.filter(b => b.tab_index === i));
    html += `</div>`;
  }
  container.innerHTML = html;

  // Callback externo para sincronizar URL al cambiar de tab
  let _onTabChange = null;

  const switchTab = (idx) => {
    destroyCharts();
    container.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', +b.dataset.tabIdx === idx));
    container.querySelectorAll('[data-tab-panel]').forEach(p => p.classList.toggle('active', +p.dataset.tabPanel === idx));
    setTimeout(() => renderChartsForTab(blocks.filter(b => b.tab_index === idx)), 30);
    if (_onTabChange) _onTabChange(idx);
  };

  container.querySelectorAll('.tab-btn').forEach(b => {
    b.addEventListener('click', () => switchTab(+b.dataset.tabIdx));
  });

  // Renderizar charts del tab inicial
  setTimeout(() => renderChartsForTab(blocks.filter(b => b.tab_index === startTab)), 30);

  return {
    switchTab,
    onTabChange: (fn) => { _onTabChange = fn; },
  };
}

function buildTabHtml(tabBlocks) {
  let out = '';
  let pendingCharts = [];

  const flushCharts = () => {
    if (!pendingCharts.length) return;
    out += `<div class="chart-grid">${pendingCharts.join('')}</div>`;
    pendingCharts = [];
  };

  tabBlocks.forEach(b => {
    const fn = renderers[b.block_type];
    if (!fn) {
      flushCharts();
      out += `<div class="card"><em style="color:var(--am-gray)">Bloque desconocido: ${escapeHtml(b.block_type)}</em></div>`;
      return;
    }
    if (b.block_type === 'chart') {
      pendingCharts.push(fn(b));
      if (pendingCharts.length >= 2) flushCharts();
    } else {
      flushCharts();
      out += fn(b);
    }
  });
  flushCharts();
  return out;
}

function renderChartsForTab(tabBlocks) {
  tabBlocks.filter(b => b.block_type === 'chart').forEach(b => {
    const canvas = document.getElementById(`chart_${b.id.replace(/-/g, '')}`);
    if (canvas) {
      try { chartInstances.push(buildChart(canvas, b.data)); }
      catch (e) { console.error('Chart error', b.id, e); }
    }
  });
}

// Renderiza el HTML de un único bloque (para preview en admin panel)
export function renderBlockHtml(block) {
  if (block.block_type === 'chart') {
    // Para charts usamos un canvas con ID único temporal
    const id = `preview_chart_${block.id?.replace(/-/g, '') || Date.now()}`;
    const note = block.data.note ? `<p class="chart-note">${escapeHtml(block.data.note)}</p>` : '';
    return `<div class="chart-card" style="max-width:500px;">
      <h4>${escapeHtml(block.data.title || '')}</h4>
      <canvas id="${id}" style="max-height:200px;"></canvas>
      ${note}
    </div>`;
  }
  const fn = renderers[block.block_type];
  if (!fn) return `<em style="color:var(--am-gray)">Tipo desconocido: ${escapeHtml(block.block_type)}</em>`;
  return fn(block);
}

// Renderiza el chart de un bloque (llamar después de insertar el HTML en el DOM)
export function renderBlockChart(block) {
  const id = `preview_chart_${block.id?.replace(/-/g, '') || Date.now()}`;
  const canvas = document.getElementById(id);
  if (canvas) {
    try { chartInstances.push(buildChart(canvas, block.data)); } catch (e) { console.error('Preview chart error', e); }
  }
}

export const AmautaRenderer = { renderInstrument, destroyCharts, renderBlockHtml, renderBlockChart };
