// DOM overlay: HUD (hearts, hotbar, crosshair, debug), menus and the inventory.

import { BLOCKS, INVENTORY_BLOCKS, blockName } from '../blocks.js';
import { blockIcon } from './icons.js';
import { drawLogo } from './logo.js';

const $ = (sel) => document.querySelector(sel);

const HEART = [
  '.kk...kk.',
  'kwrk.krrk',
  'kwrrkrrrk',
  'krrrrrrrk',
  '.krrrrrk.',
  '..krrrk..',
  '...krk...',
  '....k....',
];

function heartImage(kind) {
  const c = document.createElement('canvas');
  c.width = 9;
  c.height = 8;
  const ctx = c.getContext('2d');
  const colors = { k: '#1b0a0a', w: '#ffb3b3', r: '#e21b1b' };
  HEART.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      let col = colors[ch];
      const empty = kind === 'empty' || (kind === 'half' && x >= 5);
      if (empty && ch !== 'k') col = '#3b2a2a';
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    });
  });
  return c.toDataURL();
}

export class UI {
  constructor() {
    this.screens = {};
    for (const el of document.querySelectorAll('.screen')) this.screens[el.id] = el;
    this.hud = $('#hud');
    this.hotbarEl = $('#hotbar');
    this.heartsEl = $('#hearts');
    this.toastEl = $('#toast');
    this.debugEl = $('#debug');
    this.badgeEl = $('#badge');
    this.hearts = { full: heartImage('full'), half: heartImage('half'), empty: heartImage('empty') };
    this.lastHealth = -1;
    this.toastTimer = null;
    for (const canvas of document.querySelectorAll('canvas.logo')) drawLogo(canvas);
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

  buildHotbar(slots, onSelect) {
    this.hotbarEl.innerHTML = '';
    this.slotEls = slots.map((id, i) => {
      const el = document.createElement('button');
      el.className = 'slot';
      el.dataset.key = String(i + 1);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelect(i);
      });
      this.hotbarEl.appendChild(el);
      return el;
    });
    this.updateHotbar(slots);
  }

  updateHotbar(slots) {
    slots.forEach((id, i) => {
      const el = this.slotEls[i];
      el.innerHTML = id ? `<img alt="${blockName(id)}" src="${blockIcon(id)}">` : '';
      el.title = id ? blockName(id) : '';
    });
  }

  selectSlot(i, id) {
    this.slotEls.forEach((el, k) => el.classList.toggle('selected', k === i));
    if (id) this.toast(blockName(id));
  }

  setHealth(h) {
    if (h === this.lastHealth) return;
    this.lastHealth = h;
    let html = '';
    for (let i = 0; i < 10; i++) {
      const v = h - i * 2;
      const kind = v >= 2 ? 'full' : v === 1 ? 'half' : 'empty';
      html += `<img src="${this.hearts[kind]}" alt="">`;
    }
    this.heartsEl.innerHTML = html;
    this.heartsEl.classList.toggle('low', h <= 6);
  }

  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('shown');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('shown'), 1400);
  }

  setBadge(text) {
    this.badgeEl.textContent = text;
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

  setUnderwater(on) {
    $('#underwater').classList.toggle('shown', on);
  }

  buildInventory(onPick) {
    const grid = $('#inv-grid');
    grid.innerHTML = '';
    for (const id of INVENTORY_BLOCKS) {
      const b = document.createElement('button');
      b.className = 'slot';
      b.title = BLOCKS[id].name;
      b.innerHTML = `<img alt="${BLOCKS[id].name}" src="${blockIcon(id)}"><span>${BLOCKS[id].name}</span>`;
      b.addEventListener('click', () => onPick(id));
      grid.appendChild(b);
    }
  }
}
