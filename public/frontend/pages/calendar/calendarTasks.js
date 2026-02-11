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
                <label>Notes</label>
                <textarea id="calendarTaskNotes" class="form-control" rows="3"></textarea>
              </div>
              <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:10px;">
                <button type="button" class="btn btn-secondary" onclick="closeCalendarTaskModal()">Cancel</button>
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.body.style.overflow = 'hidden';

    const form = document.getElementById('calendarTaskForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const title = document.getElementById('calendarTaskTitle').value.trim();
        const dueAt = document.getElementById('calendarTaskDueAt').value;
        const notes = document.getElementById('calendarTaskNotes').value;

        const res = await API.calendar.createTask({ title, dueAt, notes });
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
