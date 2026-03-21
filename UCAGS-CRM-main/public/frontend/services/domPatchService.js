// DOM patch helper for table bodies
// Updates only changed/new rows and removes missing rows.

(function () {
  function toMap(iterable, keyFn) {
    const m = new Map();
    for (const item of iterable) {
      m.set(String(keyFn(item)), item);
    }
    return m;
  }

  function parseTr(html) {
    const tmp = document.createElement('tbody');
    tmp.innerHTML = html.trim();
    return tmp.firstElementChild;
  }

  /**
   * Patch a <tbody> with a new list of rows.
   * @param {HTMLElement} tbody
   * @param {Array<any>} rows
   * @param {(row:any)=>string|number} keyFn
   * @param {(row:any)=>string} trHtmlFn must return a single <tr>..</tr> string.
   */
  function patchTableBody(tbody, rows, keyFn, trHtmlFn) {
    if (!tbody) return;

    const nextKeys = new Set(rows.map(r => String(keyFn(r))));

    // Index existing <tr> by data-row-key
    const existing = new Map();
    Array.from(tbody.querySelectorAll('tr[data-row-key]')).forEach(tr => {
      existing.set(tr.getAttribute('data-row-key'), tr);
    });

    // Build new order
    const frag = document.createDocumentFragment();

    for (const r of rows) {
      const key = String(keyFn(r));
      const html = trHtmlFn(r);
      const nextTr = parseTr(html);
      if (!nextTr) continue;
      nextTr.setAttribute('data-row-key', key);

      const cur = existing.get(key);
      if (cur) {
        // If same HTML, keep existing node (preserves focus/scroll)
        if (cur.outerHTML === nextTr.outerHTML) {
          frag.appendChild(cur);
        } else {
          frag.appendChild(nextTr);
        }
        existing.delete(key);
      } else {
        frag.appendChild(nextTr);
      }
    }

    // Replace tbody children with new fragment (removes missing rows)
    tbody.innerHTML = '';
    tbody.appendChild(frag);
  }

  window.DOMPatcher = { patchTableBody };
})();
