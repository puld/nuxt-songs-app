# -*- coding: utf-8 -*-
import io, os, re, sys, json, glob
from collections import defaultdict
HERE = "/Users/l.romanov/workspace/my/nuxt-songs-app/notes-omr/pdf-epp"
SCR = "/private/tmp/claude-502/-Users-l-romanov-workspace-my-nuxt-songs-app/40dba977-185a-43ac-ade2-c2042b19f8ff/scratchpad"
sys.path.insert(0, HERE); os.chdir(HERE)
from mapnums import read_ours
ours = read_ours()
rows = {int(k): v for k, v in json.load(open(SCR+"/pairs.json")).items()}
final = json.load(io.open("numbers-final.json", encoding="utf-8"))
mapping = final["mapping"]
sheets = json.load(io.open("syllables.json", encoding="utf-8"))

allnums = sorted(int(os.path.basename(p)[:-4]) for p in glob.glob("/Users/l.romanov/workspace/my/nuxt-songs-app/songs-data/songs/*.txt"))

# многовариантные
songs = json.load(open("/Users/l.romanov/workspace/my/nuxt-songs-app/public/assets/songs.json"))["songs"]
multi = sorted(s["n"] for s in songs if len(s.get("variants") or []) > 1)

# dropped и diverged-ложные
dropped = {}
for line in io.open("dropped.tsv", encoding="utf-8").read().splitlines()[1:]:
    p = line.split("\t")
    dropped[int(p[0])] = (int(p[1]), int(p[2]))
diverged_lost = []
for it in json.load(open("numbers.json"))["diverged"]:
    if str(it["ours"]) not in mapping:
        diverged_lost.append(it["ours"])

manual = {211}

# один лист — несколько наших (по файлам разводится)
by_sheet = defaultdict(list)
for n, r in rows.items(): by_sheet[r["sheet"]].append(n)
dup_sheets = {s: sorted(ns) for s, ns in by_sheet.items() if len(ns) > 1}

HITS_STRONG, COV_MIN, MIN_HITS = 8, 0.20, 4
tiers = {}
for n in allnums:
    if n in rows:
        r = rows[n]
        notes = []
        if n in manual:
            tier = 3
            notes.append("два листа-редакции (1005/861), выбран вручную по тексту")
        else:
            strong = r["hits"] >= HITS_STRONG and r["cov"] >= COV_MIN
            if strong:
                tier = 1
                if r["conf"] == "средняя":
                    notes.append("уверенность карты средняя, но текст подтвердил сильно")
            else:
                tier = 2
                if r["hits"] < MIN_HITS:
                    notes.append("текст молчит: %d зонда(ов) — возможно, лист без подтекстовки" % r["hits"])
                elif r["hits"] < HITS_STRONG:
                    notes.append("слабое подтверждение: %d зондов (порог приёма 4)" % r["hits"])
                else:
                    notes.append("низкое покрытие: узнано %.0f%% текста" % (r["cov"]*100))
                if r["conf"] == "средняя":
                    notes.append("уверенность средняя")
        if r["sheet"] in dup_sheets:
            others = [x for x in dup_sheets[r["sheet"]] if x != n]
            fl = mapping[str(n)].get("files", [])
            notes.append("лист общий с нашей %s; песня в файлах %s" % (",".join(map(str, others)), ",".join(fl)))
        if n in multi:
            notes.append("несколько вариантов текста в .txt — сверка шла по всем строфам сразу")
        tiers[n] = {"tier": tier, "sheet": r["sheet"], "cover": round(r["cov"], 3),
                    "hits": r["hits"], "probes": r["probes"], "via": r["via"], "conf": r["conf"],
                    "note": "; ".join(notes)}
    else:
        if n in dropped:
            sh, owner = dropped[n]
            tiers[n] = {"tier": 3, "sheet": None, "cover": 0.0,
                        "note": "кандидат-лист %d снят: по тексту он принадлежит нашей %d" % (sh, owner)}
        elif n in diverged_lost:
            tiers[n] = {"tier": 3, "sheet": None, "cover": 0.0,
                        "note": "под нашим номером у издателя другая песня; настоящий лист текст не нашёл"}
        else:
            note = "несколько вариантов текста в .txt" if n in multi else ""
            tiers[n] = {"tier": 4, "sheet": None, "cover": 0.0, "note": note}

LABEL = {1: "гарантированный", 2: "условный", 3: "спорный", 4: "нет листа"}
cnt = defaultdict(int)
for v in tiers.values(): cnt[v["tier"]] += 1
print("распределение:", {LABEL[k]: cnt[k] for k in sorted(cnt)}, "всего", len(tiers))

# запись
json.dump({str(n): tiers[n] for n in allnums},
          io.open("tiers.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1, sort_keys=False)
with io.open("tiers.tsv", "w", encoding="utf-8") as f:
    f.write("наш\tгруппа\tлист\tпокрытие\tзондов\tназвание\tпримечание\n")
    for n in allnums:
        t = tiers[n]
        f.write("%d\t%s\t%s\t%.2f\t%s\t%s\t%s\n" % (
            n, LABEL[t["tier"]], t["sheet"] if t["sheet"] else "",
            t["cover"], t.get("hits", ""), ours[n][0], t["note"]))

# статистика для ответа
t2 = [n for n, t in tiers.items() if t["tier"] == 2]
t2_mute = [n for n in t2 if rows[n]["hits"] < 4]
t2_weak = [n for n in t2 if 4 <= rows[n]["hits"] < 8]
t2_lowcov = [n for n in t2 if rows[n]["hits"] >= 8 and rows[n]["cov"] < COV_MIN]
t2_mid = [n for n in t2 if rows[n]["conf"] == "средняя"]
print("T2: mute", len(t2_mute), t2_mute[:6])
print("T2: weak 4-7", len(t2_weak), sorted(t2_weak)[:6])
print("T2: lowcov", len(t2_lowcov), sorted(t2_lowcov)[:6])
print("T2: conf средняя", len(t2_mid), sorted(t2_mid)[:8])
t1 = [n for n, t in tiers.items() if t["tier"] == 1]
covs1 = sorted(rows[n]["cov"] for n in t1)
print("T1:", len(t1), "cov: min %.2f p25 %.2f медиана %.2f" % (covs1[0], covs1[len(covs1)//4], covs1[len(covs1)//2]))
mid_strong = [n for n in t1 if rows[n]["conf"] == "средняя"]
print("T1 со средней conf:", len(mid_strong), mid_strong)
t3 = sorted(n for n, t in tiers.items() if t["tier"] == 3)
print("T3:", t3)
t4 = sorted(n for n, t in tiers.items() if t["tier"] == 4)
print("T4:", len(t4), "примеры:", t4[:8])

# (а) листы без подтекстовки — оценка по длине потока
for cut in (200, 250, 300):
    files = sum(1 for v in sheets.values() if len(v) < cut)
    ss = len({int(re.match(r"(\d+)", f).group(1)) for f, v in sheets.items() if len(v) < cut})
    print("потоки короче %d букв: %d файлов, %d листов" % (cut, files, ss))
# листы карты, где ни один файл не дал >=4 зондов и потоки короткие
mute_map = [(n, rows[n]["sheet"]) for n in rows if rows[n]["hits"] < 4]
short_mute = [n for n, s in mute_map if all(len(sheets[f]) < 300 for f in sheets if re.match(r"0*%d[a-z]*\.pdf$" % s, f))]
print("mute-пар в карте:", len(mute_map), "из них все файлы листа короче 300 букв:", len(short_mute), short_mute)

# (б) многовариантные на карте
print("многовариантных:", len(multi), multi)
for n in multi:
    print("  %-5d tier=%s sheet=%s cover=%s" % (n, tiers[n]["tier"], tiers[n]["sheet"], tiers[n]["cover"]))

# (в) файлы-аранжировки: у скольких пар несколько файлов листа
manyfiles = [(k, v["files"]) for k, v in mapping.items() if len(v.get("files", [])) > 1]
print("пар с несколькими файлами одного листа:", len(manyfiles))
print("листов с двумя нашими песнями:", len(dup_sheets), dup_sheets)
