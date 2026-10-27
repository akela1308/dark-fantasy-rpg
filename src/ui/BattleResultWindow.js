/**
 * Окно итога боя (этап 6): рамка с медальоном, «Победа» / «Вы пали» капителью,
 * опыт и добыча строками с иконками, кнопки-ниши внизу.
 *
 * showBattleResult(scene, { victory, rows: [{ icon, text, color }], note, buttons: [{ label, onClick, color }] })
 */
import { Frame } from './Frame.js';
import { nicheButton } from './NicheButton.js';
import { COLOR } from './Theme.js';

export function showBattleResult(scene, { victory = true, rows = [], note = '', buttons = [], depth = 2000 }) {
  const rowH = 34;
  const noteLines = note ? note.split('\n').length : 0;
  const h = Math.max(300, 190 + rows.length * rowH + noteLines * 22 + (buttons.length ? 70 : 0));
  const f = new Frame(scene, {
    w: 560, h, title: victory ? 'Победа' : 'Вы пали', depth,
    closable: false, closeOnOutside: false,
  });
  if (!victory) f.objs.find(o => o.type === 'Text')?.setColor('#d05050');
  const { x, y, w } = f.inner;
  let cy = y + 6;
  rows.forEach(r => {
    if (r.icon && scene.textures.exists(r.icon)) f.add(scene.add.image(x + 20, cy + 12, r.icon).setDisplaySize(26, 26));
    f.text(x + 44, cy, r.text, 'body', { size: 17, color: r.color || COLOR.text });
    cy += rowH;
  });
  if (note) {
    f.text(x + w / 2, cy + 4, note, 'body', { size: 15, color: COLOR.muted, align: 'center', lineSpacing: 6 }).setOrigin(0.5, 0);
    cy += noteLines * 22 + 8;
  }
  const by = f.rect.y + f.rect.h - 78;
  const bw = buttons.length > 1 ? 200 : 240;
  buttons.forEach((b, i) => {
    const bx = 640 + (i - (buttons.length - 1) / 2) * (bw + 20);
    const btn = nicheButton(scene, bx, by, b.label, { w: bw, onClick: b.onClick, depth: depth + 10, color: b.color });
    btn.objs.forEach(o => f.add(o, 10));
  });
  return f;
}
