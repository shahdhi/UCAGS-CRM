(function () {
  const $ = (id) => document.getElementById(id);

  async function authHeaders() {
    const headers = {};
    if (window.supabaseClient) {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
  }

  const escape = (s) => String(s ?? '').replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function formatTime(ts) {
    const d = new Date(ts);
    if (isNaN(d)) return '';
    return d.toLocaleString([], { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function iconForType(type) {
    const t = String(type || 'info').toLowerCase();
    if (t === 'error') return 'fa-circle-xmark';
    if (t === 'warning') return 'fa-triangle-exclamation';
    if (t === 'success') return 'fa-circle-check';
    return 'fa-circle-info';
  }

  async function loadNotifications(limit = 200) {
    const res = await fetch(`/api/notifications?limit=${limit}`, { headers: await authHeaders() });
    const json = await res.json();
    if (!json?.success) throw new Error(json?.error || 'Failed to load notifications');
    return json.notifications || [];
  }

  async function markAllRead() {
    await fetch('/api/notifications/mark-all-read', {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }).catch(() => {});

    // Update bell badge too
    window.NotificationCenter?.updateBadge?.().catch?.(() => {});
  }

  function render(listEl, rows) {
    if (!listEl) return;
    const items = (rows || []).map(n => ({
      id: String(n.id),
      title: n.title,
      message: n.message,
      type: n.type || 'info',
      ts: new Date(n.created_at).getTime(),
      read_at: n.read_at
    }));

    if (!items.length) {
      listEl.innerHTML = '<div class="notification-empty" style="padding:12px;">No notifications</div>';
      return;
    }

    listEl.innerHTML = items.map(it => {
      const unread = !it.read_at;
      return `
        <div class="notification-item ${unread ? 'unread' : ''}" style="border-radius:12px; margin-bottom:10px; border:1px solid #eaecf0;">
          <div style="display:flex; gap:10px; align-items:flex-start;">
            <div style="width:26px; height:26px; display:flex; align-items:center; justify-content:center; margin-top:2px; color:${unread ? '#7c3aed' : '#667085'};">
              <i class="fas ${iconForType(it.type)}"></i>
            </div>
            <div style="flex:1;">
              <div class="notification-item-title">${escape(it.title || 'Notification')}</div>
              <div class="notification-item-msg">${escape(it.message || '')}</div>
              <div class="notification-item-time">${escape(formatTime(it.ts))}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  async function refresh() {
    const listEl = $('notificationsList');
    if (listEl) listEl.innerHTML = '<p class="loading">Loading...</p>';

    const rows = await loadNotifications(200);
    render(listEl, rows);
  }

  async function init() {
    const listEl = $('notificationsList');
    if (!listEl) return;

    const refreshBtn = $('notificationsRefreshBtn');
    const markBtn = $('notificationsMarkAllReadBtn');

    if (refreshBtn && !refreshBtn.__bound) {
      refreshBtn.__bound = true;
      refreshBtn.addEventListener('click', () => refresh().catch(e => window.showToast?.(e.message, 'error')));
    }

    if (markBtn && !markBtn.__bound) {
      markBtn.__bound = true;
      markBtn.addEventListener('click', async () => {
        await markAllRead();
        await refresh();
      });
    }

    // When user visits notifications page, treat as "viewed" -> mark read
    await refresh();
    await markAllRead();
    await refresh();
  }

  window.NotificationsPage = { init };
})();
