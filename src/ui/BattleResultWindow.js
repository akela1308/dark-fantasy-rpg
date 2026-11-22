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
  const textInset = 44;
  const buttonOffset = 78;
  const buttonHeight = 44;
  const noteLines = note ? note.split('\n').length : 0;
  const h = Math.max(300, 190 + rows.length * rowH + noteLines * 22 + (buttons.length ? 70 : 0));
  const frameConfig = {
    w: 560, h, title: victory ? 'Победа' : 'Вы пали', depth,
    closable: false, closeOnOutside: false,
  };
  let f = new Frame(scene, frameConfig);
  const zoom = scene.cameras.main.zoom || 1;
  const makeText = (text, width, style) => scene.make.text({
    text,
    style: f.style('body', {
      ...style,
      wordWrap: { width: f.s(width), useAdvancedWrap: true },
    }),
  }, false);
  const resultRows = rows.map(r => {
    const text = makeText(r.text, f.inner.w - textInset - 4, { size: 17, color: r.color || COLOR.text });
    return { icon: r.icon, text, height: Math.max(rowH, text.height * zoom + 8) };
  });
  const noteText = note ? makeText(note, f.inner.w - 8, {
    size: 15, color: COLOR.muted, align: 'center', lineSpacing: f.s(6),
  }).setOrigin(0.5, 0) : null;

  const contentHeight = 6 + resultRows.reduce((sum, row) => sum + row.height, 0)
    + (noteText ? 4 + noteText.height * zoom : 0);
  const innerBottom = f.inner.y + f.inner.h;
  const buttonTop = f.rect.y + f.rect.h - buttonOffset - buttonHeight / 2;
  const contentBottom = buttons.length ? Math.min(innerBottom, buttonTop - 12) : innerBottom;
  const overflow = Math.ceil(f.inner.y + contentHeight - contentBottom);
  if (overflow > 0) {
    f.close(true);
    f = new Frame(scene, { ...frameConfig, h: h + overflow });
  }

  if (!victory) f.objs.find(o => o.type === 'Text')?.setColor('#d05050');
  const { x, y, w } = f.inner;
  let cy = y + 6;
  resultRows.forEach(({ icon, text, height }) => {
    if (icon && scene.textures.exists(icon)) {
      f.add(scene.add.image(f.s(x + 20), f.s(cy + 12), icon).setDisplaySize(f.s(26), f.s(26)));
    }
    f.add(scene.add.existing(text.setPosition(f.s(x + textInset), f.s(cy))));
    cy += height;
  });
  if (noteText) {
    f.add(scene.add.existing(noteText.setPosition(f.s(x + w / 2), f.s(cy + 4))));
  }
  const by = f.rect.y + f.rect.h - buttonOffset;
  const bw = buttons.length > 1 ? 200 : 240;
  buttons.forEach((b, i) => {
    const bx = 640 + (i - (buttons.length - 1) / 2) * (bw + 20);
    const btn = nicheButton(scene, bx, by, b.label, { w: bw, h: buttonHeight, onClick: b.onClick, depth: depth + 10, color: b.color });
    btn.objs.forEach(o => f.add(o, 10));
  });
  return f;
}
