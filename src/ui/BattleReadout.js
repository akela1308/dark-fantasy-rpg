import UI from '../data/ui.json';
import { getClassDef } from '../systems/ClassProgression.js';

const labels = UI.battle;
const resourceName = id => labels.resources[id] || id;

/** Show actual resource pools and caps, including level perks and supplies saved between fights. */
export function resourceSummary(unit) {
  if (!unit) return '';
  const resource = getClassDef(unit)?.resource;
  const parts = [];
  if (resource) {
    const value = unit.resources?.[resource.id] ?? 0;
    const max = unit.resourceMax?.[resource.id] ?? resource.max;
    parts.push(`${resource.name} ${value}${max != null ? `/${max}` : ''}`);
  }
  for (const id of ['pistol_charges', 'cover_uses']) {
    if (id in (unit.resources || {})) parts.push(`${resourceName(id)} ${unit.resources[id]}`);
  }
  return parts.join(' · ');
}

export function statusSummary(unit) {
  return [...new Set((unit?.effects || []).map(e => labels.statuses[e.type]).filter(Boolean))].join(', ');
}

export function skillResourceSummary(skill) {
  const cost = Object.entries(skill.resourceCost || {}).map(([id,n]) => `${resourceName(id)} ${n}`);
  if (skill.usesResource) cost.push(`${resourceName(skill.usesResource)} 1`);
  const gain = Object.entries(skill.resourceGain || {}).map(([id,n]) => `${resourceName(id)} +${n}`);
  return [cost.length ? `${labels.cost}: ${cost.join(', ')}` : '', gain.length ? `${labels.gain}: ${gain.join(', ')}` : ''].filter(Boolean).join('\n');
}
