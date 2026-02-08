/**
 * Simple upload endpoint for WhatsApp attachments.
 * Accepts base64 payload and writes to /public/uploads.
 * NOTE: This is intended for internal CRM use only.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const { isAuthenticated } = require('../../../server/middleware/auth');
const { config } = require('../../core/config/environment');

const UPLOAD_DIR = path.join(__dirname, '../../../public/uploads');

function ensureDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function sanitizeFilename(name) {
  const base = String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  // avoid hidden files or empty
  return base.replace(/^\.+/, '').slice(0, 120) || 'file';
}

function guessExt(mime) {
  switch (mime) {
    case 'application/pdf': return '.pdf';
    case 'image/jpeg': return '.jpg';
    case 'image/png': return '.png';
    case 'image/webp': return '.webp';
    default: return '';
  }
}

// POST /api/whatsapp/uploads
// body: { filename, mimeType, base64 }
router.post('/uploads', isAuthenticated, async (req, res) => {
  try {
    const { filename, mimeType, base64 } = req.body || {};
    if (!base64) return res.status(400).json({ success: false, error: 'base64 is required' });

    // Limit size ~ 10MB (base64 overhead). WhatsApp allows larger docs, but keep server safe.
    const approxBytes = Math.floor((String(base64).length * 3) / 4);
    const maxBytes = parseInt(process.env.WHATSAPP_UPLOAD_MAX_BYTES || '10485760', 10);
    if (approxBytes > maxBytes) {
      return res.status(413).json({ success: false, error: `File too large. Max ${maxBytes} bytes` });
    }

    ensureDir();

    const safeName = sanitizeFilename(filename);
    const ext = path.extname(safeName) || guessExt(mimeType);
    const base = path.basename(safeName, path.extname(safeName));

    const stamped = `${base}_${Date.now()}${ext}`;
    const filePath = path.join(UPLOAD_DIR, stamped);

    const buf = Buffer.from(String(base64), 'base64');
    fs.writeFileSync(filePath, buf);

    const publicUrl = `${config.server.appUrl.replace(/\/$/, '')}/uploads/${encodeURIComponent(stamped)}`;

    res.json({
      success: true,
      url: publicUrl,
      filename: stamped,
      mimeType: mimeType || ''
    });
  } catch (e) {
    console.error('Upload error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
