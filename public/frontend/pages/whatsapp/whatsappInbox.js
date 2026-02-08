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
        <div class="wa-web-conv ${active ? 'active' : ''}" 
             onclick="window.WAInbox.selectConversation('${escapeHtml(shortPhone(c))}','${escapeHtml(c.leadName || '')}')">
          <div class="wa-web-avatar" style="width:40px;height:40px; flex:0 0 40px;">${escapeHtml((c.leadName || 'L').trim().slice(0,1).toUpperCase())}</div>
          <div style="flex:1; min-width:0;">
            <div style="display:flex; justify-content:space-between; gap:10px;">
              <div class="name" style="min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(c.leadName || 'Unknown')}</div>
              <div class="meta" style="white-space:nowrap;">${escapeHtml(new Date(c.lastTimestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }))}</div>
            </div>
            <div class="preview">${escapeHtml(c.lastPreview || '')}</div>
            <div class="meta" style="margin-top:2px;">${escapeHtml(shortPhone(c))}</div>
          </div>
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
      const rowCls = isOutbound ? 'wa-bubble-row wa-out' : 'wa-bubble-row wa-in';

      const time = (() => {
        try { return new Date(m.timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); } catch { return ''; }
      })();

      const statusText = m.status ? String(m.status) : '';
      const ticks = isOutbound
        ? (statusText === 'read' ? '✓✓' : (statusText === 'delivered' ? '✓✓' : '✓'))
        : '';

      let body = '';
      if ((m.messageType === 'image' || (m.messageType === 'document' && /\.(png|jpe?g|webp)$/i.test(m.documentUrl || ''))) && m.documentUrl) {
        body = `<img src="${escapeHtml(m.documentUrl)}" alt="image" style="max-width:260px; border-radius:6px; display:block;" />${m.text ? `<div style=\"margin-top:6px;\">${escapeHtml(m.text)}</div>` : ''}`;
      } else if (m.messageType === 'document' && m.documentUrl) {
        const label = m.documentUrl.split('/').pop() || 'Document';
        body = `<a class="wa-doc" href="${escapeHtml(m.documentUrl)}" target="_blank" rel="noopener">📎 ${escapeHtml(label)}</a>`;
      } else {
        body = `<div>${escapeHtml(m.text || '')}</div>`;
      }

      return `
        <div class="${rowCls}">
          <div class="wa-bubble">
            ${body}
            <div class="wa-time">${escapeHtml(time)} ${isOutbound ? `<span style=\"margin-left:6px;\">${escapeHtml(ticks)}</span>` : ''}</div>
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
        <div style="font-weight:700; color:#111827;">${escapeHtml(state.selectedLeadName || 'Chat')}</div>
        <div style="font-size:12px; color:#6b7280;">${escapeHtml(state.selectedLeadPhone || '')}</div>
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

  async function uploadFile(file) {
    const headers = await getAuthHeaders();

    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = String(reader.result || '');
        // res is like data:<mime>;base64,<data>
        const idx = res.indexOf('base64,');
        if (idx === -1) return reject(new Error('Invalid file encoding'));
        resolve(res.slice(idx + 7));
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

    const res = await fetch('/api/whatsapp/uploads', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filename: file.name,
        mimeType: file.type,
        base64
      })
    });

    const json = await res.json().catch(() => ({}));
    if (!json.success) throw new Error(json.error || 'Upload failed');
    return json;
  }

  async function sendAttachment(file) {
    const phone = state.selectedLeadPhone;
    if (!phone) {
      if (window.UI?.showToast) UI.showToast('Select a conversation first', 'warning');
      return;
    }

    const up = await uploadFile(file);

    const headers = await getAuthHeaders();
    const res = await fetch(`/api/whatsapp/leads/${encodeURIComponent(phone)}/attachments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        url: up.url,
        filename: file.name,
        mimeType: up.mimeType || file.type,
        caption: '',
        leadName: state.selectedLeadName
      })
    });

    const json = await res.json().catch(() => ({}));
    if (!json.success) throw new Error(json.error || 'Send failed');

    state.lastThreadHash = '';
    await loadThread(phone);
    await loadConversations();
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

    const attachBtn = document.getElementById('waInboxAttachBtn');
    const fileInput = document.getElementById('waInboxFileInput');
    if (attachBtn && fileInput) {
      attachBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (!file) return;
        try {
          if (window.UI?.showToast) UI.showToast('Uploading…', 'info');
          await sendAttachment(file);
          if (window.UI?.showToast) UI.showToast('Sent', 'success');
        } catch (e) {
          console.error(e);
          if (window.UI?.showToast) UI.showToast(e.message, 'error');
          else alert(e.message);
        }
      });
    }

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
