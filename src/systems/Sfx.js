import cfg from '../data/sfx.json';
import eventBus from '../utils/eventBus.js';

/**
 * Звуковые эффекты (13_ПРОМПТ, шаг 7). Файлы и громкость в src/data/sfx.json.
 * Если звук не загружен или браузер заблокировал аудио, вызов молча ничего не делает.
 */
export const Sfx = {
  preload(scene) {
    Object.entries(cfg.sounds).forEach(([name, s]) => {
      const key = `sfx_${name}`;
      if (s.file && !scene.cache.audio.exists(key)) scene.load.audio(key, s.file);
    });
  },

  play(scene, name) {
    try {
      const s = cfg.sounds[name];
      const key = `sfx_${name}`;
      if (!s || !scene?.sound || !scene.cache.audio.exists(key)) return;
      if (scene.game.registry.get('sfxMuted')) return;
      scene.sound.play(key, { volume: (s.volume ?? 0.5) * (cfg.master ?? 1) });
    } catch (e) { /* звук не критичен */ }
  },

  /** Подписка на события боя: вызывать после eventBus.clear() в BattleScene.create. */
  bindBattle(scene) {
    eventBus.on('unit_damaged', ({ isCrit }) => this.play(scene, isCrit ? 'crit' : 'hit'));
    eventBus.on('unit_missed', () => this.play(scene, 'miss'));
    eventBus.on('unit_healed', ({ amount }) => { if (amount > 0) this.play(scene, 'heal'); });
    eventBus.on('unit_died', () => this.play(scene, 'death'));
    eventBus.on('skill_used', ({ skillId }) => { if (skillId === 'pistol_shot' || skillId === 'last_argument_shot') this.play(scene, 'shot'); });
    eventBus.on('defend_action', () => this.play(scene, 'block'));
  },
};
