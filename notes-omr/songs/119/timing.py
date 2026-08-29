# -*- coding: utf-8 -*-
"""Время события — из его X.

Finale выравнивает одновременные ноты по горизонтали, поэтому голос, чей такт
сходится в 3.0, задаёт карту «X → доля». Фортепианные пассажи переходят со стана
на стан и путают подсчёт по флагам — их onset надёжнее прочитать по этой карте.
"""
import omr, choir119 as C, piano119 as P

STEP = 0.25          # сетка шестнадцатых
EPS = 1e-6

def voice_points(evs, bars, bi):
    """Опорные точки одного голоса в такте: (x, доля) — только если такт сходится."""
    ins = [e for e in evs if C.in_bar(e["x"], bars, bi)]
    if not ins: return None
    t, pts = 0.0, []
    for e in ins:
        pts.append((e["x"], t))
        t += e["dur"] if e["dur"] is not None else C.BEATS
    return pts if abs(t - C.BEATS) < EPS else None

def bar_map(voices, bars, bi):
    """Карта такта: опорные точки всех сходящихся голосов плюс границы такта."""
    pts = [(bars[bi], 0.0), (bars[bi + 1], C.BEATS)]
    for evs in voices:
        p = voice_points(evs, bars, bi)
        if p: pts += p
    pts.sort()
    out = []                                   # одинаковые x схлопываем в среднее время
    for x, t in pts:
        if out and x - out[-1][0] < 1.5:
            out[-1] = (out[-1][0], (out[-1][1] + t) / 2)
        else:
            out.append((x, t))
    return out

def at(mp, x):
    """Доля по X: кусочно-линейно между опорными точками."""
    if x <= mp[0][0]: return 0.0
    for (x0, t0), (x1, t1) in zip(mp, mp[1:]):
        if x <= x1:
            return t0 + (t1 - t0) * (x - x0) / (x1 - x0) if x1 > x0 else t0
    return mp[-1][1]

def quant(t):
    return round(t / STEP) * STEP
