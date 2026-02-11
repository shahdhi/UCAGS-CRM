/**
 * Calendar Tasks Routes
 */

const express = require('express');
const router = express.Router();

const { isAuthenticated } = require('../../../server/middleware/auth');
const tasks = require('./calendarTasksService');

router.get('/tasks', isAuthenticated, async (req, res) => {
  try {
    const owner = req.user?.name;
    const from = req.query.from;
    const to = req.query.to;
    const list = await tasks.listTasks({ owner, from, to });
    res.json({ success: true, tasks: list });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/tasks', isAuthenticated, async (req, res) => {
  try {
    const owner = req.user?.name;
    const { title, dueAt, notes } = req.body || {};
    if (!title || !dueAt) {
      return res.status(400).json({ success: false, error: 'title and dueAt are required' });
    }
    const task = await tasks.createTask({ owner, title, dueAt, notes });
    res.status(201).json({ success: true, task });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/tasks/:id', isAuthenticated, async (req, res) => {
  try {
    const owner = req.user?.name;
    await tasks.deleteTask({ owner, id: req.params.id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
