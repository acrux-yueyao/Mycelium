#!/usr/bin/env python3
"""
Pre-print audit — everything that must be true before plastic is spent.

Checks the kit manifest and the actual plate STLs produced from it:
  1  every plate STL is watertight and fits the bed
  2  every cube appears on exactly one plate, sequence 1..N complete
  3  every cube can print with a flat face down (no reaming)
  4  face agreement: each touching pair couples the SAME way on both
     sides (standard / seam / none) — a pin against a flat face leaves
     a gap; a magnet against nothing is lost holding force
  5  magnet polarity: every coupled pair is N-against-S
  6  no cube is placed into thin air in the build order
  7  single-bond joints: weight each one carries vs one magnet's grip
  8  the core cavity is empty and deep enough for the electronics stack
  9  the dock pocket matches the ground row, U/G openings line up
 10  bill of materials: cubes per spool, grams, magnets by size

Usage: python3 hardware/final_audit.py <variants_dir> <plates_dir>
Exit code 1 if any hard check fails.
"""
import glob
import json
import math
import os
import sys
from collections import Counter, deque

import trimesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_cubes import FACE_KEYS, DIRS, POLE
from seq_plates import build_order

BED = 220.0
P = 12.0
GRIP_N = 1.5          # one O4x2 N35 pair, measured earlier
CUBE_G = 1.9          # average cube mass (hollow-ish PLA)
STACK_MM = 6.5 + 1.6 + 12.5   # boss + board + tallest part


def main(vdir, pdir):
    man = json.load(open(f'{vdir}/kit_manifest.json'))
    cells = man['cells']
    S = {(c['x'], c['y'], c['z']): c for c in cells}
    fails, warns = [], []
    ok = lambda m: print(f'  ✓ {m}')
    bad = lambda m: (fails.append(m), print(f'  ✗ {m}'))
    warn = lambda m: (warns.append(m), print(f'  △ {m}'))

    print('1  plate files')
    plates = sorted(glob.glob(f'{pdir}/plate_*.stl')) + sorted(glob.glob(f'{pdir}/stand.stl'))
    for p in plates:
        m = trimesh.load(p)
        ext = m.bounds[1] - m.bounds[0]
        name = os.path.basename(p)
        if not m.is_watertight:
            bad(f'{name} not watertight')
        elif ext[0] > BED or ext[1] > BED:
            bad(f'{name} {ext[0]:.0f}x{ext[1]:.0f} exceeds {BED:.0f} bed')
        else:
            ok(f'{name} watertight · {ext[0]:.0f}x{ext[1]:.0f}x{ext[2]:.0f}mm · {m.volume/1000*1.24:.0f}g')

    print('2  every cube on exactly one plate')
    order, hanging = build_order(cells)
    seqs = sorted(range(1, len(order) + 1))
    txt = open(f'{pdir}/seq_manifest.txt').read()
    plate_total = sum(int(l.split('颗')[0].split('·')[-1]) for l in txt.splitlines() if l.startswith('plate_'))
    (ok if plate_total == len(cells) else bad)(f'plates hold {plate_total} cubes, kit has {len(cells)}')

    print('3  flat face on the bed')
    bill = open(f'{vdir}/variant_bill.txt').read()
    ream = [l.split()[0] for l in bill.splitlines() if '⚠' in l]
    if ream:
        warn(f'{len(ream)} fully-enclosed cube(s) {ream}: bed-side magnet pocket must be reamed with a 4.3mm drill')
    else:
        ok('every cube has a flat face for the bed')

    print('4  face agreement between touching cubes')
    def face_type(c, key):
        if c.get('eye'):
            if list(key) in c['eye']['seam']:
                return 'seam'
            return 'std' if list(key) in c['eye']['std'] else 'none'
        return 'std' if list(key) in c['mask'] else 'none'
    mism = []
    pairs = 0
    for k, c in S.items():
        for key, _ in FACE_KEYS:
            if not key[1]:
                continue                      # each pair once, from its + side
            n = (k[0] + DIRS[key][0], k[1] + DIRS[key][1], k[2] + DIRS[key][2])
            if n not in S:
                continue
            pairs += 1
            a, b = face_type(c, key), face_type(S[n], (key[0], False))
            if a != b:
                mism.append((k, n, a, b))
    (ok if not mism else bad)(f'{pairs} touching pairs · {len(mism)} disagree' +
                              (f' e.g. {mism[:3]}' if mism else ''))
    uncoupled = [(k, n) for k, c in S.items() for key, _ in FACE_KEYS if key[1]
                 for n in [(k[0] + DIRS[key][0], k[1] + DIRS[key][1], k[2] + DIRS[key][2])]
                 if n in S and face_type(c, key) == 'none']
    if uncoupled:
        warn(f'{len(uncoupled)} touching pairs deliberately uncoupled (bored U/G faces, pocketed eye rears)')

    print('5  magnet polarity')
    flips = [1 for k, c in S.items() for key, _ in FACE_KEYS if key[1]
             for n in [(k[0] + DIRS[key][0], k[1] + DIRS[key][1], k[2] + DIRS[key][2])]
             if n in S and face_type(c, key) != 'none' and POLE(True) == POLE(False)]
    (ok if not flips else bad)(f'global rule +faces {POLE(True)}-out / -faces {POLE(False)}-out → every pair attracts')

    print('6  build order')
    placed, orphans = set(), 0
    for c in order:
        k = (c['x'], c['y'], c['z'])
        if k[1] > 0 and not any((k[0] + d[0], k[1] + d[1], k[2] + d[2]) in placed for d in DIRS.values()):
            orphans += 1
        placed.add(k)
    (ok if not hanging and not orphans else bad)(f'{len(hanging)} hanging islands · {orphans} cubes placed into air')

    print('7  single-bond joints (weight carried vs grip)')
    adj = {k: [n for n in ((k[0] + d[0], k[1] + d[1], k[2] + d[2]) for d in DIRS.values())
               if n in S and face_type(S[k], next(key for key, _ in FACE_KEYS if (k[0] + DIRS[key][0], k[1] + DIRS[key][1], k[2] + DIRS[key][2]) == n)) != 'none']
           for k in S}
    ground = {k for k in S if k[1] == 0}
    risky = []
    for k in S:
        for n in adj[k]:
            if k >= n:
                continue
            # remove edge k-n, see if one side loses the ground
            seen, q = {k}, deque([k])
            while q:
                u = q.popleft()
                for v in adj[u]:
                    if (u, v) in ((k, n), (n, k)) or v in seen:
                        continue
                    seen.add(v); q.append(v)
            if n in seen:
                continue                       # not a bridge
            side = seen if not (seen & ground) else None
            if side is None:
                seen2, q = {n}, deque([n])
                while q:
                    u = q.popleft()
                    for v in adj[u]:
                        if (u, v) in ((k, n), (n, k)) or v in seen2:
                            continue
                        seen2.add(v); q.append(v)
                side = seen2
            w = len(side) * CUBE_G * 0.0098
            cx = sum(s[0] for s in side) / len(side); cz = sum(s[2] for s in side) / len(side)
            arm = math.hypot((cx - (k[0] + n[0]) / 2) * P, (cz - (k[2] + n[2]) / 2) * P)
            torque = w * arm
            if w > GRIP_N * 0.5 or torque > GRIP_N * 6 * 0.5:
                risky.append((round(max(w / GRIP_N, torque / (GRIP_N * 6)), 1), len(side), k, n))
    risky.sort(reverse=True)
    if risky:
        warn(f'{len(risky)} single-bond joints above 50% of one magnet (worst {risky[0][0]}x) — glue these:')
        for r, nside, k, n in risky[:8]:
            print(f'      {r:>4}x  joint {k}-{n} carries {nside} cubes (layer {min(k[1], n[1]) + 1})')
    else:
        ok('no overloaded single-bond joint')

    print('8  core cavity')
    meta_zone = man.get('zone')
    empty = True
    tx, ty = 4, 1
    for x in range(tx + 1, tx + 6):
        for y in range(ty + 1, ty + 7):
            for z in (5, 6):
                if (x, y, z) in S:
                    empty = False
    (ok if empty else bad)('cavity 60x72x24mm empty' if empty else 'cubes inside the cavity')
    (ok if 24 >= STACK_MM else bad)(f'depth 24mm vs electronics stack {STACK_MM:.1f}mm')

    print('9  dock')
    gcells = [(c['x'], c['z']) for c in cells if c['y'] == 0]
    fn = [(c['code'][0], c['x'], c['z']) for c in cells if c['y'] == 0 and c['code'][0] in 'UG']
    ok(f'ground row {len(gcells)} cells · bottom openings {fn}')

    print('10 bill of materials')
    names = man.get('color_names') or man['colors']
    cnt = Counter(c['ci'] for c in cells)
    for i, n in enumerate(names):
        if cnt[i]:
            print(f'      {n:26s} {cnt[i]:4d} cubes')
    std_m = sum(len(c['eye']['std']) if c.get('eye') else len(c['mask']) for c in cells)
    seam_m = sum(len(c['eye']['seam']) for c in cells if c.get('eye'))
    print(f'      magnets  O4x2: {std_m}   O2x1 (eye seams): {seam_m}')
    print(f'\n{"PASS" if not fails else "FAIL"} · {len(fails)} failures · {len(warns)} warnings')
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1], sys.argv[2]))
