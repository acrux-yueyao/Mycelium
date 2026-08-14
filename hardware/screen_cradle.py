#!/usr/bin/env python3
"""
Screen cradle — the eye "riser", moved inside the cavity.

The mosaic wall stays 100% individual cubes (two hollow window cubes at
the eye cells, plain cubes elsewhere). This cradle bolts to the cartridge
front rail (M2, 4.5mm grid) and floats in the void's front gap, pressing
both 0.96" OLEDs' glass against the window cubes' back faces.

Seat positions are per-creature (the kit sheet's eye cells). If a seat
must pull inboard to clear the void wall, shift that eye's pixels in
firmware (1mm ≈ 5px).

Usage: python3 hardware/screen_cradle.py <seatL_mm> <seatR_mm> [out.stl]
"""
import sys
import trimesh
from trimesh.creation import box, cylinder
from trimesh.transformations import translation_matrix as TM


def B(x0, y0, z0, x1, y1, z1):
    return box(extents=[x1-x0, y1-y0, z1-z0],
               transform=TM([(x0+x1)/2, (y0+y1)/2, (z0+z1)/2]))


def build(seats):
    plate = B(1, 30, 0, 68, 62, 2)
    parts = [plate]
    for cx in seats:
        tower = B(cx-15.5, 30.5, 2, cx+15.5, 61.5, 9.5)
        tower = trimesh.boolean.difference(
            [tower, B(cx-13.9, 32.1, 5.7, cx+13.9, 59.9, 10.5)])
        tower = trimesh.boolean.difference(
            [tower, B(cx-12, 40, -1, cx+12, 52, 6)])
        parts.append(tower)
    cradle = trimesh.boolean.union(parts)
    for hx in (21, 39):
        for hy in (40, 52):
            h = cylinder(radius=1.15, height=8, sections=24)
            h.apply_transform(TM([hx, hy, 1]))
            cradle = trimesh.boolean.difference([cradle, h])
    for cx in seats:
        cradle = trimesh.boolean.difference(
            [cradle, B(cx-4, 30.4, 5, cx+4, 35, 10.5)])
    cradle.fix_normals()
    return cradle


if __name__ == '__main__':
    sL, sR = float(sys.argv[1]), float(sys.argv[2])
    out = sys.argv[3] if len(sys.argv) > 3 else 'screen_cradle.stl'
    c = build([sL, sR])
    assert c.is_watertight
    c.export(out)
    print(f'seats {sL}/{sR} → {out}')
