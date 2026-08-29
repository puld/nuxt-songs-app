# -*- coding: utf-8 -*-
"""Сборка очередей распознавания: queues.json + queues.tsv."""
import json, re, os, collections
import pymupdf

BASE = '/Users/l.romanov/workspace/my/nuxt-songs-app'
PDF = os.path.join(BASE, 'notes-omr/pdf-epp')
SONGS = os.path.join(BASE, 'songs-data/songs')

plan = json.load(open(os.path.join(PDF, 'recognize-plan.json')))

titles = {}
with open(os.path.join(PDF, 'tiers.tsv')) as f:
    next(f)
    for line in f:
        p = line.rstrip('\n').split('\t')
        if len(p) >= 6:
            titles[p[0]] = p[5]

CYR = re.compile(r'[а-яё]')

def letters(s):
    return ''.join(CYR.findall(s.lower())).replace('ё', 'е')

def our_stream(num):
    t = open(os.path.join(SONGS, f'{int(num):04d}.txt'), encoding='utf-8').read()
    t = re.sub(r'\{[^}]*\}', '', t)
    return letters(t)

def pdf_stream(fn):
    """Кириллический поток: спаны группируются по базовой линии, в строке — по x."""
    doc = pymupdf.open(os.path.join(PDF, fn))
    out = []
    for pg in doc:
        spans = []
        for b in pg.get_text('dict')['blocks']:
            for l in b.get('lines', []):
                for s in l['spans']:
                    txt = s['text']
                    if not CYR.search(txt.lower()):
                        try:
                            t2 = txt.encode('latin-1').decode('cp1251')
                            if CYR.search(t2.lower()):
                                txt = t2
                        except Exception:
                            pass
                    y = s.get('origin', (0, s['bbox'][3]))[1]
                    spans.append((y, s['bbox'][0], txt))
        spans.sort(key=lambda z: (z[0], z[1]))
        rows = []
        for y, x, t in spans:
            if rows and abs(rows[-1][0] - y) <= 2:
                rows[-1][1].append((x, t))
            else:
                rows.append((y, [(x, t)]))
        for y, items in rows:
            items.sort()
            out.append(letters(''.join(t for _, t in items)))
    doc.close()
    return '\n'.join(out)

def score(ours, theirs, plen=12, maxp=60):
    if len(ours) < plen or not theirs:
        return 0.0
    step = max(20, len(ours) // maxp)
    probes = [ours[i:i+plen] for i in range(0, len(ours) - plen + 1, step)]
    return sum(1 for p in probes if p in theirs) / len(probes) if probes else 0.0

def suffix(f):
    return re.sub(r'^\d+', '', f).replace('.pdf', '')

# Известные разводки «один лист — две наши песни» (из постановки задачи)
OVERRIDES = {'598': '598.pdf', '1424': '598a.pdf', '1247': '1239.pdf', '1306': '1239t.pdf'}

queues = {}
choices_log = []      # (num, scored, margin)
vector_override = []  # наш текст только в векторном файле
cache = {}

def get_stream(f):
    if f not in cache:
        try:
            cache[f] = pdf_stream(f)
        except Exception:
            cache[f] = ''
    return cache[f]

for num, v in sorted(plan.items(), key=lambda x: int(x[0])):
    tier = v['tier']
    files, tfiles = v['files'], v['text_files']
    pdf_choice = None
    is_text_choice = None
    if num in OVERRIDES:
        pdf_choice = OVERRIDES[num]
        is_text_choice = pdf_choice in tfiles
    elif len(files) == 1:
        pdf_choice = files[0]
        is_text_choice = pdf_choice in tfiles
    elif len(files) > 1:
        ours = our_stream(num)
        scored = sorted(((f, score(ours, get_stream(f))) for f in files),
                        key=lambda x: (-x[1], len(suffix(x[0])), x[0]))
        sdict = dict(scored)
        best_any, best_any_sc = scored[0]
        tscored = [(f, sdict[f]) for f in tfiles]
        tscored.sort(key=lambda x: (-x[1], len(suffix(x[0])), x[0]))
        if tscored and (tscored[0][1] >= 0.15 or best_any_sc - tscored[0][1] < 0.2):
            pdf_choice, is_text_choice = tscored[0][0], True
        else:
            pdf_choice = best_any
            is_text_choice = pdf_choice in tfiles
            if tfiles and not is_text_choice:
                vector_override.append((num, scored))
        choices_log.append((num, scored, scored[0][1] - scored[1][1]))

    alt = [f for f in files if f != pdf_choice]
    alt.sort(key=lambda f: (f not in tfiles, f))

    if tier == 4:
        q, reason = 4, 'лист не найден'
    elif tier == 3:
        q, reason = 3, (v['note'] or 'спорное соответствие') + ' — нужна ручная приёмка'
    elif tier == 2:
        q = 2
        reason = v['note'] or 'слабое подтверждение текстом'
        if not tfiles and files:
            reason += '; ноты векторные'
    else:  # tier 1
        if pdf_choice and is_text_choice:
            q = 1
            reason = f"подтверждено текстом ({v['hits']} зондов, покрытие {v['cover']:.0%}), ноты глифами"
        else:
            q = 2
            if tfiles and pdf_choice and not is_text_choice:
                reason = ('соответствие гарантированное, но наша редакция текста — в файле '
                          f'{pdf_choice} с векторными нотами; глифовый файл листа содержит другую песню')
            else:
                reason = 'соответствие гарантированное, но ноты векторные — нужен другой метод разбора'
    queues[num] = {'queue': q, 'pdf': pdf_choice, 'alt': alt, 'reason': reason}

with open(os.path.join(PDF, 'queues.json'), 'w', encoding='utf-8') as f:
    json.dump(queues, f, ensure_ascii=False, indent=1, sort_keys=True)

with open(os.path.join(PDF, 'queues.tsv'), 'w', encoding='utf-8') as f:
    f.write('наш\tназвание\tочередь\tфайл\tпричина\n')
    for num in sorted(queues, key=int):
        r = queues[num]
        f.write(f"{num}\t{titles.get(num,'')}\t{r['queue']}\t{r['pdf'] or '—'}\t{r['reason']}\n")

cnt = collections.Counter(r['queue'] for r in queues.values())
print('размеры очередей:', dict(sorted(cnt.items())))
for n, o in OVERRIDES.items():
    print('разводка', n, '→', queues[n]['pdf'], '(очередь', str(queues[n]['queue']) + ')')
print('\nнаш текст только в векторном файле (переключено):', len(vector_override))
for n, s in vector_override:
    print(f"  {n} ({titles.get(n,'')[:40]}): " + ' '.join(f'{f}:{sc:.2f}' for f, sc in s))

amb = [(n, s, m) for n, s, m in choices_log if s[0][1] < 0.35]
print('\nслабый лучший скор (<0.35), стоит глянуть глазами:', len(amb))
for n, s, m in sorted(amb, key=lambda x: x[1][0][1]):
    print(f"  {n} q{queues[n]['queue']} ({titles.get(n,'')[:40]}): " + ' '.join(f'{f}:{sc:.2f}' for f, sc in s))

import statistics
best = [s[0][1] for _, s, _ in choices_log]
print('\nвыборов по тексту: %d; медиана лучшего скора %.2f' % (len(choices_log), statistics.median(best)))
# сколько песен реально спасены запасной аранжировкой (вместо базового файла выбран суффиксный текстовый)
resc = [n for n, s, m in choices_log
        if queues[n]['queue'] == 1 and suffix(queues[n]['pdf']) and
        any(re.fullmatch(r'\d+\.pdf', f) for f in plan[n]['files'])]
print('суффиксный текстовый выбран при живом базовом:', len(resc))
