# -*- coding: utf-8 -*-
"""Контроль качества: спасённые песни vs ручная разметка (пересечение с 65).

Ручной файл: {X} в тексте. Наши правки: (li, pos, name) в координатах файла
без {…}. Извлекаем ручные аккорды теми же координатами и сравниваем:
- позиция: тот же символ / тот же слог / соседний слог / дальше / нет пары;
- имя: точное, с учётом постоянной транспозиции (ручная разметка могла быть
  сделана в другой тональности, чем лист Эппа).
Слог меряем числом гласных между позициями в очищенной строке."""
import json, os, re, collections

HERE = os.path.dirname(os.path.abspath(__file__))
SONGS = "/Users/l.romanov/workspace/my/nuxt-songs-app/songs-data/songs"
VOWELS = "аеёиоуыэюяaeiouy"

CHORD = re.compile(r"\{([^}]*)\}")

PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11, "H": 11}
def pitch(name):
    m = re.match(r"^([A-Ha-h])(#|b)?", name.strip())
    if not m:
        return None
    p = PC[m.group(1).upper()]
    if m.group(2) == "#": p += 1
    if m.group(2) == "b": p -= 1
    return p % 12

def quality(name):
    """минор/мажор + септима — грубо, для сверки характера."""
    m = re.match(r"^[A-Ha-h](#|b)?(m)?", name.strip())
    return m.group(2) or "" if m else ""

def manual_chords(num):
    """[(li, pos_clean, name)] и очищенные строки."""
    raw = open(os.path.join(SONGS, "%04d.txt" % num), encoding="utf-8").read()
    out, clean_lines = [], []
    for li, line in enumerate(raw.split("\n")):
        clean, i = [], 0
        pos = 0
        for m in CHORD.finditer(line):
            seg = line[i:m.start()]
            clean.append(seg)
            pos += len(seg)
            out.append((li, pos, m.group(1)))
            i = m.end()
        clean.append(line[i:])
        clean_lines.append("".join(clean))
    return out, clean_lines

def syll_dist(line, a, b):
    """Число гласных в line между позициями a и b (примерно слоги между)."""
    lo, hi = min(a, b), max(a, b)
    return sum(1 for c in line[lo:hi] if c.lower() in VOWELS)

plan = json.load(open(os.path.join(HERE, "rescue-plan.json")))
for num in (13, 112, 132):
    rec = plan["%04d" % num]
    ours = [tuple(e) for e in rec["edits"]]
    manual, clean = manual_chords(num)
    print("=" * 60)
    print("песня %04d: наших %d, ручных %d, отброшено куплетов %s, пустых слогов %d"
          % (num, len(ours), len(manual), rec["dropped_verses"], rec["empty_slots"]))
    used = set()
    cls = collections.Counter()
    ivals = collections.Counter()
    details = []
    for li, pos, name in ours:
        cands = [(abs(pos - mp), mi) for mi, (ml, mp, mn) in enumerate(manual)
                 if ml == li and mi not in used]
        if not cands:
            cls["нет ручного на строке"] += 1
            details.append(("нет пары", li, pos, name, None))
            continue
        cands.sort()
        _, mi = cands[0]
        ml, mp, mn = manual[mi]
        used.add(mi)
        sd = syll_dist(clean[li], pos, mp)
        if pos == mp:
            c = "тот же символ"
        elif sd == 0:
            c = "тот же слог"
        elif sd == 1:
            c = "соседний слог"
        else:
            c = "дальше (%d слогов)" % sd
        cls[c] += 1
        a, b = pitch(name), pitch(mn)
        if a is not None and b is not None:
            ivals[(a - b) % 12] += 1
        details.append((c, li, pos, name, mn))
    for k, v in cls.most_common():
        print("   %-22s %d" % (k, v))
    miss = len(manual) - len(used)
    print("   ручных без нашей пары   %d" % miss)
    if ivals:
        iv, n = ivals.most_common(1)[0]
        tot = sum(ivals.values())
        print("   интервал имён: мода %+d пт (%d/%d пар)" % (iv, n, tot))
        # точность имени с поправкой на моду
        ok = sum(1 for c, li, pos, name, mn in details
                 if mn and pitch(name) is not None and pitch(mn) is not None
                 and (pitch(name) - pitch(mn)) % 12 == iv
                 and quality(name) == quality(mn))
        print("   имя совпало (с поправкой на транспозицию, корень+характер): %d/%d"
              % (ok, sum(1 for d in details if d[4])))
    bad = [d for d in details if d[0].startswith("дальше") or d[0] == "нет пары"]
    for c, li, pos, name, mn in bad[:12]:
        print("     ? %-18s строка %d поз %d наш %s ручной %s" % (c, li, pos, name, mn))
