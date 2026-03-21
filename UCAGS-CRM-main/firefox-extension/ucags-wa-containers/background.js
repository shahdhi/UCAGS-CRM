/*
 * Background worker.
 * Receives messages from content-script and creates containers.
 */

const DEFAULT_CONTAINERS = [
  'Advisor_A',
  'Advisor_B',
  'Advisor_C',
  'Advisor_D'
];

async function listContainers() {
  const list = await browser.contextualIdentities.query({});
  return Array.isArray(list) ? list : [];
}

async function ensureContainer(name) {
  const existing = await browser.contextualIdentities.query({ name });
  if (existing && existing.length > 0) {
    return { name, created: false, cookieStoreId: existing[0].cookieStoreId };
  }

  // Pick a deterministic color based on name so Advisor_A..D are visually distinct.
  const palette = ['blue', 'turquoise', 'green', 'yellow', 'orange', 'red', 'pink', 'purple'];
  const idx = Math.abs(hashString(name)) % palette.length;

  const created = await browser.contextualIdentities.create({
    name,
    color: palette[idx],
    icon: 'briefcase'
  });

  return { name, created: true, cookieStoreId: created.cookieStoreId };
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return h;
}

browser.runtime.onMessage.addListener(async (msg) => {
  try {
    if (!msg || typeof msg !== 'object') return { ok: false, error: 'Invalid message' };

    if (msg.type === 'UCAGS_WA_CONTAINERS_PING') {
      return { ok: true, type: 'UCAGS_WA_CONTAINERS_PONG', version: '1.0.0' };
    }

    if (msg.type === 'UCAGS_WA_CONTAINERS_ENSURE') {
      const names = Array.isArray(msg.names) && msg.names.length ? msg.names : DEFAULT_CONTAINERS;

      // de-dupe and sanitize
      const unique = Array.from(new Set(names.map(n => String(n || '').trim()).filter(Boolean)));
      const results = [];
      for (const name of unique) {
        results.push(await ensureContainer(name));
      }

      const all = await listContainers();
      return {
        ok: true,
        type: 'UCAGS_WA_CONTAINERS_ENSURE_RESULT',
        ensured: results,
        totalContainers: all.length
      };
    }

    return { ok: false, error: 'Unknown message type' };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});
