/**
 * WhatsApp Chat Panel (Lead Details)
 * Provides: load chat history, send text, send brochure.
 */

(function () {
  'use strict';

  async function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (window.supabaseClient) {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    }
    return headers;
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatTime(ts) {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  }

  function renderMessages(container, messages) {
    if (!container) return;

    if (!messages || messages.length === 0) {
      container.innerHTML = '<div style="color:#666; font-style: italic; padding: 8px;">No WhatsApp messages yet.</div>';
      return;
    }

    container.innerHTML = messages.map(m => {
      const isOutbound = m.direction === 'outbound';
      const bubbleBg = isOutbound ? '#DCF8C6' : '#fff';
      const align = isOutbound ? 'flex-end' : 'flex-start';
      const meta = `${escapeHtml(m.advisor || (isOutbound ? 'You' : 'Lead'))} • ${escapeHtml(formatTime(m.timestamp))}`;

      let body = '';
      if (m.messageType === 'document' && m.documentUrl) {
        body = `<a href="${escapeHtml(m.documentUrl)}" target="_blank" rel="noopener">📎 Document</a>`;
      } else if (m.messageType === 'text') {
        body = `<div>${escapeHtml(m.text || '')}</div>`;
      } else {
        body = `<div style="color:#666;">${escapeHtml(m.messageType || 'message')}</div>`;
      }

      return `
        <div style="display:flex; justify-content:${align}; margin: 8px 0;">
          <div style="max-width: 75%; background:${bubbleBg}; border:1px solid #e5e5e5; border-radius: 10px; padding: 8px 10px;">
            <div style="font-size: 12px; color:#555; margin-bottom: 4px;">${meta}</div>
            ${body}
            ${m.status ? `<div style="font-size:11px; color:#888; margin-top:4px; text-align:right;">${escapeHtml(m.status)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  async function loadLeadChat({ leadPhone, containerId }) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '<div style="padding: 8px; color:#666;">Loading WhatsApp chat…</div>';

    const headers = await getAuthHeaders();
    const res = await fetch(`/api/whatsapp/leads/${encodeURIComponent(leadPhone)}/history`, { headers });
    const json = await res.json();

    if (!json.success) {
      container.innerHTML = `<div style="padding: 8px; color:#f44336;">${escapeHtml(json.error || 'Failed to load chat')}</div>`;
      return;
    }

    renderMessages(container, json.messages || []);
  }

  async function sendLeadText({ leadPhone, leadName, inputId, containerId }) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    input.disabled = true;

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/whatsapp/leads/${encodeURIComponent(leadPhone)}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text, leadName })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Send failed');

      input.value = '';
      if (window.UI?.showToast) UI.showToast('WhatsApp message sent', 'success');

      await loadLeadChat({ leadPhone, containerId });
    } catch (e) {
      console.error(e);
      if (window.UI?.showToast) UI.showToast(`Failed to send: ${e.message}`, 'error');
      else alert(e.message);
    } finally {
      input.disabled = false;
      input.focus();
    }
  }

  async function sendBrochure({ leadPhone, leadName, containerId }) {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/whatsapp/leads/${encodeURIComponent(leadPhone)}/brochure`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ leadName })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Send failed');

      if (window.UI?.showToast) UI.showToast('Brochure sent on WhatsApp', 'success');
      await loadLeadChat({ leadPhone, containerId });
    } catch (e) {
      console.error(e);
      if (window.UI?.showToast) UI.showToast(`Failed to send brochure: ${e.message}`, 'error');
      else alert(e.message);
    }
  }

  function getPanelHTML({ leadPhone, leadName }) {
    const panelId = `waChat_${String(leadPhone).replace(/\W/g, '')}`;
    const inputId = `${panelId}_input`;
    const messagesId = `${panelId}_messages`;

    // Defer loading until inserted
    setTimeout(() => {
      loadLeadChat({ leadPhone, containerId: messagesId });
    }, 50);

    return {
      html: `
        <div style="border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden;">
          <div style="display:flex; align-items:center; justify-content: space-between; padding: 10px 12px; background:#25D366; color: white;">
            <div style="display:flex; align-items:center; gap:10px;">
              <i class="fab fa-whatsapp" style="font-size: 18px;"></i>
              <div>
                <div style="font-weight: 700;">WhatsApp Chat</div>
                <div style="font-size: 12px; opacity: .9;">${escapeHtml(leadName || '')} • ${escapeHtml(leadPhone || '')}</div>
              </div>
            </div>
            <button class="btn btn-sm btn-light" type="button" onclick="window.WAChat.sendBrochure('${escapeHtml(leadPhone)}','${escapeHtml(leadName)}','${messagesId}')">
              <i class="fas fa-file-pdf"></i> Send Brochure
            </button>
          </div>

          <div id="${messagesId}" style="height: 260px; overflow-y: auto; background:#f5f5f5; padding: 10px 12px;"></div>

          <div style="display:flex; gap: 8px; padding: 10px; background: #fff; border-top: 1px solid #eee;">
            <input id="${inputId}" type="text" class="form-control" placeholder="Type a message…" style="flex:1;" onkeydown="if(event.key==='Enter'){ event.preventDefault(); window.WAChat.sendText('${escapeHtml(leadPhone)}','${escapeHtml(leadName)}','${inputId}','${messagesId}') }" />
            <button class="btn btn-success" type="button" onclick="window.WAChat.sendText('${escapeHtml(leadPhone)}','${escapeHtml(leadName)}','${inputId}','${messagesId}')">
              <i class="fas fa-paper-plane"></i>
            </button>
          </div>
        </div>
      `,
      messagesId,
      inputId
    };
  }

  window.WAChat = {
    getPanelHTML,
    loadLeadChat,
    sendText: (leadPhone, leadName, inputId, containerId) => sendLeadText({ leadPhone, leadName, inputId, containerId }),
    sendBrochure: (leadPhone, leadName, containerId) => sendBrochure({ leadPhone, leadName, containerId })
  };
})();
