#!/usr/bin/env python3
"""
Display stand — a skirt that ends the tipping problem.

The creature stands on its cloud cubes alone; moony_v2's footprint is
48×24mm under ~660g at 97mm CoM → 4-5° forward tipping angle. This
stand is a shallow pocket the ground row drops into (0.4mm clearance,
8mm walls grip the first layer) on a wide skirt plate, tripling the
effective footprint. No couplings needed — bottom faces are flat.

Usage: python3 hardware/stand_gen.py <variants_dir> [out_dir]
Reads  kit_manifest.json   Writes stand.stl
"""
import json
import os
import sys

import trimesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from brick_lib import B, D, U

P, CLR, WALL, FLOOR, LIP, MARGIN = 12.0, 0.4, 2.4, 1.6, 8.0, 24.0


def main(vdir, out=None):
    out = out or vdir
    man = json.load(open(f'{vdir}/kit_manifest.json'))
    ground = [(c['x'], c['z']) for c in man['cells'] if c['y'] == 0]
    xs = [g[0] for g in ground]
    zs = [g[1] for g in ground]
    x0, x1 = min(xs) * P - CLR, (max(xs) + 1) * P + CLR
    z0, z1 = min(zs) * P - CLR, (max(zs) + 1) * P + CLR
    assert len(ground) == (max(xs) - min(xs) + 1) * (max(zs) - min(zs) + 1), \
        'ground row is not a full rectangle — extend stand_gen to polygons'

    ox0, ox1 = x0 - MARGIN, x1 + MARGIN
    oz0, oz1 = z0 - MARGIN, z1 + MARGIN
    stand = B(ox0, oz0, 0, ox1, oz1, FLOOR)
    wall = B(x0 - WALL, z0 - WALL, FLOOR, x1 + WALL, z1 + WALL, FLOOR + LIP)
    wall = D(wall, B(x0, z0, FLOOR - 1, x1, z1, FLOOR + LIP + 1))
    stand = U([stand, wall])
    stand.fix_normals()
    assert stand.is_watertight
    stand.export(f'{out}/stand.stl')
    ext = stand.bounds[1] - stand.bounds[0]
    print(f'stand.stl: 外廓 {ext[0]:.0f}×{ext[1]:.0f}×{ext[2]:.1f}mm · '
          f'兜口 {x1-x0:.1f}×{z1-z0:.1f} · ≈{stand.volume/1000*1.24:.0f}g PLA')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
