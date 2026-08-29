# -*- coding: utf-8 -*-
"""Сверка нумерации: наш песенник ↔ каталог нот Эппа.

Номера совпадают только на 1–830: там сборник общий. Выше 830 у Эппа свой
сборник, упорядоченный по алфавиту, поэтому единственная связь — название.

Два разных режима сравнения, и это главное в файле. Когда номер уже совпал,
подпись Эппа достаточно узнать по началу: она обрезана до двух-трёх слов
(«93].Великий Бог» против нашего «Великий Бог! Когда на мир смотрю я»), и
требовать полного сходства значит терять почти всё. Когда номер не помогает,
тот же короткий префикс становится опасен — «Господь, Спаситель!» начинает
десяток разных песен, поэтому порог там втрое выше.

Спорное не сматчивается молча, а уходит человеку в `review.tsv`: ошибка
привяжет к песне чужие ноты, и заметить это можно будет только на экране.
"""
import io, os, re, glob, json, difflib
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SPLIT = 830                 # граница общей нумерации
PREF_NUM = 8                # префикс названия, когда номер уже совпал
PREF_TITLE = 18             # префикс названия, когда сверяемся только по нему

def norm(s):
    s = s.replace("&nbsp;", " ").replace(" ", " ").lower().replace("ё", "е")
    return re.sub(r"\s+", " ", re.sub(r"[^а-яa-z0-9 ]+", " ", s)).strip()

def prefix_hit(a, b, least):
    """Одно название — начало другого, длиной не меньше `least` символов."""
    a, b = norm(a), norm(b)
    n = min(len(a), len(b))
    return n >= least and a[:n] == b[:n]

def ratio(a, b):
    return difflib.SequenceMatcher(None, norm(a)[:70], norm(b)[:70]).ratio()

# --- наши песни: номер → (название, первые строки текста) ---
ours = {}
for p in sorted(glob.glob(os.path.join(ROOT, "songs-data/songs/*.txt"))):
    lines = io.open(p, encoding="utf-8").read().splitlines()
    m = re.match(r"#(\d+)\s+(.*)", lines[0].strip())
    if not m: continue
    body = [l.strip() for l in lines[1:] if l.strip() and not l.strip().startswith(("#", "@"))]
    ours[int(m.group(1))] = (m.group(2).strip(), body[:2])

# --- их каталог: номер и вариант берутся из ИМЕНИ ФАЙЛА, а не из подписи:
# подпись бывает без номера вовсе («A].Господь, Спаситель!») ---
theirs = []
for line in io.open(os.path.join(HERE, "catalog.tsv"), encoding="utf-8"):
    u, _, cap = line.rstrip("\n").partition("\t")
    fm = re.match(r"Daten/(\d+)([a-zA-Zа-яА-Я]?)\.pdf$", u)
    cap = cap.replace("&nbsp;", " ").replace(" ", " ")
    title = re.sub(r"^[^А-Яа-яЁё]*", "", cap).strip()   # снять «A].», «.», «1465 »
    theirs.append((u, int(fm.group(1)) if fm else None, fm.group(2) if fm else "", title))

by_num = defaultdict(list)
for u, num, var, t in theirs:
    if num is not None: by_num[num].append((u, t))

# Инвертированный индекс «слово → записи»: сравнение каждой песни со всеми 3293
# подписями — миллионы вызовов difflib и минуты работы вместо секунд.
NORM = [(u, num, t) for u, num, var, t in theirs if t]
WORD = defaultdict(set)
for i, (u, num, t) in enumerate(NORM):
    for w in set(norm(t).split()):
        if len(w) > 2: WORD[w].add(i)

def candidates(probes):
    cnt = defaultdict(int)
    for p in probes:
        for w in set(norm(p).split()):
            if len(w) > 2:
                for i in WORD.get(w, ()): cnt[i] += 1
    return [i for i, c in cnt.items() if c >= 2]

def with_variants(files):
    """Все варианты нот того же номера: 090.pdf тянет за собой 090b/c/d.pdf."""
    nums = set()
    for f in files:
        m = re.match(r"Daten/(\d+)[a-zA-Zа-яА-Я]?\.pdf$", f)
        if m: nums.add(int(m.group(1)))
    return sorted(set(files) | {u for u, t in sum((by_num[n] for n in nums), [])})

mapping, review, missing = {}, [], []
for n, (title, body) in sorted(ours.items()):
    probes = [title] + body
    # 1) тот же номер — общая часть сборника, подписи достаточно узнать по началу
    same_num = by_num.get(n, [])
    hit = [u for u, ct in same_num if prefix_hit(title, ct, PREF_NUM) or ratio(title, ct) > 0.75]
    if hit:
        mapping[n] = {"files": with_variants(hit), "via": "номер", "conf": "высокая"}
        continue
    # 2) поиск по названию во всём каталоге
    cands = []
    for i in candidates(probes):
        u, num, ct = NORM[i]
        pref = prefix_hit(title, ct, PREF_TITLE)
        r = max(ratio(p, ct) for p in probes)
        if pref or r >= 0.70:
            cands.append((round(r, 3), pref, u, ct))
    cands.sort(reverse=True)
    strong = [c for c in cands if c[1] or c[0] >= 0.90]
    if strong:
        conf = "высокая" if any(c[1] for c in strong) else "средняя"
        mapping[n] = {"files": with_variants([c[2] for c in strong]), "via": "название",
                      "conf": conf, "their_title": strong[0][3]}
    elif cands or same_num:
        # номер есть, но название чужое — тоже на приёмку, а не в «нет нот»
        extra = [(0.0, False, u, ct) for u, ct in same_num] if same_num else []
        review.append((n, title, (cands[:3] + extra)[:4]))
    else:
        missing.append((n, title))

need = sorted({f for v in mapping.values() for f in v["files"]}
              | {c[2] for _, _, cs in review for c in cs})   # спорное качаем: файл дешевле поиска
io.open(os.path.join(HERE, "needed.txt"), "w", encoding="utf-8").write("\n".join(need) + "\n")
json.dump({"mapping": {str(k): v for k, v in sorted(mapping.items())}},
          io.open(os.path.join(HERE, "mapping.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
with io.open(os.path.join(HERE, "review.tsv"), "w", encoding="utf-8") as f:
    f.write("наш\tнаше название\tсходство\tих файл\tих название\n")
    for n, t, cs in review:
        for r, pref, u, ct in cs:
            f.write("%d\t%s\t%.2f\t%s\t%s\n" % (n, t, r, u, ct))
io.open(os.path.join(HERE, "missing.txt"), "w", encoding="utf-8").write(
    "\n".join("%d\t%s" % (n, t) for n, t in missing) + "\n")

hi = sum(1 for v in mapping.values() if v["conf"] == "высокая")
lo = [n for n in ours if n <= SPLIT and n not in mapping]
print("наших песен: %d" % len(ours))
print("  сопоставлено:       %d (высокая %d, средняя %d)" % (len(mapping), hi, len(mapping) - hi))
print("  на приёмку глазами: %d  → review.tsv" % len(review))
print("  кандидатов нет:     %d  → missing.txt" % len(missing))
print("  из них в зоне 1–%d: %d" % (SPLIT, len(lo)))
print("нужных PDF: %d из %d в каталоге" % (len(need), len(theirs)))
done = sum(1 for u in need if os.path.exists(os.path.join(HERE, os.path.basename(u))))
print("уже скачано: %d, осталось: %d" % (done, len(need) - done))
