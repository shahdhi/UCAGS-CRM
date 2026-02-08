/**
 * WhatsApp Side Panel (Popup that feels embedded)
 *
 * WhatsApp Web cannot be embedded in an iframe due to X-Frame-Options/CSP.
 * The most reliable approach in a normal web app is a popup window.
 *
 * This implementation makes the popup *feel like an in-CRM side panel* by:
 * - docking it to the right side of the screen
 * - keeping a single reusable window (focus instead of opening many)
 * - re-docking/resizing when requested
 *
 * Notes / limitations:
 * - Some browsers ignore "chrome" flags (location/toolbar). We still try.
 * - Popups require a user gesture at least once (browser policy).
 */

(function () {
  'use strict';

  const WHATSAPP_WEB_URL = 'https://web.whatsapp.com/';
  const WINDOW_NAME = 'ucags_whatsapp_web_panel';

  // Tweak these to your preference
  const DEFAULT_DOCK_WIDTH_PX = 420; // panel width
  const DOCK_GAP_PX = 8;            // gap from CRM window edge
  const DOCK_WIDTH_STORAGE_KEY = 'wa_panel_width_px';

  function getDockWidthPx() {
    try {
      const v = parseInt(localStorage.getItem(DOCK_WIDTH_STORAGE_KEY) || '', 10);
      if (Number.isFinite(v) && v >= 320 && v <= 900) return v;
    } catch {}
    return DEFAULT_DOCK_WIDTH_PX;
  }

  let waWindow = null;

  function isWindowOpen(w) {
    try {
      return !!w && !w.closed;
    } catch {
      return false;
    }
  }

  function getDockRect() {
    // Prefer docking relative to the current CRM browser window so it feels "embedded"
    // even when the CRM isn't maximized.
    //
    // window.screenX/screenY give the top-left of the outer browser window on most browsers.
    // window.outerWidth/outerHeight include the browser chrome.
    const baseLeft = Number.isFinite(window.screenX) ? window.screenX : 0;
    const baseTop = Number.isFinite(window.screenY) ? window.screenY : 0;
    const baseW = Number.isFinite(window.outerWidth) ? window.outerWidth : (window.innerWidth + 16);
    const baseH = Number.isFinite(window.outerHeight) ? window.outerHeight : (window.innerHeight + 88);

    // Use available screen area (respects taskbar/dock)
    const availW = window.screen.availWidth || window.screen.width || 1200;
    const availH = window.screen.availHeight || window.screen.height || 800;

    // Clamp width so it never exceeds screen
    const desiredWidth = getDockWidthPx();
    const width = Math.max(320, Math.min(desiredWidth, availW - 50));

    // Height: match CRM outer height as closely as possible, but keep within available area.
    const height = Math.max(500, Math.min(baseH - DOCK_GAP_PX * 2, availH - DOCK_GAP_PX * 2));

    // Dock to the right edge of the CRM window
    let left = Math.round(baseLeft + baseW - width - DOCK_GAP_PX);
    let top = Math.round(baseTop + DOCK_GAP_PX);

    // Safety clamps
    left = Math.max(0, Math.min(left, availW - width));
    top = Math.max(0, Math.min(top, availH - height));

    return { width, height, left, top };
  }

  function tryDockWindow(w) {
    if (!isWindowOpen(w)) return false;

    const { width, height, left, top } = getDockRect();

    // moveTo/resizeTo only works reliably for windows opened by window.open
    try { w.resizeTo(width, height); } catch {}
    try { w.moveTo(left, top); } catch {}
    try { w.focus(); } catch {}
    return true;
  }

  function openDockedPopup() {
    const { width, height, left, top } = getDockRect();

    // Try to reduce how "popup-ish" it feels (not guaranteed across browsers)
    const features = [
      'popup=yes',
      'resizable=yes',
      'scrollbars=yes',
      'menubar=no',
      'toolbar=no',
      'location=no',
      'status=no',
      'directories=no',
      `width=${width}`,
      `height=${height}`,
      `left=${left}`,
      `top=${top}`
    ].join(',');

    waWindow = window.open(WHATSAPP_WEB_URL, WINDOW_NAME, features);
    if (!waWindow) return { opened: false, error: 'Popup blocked' };

    // Re-dock after open (some browsers ignore initial geometry)
    setTimeout(() => tryDockWindow(waWindow), 250);
    setTimeout(() => tryDockWindow(waWindow), 1200);

    return { opened: true, reused: false };
  }

  function focusOrOpenDocked() {
    if (isWindowOpen(waWindow)) {
      // Bring it back and re-dock in case the user moved it
      tryDockWindow(waWindow);
      return { opened: true, reused: true };
    }

    // If page refreshed, try to reuse by name (best-effort)
    // NOTE: window.open('', name) can CREATE a new about:blank window if none exists.
    // We handle that by forcing navigation to WhatsApp Web when needed.
    try {
      const existing = window.open('', WINDOW_NAME);
      if (isWindowOpen(existing)) {
        waWindow = existing;

        // If it's a blank window (newly created or navigated away), load WhatsApp Web.
        try {
          const href = String(waWindow.location && waWindow.location.href ? waWindow.location.href : '');
          if (!href || href === 'about:blank') {
            waWindow.location.replace(WHATSAPP_WEB_URL);
          }
        } catch {
          // Cross-origin access might throw; in that case do nothing.
          // If the window is on a non-accessible origin but not WhatsApp, the user can re-open.
        }

        tryDockWindow(waWindow);
        return { opened: true, reused: true };
      }
    } catch {
      // ignore
    }

    return openDockedPopup();
  }

  function renderPanel() {
    const root = document.getElementById('whatsappView');
    if (!root) return;

    root.innerHTML = `
      <div class="page-header">
        <div>
          <h1><i class="fab fa-whatsapp" style="color:#25D366;"></i> WhatsApp</h1>
          <p style="max-width: 980px;">
            WhatsApp can’t run inside the CRM as an iframe. Instead we open <strong>WhatsApp Web</strong> in a
            <strong>docked side-panel window</strong> that stays logged-in and feels like part of this app.
          </p>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: 1fr; gap: 14px; max-width: 980px;">
        <div style="background:#fff; border:1px solid #eee; border-radius: 12px; padding: 16px;">
          <div style="display:flex; align-items:center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
            <div>
              <div style="font-weight:800;">WhatsApp Side Panel</div>
              <div style="color:#666; font-size: 13px; margin-top:4px;">
                Click once to open. After that, it will be reused and can be focused anytime.
              </div>
            </div>

            <div style="display:flex; gap: 10px; align-items:center; flex-wrap: wrap;">
              <button id="waOpenBtn" class="btn btn-success" type="button">
                <i class="fab fa-whatsapp"></i> Open Panel
              </button>
              <button id="waDockBtn" class="btn btn-secondary" type="button">
                <i class="fas fa-columns"></i> Re-dock
              </button>
              <button id="waWidenBtn" class="btn btn-secondary" type="button" title="Increase panel width">
                <i class="fas fa-plus"></i>
              </button>
              <button id="waNarrowBtn" class="btn btn-secondary" type="button" title="Decrease panel width">
                <i class="fas fa-minus"></i>
              </button>
              <button id="waCloseBtn" class="btn btn-secondary" type="button">
                <i class="fas fa-times"></i> Close
              </button>
            </div>
          </div>

          <div id="waStatus" style="margin-top: 14px; padding: 10px 12px; border-radius: 10px; background:#f9fafb; border:1px solid #eef1f6; color:#374151; font-size: 13px;">
            Status: not opened.
          </div>

          <div style="margin-top: 14px; color:#666; font-size: 13px; line-height: 1.6;">
            <div style="font-weight:800; color:#111; margin-bottom:6px;">Smooth flow tips</div>
            <ul style="margin: 0; padding-left: 18px;">
              <li>Open the panel once and scan QR (first time only).</li>
              <li>Keep the panel open while working in CRM (it will stay logged in).</li>
              <li>If you moved/resized it, click <strong>Re-dock</strong> to snap it back to the side.</li>
            </ul>
            <div style="margin-top:10px; color:#888;">
              If your browser blocks popups, allow popups for this CRM domain.
            </div>
          </div>
        </div>
      </div>
    `;

    const statusEl = document.getElementById('waStatus');
    const openBtn = document.getElementById('waOpenBtn');
    const dockBtn = document.getElementById('waDockBtn');
    const closeBtn = document.getElementById('waCloseBtn');
    const widenBtn = document.getElementById('waWidenBtn');
    const narrowBtn = document.getElementById('waNarrowBtn');

    function setStatus(text) {
      if (!statusEl) return;
      statusEl.textContent = text;
    }

    function updateStatus() {
      if (isWindowOpen(waWindow)) setStatus('Status: panel is open.');
      else setStatus('Status: not opened.');
    }

    if (openBtn) {
      openBtn.addEventListener('click', () => {
        const result = focusOrOpenDocked();
        if (!result.opened) {
          setStatus('Status: popup blocked. Please allow popups for this CRM site.');
          if (window.UI?.showToast) UI.showToast('Popup blocked. Please allow popups to open WhatsApp.', 'error');
          return;
        }
        setStatus(result.reused ? 'Status: focused existing panel.' : 'Status: opened panel. Link your device (QR) if needed.');
      });
    }

    if (dockBtn) {
      dockBtn.addEventListener('click', () => {
        if (!isWindowOpen(waWindow)) {
          const result = focusOrOpenDocked();
          if (!result.opened) {
            setStatus('Status: popup blocked. Please allow popups for this CRM site.');
            return;
          }
        }
        tryDockWindow(waWindow);
        setStatus('Status: re-docked panel.');
      });
    }

    function adjustWidth(delta) {
      try {
        const current = getDockWidthPx();
        const next = Math.max(320, Math.min(900, current + delta));
        localStorage.setItem(DOCK_WIDTH_STORAGE_KEY, String(next));
      } catch {}
      if (isWindowOpen(waWindow)) tryDockWindow(waWindow);
    }

    if (widenBtn) widenBtn.addEventListener('click', () => adjustWidth(+40));
    if (narrowBtn) narrowBtn.addEventListener('click', () => adjustWidth(-40));

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (isWindowOpen(waWindow)) {
          try { waWindow.close(); } catch {}
        }
        waWindow = null;
        updateStatus();
      });
    }

    updateStatus();

    const t = setInterval(() => {
      const page = (window.location.hash || '').replace('#', '');
      if (page !== 'whatsapp') {
        clearInterval(t);
        return;
      }
      updateStatus();
    }, 1000);
  }

  function bindAutoRedockOnce() {
    if (window.__waPanelAutoRedockBound) return;
    window.__waPanelAutoRedockBound = true;

    // Periodic re-dock to keep it pinned (some OS/window managers can drift)
    // Keep it gentle to avoid annoying the user if they intentionally moved it.
    setInterval(() => {
      if (!isWindowOpen(waWindow)) return;
      // Only snap when CRM is focused/visible to reduce surprises.
      if (document.visibilityState !== 'visible') return;
      tryDockWindow(waWindow);
    }, 2500);

    // If the CRM window resizes (user changes monitor, resizes browser), re-dock WA.
    window.addEventListener('resize', () => {
      if (isWindowOpen(waWindow)) {
        // Debounce a bit
        clearTimeout(window.__waPanelResizeT);
        window.__waPanelResizeT = setTimeout(() => tryDockWindow(waWindow), 120);
      }
    });

    // When returning to the CRM tab, snap WA back (helps if OS moved it).
    window.addEventListener('focus', () => {
      if (isWindowOpen(waWindow)) {
        setTimeout(() => tryDockWindow(waWindow), 80);
      }
    });
  }

  window.initWhatsAppPanelPage = function () {
    bindAutoRedockOnce();
    renderPanel();
  };

  // Utility for other pages to open WhatsApp (optional)
  // Convenience helper for inline onclick usage across the app
  // Returns { opened: boolean, reused?: boolean, error?: string }
  window.openWhatsAppSidePanel = function () {
    return focusOrOpenDocked();
  };

  window.WhatsAppPanel = {
    open: () => focusOrOpenDocked(),
    redock: () => tryDockWindow(waWindow),
    isOpen: () => isWindowOpen(waWindow)
  };
})();
