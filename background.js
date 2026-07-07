// background.js - Service Worker

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({ enabled: true, rules: [] });
  }
});

// ── In-memory rule cache ──────────────────────────────────────────────────────
// Eliminates the async chrome.storage.local.get() latency inside
// webNavigation.onCommitted, shaving off ~2-5 ms per navigation event.
let _cachedRules   = [];
let _cachedEnabled = true;

function _refreshCache() {
  chrome.storage.local.get(['rules', 'enabled'], (result) => {
    _cachedEnabled = result.enabled !== false;
    _cachedRules   = (_cachedEnabled ? (result.rules || []) : [])
      .filter((r) => r.enabled !== false);
    syncDNRRules();   // keep network-layer rules in sync with storage
  });
}
_refreshCache();                                // populate on service-worker start
chrome.storage.onChanged.addListener(_refreshCache); // keep cache fresh

// ── declarativeNetRequest: network-layer interception ─────────────────────────
// A JS-level fetch/XHR override cannot win the timing race against page
// monitoring SDKs (e.g. JD's SGM) inside CSP-locked iframes — the SDK captures
// the native XHR reference before our script runs. declarativeNetRequest works
// at the NETWORK layer, before any page script executes, so it is immune to
// CSP, SGM, iframe nesting and injection timing. We mirror the storage rules
// into dynamic DNR rules that redirect a matching request to a data: URL
// carrying the mock response body.
//
// Only URL-only rules are mirrored here. Rules that use BODY CONTAINS to
// discriminate between different responses on the SAME url are left to the JS
// interceptor, because DNR cannot match on request body.
function _dnrComputeBody(rule) {
  if (rule.responseType === 'function') {
    try {
      // new Function is blocked by the MV3 service-worker CSP; if it throws we
      // simply fall back to the raw response text.
      const fn = new Function(rule.response || 'return "";');
      const r = fn();
      if (r == null) return '';
      return typeof r === 'string' ? r : JSON.stringify(r);
    } catch (e) {
      return rule.response || '';
    }
  }
  return rule.response || '';
}

function _dnrBuildCondition(pattern) {
  const pat = (pattern || '').trim();
  if (!pat) return null;
  // regex mode: /.../  → DNR regexFilter
  if (pat.length > 2 && pat.charAt(0) === '/' && pat.charAt(pat.length - 1) === '/') {
    return { regexFilter: pat.slice(1, -1) };
  }
  // wildcard '*' and plain substring both map onto DNR urlFilter
  return { urlFilter: pat };
}

async function syncDNRRules() {
  try {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existing.map((r) => r.id);

    const addRules = [];
    let id = 1;
    if (_cachedEnabled) {
      for (const rule of _cachedRules) {
        // Skip body-discriminated rules — DNR can't match request bodies.
        if (rule.bodyPattern && rule.bodyPattern.trim()) continue;
        const cond = _dnrBuildCondition(rule.pattern);
        if (!cond) continue;
        cond.resourceTypes = ['xmlhttprequest'];
        const ct   = rule.contentType || 'application/json';
        const body = _dnrComputeBody(rule);
        addRules.push({
          id: id++,
          priority: 1,
          action: {
            type: 'redirect',
            redirect: { url: 'data:' + ct + ';charset=utf-8,' + encodeURIComponent(body) }
          },
          condition: cond
        });
      }
    }
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
    console.log('[URL Interceptor BG] DNR synced:', addRules.length, 'network rule(s).');
  } catch (e) {
    console.error('[URL Interceptor BG] DNR sync failed:', e);
  }
}

// Cache injected.js source so it can be injected inline (avoids associating the
// script with a chrome-extension:// URL, which page monitoring SDKs try to fetch
// and log errors for when the extension is invalidated).
let _injectedSrc = null;
async function getInjectedSrc() {
  if (!_injectedSrc) {
    const resp = await fetch(chrome.runtime.getURL('injected.js'));
    _injectedSrc = await resp.text();
  }
  return _injectedSrc;
}

// ── Proactive early injection via webNavigation ──────────────────────────────
// webNavigation.onCommitted fires as early as possible when a navigation is
// committed, before page scripts run. We inject immediately here to beat any
// SDK that captures window.fetch at module initialization time.
chrome.webNavigation.onCommitted.addListener(async (details) => {
  try {
    if (!_cachedEnabled) return;
    // Use cached rules — no storage I/O, fastest possible injection
    await doInject(details.tabId, details.frameId, _cachedRules);
  } catch (e) {
    // Ignore non-injectable frames (chrome://, PDF, etc.)
  }
});

// ── Helper: inject rules + interceptor into a specific tab / frame ───────────
async function doInject(tabId, frameId, rules) {
  const target = {
    tabId,
    // frameId 0 = main frame; if frameId provided, inject into that specific frame.
    // allFrames: true ensures iframes are also covered.
    allFrames: true
  };

  // Step 1: set window.__txcs_rules__ in page context
  await chrome.scripting.executeScript({
    target,
    world: 'MAIN',
    injectImmediately: true,   // inject as early as possible, don't wait for idle
    func: (r) => { window.__txcs_rules__ = r; },
    args: [rules]
  });

  // Step 2: inject interceptor as inline code (no chrome-extension:// URL in page)
  const src = await getInjectedSrc();
  await chrome.scripting.executeScript({
    target,
    world: 'MAIN',
    injectImmediately: true,
    func: (code) => { (0, eval)(code); },
    args: [src]
  });
}

// ── Message handler (from content.js and popup.js) ────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Content script requests injection (fallback for pages already open when
  // the extension is installed, and for storage.onChanged rule updates).
  if (message.type === 'INJECT_RULES') {
    const tabId = sender.tab && sender.tab.id;
    if (!tabId) { sendResponse({ ok: false, reason: 'no tabId' }); return false; }

    doInject(tabId, 0, message.rules || [])
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        console.debug('[URL Interceptor] injection skipped for tab', tabId, '—', err.message);
        sendResponse({ ok: false, reason: err.message });
      });

    return true; // keep channel open for async sendResponse
  }

  // ── Storage helpers used by popup ─────────────────────────────────────────
  if (message.type === 'GET_RULES') {
    chrome.storage.local.get(['rules', 'enabled'], sendResponse);
    return true;
  }

  if (message.type === 'SAVE_RULES') {
    chrome.storage.local.set({ rules: message.rules }, () => sendResponse({ success: true }));
    return true;
  }

  if (message.type === 'SET_ENABLED') {
    chrome.storage.local.set({ enabled: message.enabled }, () => sendResponse({ success: true }));
    return true;
  }
});
