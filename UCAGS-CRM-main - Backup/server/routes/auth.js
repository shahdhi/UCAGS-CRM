const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getSheetsClient } = require('../config/google');

// In-memory users (can be moved to a config file or database)
const users = {
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10),
    role: 'admin',
    name: 'Admin User'
  }
};

// Officers will be loaded from Google Sheets
let officers = {};

// Load officers from Google Sheets
async function loadOfficers() {
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.ADMIN_SHEET_ID,
      range: 'Officers!A2:E100', // Assuming Officers sheet with columns: Username, Password, Name, Email, SheetID
    });

    const rows = response.data.values || [];
    officers = {};
    
    rows.forEach(row => {
      if (row[0]) { // If username exists
        officers[row[0]] = {
          username: row[0],
          password: row[1], // Should be hashed in the sheet
          role: 'officer',
          name: row[2] || row[0],
          email: row[3] || '',
          sheetId: row[4] || ''
        };
      }
    });
    
    console.log(`Loaded ${Object.keys(officers).length} officers from Google Sheets`);
  } catch (error) {
    console.error('Error loading officers:', error.message);
  }
}

// Initialize officers on startup
loadOfficers();

// Refresh officers periodically (every 5 minutes)
setInterval(loadOfficers, 5 * 60 * 1000);

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Check admin users
    if (users[username]) {
      const isValid = bcrypt.compareSync(password, users[username].password);
      if (isValid) {
        req.session.user = {
          username: users[username].username,
          role: users[username].role,
          name: users[username].name
        };
        return res.json({
          success: true,
          user: req.session.user
        });
      }
    }

    // Check officers
    if (officers[username]) {
      const isValid = bcrypt.compareSync(password, officers[username].password);
      if (isValid) {
        req.session.user = {
          username: officers[username].username,
          role: officers[username].role,
          name: officers[username].name,
          email: officers[username].email,
          sheetId: officers[username].sheetId
        };
        return res.json({
          success: true,
          user: req.session.user
        });
      }
    }

    res.status(401).json({ error: 'Invalid username or password' });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout endpoint
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// Get current user
router.get('/me', (req, res) => {
  if (req.session && req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// Refresh officers (admin only)
router.post('/refresh-officers', async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    await loadOfficers();
    res.json({ 
      success: true, 
      message: 'Officers refreshed successfully',
      count: Object.keys(officers).length
    });
  } catch (error) {
    console.error('Error refreshing officers:', error);
    res.status(500).json({ error: 'Failed to refresh officers' });
  }
});

module.exports = router;
