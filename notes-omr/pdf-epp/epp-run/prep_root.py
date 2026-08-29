import io, os, re, glob, json
SCRATCH = os.path.dirname(os.path.abspath(__file__))
SRC = '/Users/l.romanov/workspace/my/nuxt-songs-app/songs-data/songs'
DST = os.path.join(SCRATCH, 'root/songs-data/songs')
CHORD = re.compile(r'\{([^}]*)\}')
ref = {}   # num -> [(line, pos_в_очищенной_строке, name)]
for f in sorted(glob.glob(SRC + '/*.txt')):
    num = int(os.path.basename(f)[:4])
    raw = io.open(f, encoding='utf-8').read()
    if '{' not in raw:
        io.open(os.path.join(DST, os.path.basename(f)), 'w', encoding='utf-8').write(raw)
        continue
    out_lines, edits = [], []
    for li, line in enumerate(raw.split('\n')):
        clean, pos, last = [], 0, 0
        removed = 0
        s = ''
        i = 0
        for m in CHORD.finditer(line):
            s += line[i:m.start()]
            edits.append((li, len(s), m.group(1)))
            i = m.end()
        s += line[i:]
        out_lines.append(s)
    io.open(os.path.join(DST, os.path.basename(f)), 'w', encoding='utf-8').write('\n'.join(out_lines))
    ref[num] = edits
json.dump(ref, open(os.path.join(SCRATCH, 'ref_edits.json'), 'w'), ensure_ascii=False)
print('файлов скопировано:', len(glob.glob(DST + '/*.txt')), 'эталонов:', len(ref),
      'аккордов в эталоне:', sum(len(v) for v in ref.values()))
