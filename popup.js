// popup.js

/** @type {Array<{pattern:string, status:number, contentType:string, response:string, enabled:boolean}>} */
let rules = [];
let enabled = true;
let editingIndex = -1;

// ======================== Init ========================

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['rules', 'enabled', 'collapsedGroups'], (result) => {
    rules   = result.rules   || [];
    enabled = result.enabled !== false;
    collapsedGroups = result.collapsedGroups || {};
    document.getElementById('enableToggle').checked = enabled;
    renderRules();
    bindEvents();
  });
});

// ======================== Render ========================

let collapsedGroups = {};   // 折叠状态：'p:平台' / 'i:平台#接口' → true

/* ── 平台 / 接口分类（与 HTML 工具一致） ── */
function classifyPlatform(pattern) {
  const p = pattern || '';
  if (p.indexOf('lowcode/tradeSummary') !== -1) return '京东·京麦新版';
  if (p.indexOf('jd.com/brand') !== -1 || p.indexOf('ppzh.jd.com') !== -1) return '京东·京麦旧版';
  if (p.indexOf('sycm.taobao.com') !== -1) return '淘宝·生意参谋';
  if (p.indexOf('ascp-dc.tmall.com') !== -1) return '天猫超市';
  if (p.indexOf('store.weixin.qq.com') !== -1) return '微信小店';
  if (p.indexOf('DescribeSbmxxqcx') !== -1 || p.indexOf('DescribeSbmxcx2') !== -1 || p.indexOf('szc/szzh/sjswszzh') !== -1) return '其他·电子税务局';
  return '自定义';
}
const PLATFORM_ORDER = ['京东·京麦新版','京东·京麦旧版','淘宝·生意参谋','天猫超市','微信小店','其他·电子税务局','自定义'];

function ifaceName(pattern) {
  const m = (pattern || '').match(/([A-Za-z0-9_]+)(?:\.ajax|\/|$)/);
  const known = ['getSummary','getTrend','getProSummary','getProTrend','getVenderDealSummayData',
    'DescribeSbmxxqcx','DescribeSbmxcx2','olap','liner','query','overview','trend'];
  if (m && known.indexOf(m[1]) !== -1) return m[1];
  const m2 = (pattern || '').match(/(?:v\d+\/)?([a-z0-9_\-]+)(?:\.json|\.ajax|\?|$)/i);
  return m2 ? m2[1] : ((pattern || '').slice(0, 24) || '其他');
}

function matchQuery(rule, q) {
  if (!q) return true;
  return (rule.alias || '').toLowerCase().indexOf(q) !== -1 ||
         (rule.pattern || '').toLowerCase().indexOf(q) !== -1 ||
         (rule.bodyPattern || '').toLowerCase().indexOf(q) !== -1 ||
         (rule.cookiePattern || '').toLowerCase().indexOf(q) !== -1;
}

/* 两级分组：平台 → 接口 → 规则（idx 始终是 rules 全量数组索引，过滤不改变语义） */
function buildGroups(rules, query) {
  const byPlat = {};
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (!matchQuery(r, query)) continue;
    const plat = classifyPlatform(r.pattern);
    const iface = ifaceName(r.pattern);
    if (!byPlat[plat]) byPlat[plat] = {};
    (byPlat[plat][iface] = byPlat[plat][iface] || []).push({ rule: r, idx: i });
  }
  const groups = [];
  for (const plat of PLATFORM_ORDER) {
    if (!byPlat[plat]) continue;
    const ifaces = Object.keys(byPlat[plat]).sort((a, b) => byPlat[plat][b].length - byPlat[plat][a].length);
    const total = ifaces.reduce((n, k) => n + byPlat[plat][k].length, 0);
    groups.push({ platform: plat, total, ifaces: ifaces.map(k => ({ iface: k, items: byPlat[plat][k] })) });
  }
  return groups;
}

function renderRuleItem(rule, i) {
  const st = rule.status || 200;
  const badgeClass = st >= 500 ? 's5' : st >= 400 ? 's4' : st >= 200 ? 's2' : '';
  const ct = (rule.contentType || 'application/json').split('/').pop();
  const bodyBadge = rule.bodyPattern
    ? (function() {
        var lines = rule.bodyPattern.split('\n').filter(function(l){ return l.trim(); });
        var label = lines.length > 1
          ? 'body: ' + lines.length + ' conditions'
          : 'body: ' + (lines[0] || '').substring(0, 22) + (lines[0] && lines[0].length > 22 ? '\u2026' : '');
        return `<span class="badge badge-body" title="Body conditions:\n${escHtml(lines.join('\n'))}">${escHtml(label)}</span>`;
      })()
    : '';
  const cookieBadge = rule.cookiePattern
    ? (function() {
        var lines = rule.cookiePattern.split('\n').filter(function(l){ return l.trim(); });
        var label = lines.length > 1
          ? 'cookie: ' + lines.length + ' conditions'
          : 'cookie: ' + (lines[0] || '').substring(0, 22) + (lines[0] && lines[0].length > 22 ? '\u2026' : '');
        return `<span class="badge badge-body" title="Cookie conditions:\n${escHtml(lines.join('\n'))}">${escHtml(label)}</span>`;
      })()
    : '';
  const fnBadge = rule.responseType === 'function'
    ? '<span class="badge badge-fn" title="Dynamic JS function response">&#9889;&nbsp;fn</span>'
    : '';
  return `
    <div class="rule-item ${rule.enabled === false ? 'disabled' : ''}">
      <div class="rule-info">
        ${rule.alias ? `<div class="rule-alias">${escHtml(rule.alias)}</div>` : ''}
        <div class="rule-pattern ${rule.alias ? 'muted' : ''}" title="${escHtml(rule.pattern)}">${escHtml(rule.pattern)}</div>
        <div class="rule-meta">
          <span class="badge ${badgeClass}">${st}</span>
          <span class="badge">${escHtml(ct)}</span>
          ${fnBadge}
          ${bodyBadge}
          ${cookieBadge}
        </div>
      </div>
      <div class="rule-actions">
        <label class="mini-toggle" title="${rule.enabled !== false ? 'Disable' : 'Enable'} this rule">
          <input type="checkbox" data-action="toggle" data-index="${i}" ${rule.enabled !== false ? 'checked' : ''}>
          <span class="mini-slider"></span>
        </label>
        <button class="icon-btn" data-action="edit" data-index="${i}" title="Edit">✏️</button>
        <button class="icon-btn" data-action="duplicate" data-index="${i}" title="Duplicate">📄</button>
        <button class="icon-btn delete" data-action="delete" data-index="${i}" title="Delete">🗑️</button>
      </div>
    </div>`;
}

function renderRules() {
  const list = document.getElementById('ruleList');

  if (rules.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🔀</span>
        <span>No rules yet. Click <strong>+ Add Rule</strong> to get started.</span>
      </div>`;
    return;
  }

  const searchEl = document.getElementById('searchInput');
  const q = (searchEl && searchEl.value || '').trim().toLowerCase();
  const groups = buildGroups(rules, q);

  if (groups.length === 0) {
    list.innerHTML = `<div class="empty-state"><span>没有匹配的规则</span></div>`;
    return;
  }

  const matchedTotal = groups.reduce((n, g) => n + g.total, 0);
  list.innerHTML =
    `<div class="rule-count-hint">共 ${matchedTotal} 条${q ? '（已过滤）' : ''}</div>` +
    groups.map(g => {
      const pKey = 'p:' + g.platform;
      const pCollapsed = collapsedGroups[pKey] === true;
      const pBody = pCollapsed ? '' : g.ifaces.map(ig => {
        const iKey = 'i:' + g.platform + '#' + ig.iface;
        const iCollapsed = collapsedGroups[iKey] === true;
        const iBody = iCollapsed ? '' : ig.items.map(it => renderRuleItem(it.rule, it.idx)).join('');
        return `
          <div class="subgroup">
            <div class="subgroup-header" data-action="toggle-group" data-key="${escHtml(iKey)}">
              <span class="group-arrow">${iCollapsed ? '▶' : '▼'}</span>
              <span class="group-name">${escHtml(ig.iface)}</span>
              <span class="group-count">${ig.items.length}</span>
            </div>
            ${iBody ? `<div class="subgroup-body">${iBody}</div>` : ''}
          </div>`;
      }).join('');
      return `
        <div class="rule-group">
          <div class="group-header" data-action="toggle-group" data-key="${escHtml(pKey)}">
            <span class="group-arrow">${pCollapsed ? '▶' : '▼'}</span>
            <span class="group-name">${escHtml(g.platform)}</span>
            <span class="group-count">${g.total}</span>
            <span class="group-tools" data-stop="1">
              <button class="group-btn" data-action="group-toggle-all" data-platform="${escHtml(g.platform)}" data-enable="1" title="启用该平台全部规则">全开</button>
              <button class="group-btn" data-action="group-toggle-all" data-platform="${escHtml(g.platform)}" data-enable="0" title="停用该平台全部规则">全关</button>
            </span>
          </div>
          ${pBody ? `<div class="group-body">${pBody}</div>` : ''}
        </div>`;
    }).join('');
}

function toggleGroup(key) {
  collapsedGroups[key] = !(collapsedGroups[key] === true);
  chrome.storage.local.set({ collapsedGroups });
  renderRules();
}

function groupToggleAll(platform, enable) {
  rules.forEach(r => { if (classifyPlatform(r.pattern) === platform) r.enabled = enable; });
  chrome.storage.local.set({ rules });
  showToast((enable ? '已启用' : '已停用') + ' ' + platform + ' 全部规则');
  renderRules();
}

// ======================== Events ========================

function bindEvents() {
  // Global enable toggle
  document.getElementById('enableToggle').addEventListener('change', (e) => {
    enabled = e.target.checked;
    chrome.storage.local.set({ enabled });
    showToast(enabled ? 'Interceptor enabled' : 'Interceptor disabled');
  });

  // Add rule
  document.getElementById('addRuleBtn').addEventListener('click', () => openModal(-1));

  // Search
  const searchEl = document.getElementById('searchInput');
  if (searchEl) searchEl.addEventListener('input', () => renderRules());

  // Event delegation for edit / delete / toggle inside rule list (avoids CSP issues with inline handlers)
  document.getElementById('ruleList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'toggle-group')      { toggleGroup(btn.dataset.key); return; }
    if (action === 'group-toggle-all')  { groupToggleAll(btn.dataset.platform, btn.dataset.enable === '1'); return; }
    const index  = parseInt(btn.dataset.index, 10);
    if (action === 'edit')      openModal(index);
    if (action === 'duplicate') duplicateRule(index);
    if (action === 'delete')    deleteRule(index);
  });

  document.getElementById('ruleList').addEventListener('change', (e) => {
    const cb = e.target.closest('[data-action="toggle"]');
    if (!cb) return;
    toggleRule(parseInt(cb.dataset.index, 10), cb.checked);
  });

  // Modal close / save
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('saveRuleBtn').addEventListener('click', saveRule);

  // Close modal by clicking backdrop
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal')) closeModal();
  });

  // Mode buttons (Static JSON / JS Function)
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateResponseMode(btn.dataset.mode);
    });
  });

  // Format JSON button
  document.getElementById('formatBtn').addEventListener('click', () => {
    const ta = document.getElementById('responseInput');
    try {
      ta.value = JSON.stringify(JSON.parse(ta.value), null, 2);
    } catch {
      showToast('Invalid JSON');
    }
  });

  // Inject to current tab (without page reload)
  document.getElementById('applyBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) { showToast('No active tab'); return; }

    const activeRules = rules.filter((r) => r.enabled !== false);

    try {
      // Set window.__txcs_rules__ in page context
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: (r) => { window.__txcs_rules__ = r; },
        args: [activeRules]
      });

      // Inline injection: avoids chrome-extension:// URL that page SDKs try to fetch
      const src = await (await fetch(chrome.runtime.getURL('injected.js'))).text();
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: (code) => { (0, eval)(code); },
        args: [src]
      });

      showToast(`Injected ${activeRules.length} rule(s) into tab`);
    } catch (err) {
      showToast('Injection failed: ' + err.message);
    }
  });

  document.getElementById('patternInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveRule();
  });

  // ── Export rules ────────────────────────────────────────────────────────
  document.getElementById('exportBtn').addEventListener('click', () => {
    const payload = { version: 1, rules };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'txcs-interceptor-rules.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${rules.length} rule(s)`);
  });

  // ── Import rules ────────────────────────────────────────────────────────
  document.getElementById('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        // Support both {version,rules:[...]} wrapper and plain array
        const imported = Array.isArray(parsed) ? parsed
          : (Array.isArray(parsed.rules) ? parsed.rules : null);
        if (!imported) throw new Error('Invalid format');

        // Merge: skip duplicates (same pattern)
        const existing = new Set(rules.map((r) => r.pattern));
        const added    = imported.filter((r) => !existing.has(r.pattern));
        const skipped  = imported.length - added.length;

        rules = [...rules, ...added];
        chrome.storage.local.set({ rules }, () => {
          renderRules();
          showToast(
            `Imported ${added.length} rule(s)` +
            (skipped ? `, skipped ${skipped} duplicate(s)` : '')
          );
          injectRulesToActiveTab();
        });
      } catch (err) {
        showToast('Import failed: ' + err.message);
      }
      // Reset so the same file can be re-imported
      e.target.value = '';
    };
    reader.readAsText(file);
  });
}

// ======================== Modal ========================

function openModal(index) {
  editingIndex = index;
  document.getElementById('modalTitle').textContent = index === -1 ? 'Add Rule' : 'Edit Rule';

  const rule = index >= 0 ? rules[index] : null;
  document.getElementById('aliasInput').value        = rule ? (rule.alias || '') : '';
  document.getElementById('patternInput').value      = rule ? rule.pattern     : '';
  document.getElementById('bodyPatternInput').value  = rule ? (rule.bodyPattern || '') : '';
  document.getElementById('cookiePatternInput').value = rule ? (rule.cookiePattern || '') : '';
  document.getElementById('statusInput').value       = rule ? rule.status      : 200;
  document.getElementById('contentTypeSelect').value = rule ? rule.contentType : 'application/json';
  document.getElementById('responseInput').value     = rule ? rule.response    : '';

  // Restore response mode
  const rt = rule ? (rule.responseType || 'static') : 'static';
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === rt);
  });
  updateResponseMode(rt);

  // Expand popup height so the fixed-position modal is fully visible
  document.body.style.height = '560px';
  document.getElementById('modal').classList.remove('hidden');
  requestAnimationFrame(() => document.getElementById('patternInput').focus());
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  document.body.style.height = '';
  editingIndex = -1;
}

function saveRule() {
  const pattern = document.getElementById('patternInput').value.trim();
  if (!pattern) {
    document.getElementById('patternInput').focus();
    showToast('URL pattern is required');
    return;
  }

  const rule = {
    alias:        document.getElementById('aliasInput').value.trim(),
    pattern:      pattern,
    bodyPattern:  document.getElementById('bodyPatternInput').value.trim() || '',
    cookiePattern: document.getElementById('cookiePatternInput').value.trim() || '',
    status:       parseInt(document.getElementById('statusInput').value, 10) || 200,
    contentType:  document.getElementById('contentTypeSelect').value,
    responseType: (document.querySelector('.mode-btn.active') || {}).dataset?.mode || 'static',
    response:     document.getElementById('responseInput').value,
    enabled:      editingIndex >= 0 ? rules[editingIndex].enabled : true
  };

  if (editingIndex >= 0) {
    rules[editingIndex] = rule;
  } else {
    rules.push(rule);
  }

  chrome.storage.local.set({ rules }, () => {
    renderRules();
    closeModal();
    showToast(editingIndex >= 0 ? 'Rule updated' : 'Rule added');
    injectRulesToActiveTab();
  });
}

// ======================== Rule actions ========================

function duplicateRule(index) {
  const src      = rules[index];
  const copy     = Object.assign({}, src);
  const base     = (src.alias || src.pattern || 'Rule').trim();
  // Strip any existing " (copy N)" suffix to avoid stacking
  const stripped = base.replace(/ \(copy(?: \d+)?\)$/, '');
  // Find next available alias
  const taken    = new Set(rules.map((r) => (r.alias || r.pattern || '').trim()));
  let alias      = stripped + ' (copy)';
  if (taken.has(alias)) {
    let n = 2;
    while (taken.has(stripped + ` (copy ${n})`)) n++;
    alias = stripped + ` (copy ${n})`;
  }
  copy.alias = alias;
  rules.splice(index + 1, 0, copy); // insert right after the original
  chrome.storage.local.set({ rules }, () => {
    renderRules();
    showToast('Rule duplicated');
    injectRulesToActiveTab();
  });
}

function deleteRule(index) {
  if (!confirm('Delete this rule?')) return;
  rules.splice(index, 1);
  chrome.storage.local.set({ rules }, () => {
    renderRules();
    showToast('Rule deleted');
    injectRulesToActiveTab();
  });
}

function toggleRule(index, checked) {
  rules[index].enabled = checked;
  chrome.storage.local.set({ rules }, () => {
    renderRules();
    injectRulesToActiveTab();
  });
}

// ======================== Helpers ========================

/**
 * Directly push the current rules into the active tab's page context.
 * This bypasses the storage.onChanged → content.js → background chain,
 * which silently breaks when the extension context is invalidated.
 */
async function injectRulesToActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;
    const activeRules = rules.filter((r) => r.enabled !== false);
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: (r) => { window.__txcs_rules__ = r; },
      args: [activeRules]
    });
    // Inline injection: avoids chrome-extension:// URL that page SDKs try to fetch
    const src = await (await fetch(chrome.runtime.getURL('injected.js'))).text();
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: (code) => { (0, eval)(code); },
      args: [src]
    });
  } catch (e) {
    // Non-injectable tabs (chrome://, PDF, etc.) — silently ignore
  }
}

// ======================== Response mode ========================

function updateResponseMode(mode) {
  const ta     = document.getElementById('responseInput');
  const fmtBtn = document.getElementById('formatBtn');
  const hint   = document.getElementById('fnHint');
  if (mode === 'function') {
    ta.placeholder = [
      '// Available: Date, Math, JSON, parseInt, parseFloat, Array, Object ...',
      '// Return a string or an object (objects are auto-serialised).',
      '',
      'return JSON.stringify({',
      '  code: 0,',
      '  time: Date.now(),',
      '  date: new Date().toISOString(),',
      '  rand: Math.floor(Math.random() * 100)',
      '});'
    ].join('\n');
    fmtBtn.style.display = 'none';
    if (hint) hint.style.display = 'block';
  } else {
    ta.placeholder = '{"code": 0, "data": {}, "message": "ok"}';
    fmtBtn.style.display = '';
    if (hint) hint.style.display = 'none';
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let toastTimer = null;
function showToast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}
