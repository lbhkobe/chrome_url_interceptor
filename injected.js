/**
 * injected.js - Runs in PAGE context (world: MAIN)
 * Intercepts fetch and XMLHttpRequest based on rules stored in window.__txcs_rules__
 */
(function () {
  // Avoid double-injection; support hot-reload of rules
  if (window.__txcs_interceptor_injected__) {
    return;
  }
  window.__txcs_interceptor_injected__ = true;

  function getRules() {
    return window.__txcs_rules__ || [];
  }

  /**
   * Normalize a URL for matching:
   * - URL-decode percent-encoded characters so patterns like %3B and ; both match
   * - Keep the full URL including query string
   */
  function normalizeUrl(url) {
    try { return decodeURIComponent(url); } catch (e) { return url; }
  }

  /**
   * Match a URL (+ optional request body) against a rule pattern.
   * Pattern types (auto-detected):
   *   /regex/    → RegExp test
   *   *glob*     → wildcard, * matches anything
   *   plain text → substring match (path-only when no '?' in pattern)
   *
   * For POST requests whose params are in the body, the body string is
   * appended to the URL path as "?{body}" so wildcard patterns like
   * *olap*code=1780* work regardless of whether params are in URL or body.
   */
  function matchUrl(pattern, rawUrl, bodyStr) {
    try {
      var url     = normalizeUrl(rawUrl);
      var pat     = normalizeUrl(pattern.trim());
      var urlPath = url.split('?')[0];

      // Virtual URL = path + '?' + body  (used when body contains the params)
      var urlWithBody = bodyStr ? urlPath + '?' + bodyStr : null;

      // ── Regex mode:  /pattern/ ──────────────────────────────────────────
      if (pat.length > 2 && pat.charAt(0) === '/' && pat.charAt(pat.length - 1) === '/') {
        var rx = new RegExp(pat.slice(1, -1));
        return rx.test(url) || !!(urlWithBody && rx.test(urlWithBody));
      }

      // ── Wildcard mode ───────────────────────────────────────────────────
      if (pat.indexOf('*') !== -1) {
        var re = new RegExp(
          pat
            .replace(/[-+^${}()|[\]\\]/g, '\\$&')
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*')
        );
        return re.test(url) || !!(urlWithBody && re.test(urlWithBody));
      }

      // ── Plain substring match ───────────────────────────────────────────
      // No '?' in pattern → match path only (ignore URL query params)
      if (pat.indexOf('?') === -1) {
        if (urlPath.indexOf(pat) !== -1) return true;
        // Fallback: see if the pattern appears in the body
        return !!(bodyStr && bodyStr.indexOf(pat) !== -1);
      }

      // Pattern contains '?' → match full URL or virtual URL-with-body
      return url.indexOf(pat) !== -1 || !!(urlWithBody && urlWithBody.indexOf(pat) !== -1);
    } catch (e) {
      return false;
    }
  }

  function findRule(url, bodyStr) {
    var rules = getRules();
    // Debug: log every URL from the target host to see exactly what paths are checked
    if (url.indexOf('ascp-dc.tmall.com') !== -1) {
      console.log('[URL Interceptor] 🔎 ascp-dc URL in override:', url.substring(0, 200),
        bodyStr ? '| body: ' + bodyStr.substring(0, 100) : '');
    }
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];

      // Step 1: URL pattern must match
      if (!matchUrl(rule.pattern, url, bodyStr)) continue;

      // Step 2: if bodyPattern is set, ALL non-empty lines must appear in the body
      if (rule.bodyPattern && rule.bodyPattern.length > 0) {
        if (!bodyStr) continue;  // body required but not present
        var lines = rule.bodyPattern.split('\n');
        var allMatch = true;
        for (var j = 0; j < lines.length; j++) {
          var line = lines[j].trim();
          if (!line) continue;  // skip empty lines
          if (bodyStr.indexOf(line) === -1) { allMatch = false; break; }
        }
        if (!allMatch) continue;
      }

      return rule;
    }
    return null;
  }

  // Diagnostic: log the first 3 unique hostnames seen via fetch/XHR so we can
  // verify our override is actually being called. Remove after debugging.
  var _diagSeen = {};
  var _diagCount = 0;
  function diagLog(url) {
    if (_diagCount >= 30) return;
    try {
      var host = new URL(url).hostname;
      if (_diagSeen[host]) return;
      _diagSeen[host] = true;
      _diagCount++;
      console.log('[URL Interceptor] 🔍 override active, saw request to:', host);
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ */
  /* Override fetch                                                        */
  /* ------------------------------------------------------------------ */
  var _origFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string'
      ? input
      : (input && input.url) ? input.url : String(input);

    // Extract request body as a plain string so we can match against body params
    // (many APIs send params as POST body, which DevTools shows as URL params)
    var bodyStr = '';
    if (init && init.body != null) {
      if (typeof init.body === 'string') {
        bodyStr = init.body;
      } else if (typeof URLSearchParams !== 'undefined' && init.body instanceof URLSearchParams) {
        bodyStr = init.body.toString();
      }
    }

    diagLog(url);
    var rule = findRule(url, bodyStr);
    if (rule) {
      console.log('[URL Interceptor] ✅ fetch intercepted:', url, '→ status', rule.status || 200);
      return Promise.resolve(
        new Response(rule.response || '', {
          status: rule.status || 200,
          statusText: 'OK',
          headers: { 'Content-Type': rule.contentType || 'application/json' }
        })
      );
    }
    return _origFetch.apply(this, arguments);
  };

  /* ------------------------------------------------------------------ */
  /* Override XMLHttpRequest                                               */
  /* ------------------------------------------------------------------ */
  var _origOpen = XMLHttpRequest.prototype.open;
  var _origSend = XMLHttpRequest.prototype.send;
  var _xhrMap = new WeakMap();

  XMLHttpRequest.prototype.open = function (method, url) {
    diagLog(String(url));
    var rule = findRule(String(url));  // body matched later in .send()
    if (rule) {
      _xhrMap.set(this, { rule: rule, url: String(url) });
    } else {
      _xhrMap.delete(this);
      // Store URL so .send() can re-check with body
      _xhrMap.set(this, { rule: null, url: String(url) });
    }
    return _origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    var data = _xhrMap.get(this);
    // If open() found no match, try again with body
    if (data && !data.rule && body != null) {
      var bodyStr = typeof body === 'string' ? body : '';
      if (bodyStr) {
        var recheck = findRule(data.url, bodyStr);
        if (recheck) data = { rule: recheck, url: data.url };
      }
    }
    if (data && data.rule) {
      var rule = data.rule;
      var xhr = this;
      console.log('[URL Interceptor] ✅ XHR intercepted:', data.url, '→ status', rule.status || 200);

      setTimeout(function () {
        var def = function (prop, val) {
          try {
            Object.defineProperty(xhr, prop, { value: val, configurable: true, writable: true });
          } catch (e) { /* read-only in some envs */ }
        };

        def('readyState',   4);
        def('status',       rule.status || 200);
        def('statusText',   'OK');
        def('responseText', rule.response || '');
        def('response',     rule.response || '');
        def('responseURL',  data.url);

        try { if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange(new Event('readystatechange')); } catch (e) {}
        try { if (typeof xhr.onload === 'function') xhr.onload(new ProgressEvent('load')); } catch (e) {}
        try { xhr.dispatchEvent(new Event('readystatechange')); } catch (e) {}
        try { xhr.dispatchEvent(new ProgressEvent('load')); } catch (e) {}
        try { xhr.dispatchEvent(new ProgressEvent('loadend')); } catch (e) {}
      }, 0);
      return;
    }
    return _origSend.apply(this, arguments);
  };

  console.log('[URL Interceptor] ✅ Initialized with', getRules().length, 'rule(s).',
    getRules().map(function(r){ return r.pattern; }));
})();
