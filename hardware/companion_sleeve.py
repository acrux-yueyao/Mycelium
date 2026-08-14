#!/usr/bin/env python3
"""
Character sleeve — the spore shell that swallows the MC-01 core cartridge.

Pipeline (v1.4, owned-parts build merged with the Pixel Companion draft):
  1. scripts/spore3d.mts --companion emits a solid 12 mm-module brick shell
     whose core footprint is force-filled and widened (nothing shows through).
  2. This script CSG-subtracts, at exact millimetres:
       - the core cavity 62.6 × (core top…bottom) × 26.6, centred on the
         eye anchor — the cartridge slides in from the bottom
       - two eye windows 23 × 12 through the front wall (0.96" SSD1306 AA)
       - a mic hole at the mouth cell
  3. Verifies watertightness + apertures by ray probes, then writes
     <name>_sleeve.stl.

Usage:
  npx tsx scripts/spore3d.mts --companion --flushback --cell 12 \
      --text "..." --family tender --name my_shell --out /tmp/x
  python3 hardware/companion_sleeve.py /tmp/x/my_shell
"""
import json
import sys

import trimesh
from trimesh.creation import box, cylinder
from trimesh.transformations import translation_matrix as TM, rotation_matrix as RM
import numpy as np

CAVITY_W, CAVITY_D = 62.6, 26.6      # core clearance + fit
EYE_WIN_W, EYE_WIN_H = 23.0, 12.0    # 0.96" SSD1306 active area + margin


def B(x0, y0, z0, x1, y1, z1):
    return box(extents=[x1-x0, y1-y0, z1-z0],
               transform=TM([(x0+x1)/2, (y0+y1)/2, (z0+z1)/2]))


def main(base):
    meta = json.load(open(base + '.json'))
    mm = meta['mm']
    a = meta['anchor']
    rows, cols = a['rows'], a['cols']
    # rebuild the shell as a true manifold: union of brick cubes from the
    # voxel dump (the exporter's STL is visual-grade, not boolean-grade)
    cubes = [B(x*mm, z*mm, y*mm, (x+1)*mm, (z+1)*mm, (y+1)*mm)
             for x, y, z, *_ in meta['voxels']]
    shell = trimesh.boolean.union(cubes)
    print('shell', shell.bounds.tolist(), 'watertight', shell.is_watertight)

    # STL axes: x width · y depth · z height (spore exporter's print mapping)
    ecx_cells = (a['L0'] + 1 + a['R0']) / 2
    ecx = ecx_cells * mm                     # eye-anchor x in mm
    core_top_z = (rows - a['coreRowTop']) * mm
    eye_z = (rows - 1 - a['eyeRow']) * mm + mm / 2
    depth = meta['dims'][2] * mm             # front at y=depth (flushback: back y=0)
    zc = depth / 2

    # anchor the cavity to the EYE LINE: the cartridge's A-panel eye line
    # sits 46 mm above its base, so the cavity bottom goes exactly there —
    # shell eye windows and the OLEDs end up coplanar.
    zb = eye_z - 46.0
    zt = zb + 82.6
    crown = core_top_z - zt
    print(f'eye-aligned cavity: zb={zb:.1f} zt={zt:.1f} crown above={crown:.1f}mm')
    assert crown >= 2, 'core footprint does not reach high enough above the cavity'
    cavity = B(ecx - CAVITY_W/2, zc - CAVITY_D/2, zb,
               ecx + CAVITY_W/2, zc + CAVITY_D/2, zt)
    sleeve = trimesh.boolean.difference([shell, cavity])

    for eye_c in (a['L0'] + 1, a['R0']):     # window centred per eye pair
        wx = eye_c * mm
        win = B(wx - EYE_WIN_W/2, zc, eye_z - EYE_WIN_H/2,
                wx + EYE_WIN_W/2, depth + 30, eye_z + EYE_WIN_H/2)
        sleeve = trimesh.boolean.difference([sleeve, win])

    mouth_z = (rows - 1 - (a['eyeRow'] + 2)) * mm + mm / 2
    mic = cylinder(radius=1.5, height=depth * 2, sections=24)
    mic.apply_transform(RM(np.pi/2, [1, 0, 0]))
    mic.apply_transform(TM([ecx, zc + depth/2, mouth_z]))
    sleeve = trimesh.boolean.difference([sleeve, mic])

    # ---- clamshell split at the cavity mid-plane ----
    big = 500
    front = trimesh.boolean.intersection([sleeve, B(-big, zc, -big, big, big, big)])
    back  = trimesh.boolean.intersection([sleeve, B(-big, -big, -big, big, zc, big)])
    # alignment pegs on the back half, sockets in the front half
    for pxx in (ecx - 20, ecx + 20):
        pz = zb - 8
        peg = cylinder(radius=1.8, height=6, sections=24)
        peg.apply_transform(RM(np.pi/2, [1, 0, 0]))
        peg.apply_transform(TM([pxx, zc, pz]))
        back = trimesh.boolean.union([back, trimesh.boolean.intersection([peg, B(-big, zc - 3, -big, big, zc + 3, big)])])
        sock = cylinder(radius=2.1, height=8, sections=24)
        sock.apply_transform(RM(np.pi/2, [1, 0, 0]))
        sock.apply_transform(TM([pxx, zc + 2, pz]))
        front = trimesh.boolean.difference([front, sock])

    for part, tag in ((front, 'front'), (back, 'back')):
        part.fix_normals()
        print(f'{tag}: watertight {part.is_watertight} tris {len(part.faces)}')
        part.export(f'{base}_{tag}.stl')

    # probes on the assembled sleeve
    probes = [
        ('eye L window', [(a['L0']+1)*mm, depth+40, eye_z], [0, -1, 0]),
        ('eye R window', [a['R0']*mm, depth+40, eye_z], [0, -1, 0]),
        ('mic hole', [ecx, depth+40, mouth_z], [0, -1, 0]),
        ('cavity sealed below', [ecx, zc, -5], [0, 0, 1]),
    ]
    for name, o, d in probes:
        locs = sleeve.ray.intersects_location([o], [d])[0]
        if len(locs) == 0:
            print(f'{name:22s} → clean through')
            continue
        axis = int(np.argmax(np.abs(d)))
        vals = sorted((l[axis] for l in locs), reverse=d[axis] < 0)
        print(f'{name:22s} → first hit {vals[0]:.1f}')
    print('wrote', base + '_front.stl /', base + '_back.stl')


if __name__ == '__main__':
    main(sys.argv[1])
