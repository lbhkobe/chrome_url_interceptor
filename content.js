// content.js - Runs at document_start in the ISOLATED content-script world.
//
// The actual fetch/XHR interceptor lives in injected.js, which the manifest
// loads as a MAIN-world content script at document_start (running BEFORE the
// page's own scripts — including JD's SGM SDK — and bypassing the page CSP).
//
// This isolated-world script has the one thing injected.js lacks: access to
// chrome.storage. Its sole job is to hand the rules across the world boundary.
// The two worlds share the same DOM, so we publish the rules onto a data
// attribute on <html>; injected.js reads it lazily on every request.

const _ATTR = 'data-txcs-rules';

function publishRules() {
  chrome.storage.local.get(['rules', 'enabled'], (result) => {
    if (chrome.runtime.lastError) {
      console.error('[URL Interceptor CS] storage error:', chrome.runtime.lastError);
      return;
    }
    const enabled = result.enabled !== false;
    const rules = enabled
      ? (result.rules || []).filter((r) => r.enabled !== false)
      : [];
    try {
      document.documentElement.setAttribute(_ATTR, JSON.stringify(rules));
      console.log('[URL Interceptor CS] published', rules.length,
        'rule(s) to <html>[' + _ATTR + '] (enabled=' + enabled + ')');
    } catch (e) {
      console.error('[URL Interceptor CS] failed to publish rules:', e);
    }
  });
}

// Publish immediately at document_start so rules are present before the first
// intercepted request fires.
publishRules();

// Re-publish once the DOM is ready, in case <html> was replaced during parsing.
document.addEventListener('DOMContentLoaded', publishRules);

// Live-update: when the user edits rules in the popup, re-publish so the page
// picks them up without a reload.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.rules || changes.enabled)) {
    publishRules();
  }
});
