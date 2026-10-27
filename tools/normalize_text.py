"""Единый стиль текста в данных (этап 7): «ёлочки» вместо прямых кавычек и «ё» там, где она есть в словаре игры.

python3 tools/normalize_text.py <файл.json> ... [--dry]
Правятся только строки с кириллицей, ключи и форматирование файла не трогаются.
Словарь «ё»: все слова с «ё» из текстов игры (диалоги, квесты, книги, карты) и короткий список частых слов.
"""
import glob, re, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STR = re.compile(r'"((?:[^"\\]|\\.)*)"')
WORD = re.compile(r"[А-Яа-яЁё]+")
EXTRA = {"еще": "ещё", "несет": "несёт", "пьешь": "пьёшь", "черное": "чёрное", "черный": "чёрный", "черная": "чёрная",
         "черные": "чёрные", "черного": "чёрного", "черной": "чёрной", "черным": "чёрным", "назовем": "назовём",
         "свое": "своё", "пойдешь": "пойдёшь", "идет": "идёт", "ждет": "ждёт", "все еще": "всё ещё", "твое": "твоё",
         "мое": "моё", "найдешь": "найдёшь", "берет": "берёт", "живет": "живёт", "зовет": "зовёт", "поймешь": "поймёшь",
         "остается": "остаётся", "дает": "даёт", "мертвой": "мёртвой", "мертвые": "мёртвые", "мертвый": "мёртвый", "мертвым": "мёртвым",
         "мертвого": "мёртвого", "темных": "тёмных", "темный": "тёмный", "темной": "тёмной", "возьмет": "возьмёт"}


def yo_words():
    words = set()
    files = glob.glob(f"{ROOT}/src/data/dialogues/*.json") + [f"{ROOT}/src/data/{n}.json" for n in ("quests", "books", "maps", "items")]
    for f in files:
        for w in WORD.findall(open(f, encoding="utf-8").read()):
            if "ё" in w.lower():
                words.add(w.lower())
    return words


def fix_word(w, yo):
    low = w.lower()
    if low in EXTRA:
        rep = EXTRA[low]
    else:
        rep = None
        for i, ch in enumerate(low):
            if ch == "е" and (low[:i] + "ё" + low[i + 1:]) in yo:
                rep = low[:i] + "ё" + low[i + 1:]
                break
    if not rep:
        return w
    return "".join(r.upper() if o.isupper() else r for o, r in zip(w, rep))


def fix_quotes(s):
    # \" внутри строки JSON: открывающая в начале или после пробела/скобки/тире, иначе закрывающая
    out, i = [], 0
    while i < len(s):
        if s.startswith('\\"', i):
            prev = "".join(out)[-1:] if out else ""
            out.append("«" if prev in ("", " ", "(", "\n", "\t") or "".join(out).endswith("\\n") else "»")
            i += 2
        else:
            out.append(s[i]); i += 1
    return "".join(out)


def process(path, yo, dry):
    raw = open(path, encoding="utf-8").read()
    n = [0]

    def repl(m):
        s = m.group(1)
        if not re.search("[А-Яа-яЁё]", s):
            return m.group(0)
        t = fix_quotes(s)
        # Вложенные кавычки внутри «ёлочек»: 'слово' -> „слово“
        t = re.sub(r"'([^'\n]{1,60})'", r"„\1“", t)
        t = WORD.sub(lambda w: fix_word(w.group(0), yo), t)
        if t != s:
            n[0] += 1
        return f'"{t}"'

    new = STR.sub(repl, raw)
    print(os.path.relpath(path, ROOT), "строк изменено:", n[0])
    if not dry and new != raw:
        open(path, "w", encoding="utf-8").write(new)


if __name__ == "__main__":
    yo = yo_words()
    for p in [a for a in sys.argv[1:] if not a.startswith("--")]:
        process(p, yo, "--dry" in sys.argv)
