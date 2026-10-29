import './_json_hook.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { targetPreview } = await import('../src/ui/BattleTargetPreview.js');
const { knowledgePages } = await import('../src/ui/BookKnowledge.js');
const { SkillSystem } = await import('../src/systems/SkillSystem.js');
const { checkRequires, applyEffects } = await import('../src/systems/DialogueConditions.js');
const { WorldState } = await import('../src/systems/WorldState.js');
const skills = (await import('../src/data/skills.json')).default;
const books = (await import('../src/data/books.json')).default;
const pillars = (await import('../src/data/dialogues/three_pillars.json')).default;

test('мирный исход открывает похороны, а решение скрывает повторную награду', () => {
 const r=new Map([['road_looters_done',true]]), ws=new WorldState(r);
 const choice=pillars.nodes.agna.choices.find(c=>c.next==='courier');
 assert.equal(checkRequires(choice.showIf,ws).ok,true);
 let xp=0; applyEffects(pillars.nodes.courier.choices[0].effects,ws,{giveXp:n=>xp+=n});
 assert.equal(xp,10); assert.equal(checkRequires(choice.showIf,ws).ok,false);
 assert.equal(ws.flag('courier_letter_found'),false);
});

test('предпросмотр различает закрытый задний ряд, пистолет и чужую цель лечения, ничего не расходует', () => {
 const actor={type:'player',hp:20,maxHp:40,level:1,resources:{tempo:2,pistol_charges:3},effects:[]};
 const target={type:'enemy',hp:30,maxHp:30,position:{row:1},effects:[],isAlive:true};
 const ss=new SkillSystem();ss.registerAll(skills);
 const scene={turnManager:{active:actor,isPlayerTurn:()=>true},skillSystem:ss,enemyUnits:[target,...[1,2].map(()=>({isAlive:true,position:{row:0}}))]};
 const before=JSON.stringify(actor);
 assert.match(targetPreview(scene,target).action,/закрыта/);
 scene._pendingSkill='pistol_shot';assert.match(targetPreview(scene,target).action,/Клик/);
 scene._pendingSkill='bandage';assert.match(targetPreview(scene,target).action,/союзника/);
 assert.equal(JSON.stringify(actor),before);
});

test('лечение показывает фактическое восстановление до максимума HP', () => {
 const actor={type:'player',level:1,resources:{supplies:3},effects:[]};
 const ss=new SkillSystem();ss.registerAll(skills);
 const scene={turnManager:{active:actor,isPlayerTurn:()=>true},skillSystem:ss,_pendingSkill:'bandage'};
 const target={type:'player',hp:37,maxHp:40,effects:[]};
 assert.match(targetPreview(scene,target).body,/3 HP \(37 → 40\)/);
 target.hp=40;assert.match(targetPreview(scene,target).body,/полное/);
});

test('заметки книги сохраняют рецепт и награды при повторном чтении без изменения данных', () => {
 const book=books.find(b=>b.id==='lowland_herbal'), before=JSON.stringify(book);
 const first=knowledgePages(book);assert.match(first.join(' '),/Открыт рецепт/);
 assert.deepEqual(knowledgePages(book),first);assert.equal(JSON.stringify(book),before);
 assert.deepEqual(knowledgePages({pages:['рассказ']}),[]);
});


test('подсказки расходников показывают цель и ограничение между привалами', async () => {
 const { useSummary } = await import('../src/systems/Economy.js');
 const items = (await import('../src/data/items.json')).default;
 assert.match(useSummary(items.find(i=>i.id==='camp_flask')), /между привалами/);
 assert.match(useSummary(items.find(i=>i.id==='warding_salt')), /всему отряду/);
 assert.match(useSummary(items.find(i=>i.id==='whetstone')), /выбранному бойцу/);
 assert.match(knowledgePages(books.find(b=>b.id==='outpost_shooter')).join(' '), /×2/);
});
