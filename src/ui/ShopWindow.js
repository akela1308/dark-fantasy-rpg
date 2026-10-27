/**
 * Окно торговца (МИР_РАСШИРЕНИЕ_v1.0): Frame в две колонки.
 * Слева товар лавки (и книги на прилавке), справа то, что отряд может продать этой лавке.
 * Строка: плашка «кожа», иконка, имя, остаток, цена. Клик по строке покупает или продаёт одну штуку.
 * Покупка по цене лавки (наценка, скидки по флагам и Слову), продажа ниже: 35-55% цены.
 * Вкладка «Варить»: у травницы за плату (все рецепты), в инвентаре у Таи бесплатно (только открытые рецепты).
 *
 *   new ShopWindow(scene, ws, 'vorn', { onChange, onClose })
 *   new ShopWindow(scene, ws, null, { mode: 'craft', onChange, onClose })   // Тая варит из сумки
 */
import { Frame } from './Frame.js';
import { plate } from './Plate.js';
import { nicheButton } from './NicheButton.js';
import { COLOR } from './Theme.js';
import { showToast } from './Toast.js';
import {
  SHOPS, ITEMS, itemDef, iconKey, coins, useSummary, CAT_NAMES,
  shopStock, buyPrice, sellPrice, canSell, buy, sell, shopBooks, bookPrice, buyBook,
  recipes, canCraft, craft,
} from '../systems/Economy.js';

const W = 1060, H = 640;
const ROW_H = 40, ROWS = 7;

export class ShopWindow {
  constructor(scene, ws, shopId, { mode = 'trade', onChange, onClose } = {}) {
    this.scene = scene;
    this.ws = ws;
    this.shop = shopId ? SHOPS[shopId] : null;
    this.mode = this.shop ? mode : 'craft';
    this.onChange = onChange;
    this.page = { left: 0, right: 0, craft: 0 };
    const title = this.shop ? this.shop.name : 'Тая варит';
    this.frame = new Frame(scene, { w: W, h: H, y: 350, title, onClose, backdropDepth: 7990 });
    this.parts = [];
    this.render();
  }

  get closed() { return this.frame.closed; }
  close() { this.frame.close(); }

  _clear() {
    const set = new Set(this.parts);
    this.parts.forEach(o => { try { o.destroy(); } catch {} });
    this.frame.objs = this.frame.objs.filter(o => !set.has(o));
    this.parts = [];
  }
  _add(o, dz) { this.frame.add(o, dz); this.parts.push(o); return o; }
  _text(x, y, str, kind = 'body', extra = {}) {
    const f = this.frame;
    return this._add(this.scene.add.text(f.s(x), f.s(y), str, f.style(kind, extra)));
  }
  _btn(x, y, label, w, onClick, enabled = true) {
    const b = nicheButton(this.scene, x, y, label, { w, h: 34, size: 13, onClick, depth: this.frame.depth + 6 });
    b.objs.forEach(o => { this.frame.objs.push(o); this.parts.push(o); });
    b.setEnabled(enabled);
    return b;
  }

  render() {
    this._clear();
    const f = this.frame, inn = f.inner;
    // Шапка: приветствие хозяина и вкладки
    if (this.shop) {
      this._text(inn.x, inn.y - 4, this.shop.greeting || '', 'small', { wordWrap: { width: f.s(inn.w - 260) }, color: COLOR.bone, fontStyle: 'italic' });
      if (this.shop.craft) {
        this._btn(inn.x + inn.w - 190, inn.y + 10, 'Товар', 110, () => { this.mode = 'trade'; this.render(); }, this.mode !== 'trade');
        this._btn(inn.x + inn.w - 70, inn.y + 10, 'Варить', 110, () => { this.mode = 'craft'; this.render(); }, this.mode !== 'craft');
      }
    } else {
      this._text(inn.x, inn.y - 4, '«Дай травы и склянку. Только не стой над душой, вода от этого мутнеет.»', 'small', { color: COLOR.bone, fontStyle: 'italic' });
    }
    const top = inn.y + 40;
    if (this.mode === 'craft') this._renderCraft(inn, top);
    else this._renderTrade(inn, top);
    this._renderFooter(inn);
  }

  // ── Торговля ─────────────────────────────────────────────────────────────
  _renderTrade(inn, top) {
    const colW = (inn.w - 30) / 2;
    const lx = inn.x, rx = inn.x + colW + 30;
    const shop = this.shop, ws = this.ws;
    const stock = shopStock(shop, ws.registry);

    const goods = Object.entries(stock)
      .filter(([id, n]) => n !== 0 && ITEMS[id])
      .map(([id, n]) => ({ id, def: ITEMS[id], n, price: buyPrice(shop, id, ws), kind: 'buy' }));
    shopBooks(shop, ws).forEach(b => goods.push({ id: `book_${b.id}`, def: itemDef(`book_${b.id}`), n: 1, price: bookPrice(shop, b, ws), kind: 'book', book: b }));

    const owned = ws.items();
    const wares = Object.entries(owned)
      .filter(([id, n]) => n > 0 && canSell(shop, id))
      .map(([id, n]) => ({ id, def: itemDef(id), n, price: sellPrice(shop, id), kind: 'sell' }));

    this._text(lx, top, `У ${shop.keeper === 'Водяной' ? 'Водяного' : shop.keeper}: купить`, 'small', { color: COLOR.gold });
    this._text(rx, top, `У отряда: продать${shop.buys ? ` (берёт: ${shop.buys.map(c => CAT_NAMES[c] || c).join(', ')})` : ''}`, 'small', { color: COLOR.gold });
    this._list(goods, lx, top + 24, colW, 'left', '«Пусто. Заходите после привала.»');
    this._list(wares, rx, top + 24, colW, 'right', 'Отряду нечего предложить этой лавке.');
  }

  _list(rows, x, y, w, side, emptyText) {
    const pages = Math.max(1, Math.ceil(rows.length / ROWS));
    this.page[side] = Math.min(this.page[side], pages - 1);
    const slice = rows.slice(this.page[side] * ROWS, this.page[side] * ROWS + ROWS);
    if (!rows.length) this._text(x + 8, y + 10, emptyText, 'small');
    slice.forEach((r, i) => this._row(r, x, y + i * (ROW_H + 4), w));
    if (pages > 1) {
      const py = y + ROWS * (ROW_H + 4) + 14;
      this._btn(x + 60, py, '‹', 60, () => { this.page[side]--; this.render(); }, this.page[side] > 0);
      this._text(x + w / 2, py - 8, `${this.page[side] + 1} / ${pages}`, 'small').setOrigin(0.5, 0);
      this._btn(x + w - 60, py, '›', 60, () => { this.page[side]++; this.render(); }, this.page[side] < pages - 1);
    }
  }

  _row(r, x, y, w) {
    const f = this.frame, s = f.s, sc = this.scene;
    const cy = y + ROW_H / 2;
    const pl = this._add(plate(sc, 'label', s(x + w / 2), s(cy), s(w), s(ROW_H)), 5);
    const afford = r.kind === 'sell' || this.ws.gold() >= r.price;
    pl.setAlpha(afford ? 1 : 0.6);
    const key = iconKey(sc, r.def);
    const ic = this._add(sc.add.image(s(x + 24), s(cy), key), 7);
    ic.setDisplaySize(s(28), s(28));
    const name = r.def?.name || r.id;
    const count = r.kind === 'book' ? 'книга' : r.n < 0 ? '' : `×${r.n}`;
    this._text(x + 46, cy - 9, name, 'body', { color: afford ? COLOR.text : COLOR.dim, size: 13 }).setDepth(f.depth + 8);
    if (count) this._text(x + w - 112, cy - 7, count, 'small').setDepth(f.depth + 8).setOrigin(1, 0);
    const pt = this._text(x + w - 44, cy - 8, `${r.price}`, 'body', { color: afford ? COLOR.gold : COLOR.dim, size: 13 }).setDepth(f.depth + 8).setOrigin(1, 0);
    const coin = this._add(sc.add.image(s(x + w - 28), s(cy), sc.textures.exists('icon_gold') ? 'icon_gold' : 'icon_hand'), 8);
    coin.setDisplaySize(s(16), s(16));
    void pt;

    pl.setInteractive({ useHandCursor: true });
    pl.on('pointerover', () => { pl.setTint?.(0xffe2b0); this._info(r); });
    pl.on('pointerout', () => { pl.setTint?.(0xffffff); this._info(null); });
    pl.on('pointerdown', () => this._act(r));
  }

  _act(r) {
    const ws = this.ws, sc = this.scene;
    let res;
    if (r.kind === 'buy') res = buy(this.shop, r.id, ws);
    else if (r.kind === 'sell') res = sell(this.shop, r.id, ws);
    else if (r.kind === 'book') res = buyBook(this.shop, r.book.id, ws);
    if (!res?.ok) { showToast(sc, `${r.def?.name || r.id}: ${res?.reason || 'нельзя'}`); return; }
    showToast(sc, r.kind === 'sell' ? `Продано: ${r.def.name}, +${coins(res.price)}` : `Куплено: ${r.def.name}, ${coins(res.price)}`, 'icon_gold');
    this.onChange?.({ kind: r.kind, id: r.id, book: res.book });
    this.render();
  }

  // ── Варка ────────────────────────────────────────────────────────────────
  _renderCraft(inn, top) {
    const ws = this.ws;
    const fee = this.shop?.craftFee || 0;
    const list = recipes(ws, { all: !!this.shop });
    const who = this.shop ? `${this.shop.keeper} варит за ${coins(fee)} из ваших трав` : 'Тая варит из того, что есть в сумке. Новые рецепты дают книги.';
    this._text(inn.x, top, who, 'small', { color: COLOR.gold });
    const rows = list.map(def => {
      const need = def.recipe.needs.map(x => `${ITEMS[x.id]?.name || x.id} ${Math.min(ws.items()[x.id] || 0, x.n)}/${x.n}`).join(', ');
      return { id: def.id, def, need, ok: canCraft(def.id, ws) && ws.gold() >= fee };
    });
    if (!rows.length) this._text(inn.x + 8, top + 34, 'Рецептов пока нет.', 'small');
    const perPage = ROWS;
    const pages = Math.max(1, Math.ceil(rows.length / perPage));
    this.page.craft = Math.min(this.page.craft, pages - 1);
    const sc = this.scene, f = this.frame, s = f.s;
    rows.slice(this.page.craft * perPage, this.page.craft * perPage + perPage).forEach((r, i) => {
      const y = top + 24 + i * (ROW_H + 6), cy = y + ROW_H / 2, w = inn.w;
      const pl = this._add(plate(sc, 'label', s(inn.x + w / 2), s(cy), s(w), s(ROW_H + 2)), 5).setAlpha(r.ok ? 1 : 0.6);
      const ic = this._add(sc.add.image(s(inn.x + 24), s(cy), iconKey(sc, r.def)), 7);
      ic.setDisplaySize(s(28), s(28));
      this._text(inn.x + 46, cy - 9, r.def.name, 'body', { size: 13, color: r.ok ? COLOR.text : COLOR.dim }).setDepth(f.depth + 8);
      this._text(inn.x + 300, cy - 7, r.need, 'small', { color: r.ok ? COLOR.bone : COLOR.muted }).setDepth(f.depth + 8);
      pl.setInteractive({ useHandCursor: true });
      pl.on('pointerover', () => { pl.setTint?.(0xffe2b0); this._info({ def: r.def, kind: 'craft' }); });
      pl.on('pointerout', () => { pl.setTint?.(0xffffff); this._info(null); });
      pl.on('pointerdown', () => {
        const res = craft(r.id, ws, fee);
        if (!res.ok) { showToast(sc, `${r.def.name}: ${res.reason}`); return; }
        showToast(sc, `Сварено: ${r.def.name}`, 'icon_healing_potion');
        this.onChange?.({ kind: 'craft', id: r.id });
        this.render();
      });
    });
    if (pages > 1) {
      const py = top + 24 + perPage * (ROW_H + 6) + 12;
      this._btn(inn.x + 60, py, '‹', 60, () => { this.page.craft--; this.render(); }, this.page.craft > 0);
      this._btn(inn.x + inn.w - 60, py, '›', 60, () => { this.page.craft++; this.render(); }, this.page.craft < pages - 1);
    }
  }

  // ── Низ окна: кошель и описание выбранного ───────────────────────────────
  _renderFooter(inn) {
    const f = this.frame, s = f.s, sc = this.scene;
    const y = inn.y + inn.h - 30;
    const coin = this._add(sc.add.image(s(inn.x + 12), s(y + 10), sc.textures.exists('icon_gold') ? 'icon_gold' : 'icon_hand'), 7);
    coin.setDisplaySize(s(22), s(22));
    this._text(inn.x + 30, y, `Кошель: ${coins(this.ws.gold())}`, 'body', { color: COLOR.gold });
    const notes = (this.shop?.discountIf || []).filter(d => this.ws.flag(d.flag)).map(d => d.label);
    if (this.ws.rep('word') >= 3) notes.push('ваше Слово весит');
    if (notes.length) this._text(inn.x + 30, y + 20, `Скидка: ${notes.join(', ')}`, 'small');
    this._infoText = this._text(inn.x + 300, y - 6, '', 'small', { color: COLOR.bone, wordWrap: { width: s(inn.w - 300) } });
  }

  _info(r) {
    if (!this._infoText?.active) return;
    if (!r?.def) { this._infoText.setText(''); return; }
    const sum = useSummary(r.def);
    this._infoText.setText(`${r.def.name}. ${r.def.description || ''}${sum ? ` (${sum})` : ''}`);
  }
}
