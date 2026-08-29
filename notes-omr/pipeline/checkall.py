# -*- coding: utf-8 -*-
"""Сетка по всему набору: что разбирается, где расходятся суммы длительностей.

Одна команда вместо тринадцати: правка в общем модуле легко чинит один файл и
ломает соседний, а замечаешь это только на сводке. Печатает по строке на файл —
такты, расхождения, что найдено (куплеты, лиги, репризы) и заголовок.
"""
import io, os, sys, glob, contextlib, traceback
import satb, meta, lyrics, slurs, volta, barnums, fontmap, chords, dynamics

ORDER = ["S", "A", "T", "B"]

def pitch_of(e):
    """Высота события в полутонах от C0: сравнивать голоса можно только числами."""
    STEP = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
    ACC = {"#": 1, "b": -1}
    p = e["pitches"][0]
    return p["o"] * 12 + STEP[p["p"]] + ACC.get(p["acc"], 0)

def crossings(sc):
    """Сколько раз соседние голоса поменялись местами по высоте.

    Хоровая партитура так не пишется: сопрано выше альта, тенор выше баса. Ноль
    расхождений в суммах длительностей ничего не говорит о высотах, а
    перепутанные голоса видно только этим — или глазами по всем страницам.
    """
    n = 0
    for it in sc["systems"]:
        for hi, lo in (("S", "A"), ("A", "T"), ("T", "B")):
            a = {round(e["x"]): e for bar in it["cells"][hi] for e in bar if not e["rest"]}
            b = {round(e["x"]): e for bar in it["cells"][lo] for e in bar if not e["rest"]}
            for x in set(a) & set(b):
                if pitch_of(a[x]) < pitch_of(b[x]): n += 1
    return n

def one(path):
    doc, syss, sc = satb.build(path)
    satb.content(sc)
    ties = slurs.apply(doc, syss, sc)
    marks = volta.apply(doc, syss, sc)
    # гармония и оттенки набраны своими шрифтами, и потерять их правкой в
    # `fontmap` проще всего: в сводке они видны числом, а не отсутствием
    dyn = dynamics.apply(doc, syss, sc)
    chd = chords.apply(doc, syss, sc)
    ly = lyrics.collect(doc, syss)
    nums = lyrics.numbers(ly) or []
    bad = tot = 0
    for si, it in enumerate(sc["systems"]):
        tot += it["nbars"]
        for hi, lo in (("S", "A"), ("T", "B")):
            for bi in range(it["nbars"]):
                sums = satb.staff_sums(it, hi, lo, bi, sc["beats"])
                e = satb.expected(sc, si, bi, sc["pickup"])
                for v, s in zip((hi, lo), sums):
                    if abs(s - e) < 1e-6 and satb.notes_sum(it["voices"][v], it, bi):
                        continue
                    if satb.notes_sum(it["voices"][v], it, bi) == 0: continue
                    bad += 1
    kind, nnum, mism = barnums.check(doc, syss, sc)
    return dict(bars=tot, bad=bad, cross=crossings(sc), num=(kind, nnum, mism), ts="%d/%d" % sc["ts"], key=meta.key_name(sc["nsig"]),
                verses=len(nums), ties=ties, marks=marks, title=sc["title"],
                chords=chd, dyn=dyn,
                unk=sum(fontmap.unknown(doc).values()))

if __name__ == "__main__":
    files = sys.argv[1:] or (sorted(glob.glob("../pdf/*.pdf")) + ["../songs/093/093.pdf"])
    for p in files:
        name = os.path.splitext(os.path.basename(p))[0]
        try:
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf): r = one(p)
            kind, nnum, mism = r["num"]
            # номера тактов есть не везде: где их нет, писать нечего, а где
            # напечатаны номера строк — сверять не с чем
            num = ("ном %d/%d" % (nnum - len(mism), nnum)) if kind == "такты" else "ном " + kind
            print("%-5s тактов %3d расх %2d перекр %2d  %-9s неизв %d  %-5s %-4s купл %d лиг %2d повторы %d акк %2d дин %d  %s"
                  % (name, r["bars"], r["bad"], r["cross"], num, r["unk"], r["ts"], r["key"],
                     r["verses"], r["ties"], r["marks"], r["chords"], r["dyn"], r["title"]))
            for m in mism[:3]: print("        !", m)
        except Exception as e:
            print("%-5s ОШИБКА %s: %s" % (name, type(e).__name__, str(e).split("\n")[0][:60]))
