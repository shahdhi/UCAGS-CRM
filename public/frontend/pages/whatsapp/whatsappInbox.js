/**
 * WhatsApp Inbox (Messenger-like)
 * - Conversation list (grouped by lead phone)
 * - Thread view
 * - Send text + brochure
 */

(function () {
  'use strict';

  const state = {
    selectedLeadPhone: null,
    selectedLeadName: '',
    pollTimer: null,
    pollMs: 5000,
    lastConversationsHash: '',
    lastThreadHash: ''
  };

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

  function formatTs(ts) {
    try { return new Date(ts).toLocaleString(); } catch { return ts; }
  }

  function shortPhone(item) {
    return item.leadPhoneRaw || item.leadPhoneE164 || item.leadPhoneKey || '';
  }

  function hashObj(obj) {
    try { return JSON.stringify(obj); } catch { return String(Date.now()); }
  }

  function renderConversations(items) {
    const list = document.getElementById('waInboxConversations');
    if (!list) return;

    if (!items || items.length === 0) {
      list.innerHTML = '<div style="padding:12px; color:#666;">No conversations yet.</div>';
      return;
    }

    const selectedDigits = (state.selectedLeadPhone || '').replace(/\D/g, '');

    list.innerHTML = items.slice(0, 500).map(c => {
      const digits = (c.leadPhoneKey || shortPhone(c)).replace(/\D/g, '');
      const active = selectedDigits && digits && (selectedDigits.endsWith(digits) || digits.endsWith(selectedDigits));

      return `
        <div class="wa-inbox-conv ${active ? 'active' : ''}" 
             onclick="window.WAInbox.selectConversation('${escapeHtml(shortPhone(c))}','${escapeHtml(c.leadName || '')}')">
          <div style="display:flex; justify-content:space-between; gap:10px;">
            <div style="font-weight:700;">${escapeHtml(c.leadName || 'Unknown')}</div>
            <div style="font-size:12px; color:#888; white-space:nowrap;">${escapeHtml(formatTs(c.lastTimestamp))}</div>
          </div>
          <div style="font-size:12px; color:#666;">${escapeHtml(shortPhone(c))}</div>
          <div style="margin-top:6px; font-size:13px; color:#333; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(c.lastPreview || '')}</div>
          <div style="margin-top:4px; font-size:11px; color:#999;">${escapeHtml(c.lastDirection || '')}${c.lastAdvisor ? ` • ${escapeHtml(c.lastAdvisor)}` : ''}</div>
        </div>
      `;
    }).join('');
  }

  function renderThread(messages) {
    const container = document.getElementById('waInboxThread');
    if (!container) return;

    if (!messages || messages.length === 0) {
      container.innerHTML = '<div style="padding:12px; color:#666;">No messages.</div>';
      return;
    }

    container.innerHTML = messages.map(m => {
      const isOutbound = m.direction === 'outbound';
      const align = isOutbound ? 'flex-end' : 'flex-start';
      const bg = isOutbound ? '#DCF8C6' : '#fff';
      const meta = `${escapeHtml(m.advisor || (isOutbound ? 'You' : (m.leadName || 'Lead')))} • ${escapeHtml(formatTs(m.timestamp))}`;

      let body = '';
      if (m.messageType === 'document' && m.documentUrl) {
        body = `<a href="${escapeHtml(m.documentUrl)}" target="_blank" rel="noopener">📎 Document</a>`;
      } else {
        body = `<div>${escapeHtml(m.text || '')}</div>`;
      }

      return `
        <div style="display:flex; justify-content:${align}; margin: 8px 0;">
          <div style="max-width: 75%; background:${bg}; border:1px solid #e5e5e5; border-radius: 10px; padding: 8px 10px;">
            <div style="font-size: 12px; color:#555; margin-bottom: 4px;">${meta}</div>
            ${body}
            ${m.status ? `<div style="font-size:11px; color:#888; margin-top:4px; text-align:right;">${escapeHtml(m.status)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    container.scrollTop = container.scrollHeight;
  }

  async function loadConversations() {
    const q = (document.getElementById('waInboxSearch')?.value || '').trim();
    const headers = await getAuthHeaders();

    const res = await fetch(`/api/whatsapp/inbox/conversations?search=${encodeURIComponent(q)}`, { headers });
    const json = await res.json().catch(() => ({}));

    if (!json.success) {
      if (window.UI?.showToast) UI.showToast(json.error || 'Failed to load conversations', 'error');
      renderConversations([]);
      return;
    }

    const hash = hashObj(json.items || []);
    if (hash !== state.lastConversationsHash) {
      state.lastConversationsHash = hash;
      renderConversations(json.items || []);
    }
  }

  async function loadThread(leadPhone) {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/whatsapp/inbox/threads/${encodeURIComponent(leadPhone)}`, { headers });
    const json = await res.json().catch(() => ({}));

    if (!json.success) {
      if (window.UI?.showToast) UI.showToast(json.error || 'Failed to load chat', 'error');
      renderThread([]);
      return;
    }

    const hash = hashObj(json.messages || []);
    if (hash !== state.lastThreadHash) {
      state.lastThreadHash = hash;
      renderThread(json.messages || []);
    }
  }

  async function selectConversation(leadPhone, leadName) {
    state.selectedLeadPhone = leadPhone;
    state.selectedLeadName = leadName || '';
    state.lastThreadHash = '';

    const header = document.getElementById('waInboxThreadHeader');
    if (header) {
      header.innerHTML = `
        <div style="font-weight:700;">${escapeHtml(state.selectedLeadName || 'Chat')}</div>
        <div style="font-size:12px; opacity:.9;">${escapeHtml(state.selectedLeadPhone || '')}</div>
      `;
    }

    await loadConversations();
    await loadThread(leadPhone);
  }

  async function sendText() {
    const phone = state.selectedLeadPhone;
    if (!phone) {
      if (window.UI?.showToast) UI.showToast('Select a conversation first', 'warning');
      return;
    }

    const input = document.getElementById('waInboxMessageInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    input.disabled = true;

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/whatsapp/leads/${encodeURIComponent(phone)}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text, leadName: state.selectedLeadName })
      });
      const json = await res.json().catch(() => ({}));
      if (!json.success) throw new Error(json.error || 'Send failed');

      input.value = '';
      state.lastThreadHash = '';
      await loadThread(phone);
      await loadConversations();
    } catch (e) {
      console.error(e);
      if (window.UI?.showToast) UI.showToast(e.message, 'error');
      else alert(e.message);
    } finally {
      input.disabled = false;
      input.focus();
    }
  }

  async function sendBrochure() {
    const phone = state.selectedLeadPhone;
    if (!phone) {
      if (window.UI?.showToast) UI.showToast('Select a conversation first', 'warning');
      return;
    }

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/whatsapp/leads/${encodeURIComponent(phone)}/brochure`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ leadName: state.selectedLeadName })
      });
      const json = await res.json().catch(() => ({}));
      if (!json.success) throw new Error(json.error || 'Send failed');

      state.lastThreadHash = '';
      await loadThread(phone);
      await loadConversations();
    } catch (e) {
      console.error(e);
      if (window.UI?.showToast) UI.showToast(e.message, 'error');
      else alert(e.message);
    }
  }

  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(async () => {
      try {
        await loadConversations();
        if (state.selectedLeadPhone) {
          await loadThread(state.selectedLeadPhone);
        }
      } catch (e) {
        // silent
      }
    }, state.pollMs);
  }

  function stopPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function init() {
    const search = document.getElementById('waInboxSearch');
    if (search) {
      let t;
      search.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(loadConversations, 350);
      });
    }

    const sendBtn = document.getElementById('waInboxSendBtn');
    if (sendBtn) sendBtn.addEventListener('click', sendText);

    const brochureBtn = document.getElementById('waInboxBrochureBtn');
    if (brochureBtn) brochureBtn.addEventListener('click', sendBrochure);

    const input = document.getElementById('waInboxMessageInput');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          sendText();
        }
      });
    }
  }

  window.initWhatsAppInboxPage = async function () {
    init();
    await loadConversations();
    startPolling();
  };

  window.WAInbox = {
    selectConversation
  };

  // Stop polling when navigating away (best effort)
  window.addEventListener('hashchange', () => {
    const page = (window.location.hash || '').replace('#', '');
    if (page !== 'whatsapp-inbox') {
      stopPolling();
    }
  });
})();
