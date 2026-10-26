"""Правка спавнов и выходов в src/data/maps.json скриптом (формат файла сохраняется: json, indent=2).

python3 tools/maps_set.py правки.py
где правки.py вызывает setmap(карта, spawns={id: (x, y)}, exits={toMap: (x, y, w, h)}).
Выход ищется по toMap (и в tavernEntry), метка "auto" снимается: выход поставлен вручную.
"""
import json, sys
p = 'src/data/maps.json'
d = json.load(open(p, encoding='utf-8'))
def setmap(name, spawns=None, exits=None):
    m = d[name]
    if spawns:
        m['spawnPoints'].update({k: {'x': v[0], 'y': v[1]} for k, v in spawns.items()})
    for toMap, zone in (exits or {}).items():
        te = m.get('tavernEntry')
        e = te if te and te['toMap'] == toMap else next(e for e in m['exits'] if e['toMap'] == toMap)
        e['zone'] = dict(zip('xywh', zone))
        e.pop('auto', None)
exec(open(sys.argv[1], encoding='utf-8').read())
open(p, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
