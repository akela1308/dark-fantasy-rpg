import { checkRequires, applyEffects, lockReason } from './DialogueConditions.js';

/**
 * DialogueRunner: показывает диалоги из src/data/dialogues/*.json через DialoguePanel.
 *
 * Формат файла:
 * {
 *   "id": "korvin",
 *   "speakers": { "korvin": { "name": "Корвин Сухой", "portrait": "portrait_bandit_commander" } },
 *   "start": [ { "showIf": {...}, "node": "after" }, { "node": "intro" } ],
 *   "nodes": {
 *     "intro": {
 *       "speaker": "korvin",
 *       "text": "реплика" | [ { "showIf": {...}, "text": "..." }, { "text": "..." } ],
 *       "lines": [ { "showIf": {...}, "speaker": "vornag", "text": "..." } ],   // вставки спутников
 *       "effects": { ... },                                                   // при входе в узел
 *       "choices": [ { "label": "...", "requires": {...}, "showIf": {...}, "reason": "...",
 *                      "effects": {...}, "next": "id", "close": true,
 *                      "startBattle": { "battleId": "...", "onWin": "node", "onLose": "node" },
 *                      "transition": { "map": "...", "spawn": "..." } } ]
 *     }
 *   }
 * }
 * requires не выполнено: вариант серый с подписью. showIf не выполнено: варианта не видно.
 */
// Vite подставляет все файлы диалогов при сборке (вызов должен быть прямым)
const modules = import.meta.glob('../data/dialogues/*.json', { eager: true, import: 'default' });

export const DIALOGUES = Object.fromEntries(
  Object.entries(modules).map(([path, data]) => [data.id || path.split('/').pop().replace('.json', ''), data]),
);

const HERO_PORTRAIT = 'portrait_hero_duelist';

export class DialogueRunner {
  /**
   * scene: MapScene, panel: DialoguePanel, ws: WorldState,
   * hooks: { startBattle(cfg, dlgId), giveXp(x), recruit(id), dismiss(id), transition(map, spawn), refresh(), onClose() }
   */
  constructor(scene, panel, ws, hooks = {}) {
    this.scene = scene;
    this.panel = panel;
    this.ws = ws;
    this.hooks = hooks;
  }

  has(id) { return !!DIALOGUES[id]; }

  start(dlgId, nodeId = null) {
    const dlg = DIALOGUES[dlgId];
    if (!dlg) { console.warn('Нет диалога', dlgId); return false; }
    let node = nodeId;
    if (!node) {
      const entry = (dlg.start || []).find(s => checkRequires(s.showIf, this.ws).ok);
      node = entry?.node || Object.keys(dlg.nodes)[0];
    }
    this.show(dlgId, node);
    return true;
  }

  _text(value) {
    if (Array.isArray(value)) {
      const v = value.find(t => checkRequires(t.showIf, this.ws).ok);
      return v?.text || '';
    }
    return value || '';
  }

  show(dlgId, nodeId) {
    const dlg = DIALOGUES[dlgId];
    const node = dlg?.nodes?.[nodeId];
    if (!node) { console.warn('Нет узла', dlgId, nodeId); this.hooks.onClose?.(); return; }
    // Узел-развилка: сразу переходит по первому подходящему условию
    if (node.goto) {
      if (node.effects) applyEffects(node.effects, this.ws, this.hooks);
      const g = node.goto.find(x => checkRequires(x.showIf, this.ws).ok);
      if (g?.node) { this.show(dlgId, g.node); return; }
      this._close(node);
      return;
    }
    if (node.effects) applyEffects(node.effects, this.ws, this.hooks);

    const sp = dlg.speakers?.[node.speaker] || {};
    let text = this._text(node.text);
    (node.lines || []).forEach(l => {
      if (!checkRequires(l.showIf, this.ws).ok) return;
      const who = dlg.speakers?.[l.speaker]?.name || l.speaker || '';
      text += `\n\n${who ? `${who}: ` : ''}${this._text(l.text)}`;
    });

    const visible = (node.choices || []).filter(ch => checkRequires(ch.showIf, this.ws).ok);
    const choices = visible.map(ch => {
      const check = checkRequires(ch.requires, this.ws);
      return {
        label: ch.label,
        style: ch.style || (ch.startBattle ? 'attack' : ch.close && !ch.next ? 'retreat' : 'default'),
        disabled: !check.ok,
        reason: check.ok ? null : lockReason(ch, check),
        onSelect: () => this._select(dlgId, ch),
      };
    });
    // Узел без вариантов: одна кнопка «Дальше» или закрыть
    if (!choices.length) {
      choices.push({ label: node.next ? 'Дальше.' : 'Уйти.', style: 'retreat', onSelect: () => (node.next ? this.show(dlgId, node.next) : this._close(node)) });
    }

    this.panel.show({
      portraitLeft: HERO_PORTRAIT,
      portraitRight: sp.portrait || null,
      speakerName: sp.name || '',
      speakerNameLeft: 'Дуэлянт',
      text,
      choices,
    });
  }

  _select(dlgId, ch) {
    applyEffects(ch.effects, this.ws, this.hooks);
    if (ch.startBattle) {
      this.hooks.startBattle?.(ch.startBattle, dlgId);
      return;
    }
    if (ch.transition) {
      this.hooks.transition?.(ch.transition.map, ch.transition.spawn);
      return;
    }
    if (ch.next) { this.show(dlgId, ch.next); return; }
    this._close(ch);
  }

  _close(src) {
    this.panel.hide();
    this.hooks.onClose?.(src);
  }
}
