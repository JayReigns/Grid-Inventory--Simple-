/* UI layer for the GridInventory prototype. All placement logic lives in inventory.js. */
(function () {
  'use strict';

  const CELL = 52;
  const GAP = 3;
  const PITCH = CELL + GAP;

  const $ = id => document.getElementById(id);
  const gridEl = $('grid');
  const cellsEl = $('cells');
  const itemsEl = $('items');
  const previewEl = $('preview');
  const logEl = $('log');
  const statsEl = $('stats');

  let inv = new GridInventory(5, 22);

  // --------------------------------------------------------------- helpers

  function colorFor(id) {
    const hue = (id * 137.508) % 360; // golden-angle spread
    return `hsl(${hue} 70% 62%)`;
  }

  function log(msg, cls = 'info') {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = `${new Date().toLocaleTimeString()}  ${msg}`;
    logEl.prepend(d);
    while (logEl.childElementCount > 200) logEl.lastChild.remove();
  }

  function px(cells) {
    return cells * PITCH - GAP;
  }

  function placeBox(el, x, y, w, h) {
    el.style.left = `${x * PITCH}px`;
    el.style.top = `${y * PITCH}px`;
    el.style.width = `${px(w)}px`;
    el.style.height = `${px(h)}px`;
  }

  function dimsLabel(w, h) {
    return `${w}×${h}`;
  }

  // --------------------------------------------------------------- rendering

  function buildGrid() {
    cellsEl.style.setProperty('--cols', inv.width);
    cellsEl.innerHTML = '';
    const total = inv.width * inv.height;
    for (let i = 0; i < total; i++) {
      const c = document.createElement('div');
      c.className = 'cell' + (i >= inv.totalCells ? ' void' : '');
      c.title = i < inv.totalCells ? `(${i % inv.width}, ${Math.floor(i / inv.width)})` : 'no cell';
      cellsEl.appendChild(c);
    }
    renderItems();
  }

  function renderItems(flashId = null) {
    const seen = new Set();
    for (const it of inv.items.values()) {
      seen.add(it.id);
      let el = itemsEl.querySelector(`[data-id="${it.id}"]`);
      if (!el) {
        el = document.createElement('div');
        el.className = 'item';
        el.dataset.id = it.id;
        el.style.background = colorFor(it.id);
        itemsEl.appendChild(el);
      }
      const [w, h] = GridInventory.dims(it);
      placeBox(el, it.x, it.y, w, h);
      el.innerHTML = `${dimsLabel(w, h)}<small>#${it.id}${it.rotated ? ' ↻' : ''}</small>`;
      el.title = `Item #${it.id} ${dimsLabel(it.w, it.h)}${it.rotated ? ' (rotated)' : ''} at (${it.x}, ${it.y})`;
      if (flashId === it.id) {
        el.classList.remove('flash');
        void el.offsetWidth;
        el.classList.add('flash');
      }
    }
    for (const el of [...itemsEl.children]) {
      if (!seen.has(Number(el.dataset.id))) el.remove();
    }
    statsEl.innerHTML =
      `<span>Grid <b>${inv.width}×${inv.height}</b></span>` +
      `<span>Cells <b>${inv.totalCells}</b></span>` +
      `<span>Used <b>${inv.usedCells}</b></span>` +
      `<span>Free <b>${inv.freeCells}</b></span>` +
      `<span>Items <b>${inv.items.size}</b></span>`;
  }

  function clearPreview() {
    previewEl.innerHTML = '';
  }

  function renderPreview(drag) {
    clearPreview();
    if (drag.target == null) return;
    const item = inv.getItem(drag.id);
    const main = document.createElement('div');

    if (drag.plan) {
      const m = drag.plan.moved;
      const [w, h] = GridInventory.dims(item, m.rotated);
      main.className = 'pv ok';
      placeBox(main, m.x, m.y, w, h);
      const tags = [];
      if (drag.plan.autoRotated) tags.push('↻ auto-rotate');
      if (drag.plan.shifted) tags.push(`↔ shifted ${drag.plan.shifted}`);
      if (tags.length) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = tags.join(' · ');
        main.appendChild(tag);
      }
      if (drag.plan.shifted) {
        // faint outline of where the user actually dropped it
        const [hw, hh] = GridInventory.dims(item, drag.rotated);
        const drop = document.createElement('div');
        drop.className = 'pv drop';
        placeBox(drop, drag.target.x - drag.grabX, drag.target.y - drag.grabY, hw, hh);
        previewEl.appendChild(drop);
      }
    } else {
      const [w, h] = GridInventory.dims(item, drag.rotated);
      main.className = 'pv bad';
      placeBox(main, drag.target.x - drag.grabX, drag.target.y - drag.grabY, w, h);
    }
    previewEl.appendChild(main);

    if (drag.plan) {
      for (const p of drag.plan.placements) {
        if (p.id === drag.id) continue;
        const other = inv.getItem(p.id);
        if (p.x === other.x && p.y === other.y && p.rotated === other.rotated) continue;
        const [pw, ph] = GridInventory.dims(other, p.rotated);
        const box = document.createElement('div');
        box.className = 'pv shift';
        box.style.borderColor = colorFor(p.id);
        box.textContent = '';
        placeBox(box, p.x, p.y, pw, ph);
        previewEl.appendChild(box);
      }
    }
  }

  // --------------------------------------------------------------- dragging

  let drag = null;

  function cellFromPointer(e) {
    const r = cellsEl.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / PITCH);
    const y = Math.floor((e.clientY - r.top) / PITCH);
    if (x < 0 || y < 0 || x >= inv.width || y >= inv.height) return null;
    return { x, y };
  }

  function updateGhostSize() {
    const item = inv.getItem(drag.id);
    const [w, h] = GridInventory.dims(item, drag.rotated);
    drag.ghost.style.width = `${px(w)}px`;
    drag.ghost.style.height = `${px(h)}px`;
    drag.ghost.innerHTML = `${dimsLabel(w, h)}<small>#${item.id}${drag.rotated ? ' ↻' : ''}</small>`;
  }

  function moveGhost(e) {
    drag.ghost.style.left = `${e.clientX - (drag.grabX * PITCH + CELL / 2)}px`;
    drag.ghost.style.top = `${e.clientY - (drag.grabY * PITCH + CELL / 2)}px`;
  }

  function recomputePlan(e) {
    const target = cellFromPointer(e);
    const key = target ? `${target.x},${target.y},${drag.rotated}` : 'none';
    if (key === drag.key) return;
    drag.key = key;
    drag.target = target;
    drag.plan = target
      ? inv.planMove(drag.id, target.x, target.y, drag.grabX, drag.grabY, drag.rotated)
      : null;
    renderPreview(drag);
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    const el = e.target.closest('.item');
    if (!el) return;
    e.preventDefault();

    const id = Number(el.dataset.id);
    const item = inv.getItem(id);
    const [w, h] = GridInventory.dims(item);
    const r = el.getBoundingClientRect();
    const grabX = Math.max(0, Math.min(w - 1, Math.floor((e.clientX - r.left) / PITCH)));
    const grabY = Math.max(0, Math.min(h - 1, Math.floor((e.clientY - r.top) / PITCH)));

    const ghost = el.cloneNode(true);
    ghost.classList.add('ghost');
    ghost.classList.remove('dragging');
    document.body.appendChild(ghost);

    drag = {
      id, grabX, grabY,
      rotated: item.rotated,
      origin: { x: item.x, y: item.y, rotated: item.rotated },
      ghost, el, key: null, target: null, plan: null, moved: false,
      startX: e.clientX, startY: e.clientY,
    };
    el.classList.add('dragging');
    moveGhost(e);
    recomputePlan(e);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', cancelDrag);
  }

  function onPointerMove(e) {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) > 3) drag.moved = true;
    moveGhost(e);
    recomputePlan(e);
  }

  function onPointerUp(e) {
    if (!drag) return;
    const d = drag;
    const item = inv.getItem(d.id);
    const m = d.plan ? d.plan.moved : null;
    const unchanged =
      m && m.x === d.origin.x && m.y === d.origin.y && m.rotated === d.origin.rotated;

    if (!d.moved && d.rotated === d.origin.rotated) {
      // Simple click, nothing to do (lets dblclick/contextmenu work).
    } else if (!d.target) {
      log(`moveItem(#${d.id}) → dropped outside grid, snapped back`, 'bad');
    } else if (unchanged) {
      // no-op
    } else if (d.plan) {
      inv.applyPlan(d.plan);
      const parts = [];
      if (d.plan.autoRotated) parts.push('auto-rotated');
      else if (m.rotated !== d.origin.rotated) parts.push('rotated');
      if (d.plan.shifted) parts.push(`shifted ${d.plan.shifted} cells from drop`);
      if (d.plan.changed) {
        parts.push(`${d.plan.changed} other item${d.plan.changed > 1 ? 's' : ''} shifted${d.plan.repacked ? ' (full repack)' : ''}`);
      }
      log(`moveItem(#${d.id}) → (${m.x}, ${m.y}) ✓${parts.length ? ' ' + parts.join(', ') : ''}`, 'ok');
    } else {
      const ox = d.target.x - d.grabX;
      const oy = d.target.y - d.grabY;
      log(`moveItem(#${d.id}) → (${ox}, ${oy}) ✗ no arrangement fits, snapped back`, 'bad');
    }
    cleanupDrag();
    renderItems(item ? item.id : null);
  }

  function cancelDrag() {
    if (!drag) return;
    log(`moveItem(#${drag.id}) cancelled`, 'info');
    cleanupDrag();
    renderItems();
  }

  function cleanupDrag() {
    drag.ghost.remove();
    drag.el.classList.remove('dragging');
    clearPreview();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', cancelDrag);
    drag = null;
  }

  function rotateDrag() {
    const item = inv.getItem(drag.id);
    const [, h] = GridInventory.dims(item, drag.rotated); // current displayed height
    // 90° clockwise: cell (gx, gy) of a w×h box maps to (h-1-gy, gx) of the h×w box.
    const ngx = h - 1 - drag.grabY;
    const ngy = drag.grabX;
    drag.grabX = ngx;
    drag.grabY = ngy;
    drag.rotated = !drag.rotated;
    drag.key = null;
    updateGhostSize();
  }

  itemsEl.addEventListener('pointerdown', onPointerDown);

  itemsEl.addEventListener('contextmenu', e => {
    const el = e.target.closest('.item');
    if (!el) return;
    e.preventDefault();
    if (drag) return;
    const id = Number(el.dataset.id);
    const ok = inv.rotateItem(id);
    log(`rotateItem(#${id}) ${ok ? '✓' : '✗ cannot rotate in place'}`, ok ? 'ok' : 'bad');
    renderItems(id);
  });

  itemsEl.addEventListener('dblclick', e => {
    const el = e.target.closest('.item');
    if (!el) return;
    const id = Number(el.dataset.id);
    inv.removeItem(id);
    log(`removeItem(#${id})`, 'info');
    renderItems();
  });

  window.addEventListener('keydown', e => {
    if (!drag) return;
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      rotateDrag();
      // Re-evaluate at the last pointer position using the ghost's location.
      const gr = drag.ghost.getBoundingClientRect();
      recomputePlan({
        clientX: gr.left + drag.grabX * PITCH + CELL / 2,
        clientY: gr.top + drag.grabY * PITCH + CELL / 2,
      });
    } else if (e.key === 'Escape') {
      cancelDrag();
    }
  });

  // --------------------------------------------------------------- controls

  function addItem(w, h) {
    const res = inv.addItem(w, h);
    if (res) {
      const [dw, dh] = GridInventory.dims(res);
      log(
        `addItem(${w}, ${h}) ✓ #${res.id} at (${res.x}, ${res.y})` +
        `${res.rotated ? ` rotated → ${dimsLabel(dw, dh)}` : ''}` +
        `${res._repacked ? ' (rearranged existing items)' : ''}`,
        'ok'
      );
      renderItems(res.id);
    } else {
      log(`addItem(${w}, ${h}) ✗ false — does not fit (free: ${inv.freeCells})`, 'bad');
    }
    return res;
  }

  $('btn-add').addEventListener('click', () => {
    addItem(Number($('add-w').value), Number($('add-h').value));
  });

  document.querySelectorAll('[data-size]').forEach(b => {
    b.addEventListener('click', () => {
      const [w, h] = b.dataset.size.split(',').map(Number);
      $('add-w').value = w;
      $('add-h').value = h;
      addItem(w, h);
    });
  });

  const RANDOM_SIZES = [[1, 1], [1, 1], [2, 1], [1, 2], [2, 2], [3, 1], [4, 1], [3, 2], [2, 3], [4, 4]];
  function randomSize() {
    return RANDOM_SIZES[Math.floor(Math.random() * RANDOM_SIZES.length)];
  }

  $('btn-random').addEventListener('click', () => {
    const [w, h] = randomSize();
    addItem(w, h);
  });

  $('btn-fill').addEventListener('click', () => {
    let added = 0, fails = 0;
    while (inv.freeCells > 0 && fails < 12) {
      const [w, h] = randomSize();
      if (inv.addItem(w, h)) { added++; fails = 0; } else fails++;
    }
    log(`fill: added ${added} item(s), free cells left: ${inv.freeCells}`, 'info');
    renderItems();
  });

  function rebuild(width, cells) {
    width = Math.max(1, Math.floor(width));
    cells = Math.max(1, Math.floor(cells));
    inv = new GridInventory(width, cells);
    $('cfg-width').value = width;
    $('cfg-cells').value = cells;
    buildGrid();
    log(`new grid: width ${width}, ${cells} cells → ${inv.height} rows` +
      (cells % width ? `, last row has ${cells % width} cell(s)` : ''), 'info');
  }

  $('btn-rebuild').addEventListener('click', () => {
    rebuild(Number($('cfg-width').value), Number($('cfg-cells').value));
  });

  $('btn-clear').addEventListener('click', () => {
    inv.clear();
    log('cleared all items', 'info');
    renderItems();
  });

  document.querySelectorAll('[data-preset]').forEach(b => {
    b.addEventListener('click', () => {
      const [w, c] = b.dataset.preset.split(',').map(Number);
      rebuild(w, c);
    });
  });

  // --------------------------------------------------------------- boot

  buildGrid();
  log('ready — width 5, 22 cells (last row has 2 cells)', 'info');
  addItem(2, 1);
  addItem(4, 1);
  addItem(2, 2);
  addItem(1, 1);
  addItem(3, 1);
})();
