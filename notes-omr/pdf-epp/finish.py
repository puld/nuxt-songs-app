# -*- coding: utf-8 -*-
"""Сборка итоговой карты: заголовки + текст + ручные решения.

Порядок старшинства обратный порядку появления: **текст важнее заголовка**, а
ручное решение важнее текста. Так и есть по надёжности — на контрольной выборке
текст не ошибся ни разу, тогда как сопоставление по названию дало шесть чужих
листов из 1322.
"""
import io, os, json, csv

HERE = os.path.dirname(os.path.abspath(__file__))

full = json.load(io.open(os.path.join(HERE, "numbers-final.json"), encoding="utf-8"))
mapping = full["mapping"]

fixed = 0
with io.open(os.path.join(HERE, "verify-clash.tsv"), encoding="utf-8") as f:
    for row in list(csv.reader(f, delimiter="\t"))[1:]:
        n, _was, now, hits = row[0], row[1], row[2], row[3]
        mapping[n] = dict(mapping[n], sheet=int(now), via="текст (правка)",
                          conf="высокая", hits=int(hits), src="слоги")
        fixed += 1

manual = 0
with io.open(os.path.join(HERE, "manual.tsv"), encoding="utf-8") as f:
    for line in f:
        if line.startswith("#") or not line.strip():
            continue
        n, sheet, why = line.rstrip("\n").split("\t", 2)
        mapping[n] = {"sheet": int(sheet), "via": "вручную", "conf": "высокая",
                      "why": why, "src": "решение"}
        manual += 1

# Текст промолчал — на листе нет ни одной нашей строки. Само по себе это не
# улика: у части листов под нотами вовсе нет слов. Но если тот же лист уже
# подтверждён текстом за другой нашей песней, второе сопоставление ложно —
# именно так «Авва, Отче!» оказалась на листе «Слушайте, братья и сестры».
mute, dropped = {}, []
with io.open(os.path.join(HERE, "verify-mute.tsv"), encoding="utf-8") as f:
    for row in list(csv.reader(f, delimiter="\t"))[1:]:
        mute[row[0]] = int(row[1])
confirmed = {}
for k, v in mapping.items():
    if k not in mute:
        confirmed.setdefault(v["sheet"], []).append(k)
for k, sheet in mute.items():
    if confirmed.get(sheet):
        dropped.append((k, sheet, confirmed[sheet][0]))
        del mapping[k]
    else:
        mapping[k] = dict(mapping[k], conf="средняя", note="текст не подтвердил")


json.dump({"mapping": mapping, "text_fixed_diverged": full.get("text_fixed_diverged", {})},
          io.open(os.path.join(HERE, "numbers-final.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1, sort_keys=True)
with io.open(os.path.join(HERE, "numbers-final.tsv"), "w", encoding="utf-8") as f:
    f.write("наш\tлист\tкак\tуверенность\n")
    for k in sorted(mapping, key=int):
        it = mapping[k]
        f.write("%s\t%s\t%s\t%s\n" % (k, it["sheet"], it["via"], it["conf"]))

by = {}
for k, v in mapping.items():
    by[v["via"]] = by.get(v["via"], 0) + 1
print("исправлено текстом %d, принято вручную %d" % (fixed, manual))
print("снято как ложное %d, понижено до средней %d" % (len(dropped), len(mute) - len(dropped)))
for k, sheet, other in dropped:
    print("   %-5s снят с листа %-5d — он подтверждён за нашей %s" % (k, sheet, other))
print("в карте %d из 1565" % len(mapping))
for via in sorted(by, key=lambda x: -by[x]):
    print("   %-16s %d" % (via, by[via]))
with io.open(os.path.join(HERE, "dropped.tsv"), "w", encoding="utf-8") as f:
    f.write("наш\tлист\tзанят нашей\n")
    for k, sheet, other in dropped:
        f.write("%s\t%d\t%s\n" % (k, sheet, other))
