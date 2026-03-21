/**
 * WhatsApp Drawer (in-app side panel)
 * Renders the WhatsApp Inbox UI inside a right-side drawer.
 */

(function () {
  'use strict';

  let mounted = false;

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function getDrawerEls() {
    return {
      drawer: document.getElementById('waDrawer'),
      overlay: document.getElementById('waDrawerOverlay'),
      body: document.getElementById('waDrawerBody'),
      closeBtn: document.getElementById('waDrawerCloseBtn')
    };
  }

  function renderInboxShell(container) {
    container.innerHTML = `
      <div class="wa-web">
        <div class="wa-web-left">
          <div class="wa-web-topbar">
            <input id="waInboxSearch" class="wa-web-search" type="text" placeholder="Search chats" />
          </div>
          <div id="waInboxConversations" class="wa-web-convlist"></div>
        </div>

        <div class="wa-web-right">
          <div class="wa-thread-header">
            <div class="who" style="min-width:0;">
              <div class="wa-web-avatar" style="background:#dcf8c6;color:#0f5132;">WA</div>
              <div id="waInboxThreadHeader" style="min-width:0;">
                <div style="font-weight:700; color:#111827;">Select a chat</div>
                <div style="font-size:12px; color:#6b7280;">to view messages</div>
              </div>
            </div>

            <div style="display:flex; gap:8px; align-items:center;">
              <button id="waInboxBrochureBtn" class="btn btn-sm btn-light" type="button" title="Send brochure">
                <i class="fas fa-file-pdf"></i>
              </button>
            </div>
          </div>

          <div id="waInboxThread" class="wa-thread"></div>

          <div class="wa-compose">
            <input id="waInboxMessageInput" type="text" placeholder="Type a message" autocomplete="off" />
            <input id="waInboxFileInput" type="file" style="display:none" />
            <button id="waInboxAttachBtn" class="secondary" type="button" title="Attach">
              <i class="fas fa-paperclip"></i>
            </button>
            <button id="waInboxSendBtn" type="button" title="Send">
              <i class="fas fa-paper-plane"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function mount() {
    const { body } = getDrawerEls();
    if (!body) return;
    if (mounted) return;

    renderInboxShell(body);
    mounted = true;

    if (window.initWhatsAppInboxPage) {
      // start polling + bind events
      window.initWhatsAppInboxPage();
    } else {
      body.innerHTML = `
        <div style="padding: 16px;">
          <div style="font-weight:700; margin-bottom:6px;">WhatsApp is not available</div>
          <div style="color:#666; font-size:13px;">Missing inbox script.</div>
        </div>
      `;
    }
  }

  function isOpen() {
    const { drawer } = getDrawerEls();
    return !!drawer && drawer.classList.contains('open');
  }

  function open() {
    const { drawer, overlay } = getDrawerEls();
    if (!drawer || !overlay) return;

    overlay.style.display = 'block';
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('wa-drawer-open');

    mount();
  }

  function close() {
    const { drawer, overlay, body } = getDrawerEls();
    if (!drawer || !overlay) return;

    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('wa-drawer-open');

    // Let the slide-out animation finish then hide overlay
    setTimeout(() => {
      if (!isOpen()) overlay.style.display = 'none';
    }, 220);

    // Stop polling if the inbox script exposes a stop hook
    if (window.WAInbox?.stop) {
      try { window.WAInbox.stop(); } catch {}
    }

    // Keep DOM mounted so re-open is instant
    if (body) {
      // no-op
    }
  }

  function bindOnce() {
    const { overlay, closeBtn } = getDrawerEls();
    if (overlay && !overlay.__waBound) {
      overlay.__waBound = true;
      overlay.addEventListener('click', close);
    }

    if (closeBtn && !closeBtn.__waBound) {
      closeBtn.__waBound = true;
      closeBtn.addEventListener('click', close);
    }

    // ESC close
    if (!document.__waDrawerEscBound) {
      document.__waDrawerEscBound = true;
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen()) close();
      });
    }
  }

  window.WhatsAppDrawer = {
    open: () => { bindOnce(); open(); },
    close: () => close(),
    toggle: () => { bindOnce(); isOpen() ? close() : open(); },
    isOpen
  };
})();
