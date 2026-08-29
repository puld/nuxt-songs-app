# -*- coding: utf-8 -*-
"""Замер по 20 песням с отказом «разные аккорды на один слог» (очередь 2).

Только чтение: собирает ВСЕ посадки (как diag_conflicts.collect), анализирует
конфликты по координатам, сопоставляет с разметкой повторов в тексте и с
вольтами/репризами в ABC. Пишет diag-passes.json рядом.
"""
import io, os, re, sys, json, glob, collections, contextlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import driver
from driver import al, ci, fit_map, OUT
import diag_conflicts

driver.use_shadow()

HERE = os.path.dirname(os.path.abspath(__file__))
NUMS = [117, 210, 213, 215, 266, 338, 456, 612, 613, 692, 760, 830, 835, 841,
        918, 1077, 1257, 1348, 1501, 1533]


def abc_marks(path, voice="S"):
    """Репризы и вольты в голосе: {|:, :|, номера вольт}."""
    txt = io.open(path, encoding="utf-8").read()
    lines, grab = [], False
    for line in txt.splitlines():
        if line.startswith("V:"):
            grab = line[2:].split()[0] == voice
            continue
        if grab and line and not line.startswith(("w:", "%", "X:", "T:", "K:")):
            lines.append(line)
    m = " ".join(lines)
    m = re.sub(r'"[^"]*"', " ", m)
    m = re.sub(r"![^!]*!", " ", m)
    m = al.INLINE.sub(" ", m)
    voltas = []
    # только номер при ТАКТОВОЙ черте: «]3» — длительность аккорда [E,G,]3, не вольта
    for mm in re.finditer(r"(?::\||\|:|\|)\s*([\d,]+)", m):
        voltas.append(mm.group(1))
    rawv = [mm.group(1) for mm in re.finditer(r"(?::\||\|:|\||\]|\[)\s*([\d,]+)", m)]
    nums = set()
    for v in voltas:
        for x in v.split(","):
            if x.strip().isdigit():
                nums.add(int(x))
    return {"rep_start": m.count("|:"), "rep_end": m.count(":|"),
            "voltas_raw": rawv, "chordbrackets": m.count("["),
            "voltas": voltas, "volta_nums": sorted(nums),
            "max_volta": max(nums) if nums else 0}


COUNT_RE = ci.COUNT_RE


def repeat_blocks(verses, chorus):
    """Строфы с повтором: (кому, счётчик, строки-диапазон номеров строк файла)."""
    out = []
    for name, block in [("куплет %d" % k, v) for k, v in sorted(verses.items())] + \
                       ([("припев", chorus)] if chorus else []):
        start = None
        for li, off, text in block:
            if text.lstrip().startswith("/") and start is None:
                start = li
            m = COUNT_RE.search(text)
            if m:
                b = start if start is not None else li
                out.append({"where": name, "count": int(m.group(1)),
                            "lines": [b, li]})
                start = None
    return out


def analyse(num):
    rec = {"num": num}
    try:
        abcp = al.abc_path(num)
    except IOError:
        return {"num": num, "why": "нет нот"}
    rec["abc"] = abc_marks(abcp)

    raw, lines, verses, chorus = ci.read_source(num)
    blocks = repeat_blocks(verses, chorus)
    rec["repeat_blocks"] = blocks
    rec["verses_n"] = len(verses)
    rec["has_chorus"] = bool(chorus)
    rec["repeat_counts"] = sorted({b["count"] for b in blocks})

    col = diag_conflicts.collect(num)
    if "placements" not in col:
        rec["why"] = col.get("why")
        return rec
    pl = col["placements"]
    rec["skipped_verses"] = col.get("skipped", [])
    rec["placements_n"] = len(pl)
    rec["placements"] = pl

    at = collections.defaultdict(list)          # (li,pos) -> [(vi, vno, name)]
    for vi, vno, j, li, pos, name in pl:
        at[(li, pos)].append((vi, vno, name))
    rec["coords_n"] = len(at)

    # какие строки файла лежат внутри блока повтора
    rep_lines = set()
    for b in blocks:
        for li in range(b["lines"][0], b["lines"][1] + 1):
            rep_lines.add(li)

    conf = []
    for (li, pos), v in sorted(at.items()):
        names = {n for _, _, n in v}
        if len(names) < 2:
            continue
        by_vi = collections.defaultdict(set)
        for vi, vno, n in v:
            by_vi[vi].add(n)
        intra = any(len(s) > 1 for s in by_vi.values())   # один куплет дал два имени
        inter = len({frozenset(s) for s in by_vi.values()}) > 1
        conf.append({"li": li, "pos": pos, "names": sorted(names),
                     "n_names": len(names),
                     "in_repeat": li in rep_lines,
                     "intra_verse": intra, "inter_verse": inter,
                     "by_vi": {str(k): sorted(s) for k, s in by_vi.items()}})
    rec["conflicts_n"] = len(conf)
    rec["conflicts"] = conf
    rec["max_names_on_coord"] = max([c["n_names"] for c in conf], default=0)
    rec["conf_in_repeat"] = sum(1 for c in conf if c["in_repeat"])
    rec["conf_intra"] = sum(1 for c in conf if c["intra_verse"])
    rec["conf_inter_only"] = sum(1 for c in conf if not c["intra_verse"])
    # потеря «в лоб»: на конфликтной координате остаётся одно имя
    rec["lost_if_first_wins"] = sum(c["n_names"] - 1 for c in conf)
    rec["kept_if_first_wins"] = len(at)
    # сколько разных наборов имён внутри ОДНОГО куплета (число проходов по данным)
    rec["max_names_intra_one_verse"] = max(
        [max((len(s) for s in
              collections.defaultdict(set, {vi: {n for vv, _, n in v if vv == vi}
                                            for vi, _, _ in v}).values()), default=1)
         for v in at.values()], default=1)
    return rec


def main():
    out = []
    for n in NUMS:
        try:
            out.append(analyse(n))
        except Exception as e:
            out.append({"num": n, "why": "исключение %s: %s" % (type(e).__name__, e)})
        print("...", n, flush=True)
    json.dump(out, io.open(os.path.join(HERE, "diag-passes.json"), "w", encoding="utf-8"),
              ensure_ascii=False)
    print("записано diag-passes.json")


if __name__ == "__main__":
    main()
