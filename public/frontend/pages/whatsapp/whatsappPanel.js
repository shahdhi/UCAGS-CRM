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

  const FIREFOX_CONTAINERS_ADDON_URL = 'https://addons.mozilla.org/en-US/firefox/addon/multi-account-containers/';
  // Set this to your signed XPI direct URL (recommended) or AMO unlisted listing page.
  // This is a default; the admin can override it in the UI and it will persist in localStorage.
  const DEFAULT_UCAGS_COMPANION_INSTALL_URL = '';
  const UCAGS_COMPANION_INSTALL_URL_STORAGE_KEY = 'ucags_companion_install_url';
  const DEFAULT_ADVISOR_CONTAINER_MAPPINGS = {
    'Advisor A': 'Advisor_A',
    'Advisor B': 'Advisor_B',
    'Advisor C': 'Advisor_C',
    'Advisor D': 'Advisor_D'
  };

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

  async function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (window.supabaseClient) {
      try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      } catch {}
    }
    return headers;
  }

  async function fetchContainerMappings() {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/whatsapp/containers/mappings', { headers });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.success) return json.mappings || {};
    } catch {}
    return {};
  }

  function callContainersExtension(type, payload = {}, timeoutMs = 8000) {
    return new Promise((resolve) => {
      const requestId = `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      let done = false;

      function finish(result) {
        if (done) return;
        done = true;
        window.removeEventListener('message', onMessage);
        clearTimeout(t);
        resolve(result);
      }

      function onMessage(event) {
        try {
          // Must match our page origin (content script posts back to origin)
          if (!event || event.source !== window) return;
          if (event.origin !== window.location.origin) return;

          const data = event.data;
          if (!data || typeof data !== 'object') return;
          if (data.requestId !== requestId) return;

          finish(data);
        } catch {
          // ignore
        }
      }

      window.addEventListener('message', onMessage);
      const t = setTimeout(() => finish({ ok: false, error: 'Extension timeout (not installed?)' }), timeoutMs);

      window.postMessage({ type, requestId, ...payload }, window.location.origin);
    });
  }

  async function pingContainersExtension() {
    const resp = await callContainersExtension('UCAGS_WA_CONTAINERS_PING', {}, 2500);
    return !!resp && resp.ok === true;
  }

  async function ensureAdvisorContainersViaExtension() {
    const names = Object.values(DEFAULT_ADVISOR_CONTAINER_MAPPINGS);
    const resp = await callContainersExtension('UCAGS_WA_CONTAINERS_ENSURE', { names }, 10000);
    return resp;
  }

  async function saveDefaultContainerMappings() {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/whatsapp/containers/setup-default', {
      method: 'POST',
      headers
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.success) {
      throw new Error(json?.error || 'Failed to save mappings');
    }
    return json;
  }

  function buildFirefoxContainerUrl(containerName) {
    const url = `https://web.whatsapp.com`;
    return `firefox-container://open?url=${encodeURIComponent(url)}&container=${encodeURIComponent(containerName)}`;
  }

  function renderAdvisorButtons(mappings) {
    const advisors = Object.keys(DEFAULT_ADVISOR_CONTAINER_MAPPINGS);
    return `
      <div style="background:#fff; border:1px solid #eee; border-radius: 12px; padding: 16px;">
        <div style="display:flex; align-items:center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
          <div>
            <div style="font-weight:800;">Per-advisor WhatsApp (Firefox Containers)</div>
            <div style="color:#666; font-size: 13px; margin-top:4px;">
              Each advisor opens WhatsApp Web in their own Firefox Container (separate login sessions).
            </div>
          </div>
        </div>

        <div style="margin-top: 12px; display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px;">
          ${advisors.map(a => {
            const containerName = mappings?.[a] || DEFAULT_ADVISOR_CONTAINER_MAPPINGS[a];
            const href = buildFirefoxContainerUrl(containerName);
            return `
              <div style="border:1px solid #f0f0f0; border-radius: 10px; padding: 12px;">
                <div style="font-weight:800; margin-bottom: 8px;">${a}</div>
                <div style="font-size:12px; color:#6b7280; margin-bottom: 10px;">Container: <code>${containerName}</code></div>
                <a class="btn btn-success" href="${href}" target="_blank" rel="noopener">
                  <i class="fab fa-whatsapp"></i> Open WhatsApp
                </a>
              </div>
            `;
          }).join('')}
        </div>

        <div style="margin-top: 12px; font-size: 12px; color:#6b7280; line-height: 1.5;">
          Note: These links work only in <strong>Firefox</strong> with the <strong>Multi-Account Containers</strong> add-on installed.
          <br />
          Auto-create requires the companion extension in this repo: <code>firefox-extension/ucags-wa-containers</code>
          (load it via <strong>about:debugging</strong> → <strong>This Firefox</strong> → <strong>Load Temporary Add-on…</strong>).
        </div>
      </div>
    `;
  }

  function getCompanionInstallUrl() {
    try {
      return localStorage.getItem(UCAGS_COMPANION_INSTALL_URL_STORAGE_KEY) || DEFAULT_UCAGS_COMPANION_INSTALL_URL;
    } catch {
      return DEFAULT_UCAGS_COMPANION_INSTALL_URL;
    }
  }

  function setCompanionInstallUrl(url) {
    try {
      localStorage.setItem(UCAGS_COMPANION_INSTALL_URL_STORAGE_KEY, String(url || '').trim());
    } catch {}
  }

  function isAdminUser() {
    // Primary: app sets window.currentUser in public/js/app.js
    if (window.currentUser && window.currentUser.role) {
      return String(window.currentUser.role).toLowerCase() === 'admin';
    }

    // Fallback: Supabase session metadata
    try {
      // Note: synchronous access isn’t available; so this is best-effort.
      // If currentUser isn’t set, we default to non-admin.
    } catch {}

    return false;
  }

  async function renderPanel() {
    const root = document.getElementById('whatsappView');
    if (!root) return;

    const isAdmin = isAdminUser();
    const companionInstallUrl = getCompanionInstallUrl();

    // Load mappings (admin-only endpoint; will be empty for non-admin users)
    const mappings = await fetchContainerMappings();

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

          ${isAdmin ? `
          <div style="margin-top: 14px; background:#fff; border:1px solid #eef1f6; border-radius: 12px; padding: 14px;">
            <div style="font-weight:800; margin-bottom: 6px;">Firefox Containers Setup Wizard</div>
            <div style="color:#6b7280; font-size: 13px; line-height: 1.5;">
              Do these steps once on the admin machine. After linking WhatsApp in each container, the buttons below will always open the correct session.
            </div>

            <div style="margin-top: 12px; display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px;">
              <div style="border:1px solid #f0f0f0; border-radius: 10px; padding: 12px;">
                <div style="font-weight:800; margin-bottom:6px;">1) Install Multi-Account Containers</div>
                <div style="font-size:12px; color:#6b7280; margin-bottom: 10px;">Required for per-advisor sessions.</div>
                <button id="waStepInstallMAC" class="btn btn-secondary" type="button">
                  <i class="fas fa-puzzle-piece"></i> Open Add-on Page
                </button>
              </div>

              <div style="border:1px solid #f0f0f0; border-radius: 10px; padding: 12px;">
                <div style="font-weight:800; margin-bottom:6px;">2) Install UCAGS Companion Extension</div>
                <div style="font-size:12px; color:#6b7280; margin-bottom: 10px;">Enables auto-creating Advisor_A..D containers.</div>

                <div style="display:flex; gap:8px; flex-wrap: wrap; align-items:center;">
                  <button id="waStepInstallCompanion" class="btn btn-secondary" type="button">
                    <i class="fas fa-download"></i> Install Companion
                  </button>
                  <button id="waStepCheckCompanion" class="btn btn-secondary" type="button">
                    <i class="fas fa-shield-alt"></i> Check
                  </button>
                </div>

                <div style="margin-top:10px; font-size:12px; color:#6b7280;">
                  Install URL (signed XPI / AMO unlisted):
                </div>
                <input id="waCompanionInstallUrl" type="text" value="${companionInstallUrl ? companionInstallUrl.replace(/"/g, '&quot;') : ''}"
                  placeholder="Paste signed .xpi URL here"
                  style="margin-top:6px; width:100%; padding:10px; border:1px solid #e5e7eb; border-radius:8px; font-size:12px;" />
                <div style="margin-top:6px; font-size:11px; color:#9ca3af; line-height: 1.4;">
                  Tip: Use a stable URL like <code>https://.../ucags-wa-containers-latest.xpi</code>.
                </div>
              </div>

              <div style="border:1px solid #f0f0f0; border-radius: 10px; padding: 12px;">
                <div style="font-weight:800; margin-bottom:6px;">3) Create Advisor Containers</div>
                <div style="font-size:12px; color:#6b7280; margin-bottom: 10px;">Creates Advisor_A, Advisor_B, Advisor_C, Advisor_D.</div>
                <button id="waStepCreateContainers" class="btn btn-primary" type="button">
                  <i class="fas fa-boxes"></i> Create Containers
                </button>
              </div>

              <div style="border:1px solid #f0f0f0; border-radius: 10px; padding: 12px;">
                <div style="font-weight:800; margin-bottom:6px;">4) Open WhatsApp per Advisor & Link</div>
                <div style="font-size:12px; color:#6b7280; margin-bottom: 10px;">Open each advisor once and login/scan QR.</div>
                <button id="waStepScrollAdvisors" class="btn btn-secondary" type="button">
                  <i class="fas fa-arrow-down"></i> Show Advisor Buttons
                </button>
              </div>
            </div>
          </div>
          ` : ''}

          <div id="waContainersStatus" style="margin-top: 12px; padding: 10px 12px; border-radius: 10px; background:#f9fafb; border:1px solid #eef1f6; color:#374151; font-size: 13px; display:none;"></div>

          <div id="waAdvisorButtonsAnchor"></div>
          ${renderAdvisorButtons(mappings)}

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
    const containersStatusEl = document.getElementById('waContainersStatus');

    const stepInstallMACBtn = document.getElementById('waStepInstallMAC');
    const stepInstallCompanionBtn = document.getElementById('waStepInstallCompanion');
    const stepCheckCompanionBtn = document.getElementById('waStepCheckCompanion');
    const companionInstallUrlInput = document.getElementById('waCompanionInstallUrl');
    const stepCreateContainersBtn = document.getElementById('waStepCreateContainers');
    const stepScrollAdvisorsBtn = document.getElementById('waStepScrollAdvisors');

    // Hide status box for non-admins (since wizard is hidden)
    if (!isAdmin && containersStatusEl) {
      containersStatusEl.style.display = 'none';
    }

    const openBtn = document.getElementById('waOpenBtn');
    const dockBtn = document.getElementById('waDockBtn');
    const closeBtn = document.getElementById('waCloseBtn');
    const widenBtn = document.getElementById('waWidenBtn');
    const narrowBtn = document.getElementById('waNarrowBtn');

    function setStatus(text) {
      if (!statusEl) return;
      statusEl.textContent = text;
    }

    function setContainersStatus(text, kind) {
      if (!containersStatusEl) return;
      containersStatusEl.style.display = 'block';
      containersStatusEl.textContent = text;
      const bg = kind === 'error' ? '#fef2f2' : kind === 'success' ? '#ecfdf3' : '#f9fafb';
      const border = kind === 'error' ? '#fecaca' : kind === 'success' ? '#bbf7d0' : '#eef1f6';
      containersStatusEl.style.background = bg;
      containersStatusEl.style.borderColor = border;
    }

    function updateStatus() {
      if (isWindowOpen(waWindow)) setStatus('Status: panel is open.');
      else setStatus('Status: not opened.');
    }

    if (stepInstallMACBtn) {
      stepInstallMACBtn.addEventListener('click', () => {
        try {
          window.open(FIREFOX_CONTAINERS_ADDON_URL, '_blank', 'noopener');
        } catch {}
      });
    }

    if (companionInstallUrlInput) {
      companionInstallUrlInput.addEventListener('change', () => {
        setCompanionInstallUrl(companionInstallUrlInput.value);
      });
      companionInstallUrlInput.addEventListener('blur', () => {
        setCompanionInstallUrl(companionInstallUrlInput.value);
      });
    }

    if (stepInstallCompanionBtn) {
      stepInstallCompanionBtn.addEventListener('click', () => {
        const url = (companionInstallUrlInput && companionInstallUrlInput.value)
          ? companionInstallUrlInput.value.trim()
          : getCompanionInstallUrl();

        if (!url) {
          setContainersStatus('No companion install URL set. Paste the signed .xpi URL in the field first.', 'error');
          return;
        }

        try { window.open(url, '_blank', 'noopener'); } catch {}
      });
    }

    if (stepCheckCompanionBtn) {
      stepCheckCompanionBtn.addEventListener('click', async () => {
        const hasExt = await pingContainersExtension();
        if (hasExt) {
          setContainersStatus('UCAGS companion extension is installed and responding.', 'success');
        } else {
          setContainersStatus(
            'UCAGS companion extension not detected. If IT has force-installed it, restart Firefox. Otherwise install it (signed XPI / policy) and try again.',
            'error'
          );
        }
      });
    }

    if (stepCreateContainersBtn) {
      stepCreateContainersBtn.addEventListener('click', async () => {
        try {
          // Save default advisor->container mapping in CRM.
          await saveDefaultContainerMappings();

          const hasExt = await pingContainersExtension();
          if (!hasExt) {
            setContainersStatus(
              'Saved Advisor mapping in CRM, but UCAGS companion extension is not detected. Install/enable it, then retry.',
              'error'
            );
            return;
          }

          const resp = await ensureAdvisorContainersViaExtension();
          if (!resp?.ok) throw new Error(resp?.error || 'Extension failed to create containers');

          const createdCount = (resp.ensured || []).filter(x => x.created).length;
          setContainersStatus(
            `Containers ensured: ${Object.values(DEFAULT_ADVISOR_CONTAINER_MAPPINGS).join(', ')}. Newly created: ${createdCount}. Next: open each advisor and link WhatsApp once.`,
            'success'
          );

          // Scroll to advisor buttons
          try {
            document.getElementById('waAdvisorButtonsAnchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } catch {}
        } catch (e) {
          setContainersStatus(e.message || 'Failed to create containers', 'error');
          if (window.UI?.showToast) UI.showToast(e.message || 'Failed to create containers', 'error');
        }
      });
    }

    if (stepScrollAdvisorsBtn) {
      stepScrollAdvisorsBtn.addEventListener('click', () => {
        try {
          document.getElementById('waAdvisorButtonsAnchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch {}
      });
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

  window.initWhatsAppPanelPage = async function () {
    bindAutoRedockOnce();
    await renderPanel();
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

  // Expose helper for other modules (optional)
  window.buildFirefoxContainerWhatsAppUrl = buildFirefoxContainerUrl;

})();
