# -*- coding: utf-8 -*-
"""Проверка импорта на песнях, размеченных вручную.

Разметка снимается, импорт прогоняется на чистом тексте, результат
сравнивается с тем, что стояло. Ручная разметка — не абсолютная истина
(слоги у Эппа делятся иначе, часть аккордов ставилась «по смыслу»), но
расхождение в имени аккорда на совпавшей позиции — уже ошибка.
"""
import io, os, sys, json
from collections import Counter
import importchords as ic


def check(num, files):
    raw = io.open(ic.song_path(num), encoding="utf-8").read()
    clean, want = ic.strip_marks(raw)
    if not want:
        return None
    got, report = ic.plan(num, files, raw=clean)
    if got is None:
        return {"num": num, "want": len(want), "got": 0, "same": 0,
                "moved": 0, "wrong": 0, "report": report}
    w = {(li, pos): ch for li, pos, ch in want}
    g = {(li, pos): ch for li, pos, ch in got}
    same = sum(1 for k in w if k in g and g[k] == w[k])
    wrong = sum(1 for k in w if k in g and g[k] != w[k])
    # Тот же аккорд рядом (±2 буквы) — разная разбивка на слоги, не ошибка
    moved = 0
    for k, ch in w.items():
        if k in g:
            continue
        li, pos = k
        if any((li, pos + d) in g and g[(li, pos + d)] == ch for d in (-3, -2, -1, 1, 2, 3)):
            moved += 1
    return {"num": num, "want": len(want), "got": len(got), "same": same,
            "moved": moved, "wrong": wrong, "report": report}


def main():
    mp = ic.load_map()
    nums = []
    for f in sorted(os.listdir(ic.SONGS)):
        if not f.endswith(".txt"):
            continue
        n = int(f[:-4])
        if str(n) not in mp:
            continue
        if ic.CHORD.search(io.open(os.path.join(ic.SONGS, f), encoding="utf-8").read()):
            nums.append(n)
    print("размеченных вручную и сопоставленных: %d" % len(nums))
    tot = Counter()
    rows = []
    for n in nums:
        it = mp[str(n)]
        r = check(n, it.get("files") or ["%03d.pdf" % it["sheet"]])
        if not r:
            continue
        rows.append(r)
        for k in ("want", "got", "same", "moved", "wrong"):
            tot[k] += r[k]
    print("аккордов вручную %d, импорт дал %d" % (tot["want"], tot["got"]))
    print("точно там же %d (%.0f%%), рядом %d (%.0f%%), не то имя %d" % (
        tot["same"], 100.0 * tot["same"] / max(tot["want"], 1),
        tot["moved"], 100.0 * tot["moved"] / max(tot["want"], 1), tot["wrong"]))
    rows.sort(key=lambda r: (r["same"] + r["moved"]) / max(r["want"], 1))
    print("\nхудшие:")
    for r in rows[:12]:
        print("  %-5d вручную %-4d импорт %-4d совпало %-4d рядом %-3d не то %-3d  %s"
              % (r["num"], r["want"], r["got"], r["same"], r["moved"], r["wrong"], r["report"][:60]))
    json.dump(rows, io.open(os.path.join(ic.HERE, "check-chords.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
