"""Страница просмотра всех анимаций: assets/generated/_review_morning/animations.html
Открывается двойным щелчком (file://), листы берутся из public/ по относительным путям.
python3 tools/night_viewer.py"""
import json, os, glob, re, sys
GAME = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import night_roster
NAMES = {c["slug"]: c["name"] for c in night_roster.R}
NAMES["duelist"] = "Падший Дуэлянт"
items = []
for sub in ("sprites/battle", "maps/characters/anim"):
    for f in sorted(glob.glob(f"{GAME}/public/{sub}/*.json")):
        m = json.load(open(f))
        base = os.path.basename(f)[:-5]
        img = next((x for x in (f[:-5] + ".webp", f[:-5] + ".png") if os.path.exists(x)), None)
        if not img: continue
        mm = re.match(r"(.+?)_(idle|mapidle|walk|stand|mapamb\d|amb\d|attack|power|cast2|reload|hit|death|victory|lunge|shot|slash|block|salute)_v\d+$", base)
        slug, anim = (mm.group(1), mm.group(2)) if mm else (base, "?")
        items.append(dict(slug=slug, anim=anim, where="бой" if "battle" in sub else "карта", src="../../../public/" + sub + "/" + os.path.basename(img),
                          fw=m["frameWidth"], fh=m["frameHeight"], n=m["frames"], cols=m["cols"], fps=m.get("fps", 24), name=NAMES.get(slug, slug)))
html = """<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Анимации Mortis</title>
<style>body{background:#1b1714;color:#e8dcc4;font-family:Georgia,serif;margin:16px}h2{border-bottom:1px solid #5a4630;margin-top:28px}
.row{display:flex;flex-wrap:wrap;gap:10px}.c{background:#2a221c;padding:6px;border-radius:6px;text-align:center;font-size:12px}
canvas{background:#e8e4d7;display:block}label{margin-right:12px}</style></head><body>
<h1>Анимации Mortis, ночь 26.10 (всё предварительно)</h1>
<p>Фон: <label><input type=radio name=bg value="#e8e4d7" checked>светлый</label><label><input type=radio name=bg value="#460c0e">тёмно-красный</label>
Скорость: <input id=sp type=range min=0.25 max=2 step=0.25 value=1> <span id=spv>1</span>×</p>
<div id=root></div><script>
const ITEMS=__DATA__;const H=170;let speed=1;
document.getElementById('sp').oninput=e=>{speed=+e.target.value;document.getElementById('spv').textContent=speed};
document.querySelectorAll('input[name=bg]').forEach(r=>r.onchange=()=>document.querySelectorAll('canvas').forEach(c=>c.style.background=r.value));
const groups={};ITEMS.forEach(it=>(groups[it.slug]=groups[it.slug]||[]).push(it));
const root=document.getElementById('root');const anims=[];
Object.keys(groups).sort().forEach(s=>{const h=document.createElement('h2');h.textContent=groups[s][0].name+' ('+s+')';root.appendChild(h);
 const row=document.createElement('div');row.className='row';root.appendChild(row);
 groups[s].forEach(it=>{const c=document.createElement('div');c.className='c';const cv=document.createElement('canvas');
  cv.height=H;cv.width=Math.round(it.fw*H/it.fh);c.appendChild(cv);c.appendChild(document.createTextNode(it.where+': '+it.anim+' ('+it.n+' к.)'));row.appendChild(c);
  const img=new Image();img.src=it.src;anims.push({it,cv,img,t:0});});});
let last=performance.now();function tick(now){const dt=(now-last)/1000;last=now;anims.forEach(a=>{if(!a.img.complete)return;a.t+=dt*speed;
 const f=Math.floor(a.t*a.it.fps)%a.it.n;const x=(f%a.it.cols)*a.it.fw,y=Math.floor(f/a.it.cols)*a.it.fh;const g=a.cv.getContext('2d');
 g.clearRect(0,0,a.cv.width,a.cv.height);g.drawImage(a.img,x,y,a.it.fw,a.it.fh,0,0,a.cv.width,a.cv.height);});requestAnimationFrame(tick);}
requestAnimationFrame(tick);</script></body></html>"""
out = f"{GAME}/assets/generated/_review_morning/animations.html"
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, "w").write(html.replace("__DATA__", json.dumps(items, ensure_ascii=False)))
print(out, len(items), "анимаций,", len({i["slug"] for i in items}), "персонажей")
