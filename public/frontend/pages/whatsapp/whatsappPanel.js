/**
 * WhatsApp Panel
 *
 * Goal: Show WhatsApp inside the CRM while behaving like a normal browser window.
 * We do this by opening WhatsApp Web in a dedicated popup window and keeping it open.
 *
 * Notes:
 * - True embedded WebViews are not available in plain web apps; a popup is the closest
 *   cross-browser approach that preserves cookies/session like a normal browser.
 * - Many browsers block popups unless triggered by a user click. So the panel provides
 *   a primary button that the user clicks to open/link WhatsApp.
 */

(function () {
  'use strict';

  const WHATSAPP_WEB_URL = 'https://web.whatsapp.com/';

  let waWindow = null;

  function isWindowOpen(w) {
    try {
      return !!w && !w.closed;
    } catch {
      return false;
    }
  }

  function focusOrOpen() {
    // Reuse existing window if available
    if (isWindowOpen(waWindow)) {
      waWindow.focus();
      return { opened: true, reused: true };
    }

    // A popup window behaves like a normal browser window and can keep session.
    // Size/position tuned to feel like an embedded panel.
    const w = Math.min(1200, Math.floor(window.screen.availWidth * 0.9));
    const h = Math.min(900, Math.floor(window.screen.availHeight * 0.9));
    const left = Math.max(0, Math.floor((window.screen.availWidth - w) / 2));
    const top = Math.max(0, Math.floor((window.screen.availHeight - h) / 2));

    const features = [
      'popup=yes',
      'noopener=no',
      'noreferrer=no',
      `width=${w}`,
      `height=${h}`,
      `left=${left}`,
      `top=${top}`,
      'resizable=yes',
      'scrollbars=yes'
    ].join(',');

    waWindow = window.open(WHATSAPP_WEB_URL, 'ucags_whatsapp_web', features);

    if (!waWindow) {
      return { opened: false, error: 'Popup blocked' };
    }

    try { waWindow.focus(); } catch {}
    return { opened: true, reused: false };
  }

  function renderPanel() {
    const root = document.getElementById('whatsappView');
    if (!root) return;

    root.innerHTML = `
      <div class="page-header">
        <div>
          <h1><i class="fab fa-whatsapp" style="color:#25D366;"></i> Whatsapp</h1>
          <p style="max-width: 900px;">
            This opens <strong>WhatsApp Web</strong> in a dedicated in-app browser window (popup) so it behaves like a normal browser.
            Your session stays open once linked.
          </p>
        </div>
      </div>

      <div style="background:#fff; border:1px solid #eee; border-radius: 12px; padding: 16px; max-width: 980px;">
        <div style="display:flex; align-items:center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
          <div>
            <div style="font-weight:700;">Open WhatsApp Web</div>
            <div style="color:#666; font-size: 13px; margin-top:4px;">
              If the window is already open, we will just focus it.
            </div>
          </div>
          <div style="display:flex; gap: 10px; align-items:center;">
            <button id="waOpenBtn" class="btn btn-success" type="button">
              <i class="fas fa-external-link-alt"></i> Open / Focus
            </button>
            <button id="waCloseBtn" class="btn btn-secondary" type="button">
              <i class="fas fa-times"></i> Close Window
            </button>
          </div>
        </div>

        <div id="waStatus" style="margin-top: 14px; padding: 10px 12px; border-radius: 10px; background:#f9fafb; border:1px solid #eef1f6; color:#374151; font-size: 13px;">
          Status: not opened.
        </div>

        <div style="margin-top: 14px; color:#666; font-size: 13px; line-height: 1.5;">
          <div style="font-weight:700; color:#111; margin-bottom:6px;">Why a popup?</div>
          <ul style="margin: 0; padding-left: 18px;">
            <li>Many sites block being embedded in iframes for security reasons.</li>
            <li>A popup is a normal browser context, so WhatsApp works reliably and keeps cookies/session.</li>
          </ul>
        </div>
      </div>
    `;

    const statusEl = document.getElementById('waStatus');
    const openBtn = document.getElementById('waOpenBtn');
    const closeBtn = document.getElementById('waCloseBtn');

    function updateStatus() {
      if (!statusEl) return;
      if (isWindowOpen(waWindow)) {
        statusEl.textContent = 'Status: WhatsApp window is open.';
      } else {
        statusEl.textContent = 'Status: not opened.';
      }
    }

    if (openBtn) {
      openBtn.addEventListener('click', () => {
        const result = focusOrOpen();
        if (!result.opened) {
          statusEl.textContent = 'Status: popup blocked by the browser. Please allow popups for this CRM site.';
          if (window.UI?.showToast) UI.showToast('Popup blocked. Please allow popups to open WhatsApp.', 'error');
          return;
        }

        if (result.reused) {
          statusEl.textContent = 'Status: focused existing WhatsApp window.';
        } else {
          statusEl.textContent = 'Status: opened WhatsApp window. Link your device (QR) if needed.';
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (isWindowOpen(waWindow)) {
          try { waWindow.close(); } catch {}
        }
        waWindow = null;
        updateStatus();
      });
    }

    // Best-effort periodic status refresh while the view is visible
    updateStatus();
    const t = setInterval(() => {
      // if user navigated away, stop
      const page = (window.location.hash || '').replace('#', '');
      if (page !== 'whatsapp') {
        clearInterval(t);
        return;
      }
      updateStatus();
    }, 1000);
  }

  window.initWhatsAppPanelPage = function () {
    renderPanel();
  };

  // Utility for other pages to open WhatsApp (optional)
  window.WhatsAppPanel = {
    open: () => focusOrOpen()
  };
})();
