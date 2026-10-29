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
