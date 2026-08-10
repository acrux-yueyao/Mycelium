#!/usr/bin/env python3
"""
Stud-coupling brick library — 12 mm pitch, FDM-tuned.

LEGO-style clutch made printable by CRUSH RIBS: the socket side grips studs
through thin vertical ribs at deliberate 0.15 mm interference — the first
insertion crushes them into a perfect per-printer fit. Tune TUNE by ±0.1 if
the test coupon is too tight/loose, reprint the coupon only.

Geometry (pitch P=12):
  stud     Ø6.0 × h2.4, on 12 mm centres
  body     wall 1.6 · top plate 2.4 · brick height 12 (cube module)
  2×2+     inner tubes Ø10.9/Ø6.4 grip 4 studs (LEGO-style)
  1×N      side ribs grip the stud between the two long walls
  ribs     3 per contact, 0.6 wide, 0.15 interference (crush)

Usage: python3 hardware/brick_lib.py out_dir   → test coupons
Import: from brick_lib import brick            → kit generators
"""
import math
import sys

import numpy as np
import trimesh
from trimesh.creation import box, cylinder
from trimesh.transformations import translation_matrix as TM

P = 12.0          # pitch
STUD_D = 6.0
STUD_H = 2.4
WALL = 1.6
TOP = 2.4
H = 12.0          # brick height (cube module)
TUNE = 0.0        # global fit trim: + looser, - tighter
CRUSH = 0.15      # rib interference


def U(parts):
    return trimesh.boolean.union(parts)


def D(a, b):
    return trimesh.boolean.difference([a, b])


def B(x0, y0, z0, x1, y1, z1):
    return box(extents=[x1-x0, y1-y0, z1-z0],
               transform=TM([(x0+x1)/2, (y0+y1)/2, (z0+z1)/2]))


def CYL(cx, cy, z0, z1, r, seg=48):
    c = cylinder(radius=r, height=z1-z0, sections=seg)
    c.apply_transform(TM([cx, cy, (z0+z1)/2]))
    return c


def TUBE(cx, cy, z0, z1, r_out, r_in, seg=48):
    return D(CYL(cx, cy, z0, z1, r_out, seg), CYL(cx, cy, z0-1, z1+1, r_in, seg))


def brick(L, W, height=H):
    """L×W modules, studs on top, gripping cavity underneath."""
    parts = []
    lx, ly = L*P, W*P
    body = B(0, 0, 0, lx, ly, height)
    body = D(body, B(WALL, WALL, -0.1, lx-WALL, ly-WALL, height-TOP))
    parts.append(body)
    for i in range(L):                                   # studs
        for j in range(W):
            parts.append(CYL(i*P + P/2, j*P + P/2, height, height+STUD_H, STUD_D/2))
    cav_top = height - TOP
    if L >= 2 and W >= 2:                                # interior tubes
        r_out = (P*math.sqrt(2) - STUD_D)/2 - TUNE       # ≈5.45 grips 4 studs
        for i in range(1, L):
            for j in range(1, W):
                parts.append(TUBE(i*P, j*P, 0, cav_top, r_out, STUD_D/2 + 0.2))
    elif L == 1 or W == 1:                               # rib grip for thin bricks
        n = max(L, W)
        along_x = L >= W
        gap = P - 2*WALL                                 # 8.8 between walls
        rib = (gap - STUD_D)/2 + CRUSH - TUNE            # ≈1.55 interference
        for k in range(n):
            c = k*P + P/2
            for third in (-1, 0, 1):                     # 3 ribs per contact
                off = third * 2.2
                if along_x:
                    parts.append(B(c+off-0.3, WALL, 0, c+off+0.3, WALL+rib, cav_top))
                    parts.append(B(c+off-0.3, ly-WALL-rib, 0, c+off+0.3, ly-WALL, cav_top))
                else:
                    parts.append(B(WALL, c+off-0.3, 0, WALL+rib, c+off+0.3, cav_top))
                    parts.append(B(lx-WALL-rib, c+off-0.3, 0, lx-WALL, c+off+0.3, cav_top))
    m = U(parts)
    m.fix_normals()
    return m


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    coupons = {'coupon_2x2': brick(2, 2), 'coupon_1x4': brick(1, 4),
               'coupon_2x4': brick(2, 4)}
    for name, m in coupons.items():
        print(name, 'watertight', m.is_watertight, 'tris', len(m.faces))
        m.export(f'{out}/{name}.stl')
