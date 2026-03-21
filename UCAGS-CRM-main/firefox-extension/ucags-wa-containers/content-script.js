/*
 * Content script bridge between the CRM page and the extension background.
 *
 * Page -> content-script: window.postMessage({type:'UCAGS_WA_CONTAINERS_*', ...}, '*')
 * content-script -> page: window.postMessage({type:'UCAGS_WA_CONTAINERS_*_RESULT', ...}, '*')
 */

(function () {
  'use strict';

  // Basic allow-list to reduce exposure. Adjust this list to your deployed CRM domains.
  const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://ucags-crm.vercel.app'
  ];

  // Optional: set this to true to allow *any* https origin (simpler, less strict).
  const ALLOW_ANY_HTTPS_ORIGIN = false;

  function isAllowedOrigin(origin) {
    if (!origin) return false;
    if (ALLOWED_ORIGINS.includes(origin)) return true;

    if (ALLOW_ANY_HTTPS_ORIGIN && origin.startsWith('https://')) return true;

    return false;
  }

  window.addEventListener('message', async (event) => {
    try {
      if (!event || !event.data || typeof event.data !== 'object') return;
      if (event.source !== window) return;

      const origin = event.origin || (window.location ? window.location.origin : '');
      if (!isAllowedOrigin(origin)) return;

      const msg = event.data;

      if (msg.type === 'UCAGS_WA_CONTAINERS_PING') {
        const resp = await browser.runtime.sendMessage({ type: 'UCAGS_WA_CONTAINERS_PING' });
        window.postMessage({ ...resp, requestId: msg.requestId || null }, origin);
      }

      if (msg.type === 'UCAGS_WA_CONTAINERS_ENSURE') {
        const resp = await browser.runtime.sendMessage({
          type: 'UCAGS_WA_CONTAINERS_ENSURE',
          names: msg.names
        });
        window.postMessage({ ...resp, requestId: msg.requestId || null }, origin);
      }
    } catch (e) {
      // best-effort error reporting
      try {
        const origin = event.origin || '*';
        window.postMessage({
          ok: false,
          type: 'UCAGS_WA_CONTAINERS_ERROR',
          error: e && e.message ? e.message : String(e),
          requestId: (event.data && event.data.requestId) ? event.data.requestId : null
        }, origin);
      } catch {}
    }
  }, false);
})();
