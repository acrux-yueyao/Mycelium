#!/usr/bin/env python3
"""
Storage tray — a 1:1 mirror of a print plate for magnetized cubes.

Loose cubes with magnets snap into clumps and chip; a plain box also
loses the plate ordering that every sheet (polarity, layout) is keyed
to. The tray has one well per occupied plate slot, at the exact same
row/column, with the variant code debossed in each well floor. Peel a
cube off the plate, drop it into the same spot, orientation preserved
(show face still down) — all sheets keep working, magnets never touch.

Well 13.0 (0.5 clearance/side), walls 3.0, floor 1.2, depth 6 (cube
stands 6 proud for grabbing). Blank slots between variant clusters stay
solid, so clusters read as groups in the tray too.

Usage: python3 hardware/tray_gen.py <variants_dir> <ci> [out_dir]
Reads  kit_manifest.json   Writes tray_c<ci>_<n>.stl
"""
import json
import os
import sys

import trimesh
from trimesh.transformations import translation_matrix as TM

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from brick_lib import B
from kit_cubes import _text_slab
from plate_gen import PITCH, layout_slots

WELL, FLOOR, DEPTH, RIM = 13.0, 1.2, 6.0, 2.0
INS = (PITCH - WELL) / 2                      # 1.5 well inset per side


def main(vdir, ci, out=None):
    out = out or vdir
    man = json.load(open(f'{vdir}/kit_manifest.json'))
    cs = sorted([c for c in man['cells'] if c['ci'] == int(ci)],
                key=lambda c: c['code'])
    if not cs:
        sys.exit(f'no cells with ci={ci}')
    for n0, slots in enumerate(layout_slots(cs)):
        gxy = [(k % 13, k // 13, c) for k, _, c in slots]
        x1 = (max(g for g, _, _ in gxy) + 1) * PITCH
        y1 = (max(g for _, g, _ in gxy) + 1) * PITCH
        tray = B(-RIM, -RIM, 0, x1 + RIM, y1 + RIM, FLOOR + DEPTH)
        cuts = []
        for gx, gy, c in gxy:
            x0, y0 = gx * PITCH + INS, gy * PITCH + INS
            cuts.append(B(x0, y0, FLOOR, x0 + WELL, y0 + WELL,
                          FLOOR + DEPTH + 1))
            txt = _text_slab(c['code'][2:], 5.0)
            txt.apply_transform(TM([x0 + WELL / 2, y0 + WELL / 2,
                                    FLOOR - 0.4]))
            cuts.append(txt)
        tray = trimesh.boolean.difference([tray] + cuts)
        assert tray.is_watertight
        fname = f'tray_c{ci}_{n0 + 1}.stl'
        tray.export(f'{out}/{fname}')
        ext = tray.bounds[1] - tray.bounds[0]
        print(f'{fname}: {len(gxy)} wells · {ext[0]:.0f}×{ext[1]:.0f}×'
              f'{ext[2]:.1f} mm · solid {tray.volume / 1000:.0f} cm3')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
