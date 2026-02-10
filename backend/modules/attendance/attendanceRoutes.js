/**
 * Attendance Routes
 *
 * Officers: check-in/check-out and view own status.
 * Admins: view staff attendance records.
 */

const express = require('express');
const router = express.Router();

const { isAuthenticated, isAdmin } = require('../../../server/middleware/auth');
const {
  ensureStaffSheet,
  checkIn,
  checkOut,
  confirmLocation,
  getTodayStatus,
  getStaffRecords
} = require('./attendanceService');

// Officer: ensure their sheet exists (helps first run)
router.post('/me/ensure-sheet', isAuthenticated, async (req, res) => {
  try {
    const staffName = req.user?.name;
    const result = await ensureStaffSheet(staffName);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('POST /api/attendance/me/ensure-sheet error:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// Officer: get today's check-in/out status
router.get('/me/today', isAuthenticated, async (req, res) => {
  try {
    const staffName = req.user?.name;
    const status = await getTodayStatus(staffName);
    res.json({ success: true, ...status });
  } catch (error) {
    console.error('GET /api/attendance/me/today error:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// Officer: check in
router.post('/me/checkin', isAuthenticated, async (req, res) => {
  try {
    const staffName = req.user?.name;
    const record = await checkIn(staffName);
    res.status(201).json({ success: true, record });
  } catch (error) {
    console.error('POST /api/attendance/me/checkin error:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// Officer: confirm location for today (optional)
router.post('/me/confirm-location', isAuthenticated, async (req, res) => {
  try {
    const staffName = req.user?.name;
    const { lat, lng, accuracy } = req.body || {};
    const record = await confirmLocation(staffName, { lat, lng, accuracy });
    res.status(201).json({ success: true, record });
  } catch (error) {
    console.error('POST /api/attendance/me/confirm-location error:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// Officer: check out
router.post('/me/checkout', isAuthenticated, async (req, res) => {
  try {
    const staffName = req.user?.name;
    const record = await checkOut(staffName);
    res.status(201).json({ success: true, record });
  } catch (error) {
    console.error('POST /api/attendance/me/checkout error:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// Admin: get attendance records for all staff
// Query params: date=YYYY-MM-DD (optional), from=YYYY-MM-DD, to=YYYY-MM-DD
router.get('/records', isAdmin, async (req, res) => {
  try {
    const { getSpreadsheetInfo } = require('../../core/sheets/sheetsClient');
    const { config } = require('../../core/config/environment');

    const spreadsheetId = config.sheets.attendanceSheetId;
    if (!spreadsheetId) {
      return res.json({ success: true, records: [] });
    }

    const date = req.query.date;
    const fromDate = req.query.from;
    const toDate = req.query.to;

    const info = await getSpreadsheetInfo(spreadsheetId);
    const sheetTitles = (info.sheets || []).map(s => s.properties.title);

    const records = [];
    for (const staffSheet of sheetTitles) {
      // Ignore hidden/empty/system sheets if any
      if (!staffSheet || staffSheet.startsWith('_')) continue;

      const staffRecords = await getStaffRecords(staffSheet, {
        fromDate: date || fromDate,
        toDate: date || toDate
      });

      if (date) {
        const rec = staffRecords.find(r => r.date === date);
        if (rec) records.push({ staffName: staffSheet, ...rec });
      } else {
        for (const r of staffRecords) {
          records.push({ staffName: staffSheet, ...r });
        }
      }
    }

    // Sort by date desc then staff name
    records.sort((a, b) => {
      const d = (b.date || '').localeCompare(a.date || '');
      if (d !== 0) return d;
      return (a.staffName || '').localeCompare(b.staffName || '');
    });

    res.json({ success: true, count: records.length, records });
  } catch (error) {
    console.error('GET /api/attendance/records error:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

module.exports = router;
