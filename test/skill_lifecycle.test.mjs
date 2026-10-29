import './_json_hook.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { PlayerUnit } = await import('../src/entities/PlayerUnit.js');
const { EnemyUnit } = await import('../src/entities/EnemyUnit.js');
const { SkillSystem } = await import('../src/systems/SkillSystem.js');
const { TurnManager } = await import('../src/systems/TurnManager.js');
const units = (await import('../src/data/units.json')).default;
const skills = (await import('../src/data/skills.json')).default;
const { resourceSummary, skillResourceSummary } = await import('../src/ui/BattleReadout.js');

test('стойка сохраняет заявленные 30% уклонения на ответ врага и заканчивается после следующего хода героя', () => {
 const hero=new PlayerUnit(structuredClone(units.find(u=>u.id==='hero_duelist')));
 const enemy=new EnemyUnit({id:'test',name:'Враг',type:'enemy',hp:100,speed:1,damage:{min:1,max:1}});
 const ss=new SkillSystem();ss.registerAll(skills);const tm=new TurnManager();tm.init([hero,enemy]);
 ss.use('dueling_stance',hero,hero);tm.nextTurn();
 assert.equal(tm.active,enemy);assert.equal(hero.getEffect('dodge_boost')?.value,0.3);
 tm.nextTurn();assert.equal(tm.active,hero);assert.ok(hero.hasEffect('dodge_boost'));
 tm.nextTurn();assert.equal(hero.hasEffect('dodge_boost'),false);
});

test('показ Темпа и зарядов соответствует реальному расходу пистолета, подсказка сообщает обе цены', () => {
 const hero=new PlayerUnit(structuredClone(units.find(u=>u.id==='hero_duelist')));
 hero.resources.tempo=1;hero.resources.pistol_charges=2;
 const enemy=new EnemyUnit({id:'test',name:'Враг',type:'enemy',hp:100,speed:1,damage:{min:1,max:1}});
 const ss=new SkillSystem();ss.registerAll(skills);
 assert.ok(resourceSummary(hero).includes('Темп 1/3'));
 ss.use('pistol_shot',hero,enemy);
 assert.ok(resourceSummary(hero).includes('Темп 0/3'));assert.ok(resourceSummary(hero).includes('Пистоль 1'));
 const tip=skillResourceSummary(ss.get('pistol_shot'));
 assert.ok(tip.includes('Темп 1'));assert.ok(tip.includes('Пистоль 1'));
 assert.equal(ss.canUse('pistol_shot',hero),false);
});

for (const inactive of ['dead', 'surrendered']) {
 test(`конец очереди (${inactive}): новый раунд снимает стартовую инициативу и пересортирует живых`, () => {
  const hero = new PlayerUnit(structuredClone(units.find(u => u.id === 'hero_duelist')));
  const enemy = new EnemyUnit({id:'fast',name:'Враг',hp:100,speed:8,damage:{min:1,max:1}});
  const last = new EnemyUnit({id:'last',name:'Последний',hp:100,speed:1,damage:{min:1,max:1}});
  hero.speed=7;hero._initiativeBonus=3;
  const tm=new TurnManager();tm.init([hero,enemy,last]);
  assert.equal(tm.active,hero);
  tm.nextTurn();assert.equal(tm.active,enemy);
  if(inactive==='dead')last.isAlive=false;else last.surrendered=true;
  tm.nextTurn();
  assert.equal(tm.turn,1);assert.equal(hero._initiativeBonus,0);
  assert.equal(tm.active,enemy,'со второго раунда быстрее враг');
  tm.nextTurn();assert.equal(tm.active,hero);
  tm.nextTurn();assert.equal(tm.turn,2);assert.equal(tm.active,enemy);
 });
}

test('пустая или полностью выбывшая очередь завершается без зацикливания', () => {
 const tm=new TurnManager();tm.init([]);assert.equal(tm.active,null);assert.equal(tm.isPlayerTurn(),false);
 const hero=new PlayerUnit(structuredClone(units.find(u=>u.id==='hero_duelist')));
 tm.init([hero]);hero.isAlive=false;tm.nextTurn();
 assert.equal(tm.active,null);assert.equal(tm.isPlayerTurn(),false);
});
