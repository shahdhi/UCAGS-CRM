/**
 * Admin WhatsApp Monitoring
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

  function formatTs(ts) {
    try { return new Date(ts).toLocaleString(); } catch { return ts; }
  }

  function renderRows(items) {
    const tbody = document.getElementById('waAdminTableBody');
    if (!tbody) return;

    if (!items || items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px; color:#666;">No chats found</td></tr>';
      return;
    }

    tbody.innerHTML = items.slice(0, 500).map(i => `
      <tr>
        <td>${escapeHtml(formatTs(i.timestamp))}</td>
        <td>${escapeHtml(i.leadName || '-')}</td>
        <td>${escapeHtml(i.leadPhoneRaw || i.leadPhoneE164 || '-')}</td>
        <td>${escapeHtml(i.direction)}</td>
        <td>${escapeHtml(i.advisor || '-')}</td>
        <td>${i.messageType === 'document'
          ? `<a href="${escapeHtml(i.documentUrl)}" target="_blank" rel="noopener">Document</a>`
          : escapeHtml(i.text || '')}
        </td>
      </tr>
    `).join('');
  }

  async function loadAdminChats() {
    const input = document.getElementById('waAdminSearchInput');
    const q = input ? input.value.trim() : '';

    const tbody = document.getElementById('waAdminTableBody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Loading…</td></tr>';
    }

    const headers = await getAuthHeaders();
    const res = await fetch(`/api/whatsapp/admin/chats?search=${encodeURIComponent(q)}`, { headers });
    const json = await res.json();

    if (!json.success) {
      renderRows([]);
      if (window.UI?.showToast) UI.showToast(json.error || 'Failed to load WhatsApp chats', 'error');
      return;
    }

    renderRows(json.items || []);
  }

  function init() {
    const input = document.getElementById('waAdminSearchInput');
    const btn = document.getElementById('waAdminSearchBtn');
    if (btn) btn.addEventListener('click', loadAdminChats);
    if (input) {
      let t;
      input.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(loadAdminChats, 400);
      });
    }
  }

  window.initWhatsAppAdminPage = async function () {
    init();
    await loadAdminChats();
  };
})();
