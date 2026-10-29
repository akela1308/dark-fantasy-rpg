import UI from '../data/ui.json';
import items from '../data/items.json';
import skills from '../data/skills.json';

/** Persistent reading notes, derived from the same data as the one-time book effects. */
export function knowledgePages(book) {
  const e = book.effects;
  if (!e) return [];
  const t = UI.bookKnowledge, lines = [];
  if (book.effectText) lines.push(book.effectText);
  if (e.unlockRecipe) {
    lines.push(`${t.recipe}: ${items.find(i => i.id === e.unlockRecipe)?.name || e.unlockRecipe}.`);
    lines.push(t.craft);
  }
  if (e.learnSkill) lines.push(`${t.skill}: ${skills.find(s => s.id === e.learnSkill.skill)?.name || e.learnSkill.skill}.`);
  if (e.giveXp) lines.push(`${t.xp}: +${e.giveXp}.`);
  if (e.giveItem) {
    const entries = (Array.isArray(e.giveItem) ? e.giveItem : [e.giveItem]).map(i => typeof i === 'string' ? [i, 1] : [i.id, i.n || 1]);
    for (const [id, count] of entries) lines.push(`${t.item}: ${items.find(i => i.id === id)?.name || id} ×${count}.`);
  }
  if (!lines.length) return [];
  // Bounded notes: keep the lore pages intact, each notes page fits the existing reader.
  const pages = [];
  for (let i = 0; i < lines.length; i += 3) pages.push(`${t.title}\n\n${lines.slice(i, i + 3).join('\n\n')}\n\n${t.once}`);
  return pages;
}
