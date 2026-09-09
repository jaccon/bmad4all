/**
 * Renderer Controller - PageSpeed & Network Monitor
 * English Translation, SQLite History, Pure Black Dark Theme
 * Hardened against XSS, DOM Flooding, Memory Leaks
 */

(function () {
  'use strict';

  // State
  let isAuditing = false;
  let currentFilter = 'all';
  let currentApiOrigin = 'all';
  let currentHttpStatus = 'all';
  let currentSearch = '';
  let clientSpeedMbps = 0;
  let clientPingMs = 0;
  let lastTotalBytes = 0;
  let lastLoadTimeMs = 0;
  let currentOverallScore = null;
  let currentMetrics = {
    LCP: null,
    FCP: null,
    CLS: null,
    TTFB: null,
    INP: null
  };
  let lastStats = {
    totalRequests: 0,
    totalBytes: 0,
    failedRequests: 0
  };
  let currentThrottlingProfile = 'none';

  const detectedApiOrigins = new Map(); // origin -> count
  const detectedStatusCodes = new Set(); // set of unique status codes observed
  const requestsMap = new Map(); // id -> { rowEl, req }
  const allCapturedRequestsMap = new Map(); // id -> complete req for audit log export
  const orderedRowIds = [];
  const MAX_DOM_ROWS = 500; // Cap DOM elements to prevent UI lag
  let maxDurationSeen = 100; // ms, for timeline waterfall scaling
  let systemInfo = null;

  // RAF Batch Queue
  let pendingUpdates = new Map(); // id -> req
  let rafScheduled = false;

  // DOM Elements
  const clockTimeEl = document.getElementById('clockTime');
  const clockDateEl = document.getElementById('clockDate');

  const auditForm = document.getElementById('auditForm');
  const urlInput = document.getElementById('urlInput');
  const selectThrottling = document.getElementById('selectThrottling');
  const btnClearUrl = document.getElementById('btnClearUrl');
  const btnAudit = document.getElementById('btnAudit');
  const auditBtnText = document.getElementById('auditBtnText');
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

  // Client Speed & Stats Summary
  const valClientSpeed = document.getElementById('valClientSpeed');
  const labelClientPing = document.getElementById('labelClientPing');
  const labelClientDiag = document.getElementById('labelClientDiag');
  const btnProbeSpeed = document.getElementById('btnProbeSpeed');

  const summaryTotalReqs = document.getElementById('summaryTotalReqs');
  const summaryTotalBytes = document.getElementById('summaryTotalBytes');
  const summaryLoadTime = document.getElementById('summaryLoadTime');
  const summaryEffectiveThroughput = document.getElementById('summaryEffectiveThroughput');
  const summaryFailedReqs = document.getElementById('summaryFailedReqs');

  // Network Table & Filters
  const networkTableBody = document.getElementById('networkTableBody');
  const emptyStateRow = document.getElementById('emptyStateRow');
  const reqCounter = document.getElementById('reqCounter');
  const searchFilter = document.getElementById('searchFilter');
  const filterTabsContainer = document.getElementById('filterTabs');
  const apiOriginSelect = document.getElementById('apiOriginSelect');
  const statusFilterSelect = document.getElementById('statusFilterSelect');

  const countEls = {
    all: document.getElementById('countAll'),
    api: document.getElementById('countApi'),
    fetch: document.getElementById('countFetch'),
    script: document.getElementById('countScript'),
    stylesheet: document.getElementById('countCss'),
    image: document.getElementById('countImg'),
    font: document.getElementById('countFont'),
    document: document.getElementById('countDoc')
  };

  // Status Banner & Retry
  const statusDot = document.getElementById('statusDot');
  const btnRetry = document.getElementById('btnRetry');
  let lastAuditedUrl = '';

  // History Elements (SQLite)
  const btnOpenHistory = document.getElementById('btnOpenHistory');
  const historyCountBadge = document.getElementById('historyCountBadge');
  const historyModal = document.getElementById('historyModal');
  const btnCloseHistoryModal = document.getElementById('btnCloseHistoryModal');
  const btnClearHistory = document.getElementById('btnClearHistory');
  const historyTableBody = document.getElementById('historyTableBody');
  const historyEmptyState = document.getElementById('historyEmptyState');
  const statHistoryTotal = document.getElementById('statHistoryTotal');
  const statHistoryAvgScore = document.getElementById('statHistoryAvgScore');
  const statHistoryAvgTime = document.getElementById('statHistoryAvgTime');

  // Drawer Elements
  const requestDrawer = document.getElementById('requestDrawer');
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
    if (clockTimeEl) clockTimeEl.textContent = `${hours}:${minutes}:${seconds}`;

    if (clockDateEl) {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      clockDateEl.textContent = `${year}-${month}-${day}`;
    }
  }
  setInterval(updateClock, 1000);
  updateClock();

  /* -------------------------------------------------------------------------- */
  /* Toast Notifications                                                        */
  /* -------------------------------------------------------------------------- */
  function showToast(message, type = 'info', duration = 3500) {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${sanitizeClass(type)}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'toast-content';
    contentDiv.textContent = message;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Dismiss notification');
    closeBtn.addEventListener('click', () => dismissToast(toast));

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
  /* SQLite History Controller                                                  */
  /* -------------------------------------------------------------------------- */
  async function loadAuditHistory() {
    if (!window.electronAPI || !window.electronAPI.getHistory) return;

    try {
      const history = await window.electronAPI.getHistory(100);
      renderHistoryList(history || []);
    } catch (e) {
      console.error('[History] Failed to load history:', e);
    }
  }

  function renderHistoryList(history) {
    const count = history.length;
    if (historyCountBadge) {
      historyCountBadge.textContent = count;
    }

    if (statHistoryTotal) {
      statHistoryTotal.textContent = count;
    }

    if (!historyTableBody) return;
    historyTableBody.innerHTML = '';

    if (count === 0) {
      if (historyEmptyState) historyEmptyState.classList.remove('hidden');
      if (statHistoryAvgScore) statHistoryAvgScore.textContent = '--';
      if (statHistoryAvgTime) statHistoryAvgTime.textContent = '--';
      return;
    }

    if (historyEmptyState) historyEmptyState.classList.add('hidden');

    let sumScore = 0;
    let scoreCount = 0;
    let sumTime = 0;
    let timeCount = 0;

    history.forEach((item) => {
      if (typeof item.overall_score === 'number' && item.overall_score >= 0) {
        sumScore += item.overall_score;
        scoreCount++;
      }
      if (typeof item.load_time_ms === 'number' && item.load_time_ms > 0) {
        sumTime += item.load_time_ms;
        timeCount++;
      }

      const tr = document.createElement('tr');

      // Date / Time
      const tdDate = document.createElement('td');
      tdDate.style.fontFamily = 'var(--font-mono)';
      tdDate.style.fontSize = '11px';
      tdDate.style.color = 'var(--text-muted)';
      try {
        const d = new Date(item.created_at);
        tdDate.textContent = d.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
      } catch (e) {
        tdDate.textContent = item.created_at || '--';
      }

      // Target URL
      const tdUrl = document.createElement('td');
      tdUrl.className = 'history-url-cell';
      tdUrl.title = item.url || '';
      tdUrl.textContent = item.url || '--';

      // Score
      const tdScore = document.createElement('td');
      if (typeof item.overall_score === 'number') {
        const pill = document.createElement('span');
        pill.className = 'history-score-pill';
        if (item.overall_score >= 90) {
          pill.className += ' status-2xx';
        } else if (item.overall_score >= 50) {
          pill.className += ' status-4xx';
        } else {
          pill.className += ' status-5xx';
        }
        pill.textContent = item.overall_score;
        tdScore.appendChild(pill);
      } else {
        tdScore.textContent = '--';
      }

      // Web Vitals (LCP / FCP / CLS / TTFB)
      const tdVitals = document.createElement('td');
      tdVitals.className = 'history-vitals-cell';

      const createMiniVitalBadge = (label, val, unit, evalFn) => {
        const badge = document.createElement('span');
        badge.className = 'vital-mini-badge';
        if (val === null || val === undefined || isNaN(val)) {
          badge.textContent = `${label}: --`;
        } else {
          const evalClass = evalFn(val);
          badge.className += ` ${evalClass}`;
          const formatted = unit === 'score' ? Number(val).toFixed(2) :
                            val >= 1000 ? `${(val / 1000).toFixed(2)}s` :
                            `${Math.round(val)}ms`;
          badge.textContent = `${label}: ${formatted}`;
          badge.title = `${label}: ${formatted} (${evalClass})`;
        }
        return badge;
      };

      tdVitals.appendChild(createMiniVitalBadge('LCP', item.lcp, 'ms', v => v <= 2500 ? 'good' : v <= 4000 ? 'needs-improvement' : 'poor'));
      tdVitals.appendChild(createMiniVitalBadge('FCP', item.fcp, 'ms', v => v <= 1800 ? 'good' : v <= 3000 ? 'needs-improvement' : 'poor'));
      tdVitals.appendChild(createMiniVitalBadge('CLS', item.cls, 'score', v => v <= 0.10 ? 'good' : v <= 0.25 ? 'needs-improvement' : 'poor'));
      tdVitals.appendChild(createMiniVitalBadge('TTFB', item.ttfb, 'ms', v => v <= 800 ? 'good' : v <= 1800 ? 'needs-improvement' : 'poor'));

      // Load Time
      const tdTime = document.createElement('td');
      tdTime.style.fontFamily = 'var(--font-mono)';
      tdTime.textContent = item.load_time_ms ? `${(item.load_time_ms / 1000).toFixed(2)} s` : '--';

      // Total Requests
      const tdReqs = document.createElement('td');
      tdReqs.style.fontFamily = 'var(--font-mono)';
      tdReqs.textContent = item.total_requests !== null ? item.total_requests : '--';

      // Size
      const tdSize = document.createElement('td');
      tdSize.style.fontFamily = 'var(--font-mono)';
      tdSize.textContent = item.total_bytes ? formatBytes(item.total_bytes) : '--';

      // Profile
      const tdProfile = document.createElement('td');
      tdProfile.style.fontSize = '11px';
      tdProfile.style.color = 'var(--text-secondary)';
      tdProfile.textContent = item.throttling && item.throttling !== 'none' ? item.throttling : 'Full Bandwidth';

      // Tester Speed
      const tdSpeed = document.createElement('td');
      tdSpeed.style.fontFamily = 'var(--font-mono)';
      tdSpeed.textContent = item.client_speed_mbps ? `${item.client_speed_mbps.toFixed(1)} Mbps` : '--';

      // Status
      const tdStatus = document.createElement('td');
      const statusPill = document.createElement('span');
      statusPill.className = 'status-pill';
      if (item.status === 'completed') {
        statusPill.className += ' status-2xx';
        statusPill.textContent = 'Completed';
      } else if (item.status === 'failed') {
        statusPill.className += ' status-5xx';
        statusPill.textContent = 'Failed';
        statusPill.title = item.error_message || 'Audit failed';
      } else {
        statusPill.className += ' status-pending';
        statusPill.textContent = item.status || 'Stopped';
      }
      tdStatus.appendChild(statusPill);

      // Actions
      const tdActions = document.createElement('td');
      tdActions.style.textAlign = 'right';

      const btnRun = document.createElement('button');
      btnRun.type = 'button';
      btnRun.className = 'btn-run-again';
      btnRun.textContent = 'Run Again';
      btnRun.title = `Rerun audit for ${item.url}`;
      btnRun.addEventListener('click', (e) => {
        e.stopPropagation();
        closeHistoryModal();
        if (urlInput) urlInput.value = item.url;
        if (selectThrottling && item.throttling) {
          selectThrottling.value = item.throttling;
        }
        triggerAudit(item.url);
      });

      const btnDel = document.createElement('button');
      btnDel.type = 'button';
      btnDel.className = 'btn-delete-history';
      btnDel.textContent = '✕';
      btnDel.title = 'Delete record from SQLite';
      btnDel.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (window.electronAPI && window.electronAPI.deleteAuditHistory) {
          await window.electronAPI.deleteAuditHistory(item.id);
          await loadAuditHistory();
          showToast('Record removed from history', 'info', 2000);
        }
      });

      tdActions.appendChild(btnRun);
      tdActions.appendChild(btnDel);

      tr.appendChild(tdDate);
      tr.appendChild(tdUrl);
      tr.appendChild(tdScore);
      tr.appendChild(tdVitals);
      tr.appendChild(tdTime);
      tr.appendChild(tdReqs);
      tr.appendChild(tdSize);
      tr.appendChild(tdProfile);
      tr.appendChild(tdSpeed);
      tr.appendChild(tdStatus);
      tr.appendChild(tdActions);

      historyTableBody.appendChild(tr);
    });

    if (statHistoryAvgScore) {
      statHistoryAvgScore.textContent = scoreCount > 0 ? Math.round(sumScore / scoreCount) : '--';
    }
    if (statHistoryAvgTime) {
      statHistoryAvgTime.textContent = timeCount > 0 ? `${(sumTime / timeCount / 1000).toFixed(2)} s` : '--';
    }
  }

  function openHistoryModal() {
    if (!historyModal) return;
    historyModal.classList.remove('hidden');
    loadAuditHistory();
  }

  function closeHistoryModal() {
    if (!historyModal) return;
    historyModal.classList.add('hidden');
  }

  async function saveCurrentAuditToHistory(status = 'completed', errorMsg = null) {
    if (!window.electronAPI || !window.electronAPI.saveAuditHistory) return;
    if (!lastAuditedUrl) return;

    try {
      const record = {
        url: lastAuditedUrl,
        overallScore: currentOverallScore,
        lcp: currentMetrics.LCP,
        fcp: currentMetrics.FCP,
        cls: currentMetrics.CLS,
        ttfb: currentMetrics.TTFB,
        inp: currentMetrics.INP,
        totalRequests: lastStats.totalRequests || 0,
        totalBytes: lastStats.totalBytes || 0,
        loadTimeMs: lastLoadTimeMs || 0,
        throttling: currentThrottlingProfile || 'none',
        clientSpeedMbps: clientSpeedMbps > 0 ? clientSpeedMbps : null,
        clientPingMs: clientPingMs > 0 ? clientPingMs : null,
        status: status,
        errorMessage: errorMsg,
        createdAt: new Date().toISOString()
      };

      await window.electronAPI.saveAuditHistory(record);
      await loadAuditHistory();
    } catch (err) {
      console.error('[History] Error persisting audit to SQLite:', err);
    }
  }

  function setupHistoryEvents() {
    if (btnOpenHistory) {
      btnOpenHistory.addEventListener('click', openHistoryModal);
    }
    if (btnCloseHistoryModal) {
      btnCloseHistoryModal.addEventListener('click', closeHistoryModal);
    }
    if (btnClearHistory) {
      btnClearHistory.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to delete all audit records from SQLite?')) return;
        if (window.electronAPI && window.electronAPI.clearAuditHistory) {
          await window.electronAPI.clearAuditHistory();
          await loadAuditHistory();
          showToast('Audit history cleared', 'info', 2500);
        }
      });
    }

    if (historyModal) {
      historyModal.addEventListener('click', (e) => {
        if (e.target === historyModal) {
          closeHistoryModal();
        }
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (historyModal && !historyModal.classList.contains('hidden')) {
          closeHistoryModal();
        }
      }
    });
  }

  /* -------------------------------------------------------------------------- */
  /* URL Validation & Form Submission                                           */
  /* -------------------------------------------------------------------------- */
  function normalizeInputUrl(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let val = raw.trim();
    if (!val) return '';
    if (!/^https?:\/\//i.test(val)) {
      val = 'https://' + val;
    }
    return val;
  }

  function resetStateForAudit() {
    requestsMap.clear();
    allCapturedRequestsMap.clear();
    orderedRowIds.length = 0;
    detectedApiOrigins.clear();
    detectedStatusCodes.clear();
    maxDurationSeen = 100;
    lastTotalBytes = 0;
    lastLoadTimeMs = 0;
    currentOverallScore = null;
    currentMetrics = { LCP: null, FCP: null, CLS: null, TTFB: null, INP: null };
    lastStats = { totalRequests: 0, totalBytes: 0, failedRequests: 0 };

    // Reset API dropdown
    if (apiOriginSelect) {
      apiOriginSelect.innerHTML = '<option value="all">All APIs</option>';
      apiOriginSelect.classList.add('hidden');
      currentApiOrigin = 'all';
    }

    // Reset HTTP status dropdown to 'all'
    if (statusFilterSelect) {
      statusFilterSelect.value = 'all';
      currentHttpStatus = 'all';
    }

    // Reset counts
    Object.values(countEls).forEach(el => { if (el) el.textContent = '0'; });
    if (reqCounter) reqCounter.textContent = '0 requests captured';

    // Reset summary cards
    if (summaryTotalReqs) summaryTotalReqs.textContent = '0';
    if (summaryTotalBytes) summaryTotalBytes.textContent = '0 B';
    if (summaryLoadTime) summaryLoadTime.textContent = '--';
    if (summaryEffectiveThroughput) summaryEffectiveThroughput.textContent = '-- Mbps';
    if (summaryFailedReqs) summaryFailedReqs.textContent = '0';

    // Reset Vitals
    setScore(null);
    resetVitals();

    // Reset Table
    if (networkTableBody) {
      networkTableBody.innerHTML = '';
      if (emptyStateRow) {
        networkTableBody.appendChild(emptyStateRow);
        emptyStateRow.classList.remove('hidden');
      }
    }

    closeDrawer();
  }

  function setAuditingState(active, isError = false) {
    isAuditing = active;
    if (active) {
      auditBtnText.textContent = 'Inspecting...';
      btnAudit.disabled = true;
      btnAudit.classList.add('btn-auditing');
      btnStop.classList.remove('hidden');
      if (btnRetry) btnRetry.classList.add('hidden');
      auditStatusBanner.classList.remove('hidden', 'banner-error');
      if (statusDot) statusDot.className = 'status-indicator-dot pulse';
      progressBar.style.width = '10%';
      auditStateLabel.textContent = 'Inspecting';
      auditStateLabel.style.color = 'var(--color-accent)';
    } else {
      auditBtnText.textContent = 'Start Inspect';
      btnAudit.disabled = false;
      btnAudit.classList.remove('btn-auditing');
      btnStop.classList.add('hidden');
      auditStateLabel.textContent = isError ? 'Error' : 'Completed';
      auditStateLabel.style.color = isError ? 'var(--color-poor)' : 'var(--color-good)';

      if (!isError) {
        progressBar.style.width = '100%';
        if (statusDot) statusDot.className = 'status-indicator-dot';
      }
    }
  }

  async function triggerAudit(rawUrl) {
    if (!rawUrl || isAuditing) return;
    const url = normalizeInputUrl(rawUrl);
    if (!url) {
      showToast('Please enter a valid URL (e.g. example.com)', 'warning');
      return;
    }

    try {
      new URL(url);
    } catch (e) {
      showToast('Invalid URL format', 'error');
      return;
    }

    lastAuditedUrl = url;
    resetStateForAudit();
    setAuditingState(true);

    // Measure tester bandwidth before calculating site throughput if not yet measured
    if (clientSpeedMbps === 0) {
      statusMessage.textContent = 'Measuring tester connection bandwidth...';
      try {
        await runClientSpeedProbe();
      } catch (e) {}
    }

    const throttling = selectThrottling ? selectThrottling.value : 'none';
    currentThrottlingProfile = throttling;

    statusMessage.textContent = `Connecting to ${url}...`;
    showToast(`Starting audit: ${url}`, 'info', 2500);

    if (window.electronAPI) {
      try {
        const res = await window.electronAPI.startAudit({ url, throttling });
        if (res && !res.ok) {
          setAuditingState(false, true);
          statusMessage.textContent = `Failed: ${res.error || 'Connection error'}`;
          auditStatusBanner.classList.add('banner-error');
          if (statusDot) statusDot.className = 'status-indicator-dot error';
          if (btnRetry) btnRetry.classList.remove('hidden');
          showToast(`Audit failed: ${res.error}`, 'error');
          saveCurrentAuditToHistory('failed', res.error);
        }
      } catch (err) {
        setAuditingState(false, true);
        const errMsg = err.message || 'Audit start failed';
        statusMessage.textContent = `Error: ${errMsg}`;
        auditStatusBanner.classList.add('banner-error');
        if (statusDot) statusDot.className = 'status-indicator-dot error';
        if (btnRetry) btnRetry.classList.remove('hidden');
        showToast(errMsg, 'error');
        saveCurrentAuditToHistory('failed', errMsg);
      }
    }
  }

  function triggerBounceEffect(el) {
    if (!el) return;
    el.classList.remove('btn-bounce-blue');
    void el.offsetWidth; // force DOM reflow
    el.classList.add('btn-bounce-blue');
    setTimeout(() => {
      el.classList.remove('btn-bounce-blue');
    }, 520);
  }

  function setupAuditControls() {
    if (!auditForm) return;

    auditForm.addEventListener('submit', (e) => {
      e.preventDefault();
      triggerBounceEffect(btnAudit);
      triggerAudit(urlInput.value);
    });

    if (btnAudit) {
      btnAudit.addEventListener('click', () => {
        triggerBounceEffect(btnAudit);
      });
    }

    if (btnClearUrl) {
      btnClearUrl.addEventListener('click', () => {
        urlInput.value = '';
        urlInput.focus();
      });
    }

    const urlWrapper = document.querySelector('.url-input-wrapper');
    if (urlWrapper) {
      urlWrapper.addEventListener('click', (e) => {
        if (e.target !== btnClearUrl && urlInput) {
          urlInput.focus();
        }
      });
    }

    if (btnStop) {
      btnStop.addEventListener('click', async () => {
        if (window.electronAPI) {
          await window.electronAPI.stopAudit();
        }
        setAuditingState(false);
        statusMessage.textContent = 'Audit stopped by user.';
        saveCurrentAuditToHistory('stopped');
      });
    }

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
        if (urlInput) urlInput.value = url;
        triggerAudit(url);
      });
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Metric Display Helpers                                                     */
  /* -------------------------------------------------------------------------- */
  function setScore(score) {
    if (score === null || score === undefined || isNaN(score)) {
      currentOverallScore = null;
      if (scoreValueEl) scoreValueEl.textContent = '--';
      if (scoreBadgeEl) {
        scoreBadgeEl.textContent = 'No data';
        scoreBadgeEl.className = 'score-status-badge';
      }
      if (scoreCircleEl) {
        scoreCircleEl.style.strokeDashoffset = '314';
        scoreCircleEl.style.stroke = 'var(--text-muted)';
      }
      return;
    }

    const val = Math.max(0, Math.min(100, Math.round(score)));
    currentOverallScore = val;
    if (scoreValueEl) scoreValueEl.textContent = val;

    const circumference = 314;
    const offset = circumference - (val / 100) * circumference;
    if (scoreCircleEl) scoreCircleEl.style.strokeDashoffset = offset;

    let color = 'var(--color-good)';
    let badgeText = 'Good';
    let badgeClass = 'good';

    if (val < 50) {
      color = 'var(--color-poor)';
      badgeText = 'Poor';
      badgeClass = 'poor';
    } else if (val < 90) {
      color = 'var(--color-warn)';
      badgeText = 'Needs Work';
      badgeClass = 'needs-improvement';
    }

    if (scoreCircleEl) scoreCircleEl.style.stroke = color;
    if (scoreBadgeEl) {
      scoreBadgeEl.textContent = badgeText;
      scoreBadgeEl.className = `score-status-badge ${badgeClass}`;
    }
  }

  function setVital(name, evalData) {
    if (!evalData) return;
    const { value, rating } = evalData;
    if (currentMetrics[name] !== undefined) {
      currentMetrics[name] = value;
    }

    let valEl, badgeEl, unit;
    if (name === 'LCP') {
      valEl = valLCPEl; badgeEl = badgeLCPEl; unit = 'ms';
    } else if (name === 'FCP') {
      valEl = valFCPEl; badgeEl = badgeFCPEl; unit = 'ms';
    } else if (name === 'CLS') {
      valEl = valCLSEl; badgeEl = badgeCLSEl; unit = '';
    } else if (name === 'TTFB') {
      valEl = valTTFBEl; badgeEl = badgeTTFBEl; unit = 'ms';
    }

    if (!valEl || !badgeEl) return;

    if (value === null || value === undefined) {
      valEl.textContent = '--';
      badgeEl.textContent = '--';
      badgeEl.className = 'metric-badge';
      return;
    }

    let displayVal = value;
    if (name === 'CLS') {
      displayVal = Number(value).toFixed(3);
    } else {
      displayVal = Math.round(value);
    }

    valEl.textContent = displayVal;

    let textRating = 'Good';
    if (rating === 'poor') {
      textRating = 'Poor';
    } else if (rating === 'needs-improvement') {
      textRating = 'Needs Work';
    }

    badgeEl.textContent = textRating;
    badgeEl.className = `metric-badge ${rating || ''}`;
  }

  function resetVitals() {
    ['LCP', 'FCP', 'CLS', 'TTFB'].forEach(metric => {
      setVital(metric, { value: null, rating: '' });
    });
  }

  function updateThroughputComparison() {
    if (!summaryEffectiveThroughput) return;
    if (lastTotalBytes > 0 && lastLoadTimeMs > 0) {
      const loadTimeSec = lastLoadTimeMs / 1000;
      const effectiveMbps = ((lastTotalBytes * 8) / (loadTimeSec * 1000000));
      const displayMbps = effectiveMbps.toFixed(2);
      summaryEffectiveThroughput.textContent = `${displayMbps} Mbps`;

      if (clientSpeedMbps > 0) {
        const pct = Math.min(100, Math.round((effectiveMbps / clientSpeedMbps) * 100));
        summaryEffectiveThroughput.title = `Site utilized ~${pct}% of tester bandwidth (${clientSpeedMbps.toFixed(1)} Mbps)`;
      }
    } else {
      summaryEffectiveThroughput.textContent = '-- Mbps';
    }
  }

  async function runClientSpeedProbe() {
    if (!window.electronAPI || !window.electronAPI.probeSpeed) return;
    if (btnProbeSpeed) {
      btnProbeSpeed.disabled = true;
      btnProbeSpeed.textContent = 'Testing...';
    }
    if (labelClientDiag) labelClientDiag.textContent = 'Testing speed...';

    try {
      const res = await window.electronAPI.probeSpeed();
      if (res && res.ok) {
        clientSpeedMbps = res.downloadMbps;
        clientPingMs = res.pingMs;

        if (valClientSpeed) valClientSpeed.textContent = res.downloadMbps.toFixed(1);
        if (labelClientPing) labelClientPing.textContent = `Ping: ${res.pingMs} ms`;
        if (labelClientDiag) {
          if (res.downloadMbps > 50) {
            labelClientDiag.textContent = 'Fast Connection';
          } else if (res.downloadMbps > 15) {
            labelClientDiag.textContent = 'Average Connection';
          } else {
            labelClientDiag.textContent = 'Slow Connection';
          }
        }
        showToast(`Tester Bandwidth: ${res.downloadMbps} Mbps (Ping: ${res.pingMs} ms)`, 'success', 3000);
        updateThroughputComparison();
      } else {
        if (labelClientDiag) labelClientDiag.textContent = 'Test Failed';
        showToast('Unable to test local connection speed.', 'warning', 3000);
      }
    } catch (e) {
      if (labelClientDiag) labelClientDiag.textContent = 'Probe Error';
    } finally {
      if (btnProbeSpeed) {
        btnProbeSpeed.disabled = false;
        btnProbeSpeed.textContent = 'Run Test';
      }
    }
  }

  function updateStats(stats) {
    if (!stats) return;
    lastStats = stats;

    if (summaryTotalReqs) summaryTotalReqs.textContent = stats.totalRequests || 0;
    if (summaryTotalBytes) summaryTotalBytes.textContent = formatBytes(stats.totalBytes || 0);
    if (summaryFailedReqs) summaryFailedReqs.textContent = stats.failedRequests || 0;
    if (reqCounter) reqCounter.textContent = `${stats.totalRequests || 0} requests captured`;

    if (typeof stats.totalBytes === 'number' && stats.totalBytes > 0) {
      lastTotalBytes = stats.totalBytes;
      updateThroughputComparison();
    }
  }

  /* -------------------------------------------------------------------------- */
  /* RAF Batching for Request Table                                             */
  /* -------------------------------------------------------------------------- */
  function scheduleBatchUpdate(req) {
    if (!req || !req.id) return;
    pendingUpdates.set(req.id, req);
    const existing = allCapturedRequestsMap.get(req.id) || {};
    allCapturedRequestsMap.set(req.id, { ...existing, ...req });

    if (!rafScheduled) {
      rafScheduled = true;
      requestAnimationFrame(flushBatchUpdates);
    }
  }

  function flushBatchUpdates() {
    rafScheduled = false;
    const batch = Array.from(pendingUpdates.values());
    pendingUpdates.clear();

    if (batch.length === 0) return;

    if (emptyStateRow && !emptyStateRow.classList.contains('hidden')) {
      emptyStateRow.classList.add('hidden');
    }

    const counts = { all: 0, api: 0, fetch: 0, script: 0, stylesheet: 0, image: 0, font: 0, document: 0 };

    for (let i = 0; i < batch.length; i++) {
      const req = batch[i];
      upsertRequestRow(req);
    }

    // Refresh Category Counts
    for (const entry of requestsMap.values()) {
      const cat = entry.req.category;
      counts.all++;
      if (entry.req.isApi) counts.api++;
      if (cat === 'fetch') counts.fetch++;
      else if (cat === 'script') counts.script++;
      else if (cat === 'stylesheet') counts.stylesheet++;
      else if (cat === 'image') counts.image++;
      else if (cat === 'font') counts.font++;
      else if (cat === 'document') counts.document++;
    }

    Object.keys(counts).forEach(k => {
      if (countEls[k]) countEls[k].textContent = counts[k];
    });

    applyFilter();
  }

  function trackApiOrigin(origin) {
    if (!origin || !apiOriginSelect) return;
    const isNew = !detectedApiOrigins.has(origin);
    const count = (detectedApiOrigins.get(origin) || 0) + 1;
    detectedApiOrigins.set(origin, count);

    if (isNew) {
      apiOriginSelect.classList.remove('hidden');
      const opt = document.createElement('option');
      opt.value = origin;
      opt.textContent = `${origin} (${count})`;
      apiOriginSelect.appendChild(opt);
    } else {
      const opt = apiOriginSelect.querySelector(`option[value="${CSS.escape(origin)}"]`);
      if (opt) {
        opt.textContent = `${origin} (${count})`;
      }
    }
  }

  function trackHttpStatus(code) {
    if (!code || !statusFilterSelect) return;
    const numericCode = Number(code);
    if (!numericCode || detectedStatusCodes.has(numericCode)) return;
    detectedStatusCodes.add(numericCode);
  }

  function upsertRequestRow(req) {
    let entry = requestsMap.get(req.id);

    if (!entry) {
      if (orderedRowIds.length >= MAX_DOM_ROWS) {
        const oldestId = orderedRowIds.shift();
        const oldEntry = requestsMap.get(oldestId);
        if (oldEntry && oldEntry.rowEl) {
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
      row.dataset.isApi = req.isApi ? 'true' : 'false';
      row.dataset.apiOrigin = req.apiOrigin || '';
      row.dataset.statusCode = String(req.statusCode || '');
      row.dataset.status = String(req.status || '');

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
    row.dataset.isApi = req.isApi ? 'true' : 'false';
    row.dataset.apiOrigin = req.apiOrigin || '';
    row.dataset.statusCode = String(req.statusCode || '');
    row.dataset.status = String(req.status || '');

    if (req.isApi && req.apiOrigin) {
      trackApiOrigin(req.apiOrigin);
    }
    if (req.statusCode) {
      trackHttpStatus(req.statusCode);
    }

    // Status Code
    const statusCell = row.querySelector('.cell-status');
    if (req.status === 'failed') {
      statusCell.innerHTML = `<span class="status-pill status-failed" title="${escapeHtml(req.errorText || 'Failed')}">Failed</span>`;
    } else if (req.statusCode) {
      const codeGroup = `${Math.floor(req.statusCode / 100)}xx`;
      statusCell.innerHTML = `<span class="status-pill status-${codeGroup}">${escapeHtml(req.statusCode)}</span>`;
    } else {
      statusCell.innerHTML = `<span class="status-pill status-pending">...</span>`;
    }

    // Type
    const typeCell = row.querySelector('.cell-type');
    if (req.isApi) {
      typeCell.innerHTML = `<span class="type-pill api" title="API: ${escapeHtml(req.apiOrigin || '')}">API</span>`;
    } else {
      typeCell.innerHTML = `<span class="type-pill ${safeCat}">${escapeHtml(req.category)}</span>`;
    }

    // Size
    const sizeCell = row.querySelector('.cell-size');
    const bytes = req.encodedDataLength || req.bodySize || 0;
    sizeCell.textContent = bytes > 0 ? formatBytes(bytes) : '--';

    // Duration & Timeline
    const timeCell = row.querySelector('.cell-time');
    const barEl = row.querySelector('.timeline-bar');

    if (req.duration && req.duration > 0) {
      timeCell.textContent = formatDuration(req.duration);
      if (req.duration > maxDurationSeen) maxDurationSeen = req.duration;
      const pct = Math.min(100, Math.max(5, (req.duration / maxDurationSeen) * 100));
      barEl.style.width = `${pct}%`;
    } else {
      timeCell.textContent = '--';
      barEl.style.width = '8%';
    }
  }

  /* -------------------------------------------------------------------------- */
  /* Filtering & Search                                                         */
  /* -------------------------------------------------------------------------- */
  function setupFilters() {
    if (filterTabsContainer) {
      filterTabsContainer.addEventListener('click', (e) => {
        const tab = e.target.closest('.filter-tab');
        if (!tab) return;
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.dataset.filter || 'all';
        applyFilter();
      });
    }

    if (apiOriginSelect) {
      apiOriginSelect.addEventListener('change', () => {
        currentApiOrigin = apiOriginSelect.value;
        applyFilter();
      });
    }

    if (statusFilterSelect) {
      statusFilterSelect.addEventListener('change', () => {
        currentHttpStatus = statusFilterSelect.value;
        applyFilter();
      });
    }

    if (searchFilter) {
      searchFilter.addEventListener('input', () => {
        currentSearch = searchFilter.value.trim().toLowerCase();
        applyFilter();
      });
    }

    const btnExportLog = document.getElementById('btnExportLog');
    if (btnExportLog) {
      btnExportLog.addEventListener('click', exportAuditLog);
    }
  }

  function applyFilter() {
    let visibleCount = 0;
    const isStatusSearch = currentSearch.startsWith('status:');
    const statusSearchVal = isStatusSearch ? currentSearch.replace('status:', '').trim() : '';

    requestsMap.forEach(({ rowEl, req }) => {
      let matches = true;

      // Category filter
      if (currentFilter === 'api') {
        if (!req.isApi) matches = false;
      } else if (currentFilter !== 'all') {
        if (req.category !== currentFilter) matches = false;
      }

      // API origin filter
      if (matches && currentApiOrigin !== 'all') {
        if (req.apiOrigin !== currentApiOrigin) matches = false;
      }

      // HTTP status select filter
      if (matches && currentHttpStatus !== 'all') {
        const code = Number(req.statusCode) || 0;
        if (currentHttpStatus === '2xx') {
          if (code < 200 || code >= 300) matches = false;
        } else if (currentHttpStatus === '3xx') {
          if (code < 300 || code >= 400) matches = false;
        } else if (currentHttpStatus === '4xx') {
          if (code < 400 || code >= 500) matches = false;
        } else if (currentHttpStatus === '5xx') {
          if (code < 500 || code >= 600) matches = false;
        } else if (currentHttpStatus === 'error') {
          if (code < 400 && req.status !== 'failed') matches = false;
        } else if (currentHttpStatus === 'pending') {
          if (req.status !== 'pending' && (code > 0 || req.status === 'failed')) matches = false;
        } else {
          // Specific status code
          if (String(code) !== currentHttpStatus) matches = false;
        }
      }

      // Search Filter
      if (matches && currentSearch) {
        if (isStatusSearch) {
          if (statusSearchVal === 'error') {
            const code = Number(req.statusCode) || 0;
            if (code < 400 && req.status !== 'failed') matches = false;
          } else if (statusSearchVal) {
            const codeStr = String(req.statusCode || '');
            if (!codeStr.startsWith(statusSearchVal)) matches = false;
          }
        } else {
          const urlStr = String(req.url || '').toLowerCase();
          const methodStr = String(req.method || '').toLowerCase();
          const codeStr = String(req.statusCode || '');
          if (!urlStr.includes(currentSearch) && !methodStr.includes(currentSearch) && !codeStr.includes(currentSearch)) {
            matches = false;
          }
        }
      }

      if (matches) {
        rowEl.style.display = '';
        visibleCount++;
      } else {
        rowEl.style.display = 'none';
      }
    });

    if (emptyStateRow) {
      if (requestsMap.size > 0 && visibleCount === 0) {
        emptyStateRow.classList.remove('hidden');
        emptyStateRow.querySelector('.empty-title').textContent = 'No requests match your filter';
        emptyStateRow.querySelector('.empty-desc').textContent = 'Adjust category tabs, HTTP status, or search query.';
      } else if (requestsMap.size === 0) {
        emptyStateRow.classList.remove('hidden');
        emptyStateRow.querySelector('.empty-title').textContent = 'No requests recorded yet';
        emptyStateRow.querySelector('.empty-desc').textContent = 'Enter a target URL above and click Start Inspect to monitor API calls and network waterfall in real time.';
      } else {
        emptyStateRow.classList.add('hidden');
      }
    }
  }

  /* -------------------------------------------------------------------------- */
  /* Request Drawer (Inspection Panel)                                          */
  /* -------------------------------------------------------------------------- */
  function openDrawer(req, rowEl) {
    if (!req || !requestDrawer) return;

    if (selectedRowEl) selectedRowEl.classList.remove('selected');
    if (rowEl) {
      selectedRowEl = rowEl;
      selectedRowEl.classList.add('selected');
    }

    activeRequest = req;
    renderDrawerDetails(req);
    requestDrawer.classList.remove('hidden');
  }

  function closeDrawer() {
    if (requestDrawer) requestDrawer.classList.add('hidden');
    if (selectedRowEl) {
      selectedRowEl.classList.remove('selected');
      selectedRowEl = null;
    }
    activeRequest = null;
  }

  function setupDrawerEvents() {
    if (btnCloseDrawer) btnCloseDrawer.addEventListener('click', closeDrawer);

    if (btnCopyUrl) {
      btnCopyUrl.addEventListener('click', () => {
        if (activeRequest && activeRequest.url) {
          navigator.clipboard.writeText(activeRequest.url);
          showToast('URL copied to clipboard', 'success', 2000);
        }
      });
    }

    document.querySelectorAll('.drawer-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.drawer-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const tabName = tab.dataset.drawerTab;
        if (tabName === 'headers') {
          paneHeaders.classList.remove('hidden');
          paneTiming.classList.add('hidden');
        } else if (tabName === 'timing') {
          paneHeaders.classList.add('hidden');
          paneTiming.classList.remove('hidden');
        }
      });
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && requestDrawer && !requestDrawer.classList.contains('hidden')) {
        closeDrawer();
      }
    });
  }

  function renderDrawerDetails(req) {
    if (!req) return;

    // Header badge & title
    if (drawerMethod) {
      drawerMethod.textContent = req.method || 'GET';
      drawerMethod.className = `drawer-badge method-${sanitizeClass(req.method)}`;
    }
    if (drawerTitle) {
      drawerTitle.textContent = extractPath(req.url) || req.url;
      drawerTitle.title = req.url;
    }

    // General Info Grid (XSS-Safe DOM construction)
    if (drawerGeneralInfo) {
      drawerGeneralInfo.innerHTML = '';
      const generalPairs = [
        ['Request URL', req.url || ''],
        ['Request Method', req.method || 'GET'],
        ['Status Code', req.statusCode ? `${req.statusCode} ${req.statusText || ''}` : (req.status === 'failed' ? `Failed (${req.errorText || 'Error'})` : 'Pending')],
        ['Remote Address', req.remoteIPAddress ? `${req.remoteIPAddress}:${req.remotePort || ''}` : '--'],
        ['Protocol', req.protocol || '--'],
        ['Resource Type', req.category ? req.category.toUpperCase() : 'OTHER'],
        ['API Call', req.isApi ? `Yes (${req.apiOrigin || ''})` : 'No']
      ];

      generalPairs.forEach(([key, val]) => {
        const keyDiv = document.createElement('div');
        keyDiv.className = 'drawer-info-key';
        keyDiv.textContent = key;

        const valDiv = document.createElement('div');
        valDiv.className = 'drawer-info-val';
        valDiv.textContent = val;

        drawerGeneralInfo.appendChild(keyDiv);
        drawerGeneralInfo.appendChild(valDiv);
      });
    }

    // Response Headers
    if (responseHeadersTable) {
      responseHeadersTable.innerHTML = '';
      const resHeaders = req.responseHeaders || {};
      const resKeys = Object.keys(resHeaders);
      if (responseHeadersCount) responseHeadersCount.textContent = resKeys.length;

      if (resKeys.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.style.padding = '10px 12px';
        emptyDiv.style.color = 'var(--text-muted)';
        emptyDiv.style.fontStyle = 'italic';
        emptyDiv.textContent = 'No response headers available.';
        responseHeadersTable.appendChild(emptyDiv);
      } else {
        resKeys.sort().forEach(k => {
          const row = document.createElement('div');
          row.className = 'header-row';

          const kSpan = document.createElement('span');
          kSpan.className = 'header-key';
          kSpan.textContent = k;

          const vSpan = document.createElement('span');
          vSpan.className = 'header-val';
          vSpan.textContent = resHeaders[k];

          row.appendChild(kSpan);
          row.appendChild(vSpan);
          responseHeadersTable.appendChild(row);
        });
      }
    }

    // Request Headers
    if (requestHeadersTable) {
      requestHeadersTable.innerHTML = '';
      const reqHeaders = req.requestHeaders || {};
      const reqKeys = Object.keys(reqHeaders);
      if (requestHeadersCount) requestHeadersCount.textContent = reqKeys.length;

      if (reqKeys.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.style.padding = '10px 12px';
        emptyDiv.style.color = 'var(--text-muted)';
        emptyDiv.style.fontStyle = 'italic';
        emptyDiv.textContent = 'No request headers available.';
        requestHeadersTable.appendChild(emptyDiv);
      } else {
        reqKeys.sort().forEach(k => {
          const row = document.createElement('div');
          row.className = 'header-row';

          const kSpan = document.createElement('span');
          kSpan.className = 'header-key';
          kSpan.textContent = k;

          const vSpan = document.createElement('span');
          vSpan.className = 'header-val';
          vSpan.textContent = reqHeaders[k];

          row.appendChild(kSpan);
          row.appendChild(vSpan);
          requestHeadersTable.appendChild(row);
        });
      }
    }

    // Timing & Connection Breakdown
    if (drawerTimingInfo) {
      drawerTimingInfo.innerHTML = '';
      const timing = req.timing || {};
      const duration = (typeof req.duration === 'number' && req.duration > 0)
        ? req.duration
        : ((typeof req.durationMs === 'number' && req.durationMs > 0) ? req.durationMs : 0);
      const encoded = req.encodedDataLength || req.bodySize || 0;
      const decoded = req.dataLength || req.contentLength || (encoded > 0 ? encoded : 0);

      let dnsVal = '--';
      if (typeof timing.dnsStart === 'number' && typeof timing.dnsEnd === 'number' && timing.dnsEnd >= 0) {
        if (timing.dnsStart >= 0) {
          dnsVal = `${Math.max(0, Math.round(timing.dnsEnd - timing.dnsStart))} ms`;
        } else {
          dnsVal = 'Reused connection (0 ms)';
        }
      } else if (req.fromDiskCache) {
        dnsVal = 'Cached (0 ms)';
      }

      let connectVal = '--';
      if (typeof timing.connectStart === 'number' && typeof timing.connectEnd === 'number' && timing.connectEnd >= 0) {
        if (timing.connectStart >= 0) {
          connectVal = `${Math.max(0, Math.round(timing.connectEnd - timing.connectStart))} ms`;
        } else {
          connectVal = 'Reused connection (0 ms)';
        }
      } else if (req.fromDiskCache) {
        connectVal = 'Cached (0 ms)';
      }

      let sslVal = '--';
      if (typeof timing.sslStart === 'number' && typeof timing.sslEnd === 'number' && timing.sslEnd >= 0 && timing.sslStart >= 0) {
        sslVal = `${Math.max(0, Math.round(timing.sslEnd - timing.sslStart))} ms`;
      } else if (req.protocol && (req.protocol.includes('h2') || req.protocol.includes('h3') || req.protocol.includes('https'))) {
        sslVal = (connectVal !== '--') ? 'Included in connect' : '--';
      } else if (req.fromDiskCache) {
        sslVal = 'Cached (0 ms)';
      } else {
        sslVal = 'N/A (Plain HTTP)';
      }

      let ttfbVal = '--';
      if (typeof timing.receiveHeadersEnd === 'number' && timing.receiveHeadersEnd >= 0) {
        const sendRef = (typeof timing.sendEnd === 'number' && timing.sendEnd >= 0)
          ? timing.sendEnd
          : ((typeof timing.sendStart === 'number' && timing.sendStart >= 0) ? timing.sendStart : 0);
        ttfbVal = `${Math.max(0, Math.round(timing.receiveHeadersEnd - sendRef))} ms`;
      } else if (typeof req.ttfbMs === 'number' && req.ttfbMs > 0) {
        ttfbVal = `${Math.round(req.ttfbMs)} ms`;
      } else if (duration > 0) {
        ttfbVal = `${Math.round(duration)} ms`;
      }

      let downloadVal = '--';
      if (duration > 0 && typeof timing.receiveHeadersEnd === 'number' && timing.receiveHeadersEnd > 0) {
        downloadVal = `${Math.max(0, Math.round(duration - timing.receiveHeadersEnd))} ms`;
      } else if (duration > 0) {
        downloadVal = '< 1 ms';
      }

      let durationVal = '--';
      if (duration > 0) {
        durationVal = formatDuration(duration);
      } else if (req.status === 'completed') {
        durationVal = '< 1 ms';
      } else if (req.status === 'pending') {
        durationVal = 'In progress...';
      }

      const timingPairs = [
        ['Total Duration', durationVal],
        ['Encoded (Over Wire)', encoded > 0 ? formatBytes(encoded) : (req.fromDiskCache ? '0 B (Disk Cache)' : '--')],
        ['Decoded Body', decoded > 0 ? formatBytes(decoded) : (encoded > 0 ? formatBytes(encoded) : '--')],
        ['Cache Status', req.fromDiskCache ? 'Served from Disk Cache' : (req.fromServiceWorker ? 'Service Worker' : 'Network Transfer')],
        ['DNS Lookup', dnsVal],
        ['Initial Connection', connectVal],
        ['SSL Handshake', sslVal],
        ['TTFB (Waiting for server)', ttfbVal],
        ['Content Download', downloadVal]
      ];

      timingPairs.forEach(([key, val]) => {
        const keyDiv = document.createElement('div');
        keyDiv.className = 'drawer-info-key';
        keyDiv.textContent = key;

        const valDiv = document.createElement('div');
        valDiv.className = 'drawer-info-val';
        valDiv.textContent = val;

        drawerTimingInfo.appendChild(keyDiv);
        drawerTimingInfo.appendChild(valDiv);
      });
    }
  }

  /* -------------------------------------------------------------------------- */
  /* IPC Event Handlers                                                         */
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
          lastLoadTimeMs = data.totalLoadTime;
          updateThroughputComparison();
        }
        showToast('Audit completed successfully', 'success', 3000);
        saveCurrentAuditToHistory('completed');
      } else if (data.status === 'failed' || data.status === 'stopped') {
        const isFail = data.status === 'failed';
        setAuditingState(false, isFail);
        if (isFail) {
          auditStatusBanner.classList.add('banner-error');
          if (statusDot) statusDot.className = 'status-indicator-dot error';
          if (btnRetry) btnRetry.classList.remove('hidden');
          const codeInfo = data.errorCode ? ` (${data.errorCode})` : '';
          const errMsg = data.errorDescription || data.message || 'Connection failed';
          statusMessage.textContent = `Load failed: ${errMsg}${codeInfo}`;
          showToast(`Connection failed: ${errMsg}${codeInfo}`, 'error');
          saveCurrentAuditToHistory('failed', `${errMsg}${codeInfo}`);
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
      const msg = err ? (err.message || String(err)) : 'Unknown error';
      statusMessage.textContent = `Error: ${msg}`;
      auditStatusBanner.classList.add('banner-error');
      if (statusDot) statusDot.className = 'status-indicator-dot error';
      if (btnRetry) btnRetry.classList.remove('hidden');
      showToast(`Audit error: ${msg}`, 'error');
      saveCurrentAuditToHistory('failed', msg);
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Audit Log Export (.log Plain Text Generator)                               */
  /* -------------------------------------------------------------------------- */
  function generateAuditLogText() {
    const divider = '='.repeat(84);
    const subDivider = '-'.repeat(84);
    const lines = [];

    const now = new Date();
    const timestampStr = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    lines.push(divider);
    lines.push('                    WEBSITE PERFORMANCE & NETWORK AUDIT LOG');
    lines.push(divider);
    lines.push(`Generated:        ${timestampStr}`);
    lines.push(`Target URL:       ${lastAuditedUrl || (urlInput ? urlInput.value : 'N/A')}`);
    lines.push(`Audit Status:     ${isAuditing ? 'RUNNING' : (statusMessage ? statusMessage.textContent : 'COMPLETED')}`);
    lines.push(`Overall Score:    ${currentOverallScore !== null ? currentOverallScore + ' / 100' : 'N/A'}`);
    lines.push(`Network Profile:  ${currentThrottlingProfile || 'none'}`);
    lines.push(`Tester Bandwidth: ${clientSpeedMbps > 0 ? clientSpeedMbps.toFixed(2) + ' Mbps' : 'Not measured'}`);
    lines.push(`Tester Latency:   ${clientPingMs > 0 ? clientPingMs + ' ms' : 'Not measured'}`);
    if (systemInfo) {
      lines.push(`Environment:      Electron ${systemInfo.electronVersion} | Chrome ${systemInfo.chromeVersion} | Node ${systemInfo.nodeVersion} (${systemInfo.platform})`);
    }
    lines.push('');

    // Section 1: Core Web Vitals
    lines.push(subDivider);
    lines.push('CORE WEB VITALS & PERFORMANCE METRICS');
    lines.push(subDivider);

    const formatMetricLine = (name, full, val, unit, goodThresh, poorThresh) => {
      if (val === null || val === undefined || isNaN(val)) {
        return `- ${name.padEnd(6)} (${full.padEnd(28)}):  N/A`;
      }
      let status = 'GOOD';
      if (val > poorThresh) status = 'POOR';
      else if (val > goodThresh) status = 'NEEDS IMPROVEMENT';

      const valFormatted = unit === 'score' ? Number(val).toFixed(3) : `${Math.round(val)} ms`;
      const target = unit === 'score' ? `<= ${goodThresh}` : `<= ${(goodThresh / 1000).toFixed(1)}s`;
      return `- ${name.padEnd(6)} (${full.padEnd(28)}):  ${valFormatted.padStart(10)}  [${status}]  (Target: ${target})`;
    };

    lines.push(formatMetricLine('LCP', 'Largest Contentful Paint', currentMetrics.LCP, 'ms', 2500, 4000));
    lines.push(formatMetricLine('FCP', 'First Contentful Paint', currentMetrics.FCP, 'ms', 1800, 3000));
    lines.push(formatMetricLine('CLS', 'Cumulative Layout Shift', currentMetrics.CLS, 'score', 0.10, 0.25));
    lines.push(formatMetricLine('TTFB', 'Time to First Byte', currentMetrics.TTFB, 'ms', 800, 1800));
    if (currentMetrics.INP !== null && currentMetrics.INP !== undefined) {
      lines.push(formatMetricLine('INP', 'Interaction to Next Paint', currentMetrics.INP, 'ms', 200, 500));
    }
    lines.push('');

    // Section 2: Loading & Network Summary
    lines.push(subDivider);
    lines.push('NETWORK & LOADING SUMMARY');
    lines.push(subDivider);
    const totalCount = allCapturedRequestsMap.size > 0 ? allCapturedRequestsMap.size : (lastStats.totalRequests || 0);
    lines.push(`- Total Requests:         ${totalCount}`);
    lines.push(`- Total Transferred Size: ${formatBytes(lastStats.totalBytes)} (${lastStats.totalBytes || 0} bytes)`);
    lines.push(`- Total Page Load Time:   ${lastLoadTimeMs ? (lastLoadTimeMs / 1000).toFixed(2) + ' s (' + Math.round(lastLoadTimeMs) + ' ms)' : 'N/A'}`);
    lines.push(`- Effective Throughput:   ${summaryEffectiveThroughput ? summaryEffectiveThroughput.textContent : 'N/A'}`);
    lines.push(`- Failed Requests:        ${lastStats.failedRequests || 0}`);

    // Category breakdown
    const catCounts = { document: 0, script: 0, stylesheet: 0, image: 0, font: 0, fetch: 0, api: 0, other: 0 };
    const catBytes = { document: 0, script: 0, stylesheet: 0, image: 0, font: 0, fetch: 0, api: 0, other: 0 };

    const reqList = Array.from(allCapturedRequestsMap.values());
    reqList.forEach(r => {
      const cat = r.category || 'other';
      if (catCounts[cat] !== undefined) {
        catCounts[cat]++;
        catBytes[cat] += (r.transferSize || r.encodedDataLength || 0);
      } else {
        catCounts.other++;
        catBytes.other += (r.transferSize || r.encodedDataLength || 0);
      }
      if (r.isApi) {
        catCounts.api++;
        catBytes.api += (r.transferSize || r.encodedDataLength || 0);
      }
    });

    lines.push('');
    lines.push('Resource Breakdown:');
    Object.keys(catCounts).forEach(k => {
      if (catCounts[k] > 0) {
        const label = k.toUpperCase().padEnd(12);
        lines.push(`  * ${label}: ${String(catCounts[k]).padStart(4)} requests | ${formatBytes(catBytes[k]).padStart(9)} transferred`);
      }
    });

    // Detected API Origins
    if (detectedApiOrigins.size > 0) {
      lines.push('');
      lines.push(`Detected API Endpoints (${detectedApiOrigins.size}):`);
      for (const [origin, count] of detectedApiOrigins.entries()) {
        lines.push(`  * ${origin} (${count} calls)`);
      }
    }
    lines.push('');

    // Section 3: Detailed Chronological Waterfall
    lines.push(subDivider);
    lines.push(`CHRONOLOGICAL NETWORK REQUEST WATERFALL (${reqList.length} Requests)`);
    lines.push(subDivider);

    if (reqList.length === 0) {
      lines.push('(No network requests captured)');
    } else {
      reqList.forEach((r, idx) => {
        const num = String(idx + 1).padStart(3, '0');
        const method = (r.method || 'GET').padEnd(6);
        const status = r.statusCode ? `${r.statusCode} ${r.statusText || 'OK'}` : (r.status === 'failed' ? `FAILED (${r.errorText || 'Error'})` : 'PENDING');
        const sizeStr = formatBytes(r.transferSize || r.encodedDataLength || 0);
        const durationStr = typeof r.duration === 'number' ? `${Math.round(r.duration)} ms` : '--';
        const typeStr = r.isApi ? `API (${r.category || 'fetch'})` : (r.category || 'other');

        lines.push(`[#${num}] ${method} ${status} | ${typeStr} | ${sizeStr} | ${durationStr}`);
        lines.push(`      URL:        ${r.url}`);
        if (r.remoteIPAddress) {
          lines.push(`      Remote IP:  ${r.remoteIPAddress}${r.protocol ? ' (' + r.protocol + ')' : ''}`);
        }
        if (r.fromDiskCache) {
          lines.push(`      Cache:      Served from Disk Cache`);
        }
        if (r.decodedBodyLength && r.decodedBodyLength !== (r.transferSize || r.encodedDataLength)) {
          lines.push(`      Decoded:    ${formatBytes(r.decodedBodyLength)} (decompressed)`);
        }

        // Timing breakdown if available
        if (r.timing) {
          const t = r.timing;
          const timingParts = [];
          if (typeof t.dnsStart === 'number' && typeof t.dnsEnd === 'number' && t.dnsEnd >= t.dnsStart) {
            timingParts.push(`DNS: ${Math.round(t.dnsEnd - t.dnsStart)}ms`);
          }
          if (typeof t.connectStart === 'number' && typeof t.connectEnd === 'number' && t.connectEnd >= t.connectStart) {
            timingParts.push(`Connect: ${Math.round(t.connectEnd - t.connectStart)}ms`);
          }
          if (typeof t.sslStart === 'number' && typeof t.sslEnd === 'number' && t.sslEnd >= t.sslStart) {
            timingParts.push(`SSL: ${Math.round(t.sslEnd - t.sslStart)}ms`);
          }
          if (typeof t.sendEnd === 'number' && typeof t.receiveHeadersEnd === 'number' && t.receiveHeadersEnd >= t.sendEnd) {
            timingParts.push(`TTFB: ${Math.round(t.receiveHeadersEnd - t.sendEnd)}ms`);
          }
          if (timingParts.length > 0) {
            lines.push(`      Timing:     ${timingParts.join(' | ')}`);
          }
        }

        // Headers preview
        if (r.responseHeaders && typeof r.responseHeaders === 'object') {
          const headerKeys = Object.keys(r.responseHeaders);
          if (headerKeys.length > 0) {
            const previewHeaders = ['content-type', 'content-length', 'cache-control', 'server', 'x-cache'];
            const relevant = [];
            for (const k of previewHeaders) {
              const matchedKey = headerKeys.find(hk => hk.toLowerCase() === k);
              if (matchedKey) {
                relevant.push(`${matchedKey}: ${r.responseHeaders[matchedKey]}`);
              }
            }
            if (relevant.length > 0) {
              lines.push(`      Headers:    ${relevant.join('; ')}`);
            }
          }
        }

        lines.push('');
      });
    }

    lines.push(divider);
    lines.push('                             END OF AUDIT LOG');
    lines.push(divider);

    return lines.join('\n');
  }

  async function exportAuditLog() {
    const targetUrl = lastAuditedUrl || (urlInput ? urlInput.value.trim() : '');
    if (allCapturedRequestsMap.size === 0 && !targetUrl) {
      showToast('No audit data to export. Run an audit first.', 'warning', 3000);
      return;
    }

    const logText = generateAuditLogText();

    let host = 'audit';
    try {
      if (targetUrl) {
        const u = new URL(normalizeInputUrl(targetUrl));
        host = u.hostname.replace(/[^a-zA-Z0-9.-]/g, '_');
      }
    } catch (e) {}

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const defaultFilename = `audit-${host}-${dateStr}-${timeStr}.log`;

    try {
      if (window.electronAPI && window.electronAPI.exportLog) {
        const res = await window.electronAPI.exportLog(logText, defaultFilename);
        if (res && res.ok && res.filePath) {
          const filename = res.filePath.split(/[/\\]/).pop();
          showToast(`Log file saved: ${filename}`, 'success', 3500);
        } else if (res && res.canceled) {
          // Cancelled by user
        } else if (res && res.error) {
          showToast(`Failed to export log: ${res.error}`, 'error', 3500);
        }
      } else {
        // Fallback: browser download
        const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Log file downloaded: ${defaultFilename}`, 'success', 3000);
      }
    } catch (err) {
      console.error('[ExportLog] Error:', err);
      showToast(`Error exporting log: ${err.message}`, 'error', 3500);
    }
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

  function sanitizeClass(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[^a-zA-Z0-9-_]/g, '');
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
    setupAuditControls();
    setupFilters();
    setupDrawerEvents();
    setupHistoryEvents();
    setupIpcListeners();

    if (btnProbeSpeed) {
      btnProbeSpeed.addEventListener('click', runClientSpeedProbe);
    }

    // Initial load of audit history
    loadAuditHistory();

    // Fetch system environment info
    if (window.electronAPI && window.electronAPI.getSystemInfo) {
      window.electronAPI.getSystemInfo().then(info => {
        systemInfo = info;
      }).catch(() => {});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
