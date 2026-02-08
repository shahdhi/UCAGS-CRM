/**
 * Access control helpers for WhatsApp messaging.
 */

const { getUserLeads } = require('../leads/userLeadsService');

function normalizePhone(raw) {
  return String(raw || '').replace(/\D/g, '');
}

async function assertLeadAccess(req, leadPhone) {
  const user = req.user;
  if (!user) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }

  if (user.role === 'admin') return;

  const userName = user.name;
  if (!userName) {
    const err = new Error('User name missing');
    err.status = 400;
    throw err;
  }

  const leads = await getUserLeads(userName);
  const q = normalizePhone(leadPhone);

  const found = (leads || []).some(l => {
    const p = normalizePhone(l.phone);
    return p && q && (p.endsWith(q) || q.endsWith(p));
  });

  if (!found) {
    const err = new Error('Forbidden: lead not assigned to you');
    err.status = 403;
    throw err;
  }
}

module.exports = { assertLeadAccess };
