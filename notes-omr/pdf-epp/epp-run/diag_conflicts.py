# -*- coding: utf-8 -*-
"""Диагностика отказа «разные аккорды на один слог» — поведение не меняется.

Копия driver.plan_fit, но конфликт не роняет песню: собираются ВСЕ посадки
(vi, j, li, pos, name), а анализ идёт поверх. Результат — diag-conflicts.json
рядом со скриптом.
"""
import io, json, os, sys, contextlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import driver
from driver import al, ci, fit_map, OUT

driver.use_shadow()


def collect(num):
    """Все посадки аккордов песни без отказа на конфликте.

    Возвращает dict: placements=[(vi, verse_no, j, li, pos, name)],
    skipped=[verse_no...], why=строка при отказе ДО посадки.
    """
    raw, lines, verses, chorus = ci.read_source(num)
    if not verses:
        return {"why": "нет куплетов"}
    if ci.CHORD.search(raw):
        return {"why": "аккорды уже есть"}
    try:
        abc = io.open(al.abc_path(num), encoding="utf-8").read()
    except IOError:
        return {"why": "нет нот"}
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            built, _bars = al.build(num, fit=True)
    except al.NeedJournal:
        return {"why": "нужен журнал"}
    except Exception as e:
        return {"why": "ошибка " + type(e).__name__}

    hand = ci.hand_rows(abc)
    placements, skipped = [], []
    for vi, verse_no in enumerate(sorted(verses)):
        if vi >= len(built):
            break
        row = ci.MARK_RE.sub("", built[vi]).strip()
        toks = [t for t in row.split() if t not in ("_", "*", "?")]
        toks_q = [t for t in row.split() if t not in ("_", "*")]
        mine = ci.match_syllables(verses[verse_no], chorus, toks)
        mine_full = None
        if mine is not None:
            if len(toks_q) == len(mine):
                mine_full = mine
            else:
                mine_full = list(mine) + [None] * (len(toks_q) - len(mine))
        else:
            nrow = hand[vi] if vi < len(hand) else (hand[0] if hand else "")
            notes_toks = [t for t in nrow.split() if t not in ("*", "_")]
            for expand in (False, True):
                for echo in (False, True):
                    for with_chorus in (False, True):
                        base = ci.block_syllables(verses[verse_no], expand, echo)
                        if with_chorus:
                            base = base + ci.block_syllables(chorus, expand, echo)
                        pool = [x[2] for x in base]
                        mapping = fit_map(pool, notes_toks)
                        recon = [pool[k] if k is not None else "?" for k in mapping]
                        if recon == toks_q:
                            mine_full = [base[k] if k is not None else None for k in mapping]
                            break
                    if mine_full is not None:
                        break
                if mine_full is not None:
                    break
        if mine_full is None:
            skipped.append(verse_no)
            continue
        if mine is not None and vi < len(hand):
            slots = al.hand_template(hand[vi]).count("syl")
            if slots != len(mine_full):
                mine_full = ci.split_joined(mine_full, hand[vi])
            if slots != len(mine_full):
                skipped.append(verse_no)
                continue
        cmap = ci.chords_by_syllable(abc, vi)
        if cmap is None:
            return {"why": "шаблон ≠ числу нот"}
        for j, name in cmap.items():
            if j >= len(mine_full) or mine_full[j] is None:
                continue
            li, pos = mine_full[j][0], mine_full[j][1]
            placements.append((vi, verse_no, j, li, pos, name))
    return {"placements": placements, "skipped": skipped}


def main(nums):
    out = {}
    for i, num in enumerate(nums):
        try:
            out["%04d" % num] = collect(num)
        except Exception as e:
            out["%04d" % num] = {"why": "исключение " + type(e).__name__}
        if (i + 1) % 25 == 0:
            print("...%d/%d" % (i + 1, len(nums)), flush=True)
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "diag-conflicts.json")
    json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False)
    print("записано:", path, "песен:", len(out))


if __name__ == "__main__":
    plan = json.load(open(os.path.join(OUT, "chords-plan.json")))
    plan.pop("_note", None)
    nums = sorted(int(k) for k, v in plan.items()
                  if v.get("chords_why") == "разные аккорды на один слог")
    if len(sys.argv) > 1:
        nums = nums[:int(sys.argv[1])]
    print("песен в работе:", len(nums))
    main(nums)
