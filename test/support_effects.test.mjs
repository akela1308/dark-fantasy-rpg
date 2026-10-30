import './_json_hook.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const {PlayerUnit}=await import('../src/entities/PlayerUnit.js');
const {SkillSystem}=await import('../src/systems/SkillSystem.js');
const {SaveSystem}=await import('../src/utils/SaveSystem.js');
const units=(await import('../src/data/units.json')).default;
const skills=(await import('../src/data/skills.json')).default;
const mem=new Map();globalThis.localStorage={getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};
const make=id=>new PlayerUnit(structuredClone(units.find(u=>u.id===id)));
function setup(){const ss=new SkillSystem();ss.registerAll(skills);return {ss,hero:make('hero_duelist'),healer:make('companion_healer')};}

test('очищение восстанавливает пробитую броню сразу, без повторного возврата на тике',()=>{
 const {ss,hero,healer}=setup();hero.armor=7;
 ss._status(hero,{type:'armor_broken',value:10,duration:2},healer);
 assert.equal(hero.armor,0);ss.use('bitter_poultice',healer,hero);
 assert.equal(hero.armor,7);assert.equal(hero._armorBroken,0);
 hero.endTurn();hero.endTurn();assert.equal(hero.armor,7);
});
test('несколько пробитий возвращают только реально снятую броню',()=>{
 const {ss,hero,healer}=setup();hero.armor=15;
 ss._status(hero,{type:'armor_broken',value:10,duration:1},healer);
 ss._status(hero,{type:'armor_broken',value:10,duration:2},healer);
 assert.equal(hero.armor,0);hero.endTurn();assert.equal(hero.armor,10);
 hero.endTurn();assert.equal(hero.armor,15);assert.equal(hero._armorBroken,0);
});
test('сохранение и новый бой не закрепляют временное пробитие брони',()=>{
 mem.clear();const {ss,hero,healer}=setup();hero.armor=15;
 ss._status(hero,{type:'armor_broken',value:10,duration:2},healer);
 SaveSystem.save([hero],'south_post','default',new Map());
 const restored=make('hero_duelist');SaveSystem.applyToUnits([restored]);assert.equal(restored.armor,15);
 assert.equal(hero.armor,5,'сохранение не меняет текущий бой');
 hero.prepareForBattle({});assert.equal(hero.armor,15);assert.equal(hero._armorBroken,0);
});
test('прикрытие принимает один удар, массовое лечение не воскрешает павшего',()=>{
 const {ss,hero,healer}=setup(),guard=make('companion_brawler');
 const hp=hero.hp;ss.use('shield_cover',guard,hero);hero.takeDamage(10);assert.equal(hero.hp,hp);assert.ok(guard.hp<guard.maxHp);
 hero.takeDamage(10);assert.ok(hero.hp<hp);
 hero.hp=hero.maxHp-3;guard.isAlive=false;guard.hp=0;healer.hp=healer.maxHp-20;healer._allies=[hero,guard,healer];healer.resources.supplies=3;
 ss.use('resin_brew',healer,healer);assert.equal(hero.hp,hero.maxHp);assert.equal(guard.hp,0);assert.equal(healer.resources.supplies,1);
});

test('ответ прикрывающего бойца срабатывает один раз до следующего хода, не на дальний удар',()=>{
 const {ss,hero}=setup(),guard=make('companion_brawler');guard.passives.push('punish_intruders');
 let reactions=0;guard.attack=()=>{reactions++;return 1;};
 const source={isAlive:true,ranged:false};ss.use('shield_cover',guard,hero);
 hero.takeDamage(5,{source});guard.takeDamage(5,{source});assert.equal(reactions,1);
 guard.endTurn();guard.takeDamage(5,{source,ranged:true});assert.equal(reactions,1);
 guard.takeDamage(5,{source});assert.equal(reactions,2);
});
