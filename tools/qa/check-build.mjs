import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve('dist');
function files(dir) {
 return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e => e.isDirectory() ? files(path.join(dir,e.name)) : [path.join(dir,e.name)]);
}
const built=files(root),bytes=built.reduce((sum,f)=>sum+fs.statSync(f).size,0);
assert.ok(bytes<1024**3,`Build exceeds Pages limit: ${bytes} bytes`);
const refs=new Set();
for(const name of ['animations','map_animations']) {
 const data=JSON.parse(fs.readFileSync(`src/data/${name}.json`));
 const visit=v=>{if(!v||typeof v!=='object')return;if(typeof v.file==='string')refs.add(v.file);Object.values(v).forEach(visit);};
 visit(data);
}
const npc=JSON.parse(fs.readFileSync('src/data/npc_art.json'));
Object.entries(npc).filter(([key])=>!key.startsWith('_')).forEach(([,file])=>refs.add(file));
const missing=[...refs].filter(file=>!fs.existsSync(path.join(root,file.replace(/\.png$/,'.webp'))));
assert.deepEqual(missing,[], 'Missing animation/NPC files in production');
assert.equal(built.some(f=>/maps\/gen\/.*_(v\d|pick)\.png$/.test(f)),false,'Source map variants leaked into build');
const scripts=built.filter(f=>/assets\/index-[^/]+\.js$/.test(f));
assert.equal(scripts.length,1,'Stale entry bundles accumulated in dist');
console.log(JSON.stringify({files:built.length,referencedAnimationAndNpcFiles:refs.size,bytes,MiB:Math.round(bytes/1024**2),headroomMiB:Math.floor((1024**3-bytes)/1024**2),entryBundles:scripts.length},null,2));
