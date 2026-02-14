// Notification Center (in-app inbox)
// Stores notifications in localStorage and renders a dropdown from the header bell.

(function () {
  const STORAGE_KEY = 'notificationCenter:items';
  const READ_KEY = 'notificationCenter:readAt';
  const MAX_ITEMS = 50;

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  async function authHeaders() {
    const headers = {};
    if (window.supabaseClient) {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
  }

  function loadItemsLocal() {
    return safeJsonParse(localStorage.getItem(STORAGE_KEY) || '[]', []).filter(Boolean);
  }

  function saveItemsLocal(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  }

  async function loadItems() {
    // Prefer Supabase-backed notifications; fallback to local.
    try {
      const res = await fetch('/api/notifications?limit=' + MAX_ITEMS, { headers: await authHeaders() });
      const json = await res.json();
      if (json?.success && Array.isArray(json.notifications)) {
        return json.notifications.map(n => ({
          id: String(n.id),
          title: n.title,
          message: n.message,
          ts: new Date(n.created_at).getTime(),
          type: n.type || 'info',
          read_at: n.read_at
        }));
      }
    } catch (e) {
      // ignore
    }
    return loadItemsLocal();
  }

  function saveItems(items) {
    // Local fallback cache only (server is source of truth)
    saveItemsLocal(items);
  }

  function getReadAt() {
    const v = localStorage.getItem(READ_KEY);
    const n = v ? Number(v) : 0;
    return Number.isFinite(n) ? n : 0;
  }

  async function setReadNow() {
    localStorage.setItem(READ_KEY, String(Date.now()));
    // Best-effort mark read in Supabase
    try {
      await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
    } catch (e) {}
  }

  async function add({ title, message, ts = Date.now(), type = 'info' }) {
    // Optimistic local add
    const items = loadItemsLocal();
    const localItem = { id: `${ts}:${Math.random().toString(16).slice(2)}`, title, message, ts, type };
    items.unshift(localItem);
    saveItemsLocal(items);
    updateBadge();

    // Best-effort persist to server
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message, type })
      });
      const json = await res.json();
      if (json?.success && json.notification) {
        // Refresh from server to keep consistent
        const serverItems = await loadItems();
        saveItemsLocal(serverItems);
        updateBadge();
      }
    } catch (e) {
      // ignore
    }
  }

  function unreadCountFromItems(items) {
    const readAt = getReadAt();
    return (items || []).filter(x => {
      if (x.read_at) return false;
      return (x.ts || 0) > readAt;
    }).length;
  }

  function formatTime(ts) {
    const d = new Date(ts);
    if (isNaN(d)) return '';
    return d.toLocaleString([], { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function ensureDropdown() {
    let el = document.getElementById('notificationDropdown');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'notificationDropdown';
    el.className = 'notification-dropdown hidden';
    el.innerHTML = `
      <div class="notification-dropdown-header">
        <div style="font-weight:800;">Notifications</div>
        <button id="notificationMarkReadBtn" class="btn btn-secondary" style="padding:6px 10px; font-size:12px;">Mark all read</button>
      </div>
      <div id="notificationDropdownList" class="notification-dropdown-list"></div>
    `;

    // Attach near the bell button
    const btn = document.getElementById('notificationsBtn');
    if (btn && btn.parentElement) {
      btn.parentElement.style.position = 'relative';
      btn.parentElement.appendChild(el);
    } else {
      document.body.appendChild(el);
    }

    const markBtn = document.getElementById('notificationMarkReadBtn');
    if (markBtn) {
      markBtn.addEventListener('click', async () => {
        await setReadNow();
        await render();
        await updateBadge();
      });
    }

    // Close on outside click
    document.addEventListener('click', (e) => {
      const bell = document.getElementById('notificationsBtn');
      if (!el.classList.contains('hidden')) {
        if (e.target === bell || bell?.contains(e.target) || el.contains(e.target)) {
          return;
        }
        hide();
      }
    });

    return el;
  }

  async function render() {
    const list = document.getElementById('notificationDropdownList');
    if (!list) return;

    const items = await loadItems();
    saveItemsLocal(items);
    const readAt = getReadAt();

    if (!items.length) {
      list.innerHTML = `<div class="notification-empty">No notifications</div>`;
      return;
    }

    const escape = (s) => String(s ?? '').replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    list.innerHTML = items.map(it => {
      const isUnread = (it.ts || 0) > readAt;
      return `
        <div class="notification-item ${isUnread ? 'unread' : ''}">
          <div class="notification-item-title">${escape(it.title || 'Notification')}</div>
          <div class="notification-item-msg">${escape(it.message || '')}</div>
          <div class="notification-item-time">${escape(formatTime(it.ts))}</div>
        </div>
      `;
    }).join('');
  }

  async function show() {
    const el = ensureDropdown();
    await render();
    el.classList.remove('hidden');
  }

  function hide() {
    const el = ensureDropdown();
    el.classList.add('hidden');
  }

  function toggle() {
    const el = ensureDropdown();
    if (el.classList.contains('hidden')) {
      show();
    } else {
      hide();
    }
  }

  async function updateBadge() {
    const btn = document.getElementById('notificationsBtn');
    if (!btn) return;
    const badge = btn.querySelector('.notification-badge');
    if (!badge) return;

    const items = await loadItems();
    // cache locally for offline dropdown
    saveItemsLocal(items);

    const n = unreadCountFromItems(items);
    if (n > 0) {
      badge.textContent = String(n);
      badge.style.display = 'inline-flex';
    } else {
      badge.textContent = '0';
      badge.style.display = 'none';
    }
  }

  function init() {
    const btn = document.getElementById('notificationsBtn');
    if (!btn) return;

    // Hide badge initially; it will update after init
    updateBadge();

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      toggle();
      // Mark read when user opens the dropdown
      setReadNow().then(() => updateBadge()).catch(() => {});
    });

    // Refresh badge periodically (in case other tabs/devices add notifications)
    setInterval(() => updateBadge(), 60 * 1000);
  }

  window.NotificationCenter = {
    init,
    add,
    updateBadge,
    show,
    hide,
    async markAllRead() {
      await setReadNow();
      await updateBadge();
    }
  };
})();
