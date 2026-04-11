/**
 * WhatsApp Firefox Containers mapping routes.
 *
 * These endpoints do NOT create Firefox containers themselves (browser APIs cannot be called from Node).
 * They store the CRM mapping so the frontend can generate per-advisor `firefox-container://` links.
 */

const express = require('express');
const router = express.Router();

const { isAdmin } = require('../../../server/middleware/auth');
const { getAllMappings, upsertMappings } = require('./whatsappContainersStore');

const DEFAULT_MAPPINGS = [
  { advisorKey: 'Advisor A', containerName: 'Advisor_A' },
  { advisorKey: 'Advisor B', containerName: 'Advisor_B' },
  { advisorKey: 'Advisor C', containerName: 'Advisor_C' },
  { advisorKey: 'Advisor D', containerName: 'Advisor_D' }
];

router.get('/mappings', isAdmin, async (req, res) => {
  try {
    const result = await getAllMappings();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('GET /api/whatsapp/containers/mappings error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to load mappings' });
  }
});

router.post('/mappings', isAdmin, async (req, res) => {
  try {
    const { mappings } = req.body || {};
    if (!mappings || typeof mappings !== 'object') {
      return res.status(400).json({ success: false, error: 'mappings object is required' });
    }

    const pairs = Object.entries(mappings).map(([advisorKey, containerName]) => ({ advisorKey, containerName }));
    const saved = await upsertMappings(pairs);

    res.json({ success: true, ...saved });
  } catch (error) {
    console.error('POST /api/whatsapp/containers/mappings error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to save mappings' });
  }
});

router.post('/setup-default', isAdmin, async (req, res) => {
  try {
    const saved = await upsertMappings(DEFAULT_MAPPINGS);
    res.json({ success: true, ...saved, defaults: DEFAULT_MAPPINGS });
  } catch (error) {
    console.error('POST /api/whatsapp/containers/setup-default error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to setup defaults' });
  }
});

module.exports = router;
