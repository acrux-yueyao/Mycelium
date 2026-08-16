#!/usr/bin/env python3
"""
Storage tray — a 1:1 mirror of a print plate for magnetized cubes.

Loose cubes with magnets snap into clumps and chip; a plain box also
loses the plate ordering that every sheet is keyed to. The tray has one
well per occupied plate slot, at the exact same row/column. Peel a cube
off the plate, drop it into the same spot, orientation preserved (show
face still down) — all sheets keep working, magnets never touch.

Two modes:
  seq mode  (tray for seq_plates):  well floors carry BIG assembly
            sequence numbers (~5 mm digits) and the widened left rim is
            a ruler: each row is labelled with its first sequence
            number. Blank slots (layer boundaries) stay solid.
  zone mode (tray for plate_gen):   well floors carry the variant code.

Well 13.0 (0.5 clearance/side), walls 3.0, floor 1.2, depth 6 (cube
stands 6 proud for grabbing).  Tip for white-on-white legibility: rub a
pencil or marker across the engraving and wipe — digits turn dark.

Usage: python3 hardware/tray_gen.py <variants_dir> seq  [out_dir]
       python3 hardware/tray_gen.py <variants_dir> <ci> [out_dir]
Reads  kit_manifest.json   Writes tray_seq_<n>.stl / tray_c<ci>_<n>.stl
"""
import json
import os
import sys

import trimesh
from trimesh.transformations import translation_matrix as TM

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from brick_lib import B
from kit_cubes import _text_slab
from plate_gen import GRID, PITCH, layout_slots
from seq_plates import seq_slots

WELL, FLOOR, DEPTH, RIM, LRIM = 13.0, 1.2, 6.0, 1.5, 7.0
INS = (PITCH - WELL) / 2                      # 1.5 well inset per side
H = FLOOR + DEPTH


def build_tray(wells, out, fname, row_labels=None):
    """wells: [(gx, gy, label, size)] · row_labels: {gy: text} on left rim."""
    x1 = (max(g for g, _, _, _ in wells) + 1) * PITCH
    y1 = (max(g for _, g, _, _ in wells) + 1) * PITCH
    lrim = LRIM if row_labels else RIM
    tray = B(-lrim, -RIM, 0, x1 + RIM, y1 + RIM, H)
    cuts = []
    for gx, gy, label, size in wells:
        x0, y0 = gx * PITCH + INS, gy * PITCH + INS
        cuts.append(B(x0, y0, FLOOR, x0 + WELL, y0 + WELL, H + 1))
        txt = _text_slab(label, size)
        txt.apply_transform(TM([x0 + WELL / 2, y0 + WELL / 2, FLOOR - 0.4]))
        cuts.append(txt)
    for gy, label in (row_labels or {}).items():
        txt = _text_slab(label, 5.0)
        txt.apply_transform(TM([-lrim / 2 - 0.3, gy * PITCH + PITCH / 2,
                                H - 0.4]))
        cuts.append(txt)
    tray = trimesh.boolean.difference([tray] + cuts)
    assert tray.is_watertight
    tray.export(f'{out}/{fname}')
    ext = tray.bounds[1] - tray.bounds[0]
    print(f'{fname}: {len(wells)} wells · {ext[0]:.0f}×{ext[1]:.0f}×'
          f'{ext[2]:.1f} mm')


def main(vdir, mode, out=None):
    out = out or vdir
    man = json.load(open(f'{vdir}/kit_manifest.json'))
    if mode == 'seq':
        for n0, slots in enumerate(seq_slots(man)):
            wells, rows = [], {}
            for k, c in slots:
                gx, gy = k % GRID, k // GRID
                s = str(c['seq'])
                wells.append((gx, gy, s, 8.5 - 1.3 * len(s)))
                rows.setdefault(gy, str(c['seq']))
            build_tray(wells, out, f'tray_seq_{n0 + 1}.stl', rows)
    else:
        cs = sorted([c for c in man['cells'] if c['ci'] == int(mode)],
                    key=lambda c: c['code'])
        if not cs:
            sys.exit(f'no cells with ci={mode}')
        for n0, slots in enumerate(layout_slots(cs)):
            wells = [(k % GRID, k // GRID, c['code'][2:], 5.0)
                     for k, _, c in slots]
            build_tray(wells, out, f'tray_c{mode}_{n0 + 1}.stl')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
