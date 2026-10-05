#!/usr/bin/env python3
"""
Charging dock — the stand the creature sits in, hollow underneath.

The ground row drops into a pocket on the top plate (0.4mm clearance,
8mm gripping lip), as before. Underneath is a hollow plinth so the
bottom function cubes can breathe:
  - a plug opening under the U cube; a right-angle USB-C cable plugs up
    into the body and its cable runs through an internal tunnel out of
    the back wall
  - a grille opening under the G cube; the speaker fires down into the
    plinth and out through vent slots in the front and side walls
Printed as one piece, floor on the bed: internal ribs run front-to-back
(parallel to the tunnel) so the top plate never bridges more than
~24mm.

Usage: python3 hardware/stand_gen.py <variants_dir> [out_dir] [--flat]
       --flat  the old solid skirt with no openings
Reads  kit_manifest.json   Writes stand.stl
"""
import json
import os
import sys

import trimesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from brick_lib import B, D, U

P, CLR, WALL, FLOOR, LIP, MARGIN = 12.0, 0.4, 2.4, 1.6, 8.0, 24.0
DOCK_H, TOP, RIB = 15.0, 2.0, 1.6       # plinth height, top plate, rib width
TUNNEL_W, TUNNEL_H = 14.0, 11.0          # cable tunnel (right-angle USB-C)
PLUG = (12.0, 8.0)                       # plug opening under U (x × depth)


def main(vdir, out=None, flat=False):
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
    base = 0.0 if flat else DOCK_H

    if flat:
        stand = B(ox0, oz0, 0, ox1, oz1, FLOOR)
    else:
        # hollow plinth: floor + walls + ribs + top plate
        shell = B(ox0, oz0, 0, ox1, oz1, DOCK_H)
        shell = D(shell, B(ox0 + WALL, oz0 + WALL, FLOOR, ox1 - WALL, oz1 - WALL, DOCK_H - TOP))
        parts = [shell]
        uc = [(c['x'], c['z']) for c in man['cells'] if c['y'] == 0 and c['code'][0] == 'U']
        gc = [(c['x'], c['z']) for c in man['cells'] if c['y'] == 0 and c['code'][0] == 'G']
        ux = uc[0][0] * P + P / 2 if uc else None
        # ribs front-to-back every <=24mm, skipping the tunnel lane
        n = int((ox1 - ox0) // 24) + 1
        for i in range(1, n):
            rx = ox0 + i * (ox1 - ox0) / n
            if ux is not None and abs(rx - ux) < TUNNEL_W / 2 + RIB:
                continue
            parts.append(B(rx - RIB / 2, oz0 + WALL, FLOOR, rx + RIB / 2, oz1 - WALL, DOCK_H - TOP))
        stand = U(parts)
        cuts = []
        for (cx, cz) in uc:
            px, pz = cx * P + P / 2, cz * P + P / 2
            cuts.append(B(px - PLUG[0] / 2, pz - PLUG[1] / 2, DOCK_H - TOP - 1,
                          px + PLUG[0] / 2, pz + PLUG[1] / 2, DOCK_H + 1))
            # tunnel from the plug straight out of the back wall
            cuts.append(B(px - TUNNEL_W / 2, oz0 - 1, FLOOR, px + TUNNEL_W / 2, pz + PLUG[1] / 2,
                          FLOOR + TUNNEL_H))
        for (cx, cz) in gc:
            gx, gz = cx * P + P / 2, cz * P + P / 2
            cuts.append(B(gx - 5.5, gz - 5.5, DOCK_H - TOP - 1, gx + 5.5, gz + 5.5, DOCK_H + 1))
            for k in range(4):                       # front + side vent slots
                cuts.append(B(gx - 12 + k * 7, oz1 - WALL - 1, FLOOR + 3,
                              gx - 9 + k * 7, oz1 + 1, DOCK_H - TOP - 3))
                cuts.append(B(ox0 - 1, gz - 12 + k * 7, FLOOR + 3,
                              ox0 + WALL + 1, gz - 9 + k * 7, DOCK_H - TOP - 3))
        if cuts:
            stand = D(stand, U(cuts))

    wall = B(x0 - WALL, z0 - WALL, base + (FLOOR if flat else 0),
             x1 + WALL, z1 + WALL, base + (FLOOR if flat else 0) + LIP)
    wall = D(wall, B(x0, z0, base - 1, x1, z1, base + LIP + FLOOR + 1))
    stand = U([stand, wall])
    stand.fix_normals()
    assert stand.is_watertight
    stand.export(f'{out}/stand.stl')
    ext = stand.bounds[1] - stand.bounds[0]
    kind = 'flat skirt' if flat else 'charging dock'
    print(f'stand.stl ({kind}): {ext[0]:.0f}×{ext[1]:.0f}×{ext[2]:.1f}mm · '
          f'pocket {x1-x0:.1f}×{z1-z0:.1f} · ≈{stand.volume/1000*1.24:.0f}g PLA')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    main(args[0], args[1] if len(args) > 1 else None, flat='--flat' in sys.argv)
