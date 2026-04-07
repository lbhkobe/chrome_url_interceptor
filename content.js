// content.js - Runs at document_start in content-script context
// Does NOT inject any inline <script> (would be blocked by page CSP).
// Instead, messages background.js to perform injection via chrome.scripting.executeScript,
// which bypasses the page's CSP as a programmatic extension injection.

(async function () {
  try {
    const result = await chrome.storage.local.get(['rules', 'enabled']);
    if (result.enabled === false) return;
    const rules = (result.rules || []).filter((r) => r.enabled !== false);
    // Send to background even if empty (background handles the set + inject)
    chrome.runtime.sendMessage({ type: 'INJECT_RULES', rules }).catch(() => {});
  } catch (e) {
    console.error('[URL Interceptor] init failed:', e);
  }
})();

// When user edits rules in the popup, push updated rules to the current page live
chrome.storage.onChanged.addListener(async () => {
  try {
    const result = await chrome.storage.local.get(['rules', 'enabled']);
    const rules = result.enabled === false
      ? []
      : (result.rules || []).filter((r) => r.enabled !== false);
    chrome.runtime.sendMessage({ type: 'INJECT_RULES', rules }).catch(() => {});
  } catch (e) {
    console.error('[URL Interceptor] rule update failed:', e);
  }
});
