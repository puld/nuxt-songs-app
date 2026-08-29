# -*- coding: utf-8 -*-
"""Динамические оттенки: глиф нотного шрифта → декорация ABC у ноты.

Долгое время считалось, что в этих сборниках динамики нет вовсе: её искали
среди текста, а набрана она нотным шрифтом — в Maestro «mp» это один глиф
(0x50), а не пара букв, и в текст страницы он приезжает наравне с головками.

Оттенок относится к стану, а не к голосу: в PDF он стоит над верхним станом и
под нижним, по одному знаку на пару голосов. В ABC места для «знака на стан»
нет, поэтому знак вешается на верхний голос стана (S и T) — abcjs печатает его
над своим станом, а нижний голос повторного знака не получает: два одинаковых
«mf» друг под другом выглядят как ошибка набора.
"""
import omr

NAME = {"dyn_p": "p", "dyn_f": "f", "dyn_mp": "mp", "dyn_mf": "mf"}

def staff_dist(staff, y):
    """Расстояние от знака до стана: внутри стана — ноль."""
    if staff["top"] <= y <= staff["bottom"]: return 0.0
    return staff["top"] - y if y < staff["top"] else y - staff["bottom"]

def targets(sy):
    """Пары «стан — голос, которому достанется знак» для вокала системы."""
    voc = sy.get("vocal")
    if voc is None: voc = [sy["treble"], sy["bass"]]
    if not voc: return []
    if len(voc) == 1: return [(voc[0], "S")]
    return [(voc[0], "S"), (voc[-1], "T")]

def apply(doc, syss, sc):
    """Расставляет `dyn` по событиям партитуры. Возвращает число знаков."""
    n = 0
    for it, sy in zip(sc["systems"], syss):
        tg = targets(sy)
        if not tg: continue
        for g in sy["glyphs"]:
            name = NAME.get(g["sem"])
            if not name: continue
            staff, v = min(tg, key=lambda t: staff_dist(t[0], g["y"]))
            # глифы в системе лежат от всей страницы, и знак соседней системы
            # с похожим x прилипал к первой попавшейся ноте этой. Оттенок пишут
            # вплотную к своему стану, но под станом ему мешают штили и слова —
            # там он отодвинут дальше, чем над станом (в 119 — до 3.7 против 2.2)
            if staff_dist(staff, g["y"]) > 5 * staff["space"]: continue
            # знак стоит чуть левее своей ноты, но не дальше двух межлинейных:
            # иначе оттенок из соседнего такта прилипал бы к ближайшей ноте
            sp = staff["space"]
            evs = [e for e in it["voices"][v]["events"] if e["x"] > g["x"] - 2 * sp]
            if not evs: continue
            e = min(evs, key=lambda e: abs(e["x"] - g["x"]))
            if e.get("dyn"): continue
            e["dyn"] = name
            n += 1
    return n
