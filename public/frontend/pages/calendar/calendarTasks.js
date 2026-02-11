(function () {
  'use strict';

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = String(s || '');
    return div.innerHTML;
  }

  async function openCalendarTaskModal(taskId) {
    let existing = document.getElementById('calendarTaskModal');
    if (existing) existing.remove();

    const modalHTML = `
      <div class="modal-overlay" id="calendarTaskModal" onclick="closeCalendarTaskModal(event)">
        <div class="modal-dialog" onclick="event.stopPropagation()" style="max-width: 600px;">
          <div class="modal-header">
            <h2><i class="fas fa-calendar-plus"></i> Calendar Task</h2>
            <button class="modal-close" onclick="closeCalendarTaskModal()"><i class="fas fa-times"></i></button>
          </div>
          <div class="modal-body">
            <form id="calendarTaskForm">
              <div class="form-group">
                <label>Title *</label>
                <input type="text" id="calendarTaskTitle" class="form-control" required placeholder="e.g., Meeting / Call / Reminder" />
              </div>
              <div class="form-group">
                <label>Due at *</label>
                <input type="datetime-local" id="calendarTaskDueAt" class="form-control" required />
              </div>

              <div class="form-group">
                <label>Repeat</label>
                <select id="calendarTaskRepeat" class="form-control">
                  <option value="none" selected>Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              <div class="form-group" id="calendarTaskAdminFields" style="display:none;">
                <label>Assign to</label>
                <select id="calendarTaskOwner" class="form-control"></select>
                <div style="margin-top: 10px;">
                  <label style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" id="calendarTaskGlobal" />
                    <span>Visible for everyone (Admin only)</span>
                  </label>
                </div>
              </div>

              <div class="form-group">
                <label>Notes</label>
                <textarea id="calendarTaskNotes" class="form-control" rows="3"></textarea>
              </div>

              <div class="modal-footer" style="display:flex; justify-content:space-between; gap:10px;">
                <button type="button" class="btn btn-danger" id="calendarTaskDeleteBtn" style="display:none;"><i class="fas fa-trash"></i> Delete</button>
                <div style="display:flex; justify-content:flex-end; gap:10px;">
                  <button type="button" class="btn btn-secondary" onclick="closeCalendarTaskModal()">Cancel</button>
                  <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.body.style.overflow = 'hidden';

    // Admin fields
    const adminFields = document.getElementById('calendarTaskAdminFields');
    const ownerSelect = document.getElementById('calendarTaskOwner');
    const globalCb = document.getElementById('calendarTaskGlobal');
    const repeatSel = document.getElementById('calendarTaskRepeat');
    const deleteBtn = document.getElementById('calendarTaskDeleteBtn');

    const isAdmin = window.currentUser && window.currentUser.role === 'admin';
    if (isAdmin && adminFields) {
      adminFields.style.display = '';

      // Populate owners from the same officers list used in calendar admin dropdown
      try {
        let authHeaders = {};
        if (window.supabaseClient) {
          const { data: { session } } = await window.supabaseClient.auth.getSession();
          if (session && session.access_token) authHeaders['Authorization'] = `Bearer ${session.access_token}`;
        }
        const res = await fetch('/api/batches/officers', { headers: authHeaders });
        const data = await res.json();
        const officers = (data && data.officers) ? data.officers : [];
        const opts = [window.currentUser.name, ...officers.filter(o => o !== window.currentUser.name)];
        ownerSelect.innerHTML = opts.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
      } catch (e) {
        // ignore; fallback to current user
        ownerSelect.innerHTML = `<option value="${escapeHtml(window.currentUser.name)}">${escapeHtml(window.currentUser.name)}</option>`;
      }
    }

    // If editing existing task, prefill + show delete
    if (taskId) {
      try {
        const tasksParams = (() => {
          if (!isAdmin) return { mode: 'me' };
          const mode = document.getElementById('calendarViewModeSelect')?.value || 'me';
          const officer = document.getElementById('calendarOfficerSelect')?.value;
          const params = { mode };
          if (mode === 'officer' && officer) params.officer = officer;
          return params;
        })();
        const listRes = await API.calendar.getTasks(tasksParams);
        const t = (listRes.tasks || []).find(x => x.id === taskId);
        if (t) {
          document.getElementById('calendarTaskTitle').value = t.title || '';
          document.getElementById('calendarTaskDueAt').value = (t.due_at || '').slice(0, 16);
          document.getElementById('calendarTaskNotes').value = t.notes || '';
          if (repeatSel) repeatSel.value = t.repeat || 'none';
          if (isAdmin && ownerSelect) ownerSelect.value = t.owner_name || window.currentUser.name;
          if (isAdmin && globalCb) globalCb.checked = (t.visibility === 'global');

          if (deleteBtn) deleteBtn.style.display = '';
        }
      } catch (e) {
        // ignore
      }
    }

    if (deleteBtn && taskId) {
      deleteBtn.addEventListener('click', async () => {
        if (!confirm('Delete this task?')) return;
        try {
          const res = await API.calendar.deleteTask(taskId);
          if (!res.success) throw new Error(res.error || 'Failed to delete task');
          if (window.UI?.showToast) UI.showToast('Task deleted', 'success');
          closeCalendarTaskModal();
          if (window.loadCalendar) window.loadCalendar();
        } catch (err) {
          if (window.UI?.showToast) UI.showToast(err.message, 'error');
        }
      });
    }

    const form = document.getElementById('calendarTaskForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const title = document.getElementById('calendarTaskTitle').value.trim();
        const dueAt = document.getElementById('calendarTaskDueAt').value;
        const notes = document.getElementById('calendarTaskNotes').value;
        const repeat = repeatSel ? repeatSel.value : 'none';

        const payload = { title, dueAt, notes, repeat };

        if (isAdmin) {
          payload.ownerName = ownerSelect?.value || window.currentUser.name;
          payload.visibility = globalCb?.checked ? 'global' : 'personal';
        }

        if (taskId) {
          // No update endpoint yet; inform user
          throw new Error('Editing tasks is not supported yet. Please delete and re-create the task.');
        }

        const res = await API.calendar.createTask(payload);
        if (!res.success) throw new Error(res.error || 'Failed to create task');

        if (window.UI?.showToast) UI.showToast('Task created', 'success');
        closeCalendarTaskModal();
        // Reload calendar
        if (window.loadCalendar) window.loadCalendar();
      } catch (err) {
        if (window.UI?.showToast) UI.showToast(err.message, 'error');
      }
    });
  }

  function closeCalendarTaskModal(event) {
    if (event && event.target.className !== 'modal-overlay' && !event.target.closest('.modal-close')) return;
    const modal = document.getElementById('calendarTaskModal');
    if (modal) modal.remove();
    document.body.style.overflow = '';
  }

  window.openCalendarTaskModal = openCalendarTaskModal;
  window.closeCalendarTaskModal = closeCalendarTaskModal;
})();
