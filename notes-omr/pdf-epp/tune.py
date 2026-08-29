# Подбор длины зонда и порога по контрольной выборке уже сопоставленных песен.
#
# Сверка по тексту ценна ровно настолько, насколько она не врёт: цена ошибки —
# чужая песня в карте, которую потом никто не перепроверит. Поэтому выбираем не
# лучшую полноту, а лучшую полноту **при нуле расхождений**.
import json, re, sys
from collections import defaultdict
from mapnums import read_ours
from matchtext import squash

sheets = json.load(open('syllables.json', encoding='utf-8'))
known = json.load(open('numbers.json', encoding='utf-8'))['mapping']
ours = read_ours()

def probes(text, size):
    flat, out = squash(text), []
    for i in range(0, len(flat) - size + 1, size):
        p = flat[i:i + size]
        if p not in out:
            out.append(p)
    return out

def best(pr, need):
    hits = defaultdict(int)
    for name, text in sheets.items():
        for p in pr:
            if p in text:
                hits[name] += 1
    top = sorted(((c, n) for n, c in hits.items() if c >= need), reverse=True)
    if not top:
        return None
    return int(re.match(r"(\d+)", top[0][1]).group(1))

sample = sorted(int(k) for k in known)[::10]
print('контроль: %d песен' % len(sample))
print('%-6s %-6s %-8s %-8s %-8s' % ('зонд', 'порог', 'совпало', 'разошлось', 'не нашлось'))
for size in (18, 20, 22, 24, 30):
    cache = {n: probes(ours[n][2], size) for n in sample if n in ours}
    for need in (2, 3, 4):
        ok = bad = none = 0
        for n in sample:
            if n not in cache:
                continue
            got = best(cache[n], need)
            want = known[str(n)]['sheet']
            if got is None:
                none += 1
            elif got == want:
                ok += 1
            else:
                bad += 1
        print('%-6d %-6d %-8d %-8d %-8d' % (size, need, ok, bad, none))
