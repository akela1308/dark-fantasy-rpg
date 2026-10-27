/**
 * «Меню» на карте (этап 6): Продолжить, громкость музыки и звуков, выйти в титул.
 * Громкость хранится в браузере игрока (localStorage), сохранение игры при выходе пишется как обычно.
 */
import { Frame } from './Frame.js';
import { nicheButton } from './NicheButton.js';
import { COLOR } from './Theme.js';

const VOL_KEY = 'mortis_volume';

/** Громкость из прошлой сессии (0..1). Вызывается при старте игры. */
export function applySavedVolume(game) {
  try {
    const v = parseFloat(localStorage.getItem(VOL_KEY));
    if (!Number.isNaN(v)) game.sound.volume = Math.max(0, Math.min(1, v));
  } catch {}
}

export function openGameMenu(scene, { onExit } = {}) {
  const f = new Frame(scene, { w: 460, h: 420, title: 'Меню', y: 340, backdropDepth: 7990 });
  const cx = 640;
  let y = f.inner.y + 26;
  const add = b => { b.objs.forEach(o => f.add(o, 10)); return b; };
  add(nicheButton(scene, cx, y, 'Продолжить', { w: 260, depth: 9820, onClick: () => f.close() }));
  y += 64;

  // Громкость: общий уровень звука игры шагом 10%
  const volText = f.text(cx, y - 10, '', 'body', { color: COLOR.text }).setOrigin(0.5, 0.5);
  const paint = () => volText.setText(`Громкость: ${Math.round(scene.sound.volume * 100)}%`);
  const setVol = d => {
    scene.sound.volume = Math.max(0, Math.min(1, Math.round((scene.sound.volume + d) * 10) / 10));
    try { localStorage.setItem(VOL_KEY, String(scene.sound.volume)); } catch {}
    paint();
  };
  paint();
  add(nicheButton(scene, cx - 150, y - 10, '−', { w: 44, h: 36, size: 20, depth: 9820, onClick: () => setVol(-0.1) }));
  add(nicheButton(scene, cx + 150, y - 10, '+', { w: 44, h: 36, size: 20, depth: 9820, onClick: () => setVol(0.1) }));
  y += 44;
  const reg = scene.game.registry;
  const sfxLabel = () => `Звуки боя и шагов: ${reg.get('sfxMuted') ? 'выключены' : 'включены'}`;
  const sfx = add(nicheButton(scene, cx, y, sfxLabel(), { w: 300, h: 36, size: 14, depth: 9820, onClick: () => {
    reg.set('sfxMuted', !reg.get('sfxMuted'));
    sfx.text.setText(sfxLabel());
  } }));
  y += 70;
  add(nicheButton(scene, cx, y, 'Выйти в титул', { w: 260, depth: 9820, color: '#d8b070', onClick: () => { f.close(true); onExit?.(); } }));
  f.text(cx, y + 30, 'Игра сохранится на этом месте', 'small').setOrigin(0.5, 0);
  return f;
}
