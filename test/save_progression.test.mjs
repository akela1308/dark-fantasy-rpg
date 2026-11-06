import './_json_hook.mjs';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
const { SaveSystem } = await import('../src/utils/SaveSystem.js');
const { PartySystem } = await import('../src/systems/PartySystem.js');
const { pendingProgression } = await import('../src/systems/ProgressionRecovery.js');
const CP = await import('../src/systems/ClassProgression.js');
const CT = await import('../src/systems/CommanderTraits.js');
class Reg {
  constructor() { this.list = {}; }
  get(k) { return this.list[k]; }
  set(k,v) { this.list[k] = v; }
  remove(k) { delete this.list[k]; }
}
beforeEach(() => {
 const values = new Map();
 globalThis.localStorage = {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
});

test('F5 между наградой и выбором уровня сохраняет опыт и восстанавливает незавершённую прокачку', () => {
 const reg=new Reg(); SaveSystem.newGame(reg);
 PartySystem.recruit(reg,'companion_brawler');
 const units=PartySystem.buildRosterUnits(reg);
 assert.equal(PartySystem.getParty(reg).length,1);
 PartySystem.addXp(reg,100);
 SaveSystem.save(units,'south_post','default',reg);
 const restored=new Reg();SaveSystem.applyFlagsToRegistry(restored);
 const state=pendingProgression(restored);
 assert.equal(state.toLevel,2);
 assert.deepEqual(state.pending.map(u=>u.id),['hero_duelist','companion_brawler']);
 assert.equal(PartySystem.getParty(restored).length,2);
 assert.equal(PartySystem.getXp(restored),100);
 for(const u of state.roster) {
  CP.applyLevelGrowth(u,2);u.level=2;
  const traits=CT.getCommanderTraitChoices(u,2,restored);
  if(traits) CT.applyCommanderTraitChoice(u,traits.find(t=>t.traitId==='second_strike')||traits[0],restored);
  const choices=CP.getClassProgressionChoices(u,2);
  if(choices) CP.applyProgressionChoice(u,choices[0]);
 }
 SaveSystem.save(state.roster,'south_post','default',restored);
 const after=new Reg();SaveSystem.applyFlagsToRegistry(after);
 assert.equal(pendingProgression(after).pending.length,0);
 assert.equal(PartySystem.getXp(after),100);
 assert.ok(pendingProgression(after).roster[0].commanderTraits.length);
});

test('Хроника возвращает золото, опыт, найм и здоровье из привала', () => {
 const reg=new Reg();SaveSystem.newGame(reg);
 SaveSystem.save(PartySystem.buildRosterUnits(reg),'tavern_inside','default',reg);
 PartySystem.restAll(reg,'tavern_inside','default');
 const rest=SaveSystem.loadRestPoint();
 PartySystem.addXp(reg,100);PartySystem.recruit(reg,'companion_brawler');SaveSystem.addGold(50,reg);
 SaveSystem.saveWorld(reg,'forest1','default');SaveSystem.markBattle('korvin_gang');
 SaveSystem.restoreRestPoint();SaveSystem.applyFlagsToRegistry(reg,{force:true});
 assert.equal(PartySystem.getXp(reg),0);assert.equal(PartySystem.getRoster(reg).length,1);
 assert.equal(SaveSystem.getGold(reg),rest.gold);assert.equal(SaveSystem.load().mapKey,'tavern_inside');
 assert.equal(SaveSystem.load().inBattle,undefined);
});

test('Железо: F5 в бою стирает прогресс, сохранённая победа переживает F5', () => {
 const reg=new Reg();SaveSystem.newGame(reg,{mode:'iron'});
 SaveSystem.saveWorld(reg,'south_post','default');SaveSystem.markBattle('road_looters');
 assert.equal(SaveSystem.resolveAbandonedBattle(),true);assert.equal(SaveSystem.load(),null);
 SaveSystem.newGame(reg,{mode:'iron'});SaveSystem.saveWorld(reg,'south_post','default');
 SaveSystem.markBattle('road_looters');reg.set('road_looters_done',true);PartySystem.addXp(reg,25);
 SaveSystem.saveWorld(reg,'south_post','default');
 assert.equal(SaveSystem.resolveAbandonedBattle(),false);assert.equal(SaveSystem.load().world.partyXp,25);
});

test('уровни 3–4, резерв и поражение: привал возвращает состав и выбранное развитие', () => {
 const reg=new Reg();SaveSystem.newGame(reg);
 for(const id of ['companion_brawler','companion_healer'])PartySystem.recruit(reg,id);
 PartySystem.addXp(reg,PartySystem.xpTotalFor(4));
 const roster=PartySystem.buildRosterUnits(reg);
 for(const u of roster)for(let level=2;level<=4;level++){
  CP.applyLevelGrowth(u,level);u.level=level;
  for(const n of CP.getAutoNodes(u,level))CP.applyProgressionChoice(u,n);
  const choices=CP.getClassProgressionChoices(u,level);
  if(choices)CP.applyProgressionChoice(u,choices[0]);
 }
 PartySystem.bench(reg,'companion_brawler');assert.equal(PartySystem.activate(reg,'companion_healer'),true);
 SaveSystem.save(roster,'tavern_inside','default',reg);PartySystem.restAll(reg,'tavern_inside','default');
 const saved=SaveSystem.load();assert.ok(saved.units.every(u=>u.level===4));
 PartySystem.bench(reg,'companion_healer');PartySystem.activate(reg,'companion_brawler');
 PartySystem.addXp(reg,200);SaveSystem.saveWorld(reg,'chapel_inside','default');SaveSystem.markBattle('chapel_cult');
 SaveSystem.restoreRestPoint();const restored=new Reg();SaveSystem.applyFlagsToRegistry(restored,{force:true});
 assert.deepEqual(PartySystem.getParty(restored),['hero_duelist','companion_healer']);
 assert.equal(PartySystem.getXp(restored),PartySystem.xpTotalFor(4));
 assert.deepEqual(SaveSystem.load().units,saved.units);
 assert.equal(pendingProgression(restored).pending.length,0);
});

test('сохранение переносит поздние узлы, ресурсы Следопыта и Запрета и лимиты', () => {
 const reg=new Reg();SaveSystem.newGame(reg);
 PartySystem.recruit(reg,'holt');PartySystem.recruit(reg,'ressa');PartySystem.recruit(reg,'hero_duelist');
 const [hero,holt,ressa]=['hero_duelist','holt','ressa'].map(id=>PartySystem.buildRosterUnits(reg).find(u=>u.id===id));
 const up=(u,branch,picks={})=>{
  for(let L=2;L<=12;L++){
   CP.applyLevelGrowth(u,L);u.level=L;
   CP.getAutoNodes(u,L).forEach(n=>CP.applyProgressionChoice(u,n));
   const ch=CP.getClassProgressionChoices(u,L);
   if(ch)CP.applyProgressionChoice(u,ch.find(c=>c.branchId===branch||c.key===picks[L])||ch[0]);
  }
 };
 up(hero,'last_argument');up(holt,'royal_drill',{6:'focus_cap'});up(ressa,'black_litany',{6:'taint_cap'});
 ressa.resources.taint=2;
 SaveSystem.save([hero,holt,ressa],'south_post','default',reg);
 const back=PartySystem.buildRosterUnits(reg).reduce((m,u)=>({...m,[u.id]:u}),{});
 assert.equal(back.hero_duelist.resourceBonus.pistol_charges,1);
 assert.ok(back.hero_duelist.skills.includes('two_barrels'));
 assert.equal(back.holt.branchId,'royal_drill');
 assert.equal(back.holt.resourceMax.focus,4);
 assert.ok(back.holt.passives.includes('field_orders'));
 assert.ok(back.holt.skills.includes('royal_volley'));
 assert.equal(back.ressa.resourceMax.taint,5,'предел перка и узла');
 assert.equal(back.ressa.resources.taint,2);
 assert.ok(back.ressa.skills.includes('unspoken_name'));
 back.ressa.prepareForBattle({});assert.equal(back.ressa.resources.taint,0);
 back.hero_duelist.prepareForBattle({tempo:0,pistol_charges:2});assert.equal(back.hero_duelist.resources.pistol_charges,3);
});

test('старое сохранение: высокий уровень получает пропущенные узлы, спутник без ветки выбирает её', () => {
 const reg=new Reg();SaveSystem.newGame(reg);
 PartySystem.recruit(reg,'holt');
 const [hero,holt]=PartySystem.buildRosterUnits(reg);
 hero.level=10;hero.branchId='last_argument';hero.passives.push('point_blank');
 holt.level=7;
 SaveSystem.save([hero,holt],'south_post','default',reg);
 const [h2,t2]=PartySystem.buildRosterUnits(reg);
 assert.ok(h2.passives.includes('smoke_screen')&&h2.passives.includes('dirty_range'));
 assert.equal(h2.resourceBonus.pistol_charges,1);
 SaveSystem.save([h2],'south_post','default',reg);
 const [h3]=PartySystem.buildRosterUnits(reg);
 assert.equal(h3.resourceBonus.pistol_charges,1,'повторная загрузка не копит бонус');
 assert.equal(t2.branchId,null);
 const ch=CP.getClassProgressionChoices(t2,8);
 assert.deepEqual(ch.map(c=>c.key),['swamp_grip','royal_drill']);
 t2.level=8;CP.applyProgressionChoice(t2,ch[0]);
 assert.ok(t2.skills.includes('venom_bolt')&&t2.skills.includes('snare_trap'));
 assert.ok(t2.passives.includes('rotten_blood'));
});
