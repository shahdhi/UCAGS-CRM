/**
 * Calendar Tasks Routes
 */

const express = require('express');
const router = express.Router();

const { isAuthenticated } = require('../../../server/middleware/auth');
const tasks = require('./calendarTasksService');

router.get('/tasks', isAuthenticated, async (req, res) => {
  try {
    const requester = req.user?.name;
    const role = req.user?.role;

    const mode = String(req.query.mode || 'me'); // me|officer|everyone
    const officer = req.query.officer;
    const from = req.query.from;
    const to = req.query.to;

    let owner = requester;
    let includeAllOwners = false;
    let includeGlobal = true;

    if (role === 'admin') {
      if (mode === 'everyone') {
        includeAllOwners = true;
      } else if (mode === 'officer') {
        if (officer) owner = officer;
      }
      // mode === 'me' keeps owner=requester
    }

    const list = await tasks.listTasks({ owner, includeAllOwners, includeGlobal, from, to });
    res.json({ success: true, tasks: list });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/tasks', isAuthenticated, async (req, res) => {
  try {
    const requester = req.user?.name;
    const role = req.user?.role;

    const { title, dueAt, notes, repeat, visibility, ownerName } = req.body || {};
    if (!title || !dueAt) {
      return res.status(400).json({ success: false, error: 'title and dueAt are required' });
    }

    // Admin can create tasks for another officer via ownerName.
    // Non-admin always creates personal tasks for self.
    const owner = (role === 'admin' && ownerName) ? ownerName : requester;

    const safeVisibility = (role === 'admin' && visibility === 'global') ? 'global' : 'personal';
    const safeRepeat = ['none', 'daily', 'weekly', 'monthly'].includes(String(repeat || 'none')) ? String(repeat || 'none') : 'none';

    const task = await tasks.createTask({ owner, title, dueAt, notes, repeat: safeRepeat, visibility: safeVisibility });
    res.status(201).json({ success: true, task });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/tasks/:id', isAuthenticated, async (req, res) => {
  try {
    const requesterName = req.user?.name;
    const requesterRole = req.user?.role;

    await tasks.deleteTask({ requesterName, requesterRole, id: req.params.id });
    res.json({ success: true });
  } catch (e) {
    const status = e.statusCode || 500;
    res.status(status).json({ success: false, error: e.message });
  }
});

module.exports = router;
