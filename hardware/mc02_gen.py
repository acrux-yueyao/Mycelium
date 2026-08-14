#!/usr/bin/env python3
"""
MC02-P core backplane — the box, collapsed to a plate.

v0.2 architecture (approved sketch): the electronics live on ONE combo
perfboard + battery + speaker, all mounted on this 84×84×3 plate. The
plate's front face carries the same pin/magnet coupling language as any
cube face — 19 wall-cell couplings (left col 7 + right col 7 + bottom
inner 5) — so it clicks onto the back of the 7×7 core zone exactly like
a giant cube face. Cavity in front of it: 60×72×21.

Front-face features (z=3 is the front / cube side):
  - 38 pins Ø2.4×0.5 on the wall cells' diagonals (mate standard dimples)
  - 8 magnet pockets Ø4.3×2.1 (glue Ø4×2, N facing out per convention)
  - 4 board bosses Ø6×9, Ø1.7 pilots — combo board 55×60 on M2 screws
  - battery recess 41×31×0.4 (behind-board layer, velcro)
  - engraved MC02-P + polarity arrow on the back

Usage: python3 hardware/mc02_gen.py out_dir
Writes mc02_plate.stl + a bottom-row test kit (U/G/T cubes + std walls).
"""
import math
import sys

import numpy as np
import trimesh
from trimesh.creation import box, cylinder
from trimesh.transformations import translation_matrix as TM, rotation_matrix as RM

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from brick_lib import (mosaic_cube, B, D, U as UN, face_cyl,
                       MAG_R, MAG_D, NUB_R, NUB_H, OFF, P)

PW, PH, PT = 84.0, 84.0, 3.0          # plate w/h/thickness
BOSS_H = 9.0                          # board standoff (battery 6 + play)

# wall coupling cells (i, j) of the 7×7 zone the plate overlaps
WALL_CELLS = ([(0, j) for j in range(7)] + [(6, j) for j in range(7)]
              + [(i, 0) for i in range(1, 6)])
MAG_CELLS = [(0, 0), (6, 0), (0, 6), (6, 6), (0, 3), (6, 3), (2, 0), (4, 0)]


def CYL_Z(cx, cy, z0, z1, r, seg=32):
    c = cylinder(radius=r, height=z1 - z0, sections=seg)
    c.apply_transform(TM([cx, cy, (z0 + z1) / 2]))
    return c


def build_plate():
    m = B(0, 0, 0, PW, PH, PT)
    # perimeter stiffening rib on the back (z<0 side stays flat: rib toward back)
    m = UN([m, B(0, 0, -1.2, PW, 2.5, 0),
            B(0, PH - 2.5, -1.2, PW, PH, 0),
            B(0, 0, -1.2, 2.5, PH, 0),
            B(PW - 2.5, 0, -1.2, PW, PH, 0)])

    for i, j in WALL_CELLS:
        cx, cy = i * 12 + 6, j * 12 + 6
        for s in (+OFF, -OFF):        # pins on the diagonal, mate cube dimples
            m = UN([m, CYL_Z(cx + s, cy + s, PT - 0.02, PT + NUB_H, NUB_R)])
        if (i, j) in MAG_CELLS:       # magnet pocket, open to the front
            m = D(m, CYL_Z(cx, cy, PT - MAG_D, PT + 1, MAG_R))

    # board bosses (combo board 55×60, y 22..82, centred x)
    bx0, bx1 = (PW - 55) / 2, (PW + 55) / 2
    for px, py in [(bx0 + 3, 25), (bx1 - 3, 25), (bx0 + 3, 79), (bx1 - 3, 79)]:
        m = UN([m, CYL_Z(px, py, PT - 0.02, PT + BOSS_H, 3.0)])
        m = D(m, CYL_Z(px, py, PT + BOSS_H - 6, PT + BOSS_H + 1, 0.85))

    # battery recess 41×31×0.4 (left, behind-board layer)
    m = D(m, B(6, 24, PT - 0.4, 47, 65, PT + 0.1))
    m.fix_normals()
    return m


def u_cube_v2():
    """Charge-port cube: local x width, y depth, z height. Slot 10(x)×6(y)
    cut vertically through the whole cube — the USB plug passes from the
    desk up into the cavity. Exposed faces (front, bottom) stay flat."""
    # 底行块:顶面是腔底(喇叭/TP 平放),必须全平 —— 只耦合左右+背
    c = mosaic_cube(faces=[(0, True), (0, False), (1, False)])
    c = D(c, B(1.0, 3.0, -1, 11.0, 9.0, 13))
    c.fix_normals()
    return c


def g_cube():
    """Speaker grille cube: Ø1.2 hole array through the bottom face.
    Top face flat — the speaker lies on it, face-down."""
    c = mosaic_cube(faces=[(0, True), (0, False), (1, False)])
    for gx in (3, 6, 9):
        for gy in (3.5, 6, 8.5):
            c = D(c, CYL_Z(gx, gy, -1, 3.5, 0.6, 16))
    c.fix_normals()
    return c


def t_cube():
    """Ribbon channel cube: 9×5 bore top↔bottom (the eye-ribbon chimney)."""
    c = mosaic_cube(faces=[(0, True), (0, False), (1, True), (1, False)])
    c = D(c, B(1.5, 3.5, -1, 10.5, 8.5, 13))
    c.fix_normals()
    return c


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    plate = build_plate()
    parts = {'mc02_plate': plate, 'u_cube': u_cube_v2(),
             'g_cube': g_cube(), 't_cube': t_cube(),
             'wall_bottom': mosaic_cube(faces=[(0, True), (0, False), (1, False)]),
             'wall_side': mosaic_cube(faces=[(0, True), (0, False),
                                             (2, True), (2, False), (1, False)])}
    for name, m in parts.items():
        wt = m.is_watertight
        print(f'{name:12s} watertight={wt} tris={len(m.faces)}')
        assert wt, name
        m.export(f'{out}/{name}.stl')

    # ---- audits ----
    print('\n-- plate audits --')
    # pin apex above front plane
    locs, _, _ = plate.ray.intersects_location([[6 + OFF, 6 + OFF, 20]], [[0, 0, -1]])
    print(f'pin apex z = {max(l[2] for l in locs):.2f} (expect {PT + NUB_H})')
    # magnet pocket floor
    locs, _, _ = plate.ray.intersects_location([[6, 6, 20]], [[0, 0, -1]])
    print(f'magnet pocket floor z = {max(l[2] for l in locs):.2f} (expect {PT - MAG_D:.1f})')
    # boss top + pilot
    locs, _, _ = plate.ray.intersects_location([[(PW - 55) / 2 + 3, 25, 30]], [[0, 0, -1]])
    zs = sorted((l[2] for l in locs), reverse=True)
    print(f'boss: pilot floor z = {zs[0]:.2f} (expect {PT + BOSS_H - 6:.1f})')
    # U cube slot through
    uc = parts['u_cube']
    locs, _, _ = uc.ray.intersects_location([[6, 6, -5]], [[0, 0, 1]])
    print(f'U slot: {"clean through" if len(locs) == 0 else "hit " + str(min(l[2] for l in locs))}')
    # T cube bore through
    tc = parts['t_cube']
    locs, _, _ = tc.ray.intersects_location([[6, 6, -5]], [[0, 0, 1]])
    print(f'T bore: {"clean through" if len(locs) == 0 else "blocked"}')
    print(f'plate mass ≈ {plate.volume / 1000 * 1.27:.0f} g (PETG)')
