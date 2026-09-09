/**
 * Renderer Controller - PageSpeed & Network Monitor
 * Hardened against XSS, DOM Flooding, Memory Leaks
 */

(function () {
  'use strict';

  // State
  let isAuditing = false;
  let currentFilter = 'all';
  let currentSearch = '';
  const requestsMap = new Map(); // id -> { rowEl, req }
  const orderedRowIds = [];
  const MAX_DOM_ROWS = 500; // Cap DOM elements to prevent UI lag
  let maxDurationSeen = 100; // ms, for timeline waterfall scaling

  // RAF Batch Queue
  let pendingUpdates = new Map(); // id -> req
  let rafScheduled = false;

  // DOM Elements
  const clockTimeEl = document.getElementById('clockTime');
  const clockDateEl = document.getElementById('clockDate');
  const userWidgetEl = document.getElementById('userWidget');

  const auditForm = document.getElementById('auditForm');
  const urlInput = document.getElementById('urlInput');
  const btnClearUrl = document.getElementById('btnClearUrl');
  const btnAudit = document.getElementById('btnAudit');
  const btnStop = document.getElementById('btnStop');

  const auditStatusBanner = document.getElementById('auditStatusBanner');
  const statusMessage = document.getElementById('statusMessage');
  const progressBar = document.getElementById('progressBar');
  const auditStateLabel = document.getElementById('auditStateLabel');

  // Vitals
  const scoreValueEl = document.getElementById('scoreValue');
  const scoreBadgeEl = document.getElementById('scoreBadge');
  const scoreCircleEl = document.getElementById('scoreCircle');

  const valLCPEl = document.getElementById('valLCP');
  const badgeLCPEl = document.getElementById('badgeLCP');
  const valFCPEl = document.getElementById('valFCP');
  const badgeFCPEl = document.getElementById('badgeFCP');
  const valCLSEl = document.getElementById('valCLS');
  const badgeCLSEl = document.getElementById('badgeCLS');
  const valTTFBEl = document.getElementById('valTTFB');
  const badgeTTFBEl = document.getElementById('badgeTTFB');

  const summaryTotalReqs = document.getElementById('summaryTotalReqs');
  const summaryTotalBytes = document.getElementById('summaryTotalBytes');
  const summaryLoadTime = document.getElementById('summaryLoadTime');
  const summaryFailedReqs = document.getElementById('summaryFailedReqs');

  // Network Table & Filters
  const networkTableBody = document.getElementById('networkTableBody');
  const emptyStateRow = document.getElementById('emptyStateRow');
  const reqCounter = document.getElementById('reqCounter');
  const searchFilter = document.getElementById('searchFilter');
  const filterTabsContainer = document.getElementById('filterTabs');

  const countEls = {
    all: document.getElementById('countAll'),
    fetch: document.getElementById('countFetch'),
    script: document.getElementById('countScript'),
    stylesheet: document.getElementById('countCss'),
    image: document.getElementById('countImg'),
    font: document.getElementById('countFont'),
    document: document.getElementById('countDoc')
  };

  // Modal Elements
  const loginModal = document.getElementById('loginModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnCancelLogin = document.getElementById('btnCancelLogin');
  const loginForm = document.getElementById('loginForm');
  const inputEmail = document.getElementById('inputEmail');

  // Status Banner & Retry
  const statusDot = document.getElementById('statusDot');
  const btnRetry = document.getElementById('btnRetry');
  let lastAuditedUrl = '';

  // Drawer Elements
  const requestDrawer = document.getElementById('requestDrawer');
  const drawerBackdrop = document.getElementById('drawerBackdrop');
  const btnCloseDrawer = document.getElementById('btnCloseDrawer');
  const btnCopyUrl = document.getElementById('btnCopyUrl');
  const drawerMethod = document.getElementById('drawerMethod');
  const drawerTitle = document.getElementById('drawerTitle');

  const paneHeaders = document.getElementById('paneHeaders');
  const paneTiming = document.getElementById('paneTiming');
  const drawerGeneralInfo = document.getElementById('drawerGeneralInfo');
  const responseHeadersTable = document.getElementById('responseHeadersTable');
  const requestHeadersTable = document.getElementById('requestHeadersTable');
  const responseHeadersCount = document.getElementById('responseHeadersCount');
  const requestHeadersCount = document.getElementById('requestHeadersCount');
  const drawerTimingInfo = document.getElementById('drawerTimingInfo');

  let activeRequest = null;
  let selectedRowEl = null;

  // Toast Container
  const toastContainer = document.getElementById('toastContainer');

  /* -------------------------------------------------------------------------- */
  /* Real-time Clock                                                            */
  /* -------------------------------------------------------------------------- */
  function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    clockTimeEl.textContent = `${hours}:${minutes}:${seconds}`;

    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    clockDateEl.textContent = `${day}/${month}/${year}`;
  }
  setInterval(updateClock, 1000);
  updateClock();

  /* -------------------------------------------------------------------------- */
  /* Toast Notifications                                                        */
  /* -------------------------------------------------------------------------- */
  function showToast(message, type = 'info', duration = 4000) {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${sanitizeClass(type)}`;

    const iconMap = {
      warning: '⚠️',
      error: '❌',
      info: 'ℹ️',
      success: '✅'
    };

    const iconSpan = document.createElement('span');
    iconSpan.style.fontSize = '14px';
    iconSpan.textContent = iconMap[type] || 'ℹ️';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'toast-content';
    contentDiv.textContent = message;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Fechar notificação');
    closeBtn.addEventListener('click', () => dismissToast(toast));

    toast.appendChild(iconSpan);
    toast.appendChild(contentDiv);
    toast.appendChild(closeBtn);

    while (toastContainer.children.length >= 5) {
      toastContainer.firstChild.remove();
    }
    toastContainer.appendChild(toast);

    const timer = setTimeout(() => {
      dismissToast(toast);
    }, duration);

    function dismissToast(el) {
      clearTimeout(timer);
      el.style.opacity = '0';
      el.style.transform = 'translateY(16px)';
      setTimeout(() => {
        if (el.parentNode) el.remove();
      }, 200);
    }
  }

  /* -------------------------------------------------------------------------- */
  /* User Authentication / Session State (XSS-Safe DOM creation)                */
  /* -------------------------------------------------------------------------- */
  function loadUserSession() {
    try {
      const stored = localStorage.getItem('pagespeed_user');
      if (stored) {
        const user = JSON.parse(stored);
        if (user && typeof user === 'object') {
          renderUserLoggedIn(user);
          return;
        }
      }
    } catch (e) {}
    renderUserLoggedOut();
  }

  function renderUserLoggedIn(user) {
    const rawEmail = String(user.email || '');
    const rawName = String(user.name || rawEmail.split('@')[0] || 'Usuário');
    const initials = (rawName || 'U').slice(0, 2).toUpperCase();

    userWidgetEl.innerHTML = ''; // clear

    const badgeDiv = document.createElement('div');
    badgeDiv.className = 'user-badge';
    badgeDiv.title = `Conectado como ${rawEmail}`;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'user-avatar';
    avatarDiv.textContent = initials;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = rawName;

    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'btn-clear';
    logoutBtn.title = 'Sair';
    logoutBtn.style.marginLeft = '4px';
    logoutBtn.textContent = '🚪';
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('pagespeed_user');
      loadUserSession();
    });

    badgeDiv.appendChild(avatarDiv);
    badgeDiv.appendChild(nameSpan);
    badgeDiv.appendChild(logoutBtn);
    userWidgetEl.appendChild(badgeDiv);
  }

  function renderUserLoggedOut() {
    userWidgetEl.innerHTML = '';
    const loginBtn = document.createElement('button');
    loginBtn.className = 'btn btn-secondary btn-sm';
    loginBtn.id = 'btnLogin';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'btn-icon';
    iconSpan.textContent = '👤';

    const textSpan = document.createElement('span');
    textSpan.textContent = 'Entrar';

    loginBtn.appendChild(iconSpan);
    loginBtn.appendChild(textSpan);
    loginBtn.addEventListener('click', () => {
      loginModal.classList.remove('hidden');
      inputEmail.focus();
    });

    userWidgetEl.appendChild(loginBtn);
  }

  function setupAuthEvents() {
    btnCloseModal.addEventListener('click', () => loginModal.classList.add('hidden'));
    btnCancelLogin.addEventListener('click', () => loginModal.classList.add('hidden'));
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = inputEmail.value.trim();
      if (!email) return;
      const user = {
        email,
        name: email.split('@')[0],
        token: 'mock-session-token-' + Date.now()
      };
      localStorage.setItem('pagespeed_user', JSON.stringify(user));
      loginModal.classList.add('hidden');
      loginForm.reset();
      loadUserSession();
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Form & Audit Controls                                                      */
  /* -------------------------------------------------------------------------- */
  function resetDashboard() {
    closeDrawer();
    requestsMap.clear();
    orderedRowIds.length = 0;
    pendingUpdates.clear();
    maxDurationSeen = 100;
    networkTableBody.innerHTML = '';
    networkTableBody.appendChild(emptyStateRow);
    emptyStateRow.classList.remove('hidden');

    // Reset counts
    Object.values(countEls).forEach(el => { if (el) el.textContent = '0'; });
    reqCounter.textContent = '0 requisições capturadas';

    // Reset vitals
    setScore(null);
    setVital('LCP', null);
    setVital('FCP', null);
    setVital('CLS', null);
    setVital('TTFB', null);

    summaryTotalReqs.textContent = '0';
    summaryTotalBytes.textContent = '0 B';
    summaryLoadTime.textContent = '--';
    summaryFailedReqs.textContent = '0';

    progressBar.style.width = '0%';
    auditStatusBanner.classList.remove('banner-error');
    if (statusDot) statusDot.className = 'status-indicator-dot pulse';
    if (btnRetry) btnRetry.classList.add('hidden');
  }

  function setAuditingState(active, isError = false) {
    isAuditing = active;
    if (active) {
      btnAudit.classList.add('hidden');
      btnStop.classList.remove('hidden');
      auditStatusBanner.classList.remove('hidden', 'banner-error');
      if (statusDot) statusDot.className = 'status-indicator-dot pulse';
      if (btnRetry) btnRetry.classList.add('hidden');
      auditStateLabel.textContent = 'Analisando...';
      auditStateLabel.style.color = 'var(--color-accent)';
    } else {
      btnAudit.classList.remove('hidden');
      btnStop.classList.add('hidden');
      if (isError) {
        auditStateLabel.textContent = 'Erro no Carregamento';
        auditStateLabel.style.color = 'var(--color-poor)';
      } else {
        auditStateLabel.textContent = 'Concluído';
        auditStateLabel.style.color = 'var(--color-good)';
      }
    }
  }

  async function triggerAudit(url) {
    if (!url || !url.trim()) {
      showToast('Por favor, informe uma URL para analisar (ex: https://example.com)', 'warning');
      urlInput.focus();
      return;
    }
    if (isAuditing) return;

    const trimmed = url.trim();
    // Validate protocol scheme if provided
    const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
    if (schemeMatch) {
      const proto = schemeMatch[1].toLowerCase();
      if (!['http', 'https'].includes(proto)) {
        showToast(`Protocolo "${proto}:" não permitido. Utilize http:// ou https://`, 'error');
        urlInput.focus();
        return;
      }
    }

    lastAuditedUrl = trimmed;
    resetDashboard();
    setAuditingState(true);

    if (window.electronAPI) {
      try {
        await window.electronAPI.startAudit(trimmed);
      } catch (err) {
        setAuditingState(false, true);
        const errMsg = err.message || String(err);
        statusMessage.textContent = 'Erro ao disparar auditoria: ' + errMsg;
        auditStatusBanner.classList.add('banner-error');
        if (statusDot) statusDot.className = 'status-indicator-dot error';
        if (btnRetry) btnRetry.classList.remove('hidden');
        showToast(`Erro na auditoria: ${errMsg}`, 'error');
      }
    } else {
      console.warn('Electron API não disponível');
    }
  }

  function setupAuditControls() {
    auditForm.addEventListener('submit', (e) => {
      e.preventDefault();
      triggerAudit(urlInput.value);
    });

    btnClearUrl.addEventListener('click', () => {
      urlInput.value = '';
      urlInput.focus();
    });

    btnStop.addEventListener('click', async () => {
      if (window.electronAPI) {
        await window.electronAPI.stopAudit();
      }
      setAuditingState(false);
      statusMessage.textContent = 'Auditoria interrompida pelo usuário.';
    });

    if (btnRetry) {
      btnRetry.addEventListener('click', () => {
        const target = urlInput.value.trim() || lastAuditedUrl;
        if (target) {
          triggerAudit(target);
        }
      });
    }

    document.querySelectorAll('.preset-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        const url = tag.getAttribute('data-url');
        urlInput.value = url;
        triggerAudit(url);
      });
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Metric Display Helpers                                                     */
  /* -------------------------------------------------------------------------- */
  function setScore(score) {
    if (score === null || score === undefined || isNaN(score)) {
      scoreValueEl.textContent = '--';
      scoreBadgeEl.textContent = 'Sem dados';
      scoreBadgeEl.className = 'score-status-badge';
      scoreCircleEl.style.strokeDashoffset = 314;
      scoreCircleEl.style.stroke = 'var(--text-muted)';
      return;
    }

    scoreValueEl.textContent = score;
    const circumference = 314;
    const offset = circumference - (score / 100) * circumference;
    scoreCircleEl.style.strokeDashoffset = offset;

    if (score >= 90) {
      scoreCircleEl.style.stroke = 'var(--color-good)';
      scoreBadgeEl.textContent = 'Excelente';
      scoreBadgeEl.className = 'score-status-badge good';
    } else if (score >= 50) {
      scoreCircleEl.style.stroke = 'var(--color-warn)';
      scoreBadgeEl.textContent = 'Precisa Melhorar';
      scoreBadgeEl.className = 'score-status-badge needs-improvement';
    } else {
      scoreCircleEl.style.stroke = 'var(--color-poor)';
      scoreBadgeEl.textContent = 'Crítico';
      scoreBadgeEl.className = 'score-status-badge poor';
    }
  }

  function setVital(name, evaluated) {
    const valMap = { LCP: valLCPEl, FCP: valFCPEl, CLS: valCLSEl, TTFB: valTTFBEl };
    const badgeMap = { LCP: badgeLCPEl, FCP: badgeFCPEl, CLS: badgeCLSEl, TTFB: badgeTTFBEl };

    const elVal = valMap[name];
    const elBadge = badgeMap[name];
    if (!elVal || !elBadge) return;

    if (!evaluated || evaluated.value === null) {
      elVal.textContent = '--';
      elBadge.textContent = '--';
      elBadge.className = 'metric-badge';
      return;
    }

    let displayVal = evaluated.value;
    if (name === 'CLS') {
      displayVal = evaluated.value.toFixed(3);
    } else if (evaluated.value >= 1000) {
      displayVal = (evaluated.value / 1000).toFixed(2) + ' s';
    } else {
      displayVal = Math.round(evaluated.value);
    }

    elVal.textContent = displayVal;
    elBadge.textContent = evaluated.label;
    elBadge.className = `metric-badge ${evaluated.rating}`;
  }

  /* -------------------------------------------------------------------------- */
  /* Real-time Network Table Rendering (Buffered & Capped)                      */
  /* -------------------------------------------------------------------------- */
  function scheduleBatchUpdate(req) {
    if (!req || !req.id) return;
    pendingUpdates.set(req.id, req);

    if (!rafScheduled) {
      rafScheduled = true;
      requestAnimationFrame(flushBatchUpdates);
    }
  }

  function flushBatchUpdates() {
    rafScheduled = false;
    const batch = Array.from(pendingUpdates.values());
    pendingUpdates.clear();

    for (const req of batch) {
      updateOrInsertRow(req);
    }
  }

  function sanitizeClass(str) {
    return String(str || 'other').replace(/[^a-zA-Z0-9_-]/g, '');
  }

  function updateOrInsertRow(req) {
    let entry = requestsMap.get(req.id);

    if (!entry) {
      if (emptyStateRow && emptyStateRow.parentNode) {
        emptyStateRow.remove();
      }

      // Enforce max DOM rows to protect performance
      if (orderedRowIds.length >= MAX_DOM_ROWS) {
        const oldestId = orderedRowIds.shift();
        const oldEntry = requestsMap.get(oldestId);
        if (oldEntry && oldEntry.rowEl && oldEntry.rowEl.parentNode) {
          if (selectedRowEl === oldEntry.rowEl) {
            closeDrawer();
          }
          oldEntry.rowEl.remove();
        }
        requestsMap.delete(oldestId);
      }

      const row = document.createElement('tr');
      const safeCat = sanitizeClass(req.category);
      const safeMethod = sanitizeClass(req.method);
      row.dataset.category = safeCat;
      row.dataset.url = String(req.url || '').toLowerCase();
      row.dataset.method = safeMethod;

      row.innerHTML = `
        <td class="cell-status"><span class="status-pill status-pending">...</span></td>
        <td class="cell-method"><span class="method-badge method-${safeMethod}">${escapeHtml(req.method)}</span></td>
        <td class="cell-url">
          <div class="url-cell" title="${escapeHtml(req.url)}">
            <span class="url-domain">${escapeHtml(extractDomain(req.url))}</span><span class="url-path">${escapeHtml(extractPath(req.url))}</span>
          </div>
        </td>
        <td class="cell-type"><span class="type-pill ${safeCat}">${escapeHtml(req.category)}</span></td>
        <td class="cell-size mono-cell">--</td>
        <td class="cell-time mono-cell">--</td>
        <td class="cell-waterfall">
          <div class="timeline-bar-wrapper">
            <div class="timeline-bar" style="width: 8%;"></div>
          </div>
        </td>
      `;

      row.addEventListener('click', () => {
        const cur = requestsMap.get(req.id);
        openDrawer(cur ? cur.req : req, row);
      });

      networkTableBody.appendChild(row);
      entry = { rowEl: row, req };
      requestsMap.set(req.id, entry);
      orderedRowIds.push(req.id);
    }

    // Update row contents
    entry.req = req;
    if (activeRequest && (activeRequest.id === req.id || (Boolean(activeRequest.originalId) && activeRequest.originalId === req.originalId))) {
      renderDrawerDetails(req);
    }
    const row = entry.rowEl;
    const safeCat = sanitizeClass(req.category);
    row.dataset.category = safeCat;

    // Status Code
    const statusCell = row.querySelector('.cell-status');
    if (req.status === 'failed') {
      statusCell.innerHTML = `<span class="status-pill status-failed" title="${escapeHtml(req.errorText || 'Failed')}">Falha</span>`;
    } else if (req.statusCode) {
      const codeGroup = `${Math.floor(req.statusCode / 100)}xx`;
      statusCell.innerHTML = `<span class="status-pill status-${codeGroup}">${req.statusCode}</span>`;
    } else {
      statusCell.innerHTML = `<span class="status-pill status-pending">Pendente</span>`;
    }

    // Type
    const typeCell = row.querySelector('.cell-type');
    typeCell.innerHTML = `<span class="type-pill ${safeCat}">${escapeHtml(req.category)}</span>`;

    // Size
    const sizeCell = row.querySelector('.cell-size');
    if (req.encodedDataLength > 0) {
      sizeCell.textContent = formatBytes(req.encodedDataLength);
    }

    // Duration & Timeline
    const timeCell = row.querySelector('.cell-time');
    const timelineBar = row.querySelector('.timeline-bar');
    if (req.durationMs > 0) {
      timeCell.textContent = formatDuration(req.durationMs);
      if (req.durationMs > maxDurationSeen) maxDurationSeen = req.durationMs;
      const pct = Math.min(100, Math.max(8, (req.durationMs / maxDurationSeen) * 100));
      timelineBar.style.width = `${pct}%`;
    }

    applyFilterToRow(row);
  }

  function updateStats(stats) {
    if (!stats) return;

    summaryTotalReqs.textContent = stats.totalRequests || 0;
    summaryTotalBytes.textContent = formatBytes(stats.totalBytes || 0);
    summaryFailedReqs.textContent = stats.failedRequests || 0;
    reqCounter.textContent = `${stats.totalRequests || 0} requisições capturadas`;

    if (stats.typeCounts) {
      countEls.all.textContent = stats.typeCounts.all || 0;
      countEls.fetch.textContent = stats.typeCounts.fetch || 0;
      countEls.script.textContent = stats.typeCounts.script || 0;
      countEls.stylesheet.textContent = stats.typeCounts.stylesheet || 0;
      countEls.image.textContent = stats.typeCounts.image || 0;
      countEls.font.textContent = stats.typeCounts.font || 0;
      countEls.document.textContent = stats.typeCounts.document || 0;
    }
  }

  /* -------------------------------------------------------------------------- */
  /* Filtering and Searching                                                    */
  /* -------------------------------------------------------------------------- */
  function applyFilterToRow(row) {
    if (!row) return;
    const category = row.dataset.category;
    const url = row.dataset.url || '';
    const method = row.dataset.method || '';

    let matchesFilter = (currentFilter === 'all' || category === currentFilter);
    let matchesSearch = true;

    if (currentSearch) {
      matchesSearch = url.includes(currentSearch) || method.includes(currentSearch);
    }

    if (matchesFilter && matchesSearch) {
      row.classList.remove('hidden');
    } else {
      row.classList.add('hidden');
    }
  }

  function applyFiltersAll() {
    requestsMap.forEach(entry => applyFilterToRow(entry.rowEl));
  }

  function setupFilters() {
    filterTabsContainer.addEventListener('click', (e) => {
      const tab = e.target.closest('.filter-tab');
      if (!tab) return;

      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.getAttribute('data-filter');
      applyFiltersAll();
    });

    searchFilter.addEventListener('input', (e) => {
      currentSearch = (e.target.value || '').toLowerCase().trim();
      applyFiltersAll();
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Request Details Drawer & Inspection                                        */
  /* -------------------------------------------------------------------------- */
  function openDrawer(req, rowEl) {
    if (!req) return;
    activeRequest = req;

    if (selectedRowEl) {
      selectedRowEl.classList.remove('selected-row');
    }
    selectedRowEl = rowEl;
    if (selectedRowEl) {
      selectedRowEl.classList.add('selected-row');
    }

    renderDrawerDetails(req);

    if (requestDrawer) requestDrawer.classList.remove('hidden');
    if (drawerBackdrop) drawerBackdrop.classList.remove('hidden');
  }

  function closeDrawer() {
    activeRequest = null;
    if (requestDrawer) requestDrawer.classList.add('hidden');
    if (drawerBackdrop) drawerBackdrop.classList.add('hidden');
    if (selectedRowEl) {
      selectedRowEl.classList.remove('selected-row');
      selectedRowEl = null;
    }
  }

  function renderDrawerDetails(req) {
    if (!drawerMethod || !drawerTitle || !drawerGeneralInfo) return;

    const safeMethod = sanitizeClass(req.method);
    drawerMethod.textContent = req.method;
    drawerMethod.className = `drawer-badge method-${safeMethod}`;
    drawerTitle.textContent = req.url || 'Requisição';
    drawerTitle.title = req.url || '';

    // General Section
    drawerGeneralInfo.innerHTML = '';
    const statusDisplay = req.status === 'failed'
      ? `Falha (${req.errorText || 'Erro de rede'})`
      : (req.statusCode ? `${req.statusCode} ${req.statusText || ''}` : 'Pendente');

    const generalFields = [
      { key: 'URL da Requisição', val: req.url },
      { key: 'Método HTTP', val: req.method },
      { key: 'Código de Status', val: statusDisplay },
      { key: 'Endereço Remoto', val: req.remoteIPAddress || 'Não informado' },
      { key: 'Protocolo', val: req.protocol || 'Desconhecido' },
      { key: 'Tipo de Recurso', val: `${(req.category || '').toUpperCase()} (${req.type || ''})` }
    ];

    for (const f of generalFields) {
      const row = document.createElement('div');
      row.className = 'drawer-info-row';
      row.innerHTML = `<span class="drawer-info-key">${escapeHtml(f.key)}:</span><span class="drawer-info-val">${escapeHtml(String(f.val || ''))}</span>`;
      drawerGeneralInfo.appendChild(row);
    }

    // Response Headers
    renderHeadersList(responseHeadersTable, responseHeadersCount, req.responseHeaders);

    // Request Headers
    renderHeadersList(requestHeadersTable, requestHeadersCount, req.requestHeaders);

    // Timing Tab Info
    if (drawerTimingInfo) {
      drawerTimingInfo.innerHTML = '';
      const timingFields = [
        { key: 'Duração Total', val: formatDuration(req.durationMs) },
        { key: 'Tamanho Transferido', val: req.encodedDataLength > 0 ? formatBytes(req.encodedDataLength) : '0 B' },
        { key: 'Tipo MIME', val: req.mimeType || 'Não especificado' },
        { key: 'Iniciador', val: req.initiator || 'Desconhecido' },
        { key: 'Timestamp de Início', val: req.startMonotonic > 0 ? `${req.startMonotonic.toFixed(3)}s` : '--' }
      ];

      for (const f of timingFields) {
        const row = document.createElement('div');
        row.className = 'drawer-info-row';
        row.innerHTML = `<span class="drawer-info-key">${escapeHtml(f.key)}:</span><span class="drawer-info-val">${escapeHtml(String(f.val || ''))}</span>`;
        drawerTimingInfo.appendChild(row);
      }
    }
  }

  function renderHeadersList(containerEl, countEl, headersObj) {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    const entries = (headersObj && typeof headersObj === 'object' && !Array.isArray(headersObj)) ? Object.entries(headersObj) : [];
    if (countEl) countEl.textContent = entries.length;

    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-headers';
      empty.textContent = 'Nenhum cabeçalho disponível para esta requisição.';
      containerEl.appendChild(empty);
      return;
    }

    for (const [key, val] of entries) {
      const entryEl = document.createElement('div');
      entryEl.className = 'header-entry';
      const keySpan = document.createElement('span');
      keySpan.className = 'header-name';
      keySpan.textContent = String(key) + ':';
      const valSpan = document.createElement('span');
      valSpan.className = 'header-val';
      valSpan.textContent = String(val);
      entryEl.appendChild(keySpan);
      entryEl.appendChild(valSpan);
      containerEl.appendChild(entryEl);
    }
  }

  function setupDrawerEvents() {
    if (btnCloseDrawer) {
      btnCloseDrawer.addEventListener('click', closeDrawer);
    }
    if (drawerBackdrop) {
      drawerBackdrop.addEventListener('click', closeDrawer);
    }
    if (btnCopyUrl) {
      btnCopyUrl.addEventListener('click', async () => {
        if (!activeRequest || !activeRequest.url) {
          showToast('URL vazia ou indisponível para cópia.', 'warning', 2500);
          return;
        }
        try {
          await navigator.clipboard.writeText(activeRequest.url);
          showToast('URL copiada para a área de transferência!', 'success', 2500);
        } catch (e) {
          showToast('Não foi possível copiar a URL.', 'error', 2500);
        }
      });
    }

    // Drawer Tabs switching
    document.querySelectorAll('.drawer-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.drawer-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const targetTab = tab.getAttribute('data-drawer-tab');
        if (targetTab === 'headers') {
          if (paneHeaders) paneHeaders.classList.remove('hidden');
          if (paneTiming) paneTiming.classList.add('hidden');
        } else {
          if (paneHeaders) paneHeaders.classList.add('hidden');
          if (paneTiming) paneTiming.classList.remove('hidden');
        }
      });
    });

    // Keyboard navigation (ESC closes modal or drawer)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (loginModal && !loginModal.classList.contains('hidden')) {
          loginModal.classList.add('hidden');
        } else if (requestDrawer && !requestDrawer.classList.contains('hidden')) {
          if (e.target === searchFilter || e.target === urlInput) {
            e.target.blur();
            return;
          }
          closeDrawer();
        }
      }
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Electron IPC Listeners                                                     */
  /* -------------------------------------------------------------------------- */
  function setupIpcListeners() {
    if (!window.electronAPI) return;

    window.electronAPI.onStatus((data) => {
      if (!data) return;
      statusMessage.textContent = data.message || data.status;

      if (data.status === 'starting') {
        progressBar.style.width = '20%';
      } else if (data.status === 'navigating') {
        progressBar.style.width = '45%';
      } else if (data.status === 'dom-ready') {
        progressBar.style.width = '75%';
      } else if (data.status === 'completed') {
        progressBar.style.width = '100%';
        setAuditingState(false);
        if (data.totalLoadTime) {
          summaryLoadTime.textContent = (data.totalLoadTime / 1000).toFixed(2) + ' s';
        }
      } else if (data.status === 'failed' || data.status === 'stopped') {
        const isFail = data.status === 'failed';
        setAuditingState(false, isFail);
        if (isFail) {
          auditStatusBanner.classList.add('banner-error');
          if (statusDot) statusDot.className = 'status-indicator-dot error';
          if (btnRetry) btnRetry.classList.remove('hidden');
          const codeInfo = data.errorCode ? ` (${data.errorCode})` : '';
          const errMsg = data.errorDescription || data.message || 'Falha de conexão';
          statusMessage.textContent = `Falha no carregamento: ${errMsg}${codeInfo}`;
          showToast(`Falha de conexão: ${errMsg}${codeInfo}`, 'error');
        }
      }
    });

    window.electronAPI.onRequestStarted((data) => {
      if (data && data.request) {
        scheduleBatchUpdate(data.request);
        updateStats(data.stats);
      }
    });

    window.electronAPI.onResponseReceived((data) => {
      if (data && data.request) {
        scheduleBatchUpdate(data.request);
        updateStats(data.stats);
      }
    });

    window.electronAPI.onRequestFinished((data) => {
      if (data && data.request) {
        scheduleBatchUpdate(data.request);
        updateStats(data.stats);
      }
    });

    window.electronAPI.onRequestFailed((data) => {
      if (data && data.request) {
        scheduleBatchUpdate(data.request);
        updateStats(data.stats);
      }
    });

    window.electronAPI.onMetricUpdate((data) => {
      if (!data) return;
      setVital(data.name, data.evaluated);
      if (typeof data.overallScore === 'number') {
        setScore(data.overallScore);
      }
    });

    window.electronAPI.onError((err) => {
      setAuditingState(false, true);
      const msg = err ? (err.message || String(err)) : 'Erro desconhecido';
      statusMessage.textContent = `Erro: ${msg}`;
      auditStatusBanner.classList.add('banner-error');
      if (statusDot) statusDot.className = 'status-indicator-dot error';
      if (btnRetry) btnRetry.classList.remove('hidden');
      showToast(`Erro na auditoria: ${msg}`, 'error');
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Utility String & Format Helpers                                            */
  /* -------------------------------------------------------------------------- */
  function extractDomain(urlStr) {
    try {
      const u = new URL(urlStr);
      return u.origin;
    } catch (e) {
      return '';
    }
  }

  function extractPath(urlStr) {
    try {
      const u = new URL(urlStr);
      return u.pathname + u.search;
    } catch (e) {
      return urlStr;
    }
  }

  function formatBytes(bytes) {
    if (typeof bytes !== 'number' || isNaN(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const val = bytes / Math.pow(1024, i);
    return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function formatDuration(ms) {
    if (typeof ms !== 'number' || isNaN(ms) || ms < 0) return '0 ms';
    if (ms < 1000) return `${Math.round(ms)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str || '');
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /* -------------------------------------------------------------------------- */
  /* Initialization                                                             */
  /* -------------------------------------------------------------------------- */
  function init() {
    loadUserSession();
    setupAuthEvents();
    setupAuditControls();
    setupFilters();
    setupDrawerEvents();
    setupIpcListeners();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
