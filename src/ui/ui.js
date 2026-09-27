// DOM overlay: HUD (hearts, hunger, air, hotbar, crosshair, debug), menus,
// the inventory / chest / crafting screen and the creative item palette.

import { itemName, itemDef, RECIPES, CREATIVE_ITEMS } from '../items.js';
import { clickSlot, maxStack } from '../game/inventory.js';
import { itemIcon } from './icons.js';
import { drawLogo } from './logo.js';

const $ = (sel) => document.querySelector(sel);

function pixelIcon(rows, colors) {
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const ctx = c.getContext('2d');
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      ctx.fillStyle = colors[ch];
      ctx.fillRect(x, y, 1, 1);
    });
  });
  return c.toDataURL();
}

const HEART = ['.kk...kk.', 'kwrk.krrk', 'kwrrkrrrk', 'krrrrrrrk', '.krrrrrk.', '..krrrk..', '...krk...', '....k....'];
// A round meat-ball on a bone: the hunger icon.
const FOOD = ['....kkk..', '...kwmmk.', '..kmmmmmk', '..kmmmmdk', '.kkmmmddk', 'kbkkddkk.', 'kbbk.kk..', '.kk......'];
const BUBBLE = ['..kkk..', '.kwwbk.', 'kwbbbbk', 'kbbbbbk', 'kbbbbbk', '.kbbbk.', '..kkk..'];

function variants(rows, full, emptyColor) {
  const make = (mode) => pixelIcon(rows.map((r) => [...r].map((ch, x) => {
    if (ch === '.' || ch === 'k') return ch;
    const empty = mode === 'empty' || (mode === 'half' && x >= Math.ceil(rows[0].length / 2));
    return empty ? 'e' : ch;
  }).join('')), { ...full, e: emptyColor });
  return { full: make('full'), half: make('half'), empty: make('empty') };
}

export class UI {
  constructor(game) {
    this.game = game;
    this.screens = {};
    for (const el of document.querySelectorAll('.screen')) this.screens[el.id] = el;
    this.hud = $('#hud');
    this.hotbarEl = $('#hotbar');
    this.heartsEl = $('#hearts');
    this.foodEl = $('#food');
    this.airEl = $('#air');
    this.toastEl = $('#toast');
    this.debugEl = $('#debug');
    this.badgeEl = $('#badge');
    this.icons = {
      heart: variants(HEART, { k: '#1b0a0a', w: '#ffb3b3', r: '#e21b1b' }, '#3b2a2a'),
      food: variants(FOOD, { k: '#2a140a', w: '#ffd3a8', m: '#c8642a', d: '#8a3a16', b: '#efe8d8' }, '#3b2a22'),
      air: pixelIcon(BUBBLE, { k: '#0c2a5a', w: '#ffffff', b: '#5aa8ff' }),
    };
    this.lastHud = '';
    this.toastTimer = null;
    this.invVersion = -1;
    for (const canvas of document.querySelectorAll('canvas.logo')) drawLogo(canvas);
    this.cursorEl = $('#cursor-stack');
    document.addEventListener('mousemove', (e) => {
      this.cursorEl.style.transform = `translate(${e.clientX - 22}px, ${e.clientY - 22}px)`;
    });
  }

  show(name) {
    for (const [id, el] of Object.entries(this.screens)) el.classList.toggle('hidden', id !== name);
    this.current = name;
  }

  hideScreens() {
    this.show(null);
  }

  setHud(visible) {
    this.hud.classList.toggle('hidden', !visible);
  }

  setLoading(p, label) {
    $('#load-bar').style.width = `${Math.round(p * 100)}%`;
    if (label) $('#load-label').textContent = label;
  }

  // ------------------------------------------------------------------ hotbar & bars

  slotHtml(stack, showCount = true) {
    if (!stack) return '';
    const def = itemDef(stack.id);
    let html = `<img alt="" src="${itemIcon(stack.id)}">`;
    if (showCount && stack.count > 1) html += `<span class="count">${stack.count}</span>`;
    if (stack.dur !== undefined && def?.durability && stack.dur < def.durability) {
      const f = Math.max(0, stack.dur / def.durability);
      html += `<span class="dur"><i style="width:${Math.round(f * 100)}%;background:hsl(${Math.round(f * 120)},80%,50%)"></i></span>`;
    }
    return html;
  }

  buildHotbar(onSelect) {
    this.hotbarEl.innerHTML = '';
    this.slotEls = [];
    for (let i = 0; i < 9; i++) {
      const el = document.createElement('button');
      el.className = 'slot';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.game.state === 'inventory') this.onSlotClick(this.game.inventory, i, e.button === 2 || e.shiftKey);
        else onSelect(i);
      });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (this.game.state === 'inventory') this.onSlotClick(this.game.inventory, i, true);
      });
      this.hotbarEl.appendChild(el);
      this.slotEls.push(el);
    }
    this.invVersion = -1;
    this.updateHud();
  }

  selectSlot(i, id) {
    this.slotEls.forEach((el, k) => el.classList.toggle('selected', k === i));
    if (id) this.toast(itemName(id));
  }

  updateHud() {
    const g = this.game;
    const inv = g.inventory;
    if (inv.version !== this.invVersion) {
      this.invVersion = inv.version;
      for (let i = 0; i < 9; i++) this.slotEls[i].innerHTML = this.slotHtml(inv.get(i), g.mode === 'survival');
      if (g.state === 'inventory') this.renderInventory();
    }
    const h = Math.ceil(g.player.health);
    const f = Math.ceil(g.food);
    const a = g.player.headInWater || g.air < 10 ? Math.ceil(g.air) : -1;
    const key = `${h}|${f}|${a}|${g.mode}`;
    if (key === this.lastHud) return;
    this.lastHud = key;
    const bar = (value, set) => {
      let html = '';
      for (let i = 0; i < 10; i++) {
        const v = value - i * 2;
        html += `<img src="${set[v >= 2 ? 'full' : v === 1 ? 'half' : 'empty']}" alt="">`;
      }
      return html;
    };
    this.heartsEl.innerHTML = bar(h, this.icons.heart);
    this.heartsEl.classList.toggle('low', h <= 6);
    this.foodEl.innerHTML = [...Array(10)].map((_, i) => {
      const v = f - (9 - i) * 2;
      return `<img src="${this.icons.food[v >= 2 ? 'full' : v === 1 ? 'half' : 'empty']}" alt="">`;
    }).join('');
    this.airEl.innerHTML = a >= 0 ? [...Array(10)].map((_, i) => (i >= 10 - a ? `<img src="${this.icons.air}" alt="">` : '<span></span>')).join('') : '';
  }

  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('shown');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('shown'), 1600);
  }

  setBadge(text) {
    if (this.badgeEl.textContent !== text) this.badgeEl.textContent = text;
    this.badgeEl.classList.toggle('shown', !!text);
  }

  setDebug(text) {
    this.debugEl.textContent = text;
  }

  toggleDebug(force) {
    return !this.debugEl.classList.toggle('hidden', force === undefined ? undefined : !force);
  }

  flashDamage() {
    const el = $('#damage-flash');
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  sleep() {
    const el = $('#sleep-fade');
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  }

  setUnderwater(on) {
    $('#underwater').classList.toggle('shown', on);
  }

  // ------------------------------------------------------------------ inventory screen

  onSlotClick(inv, i, right) {
    const g = this.game;
    g.cursor = clickSlot(inv, i, g.cursor, right);
    this.renderCursor();
    this.invVersion = -1;
    this.renderInventory();
    this.updateHud();
  }

  renderCursor() {
    const c = this.game.cursor;
    this.cursorEl.innerHTML = c ? this.slotHtml(c) : '';
    this.cursorEl.classList.toggle('shown', !!c);
  }

  _grid(el, inv, from, to) {
    el.innerHTML = '';
    for (let i = from; i < to; i++) {
      const b = document.createElement('button');
      b.className = 'slot';
      b.innerHTML = this.slotHtml(inv.get(i));
      const s = inv.get(i);
      if (s) b.title = itemName(s.id);
      b.addEventListener('click', (e) => this.onSlotClick(inv, i, e.shiftKey));
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.onSlotClick(inv, i, true);
      });
      el.appendChild(b);
    }
  }

  renderInventory() {
    const g = this.game;
    const creative = g.mode === 'creative';
    $('#inv-title').textContent = g.openChest ? 'Chest' : creative ? 'All items' : 'Inventory';
    const chestEl = $('#chest-grid');
    chestEl.classList.toggle('hidden', !g.openChest);
    if (g.openChest) this._grid(chestEl, g.openChest, 0, 27);
    const creativeEl = $('#creative-grid');
    creativeEl.classList.toggle('hidden', !creative || !!g.openChest);
    if (creative && !g.openChest && !creativeEl.childElementCount) {
      for (const id of CREATIVE_ITEMS) {
        const b = document.createElement('button');
        b.className = 'slot';
        b.title = itemName(id);
        b.innerHTML = `<img alt="" src="${itemIcon(id)}">`;
        b.addEventListener('click', () => {
          const stack = { id, count: maxStack(id) };
          if (itemDef(id).durability) stack.dur = itemDef(id).durability;
          g.inventory.set(g.selected, stack);
          g.ui.selectSlot(g.selected, id);
          this.updateHud();
        });
        creativeEl.appendChild(b);
      }
    }
    this._grid($('#main-grid'), g.inventory, 9, 36);
    this._grid($('#hot-grid'), g.inventory, 0, 9);
    this.renderRecipes();
    this.renderCursor();
  }

  renderRecipes() {
    const g = this.game;
    const list = $('#recipe-list');
    const panel = $('#craft-panel');
    panel.classList.toggle('hidden', !!g.openChest);
    if (g.openChest) return;
    const st = g.station || {};
    $('#craft-station').textContent = st.table
      ? st.furnace ? 'Using a crafting table and furnace' : 'Using a crafting table'
      : st.furnace ? 'Using a furnace' : 'Stand near a crafting table or furnace for more recipes';
    const rows = RECIPES.map((r) => ({ r, ok: g.canCraft(r) }))
      .sort((a, b) => (b.ok ? 1 : 0) - (a.ok ? 1 : 0));
    list.innerHTML = '';
    for (const { r, ok } of rows) {
      const b = document.createElement('button');
      b.className = `recipe${ok ? '' : ' locked'}`;
      const needs = r.inputs.map(([id, n]) => {
        const have = g.mode === 'creative' || g.inventory.count(id) >= n;
        return `<span class="need${have ? '' : ' missing'}" title="${itemName(id)}"><img alt="" src="${itemIcon(id)}">${n}</span>`;
      }).join('');
      const tag = r.station ? `<span class="station">${r.station === 'table' ? 'Table' : 'Furnace'}</span>` : '';
      b.innerHTML = `<span class="out"><img alt="" src="${itemIcon(r.out)}"><b>${r.count > 1 ? `${r.count}× ` : ''}${itemName(r.out)}</b></span><span class="needs">${needs}${tag}</span>`;
      b.addEventListener('click', (e) => {
        let n = e.shiftKey ? 8 : 1;
        while (n-- > 0 && g.craft(r));
        this.invVersion = -1;
        this.updateHud();
        this.renderInventory();
      });
      list.appendChild(b);
    }
  }
}
