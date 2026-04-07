// background.js - Service Worker

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({ enabled: true, rules: [] });
  }
});

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
    const result = await chrome.storage.local.get(['rules', 'enabled']);
    if (result.enabled === false) return;
    const rules = (result.rules || []).filter((r) => r.enabled !== false);
    // Always inject early (even with 0 rules) so window.fetch is wrapped before
    // any third-party SDK can capture a reference to the original.
    await doInject(details.tabId, details.frameId, rules);
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
