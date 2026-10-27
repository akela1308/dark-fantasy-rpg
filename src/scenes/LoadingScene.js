import * as Phaser from 'phaser/dist/phaser.esm.js';
import MAP_CONFIGS from '../data/maps.json';
import { loadSheetOnce } from '../utils/loadOnce.js';
import { Sfx } from '../systems/Sfx.js';
import { PartySystem } from '../systems/PartySystem.js';
import { DIALOGUES } from '../systems/DialogueRunner.js';
import MAP_ANIMS from '../data/map_animations.json';
import BATTLE_ANIM_DATA from '../data/animations.json';
import unitsList from '../data/units.json';

/**
 * LoadingScene - экран загрузки с картинкой по центру и прогресс баром.
 */
export class LoadingScene extends Phaser.Scene {
  /**
   * Видеопамять (этап 8): по пути на карту выгружаем листы анимаций NPC других карт и боевые листы врагов
   * прошедшего боя (у отряда листы остаются, они нужны в каждом бою). Вместе с текстурой убирается анимация.
   */
  _unloadSheets(destMap) {
    const keep = new Set();
    (destMap.npcs || []).forEach(n => {
      const c = MAP_ANIMS[n.spriteKey];
      if (c) [c.idle, ...(c.ambient || [])].forEach(a => a && keep.add(a.key));
    });
    const drop = new Set();
    Object.values(MAP_ANIMS).forEach(c => [c.idle, ...(c.ambient || [])].forEach(a => { if (a && !keep.has(a.key)) drop.add(a.key); }));
    const party = new Set(PartySystem.getParty(this.game.registry));
    const partyKeys = new Set(unitsList.filter(u => party.has(u.id)).flatMap(u => [u.id, u.spriteKey]).filter(Boolean));
    Object.entries(BATTLE_ANIM_DATA).forEach(([id, c]) => {
      if (partyKeys.has(id)) return;
      Object.values(c.anims || {}).forEach(a => drop.add(a.key));
    });
    let n = 0;
    drop.forEach(k => {
      if (!this.textures.exists(k)) return;
      if (this.anims.exists(k)) this.anims.remove(k);
      this.textures.remove(k);
      n++;
    });
    if (n && import.meta.env.DEV) console.log(`[LoadingScene] выгружено листов: ${n}`);
  }

  constructor() {
    super({ key: 'LoadingScene' });
  }

  init(data) {
    // Куда идти после загрузки и с какими данными
    this._destination     = data?.destination     || 'MapScene';
    this._destinationData = data?.destinationData || { mapKey: 'map1' };
  }

  preload() {
    const W = this.scale.width;
    const H = this.scale.height;

    // Чёрный фон сразу
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000);

    // Прогресс бар (рисуем до загрузки картинки)
    const barW = 400;
    const barH = 6;
    const barX = W / 2 - barW / 2;
    const barY = H - 50;

    this.add.rectangle(W / 2, barY, barW, barH, 0x333333).setOrigin(0.5);
    const barFill = this.add.rectangle(barX, barY, 1, barH, 0xC9A84C).setOrigin(0, 0.5);

    // Слушаем прогресс
    this.load.on('progress', (value) => {
      barFill.width = Math.max(1, barW * value);
    });

    this.load.on('complete', () => {
      this.scene.start(this._destination, this._destinationData);
    });

    // Сначала загружаем картинку
    this.load.image('loading_bg', 'loading.png');

    // Когда картинка загружена - показываем её по центру без растяжки
    this.load.once('filecomplete-image-loading_bg', () => {
      const img = this.add.image(W / 2, H / 2, 'loading_bg');
      // Масштабируем чтобы вписалась в экран, сохраняя пропорции
      const scaleX = W / img.width;
      const scaleY = H / img.height;
      const scale  = Math.min(scaleX, scaleY, 1); // не увеличиваем если меньше экрана
      img.setScale(scale);
    });

    // Хелпер: загружаем только если ещё нет в кэше
    const queued = new Set();
    const img  = (key, path) => { if (!this.textures.exists(key) && !queued.has(key)) { queued.add(key); this.load.image(key, path); } };
    const sheet = (key, path, cfg) => { if (!this.textures.exists(key)) this.load.spritesheet(key, path, cfg); };

    // Спрайты (бой)
    const sprites = [
      'hero_duelist','companion_brawler','companion_healer',
      'bandit_commander','bandit_brawler','bandit_archer',
      'kikimora','swamp_knight','swamp_elf_battle'
    ];
    sprites.forEach(id => img(id, `sprites/${id}.png`));

    // Портреты (бой)
    sprites.forEach(id => img(`portrait_${id}`, `portraits/${id}.png`));

    // Фон боя и UI
    img('battle_bg',    'battle_bg.png');
    img('battle_bg_swamp', 'battle_bg_swamp.png');
    img('dialog_frame', 'ui/dialog_frame.png');

    // UI ассеты (портреты, скиллы, панели)
    img('skill_button',         'ui/skill_button.png');
    img('hp_bar_frame',         'ui/hp_bar_frame.png');
    img('panel_frame',          'ui/panel_frame.png');
    img('frame_gothic',         'ui/frame_gothic_v1.png');
    img('character_sheet_bg',   'ui/character_sheet_bg.png');
    img('map_menu_button',      'ui/map_menu_button.png');
    img('bottom_panel',         'ui/bottom_panel.png');
    img('bottom_panel1',        'ui/bottom_panel1.png');
    img('panel_divider',        'ui/panel_divider.png');
    img('inventory_slot',       'ui/inventory_slot.png');
    img('icon_rapier_strike',   'ui/icon_rapier_strike.png');
    img('icon_dueling_stance',  'ui/icon_dueling_stance.png');
    img('icon_pistol',          'ui/icon_pistol.png');
    img('bleeding_curse',       'ui/bleeding_curse.png');
    img('healing_magic',        'ui/healing_magic.png');

    // Карты мира: грузим только фон той карты, куда идём (остальные догрузятся при переходе)
    const OLD_MAP_IMAGES = {
      map_map1: 'maps/map1_v2.png', map_tavern_map: 'maps/tavern_map_v2.png', map_tavern_inside: 'maps/tavern_inside.png',
      map_mountains_map: 'maps/mountains_map.png', map_swamp_map: 'maps/swamp_map.png', map_forest1: 'maps/forest1.png',
      map_elf_boloto: 'maps/elf_boloto_v2.png', map_elf_boloto1: 'maps/elf_boloto1.png', map_road_boloto: 'maps/road_boloto.png',
      map_kingthrone: 'maps/kingthrone.png', map_road_to_village: 'maps/road_to_village.png', map_gate: 'maps/gate.png',
      map_village: 'maps/village.png',
    };
    const destMap = this._destination === 'MapScene' ? MAP_CONFIGS[this._destinationData?.mapKey] : null;
    if (destMap) {
      // Фоны прошлых карт выгружаем, чтобы не копить видеопамять (каждый 2K-фон около 17 МБ)
      Object.values(MAP_CONFIGS).forEach(cfg => {
        if (cfg === destMap) return;
        [cfg.bgKey, cfg.image && `img:${cfg.image}`].forEach(k => { if (k && this.textures.exists(k)) this.textures.remove(k); });
      });
      this._unloadSheets(destMap);
      if (OLD_MAP_IMAGES[destMap.bgKey]) img(destMap.bgKey, OLD_MAP_IMAGES[destMap.bgKey]);
      // Карты из maps.json с полем image (новые локации и временная картинка): ключ img:<путь>
      if (destMap.image && !OLD_MAP_IMAGES[destMap.bgKey] && !this.textures.exists(destMap.bgKey)) img(`img:${destMap.image}`, destMap.image);
    }
    img('fg_lantern_map1',    'maps/foreground_lantern_map1.png');

    // Персонажи на карте
    img('map_hero',      'maps/characters/hero.png');
    img('map_brawler',   'maps/characters/brawler_idle_v3.png');
    img('map_healer',    'maps/characters/healer.png');
    img('map_bandit',    'maps/characters/bandit.png');
    sheet('map_hero_walk_side', 'maps/characters/hero_walk_side_v3.png', { frameWidth: 181, frameHeight: 260 }); // v3: Veo, 29 кадров, 24 fps (старый v2 оставлен в папке)
    sheet('map_hero_stand', 'maps/characters/hero_stand_v1.png', { frameWidth: 149, frameHeight: 260 }); // стойка на карте без оружия в руках, 96 кадров
    // Ночь 26.10: новые ходьба и стойка Ворнага и Таи (Veo, вид сбоку, как у Дуэлянта).
    // Грузим, только если спутник в отряде; иначе их дочитает MapScene в фоне (preloadCompanionSheets).
    // Старые листы ходьбы и детали paper doll больше не грузятся: все трое ходят покадрово (paperdoll: false).
    preloadCompanionSheets(this, PartySystem.getParty(this.game.registry));
    img('map_tavernman', 'maps/characters/tavernman.png');
    img('map_wanderer',  'maps/characters/map_wanderer.png');
    img('map_drunkman',       'maps/characters/drunkman.png');
    img('map_dog',            'maps/characters/dog.png');
    img('map_bandit_warrior', 'maps/characters/bandit_warrior.png');
    img('map_bandit_archer',  'maps/characters/bandit_archer_map.png');
    img('map_cleaning_girl', 'maps/characters/cleaning_girl.png');
    img('map_cleaning_bucket', 'maps/characters/cleaning_bucket.png');
    sheet('map_cleaning_girl_mop', 'maps/characters/cleaning_girl_mop_sheet.png', { frameWidth: 320, frameHeight: 405 });
    img('map_dwarf_beer',    'maps/characters/dwarf_beer.png');
    sheet('map_dwarf_beer_drink', 'maps/characters/dwarf_beer_drink_sheet.png', { frameWidth: 379, frameHeight: 520 });
    img('map_dwarf_beer2',   'maps/characters/dwarf_beer2.png');
    img('map_companion_brawler', 'maps/characters/companion_brawler.png');
    img('map_companion_healer',  'maps/characters/companion_healer.png');
    img('map_swamp_elf_girl',    'maps/characters/swamp_elf_girl.png');
    img('map_mountain_king',     'maps/characters/mountain_king.png');
    img('map_guard',             'maps/characters/guard.png');
    img('map_archer_guard',      'maps/characters/archer_guard.png');
    img('map_recruit',           'maps/characters/recruit.png');
    img('map_holt',              'maps/characters/holt_map_v2.png');   // Хольт в отряде: стоячая фигура (assets/generated/holt_map)

    // Иконки скиллов и действий (dark_rpg_icons)
    img('icon_shield',         'ui/icon_shield.png');
    img('icon_broken_sword',   'ui/icon_broken_sword.png');
    img('icon_might',          'ui/icon_might.png');
    img('icon_heart',          'ui/icon_heart.png');
    img('icon_bow',            'ui/icon_bow.png');
    img('icon_gold',           'ui/icon_gold.png');
    img('icon_skull',          'ui/icon_skull.png');
    img('icon_hammer',         'ui/icon_hammer.png');
    img('icon_healing_potion', 'ui/icon_healing_potion.png');
    img('icon_hand',           'ui/icon_hand.png');
    img('icon_axe',            'ui/icon_axe.png');
    img('icon_dual_sword',     'ui/icon_dual_sword.png');
    img('icon_crossbow',       'ui/icon_crossbow.png');
    img('icon_trader',         'ui/icon_trader.png');
    img('icon_luck_horseshoe', 'ui/icon_luck_horseshoe.png');
    img('icon_drop',           'ui/icon_drop.png');

    // Книги и записки
    img('item_book_road_houses',     'items/book_road_houses.png');
    img('item_book_lame_stag',       'items/book_lame_stag.png');
    img('item_book_forgotten_seals', 'items/book_forgotten_seals.png');
    img('item_book_korvin_tolls',    'items/book_korvin_tolls.png');
    img('item_book_lowland_herbal',  'items/book_lowland_herbal.png');
    img('ui_book_open_panel',        'items/book_open_panel.png');
    img('item_road_satchel',         'items/road_satchel.png');
    img('item_withered_apple',       'items/withered_apple.png');
    img('item_pilgrim_tag',          'items/pilgrim_tag.png');

        // Пропсы (интерьерные объекты)
    img('prop_table3',   'sprites/table3.png');
    img('prop_table4',   'sprites/table4.png');
    img('prop_table2_2', 'sprites/table2_2.png');

    // Портреты NPC
    img('portrait_tavernman', 'portraits/tavernman.png');
    img('portrait_wanderer',  'portraits/wanderer.png');
    img('portrait_drunkman',      'portraits/drunkman.png');
    img('portrait_dog',           'portraits/dog.png');
    img('portrait_bandit_warrior','portraits/bandit_warrior.png');
    img('portrait_bandit_archer', 'portraits/bandit_archer_map.png');
    img('portrait_cleaning_girl','portraits/cleaning_girl.png');
    img('portrait_dwarf_beer',   'portraits/dwarf_beer.png');
    img('portrait_dwarf_beer2',  'portraits/dwarf_beer2.png');
    img('portrait_companion_brawler', 'portraits/companion_brawler.png');
    img('portrait_companion_healer',  'portraits/companion_healer.png');
    img('portrait_swamp_elf_girl',    'portraits/swamp_elf_girl.png');
    img('portrait_mountain_king',     'portraits/mountain_king.png');
    img('portrait_guard',             'portraits/guard.png');
    img('portrait_archer_guard',      'portraits/archer_guard.png');
    img('portrait_recruit',           'portraits/recruit.png');
    // Портреты собеседников из диалогов и NPC карт, если файл есть (portrait_agna и др.)
    const used = new Set();
    Object.values(DIALOGUES).forEach(d => Object.values(d.speakers || {}).forEach(sp => sp.portrait && used.add(sp.portrait)));
    Object.values(MAP_CONFIGS).forEach(m => (m.npcs || []).forEach(n => n.portraitKey && used.add(n.portraitKey)));
    used.forEach(key => {
      const file = key.replace(/^portrait_/, '');
      if (typeof __PORTRAITS__ === 'undefined' || __PORTRAITS__.includes(file)) img(key, `portraits/${file}.png`);
    });

    // Звуковые эффекты (src/data/sfx.json)
    Sfx.preload(this);

    // Туман
    img('fog',  'maps/fog.png');
    img('fog2', 'maps/fog2.png');

    // Музыку экран загрузки не ждёт и не запускает: первый трек догружает и включает MusicPlayer уже в игре
  }

  create() {
    // scene.start is handled by the 'complete' event in preload
  }
}

/** Листы ходьбы и стойки спутников на карте: only = кого грузить (id из units.json). */
export function preloadCompanionSheets(scene, only) {
  const SHEETS = {
    companion_brawler: [
      ['map_brawler_walk_v4', 'maps/characters/anim/brawler_walk_v1.webp', 376, 269],
      ['map_brawler_stand_v1', 'maps/characters/anim/brawler_stand_v1.webp', 301, 268],
    ],
    companion_healer: [
      ['map_healer_walk_v3', 'maps/characters/anim/healer_walk_v1.webp', 376, 274],
      ['map_healer_stand_v1', 'maps/characters/anim/healer_stand_v1.webp', 300, 274],
    ],
  };
  let n = 0;
  Object.entries(SHEETS).forEach(([id, list]) => {
    if (!only.includes(id)) return;
    list.forEach(([key, file, frameWidth, frameHeight]) => {
      if (loadSheetOnce(scene, key, file, { frameWidth, frameHeight })) n++;
    });
  });
  return n;
}
