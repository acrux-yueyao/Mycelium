#!/usr/bin/env python3
"""
MC-01 core cartridge — printable skeleton generator (drawing v1.3).

Outputs cartridge_frame.stl + cartridge_lid.stl (mm). Geometry follows the
MC-01 v1.3 sheet: 60x80x25 outer, card slots A5/B6/C7 with side ribs, dual
0.96" screen windows, ToF window, mic holes, USB-C window, back card door +
D-bay service opening, top wire slot, speaker grille, pogo holes, blind
magnet pockets (0.6 skin).

Deps: pip install trimesh manifold3d numpy scipy rtree shapely
Print: PETG or PLA, 0.2mm layers, 3 walls, 0% infill not needed (solid thin
parts) — print face-down (front on bed), no supports; lid prints flat.
"""
import math
import numpy as np
import trimesh
from trimesh.creation import box, cylinder
from trimesh.transformations import translation_matrix as TM, rotation_matrix as RM


def B(x0, y0, z0, x1, y1, z1):
    return box(extents=[x1-x0, y1-y0, z1-z0],
               transform=TM([(x0+x1)/2, (y0+y1)/2, (z0+z1)/2]))

def CYL_Z(cx, cy, z0, z1, r, seg=32):
    c = cylinder(radius=r, height=z1-z0, sections=seg)
    c.apply_transform(TM([cx, cy, (z0+z1)/2]))
    return c

def CYL_Y(cx, cz, y0, y1, r, seg=32):
    c = cylinder(radius=r, height=y1-y0, sections=seg)
    c.apply_transform(RM(math.pi/2, [1, 0, 0]))
    c.apply_transform(TM([cx, (y0+y1)/2, cz]))
    return c

U = lambda a, b: trimesh.boolean.union([a, b])
D = lambda a, b: trimesh.boolean.difference([a, b])


def build_frame():
    f = B(0, 0, 0, 60, 80, 25)
    f = D(f, B(2, 2, 1.5, 58, 78, 23))                    # cavity
    for zr0, zr1 in [(6.5, 7.0), (13.0, 13.5)]:           # card-slot ribs
        f = U(f, B(2, 26, zr0, 4.5, 74, zr1))
        f = U(f, B(55.5, 26, zr0, 58, 74, zr1))
    f = U(f, B(2, 24, 1.5, 58, 26, 20.5))                 # shelf over D bay
    for cx in (16.25, 43.75):                             # screen windows
        f = D(f, B(cx-10.85, 40.55, -1, cx+10.85, 51.45, 2.5))
    f = D(f, B(24, 64, -1, 36, 72, 2.5))                  # ToF window
    for i in range(5):                                    # mic holes
        f = D(f, CYL_Z(24+i*3, 30, -1, 2.5, 0.8, 16))
    f = D(f, B(37.75, 8.25, -1, 47.25, 11.75, 2.5))       # USB-C window
    f = D(f, B(2.5, 26.5, 20.5, 57.5, 73.5, 26))          # back card door
    f = D(f, B(15, 4, 22, 45, 22, 26))                    # D-bay service opening
    f = D(f, B(26, 77, 20, 34, 81, 24))                   # top wire slot
    f = D(f, CYL_Y(17, 12.5, -1, 3, 1.25, 20))            # speaker grille
    for k in range(8):
        a = k*math.pi/4
        f = D(f, CYL_Y(17+9*math.cos(a), 12.5+9*math.sin(a), -1, 3, 1.25, 20))
    for px in (10, 50):                                   # pogo through-holes
        f = D(f, CYL_Y(px, 6, -1, 3, 1.1, 20))
    for mx, mz in ((5, 5), (5, 20), (55, 5), (55, 20)):   # blind magnet pockets
        f = D(f, CYL_Y(mx, mz, 0.6, 2.6, 2.65, 24))
    f.fix_normals()
    return f


def build_lid():
    lid = B(0, 0, 0, 54.6, 46.6, 2)
    lid = U(lid, B(2, 2, 2, 52.6, 44.6, 4))               # friction plug
    lid = D(lid, CYL_Z(27.3, 46.6, -1, 5, 6, 32))         # finger notch
    lid.fix_normals()
    return lid


if __name__ == '__main__':
    frame = build_frame()
    lid = build_lid()
    assert frame.is_watertight and lid.is_watertight
    frame.export('cartridge_frame.stl')
    lid.export('cartridge_lid.stl')
    print(f'frame tris={len(frame.faces)}  lid tris={len(lid.faces)}  → STL written')
