#!/usr/bin/env python3
"""
Moony base — a plate the body stands in, with the back pod (door_gen.py 'pod') resting on it.

The bottom layer of cubes drops into a 2.6 mm recess (0.3 mm clearance), so Moony can't slide or tip
off; behind it a 3 mm rim boxes in the pod's foot. A hole under the speaker grille cube (G) keeps
the sound open. Built in the cube mesh frame (x, front, up); the body's floor is z = 0.

Usage: python3 hardware/base_gen.py <variants_dir> <out_dir>
Writes base.stl + base_preview.png
"""
import json
import os
import sys

import numpy as np
import trimesh
from trimesh.creation import box, cylinder
from trimesh.transformations import translation_matrix as TM

P = 12.0
CLR = 0.3
TOP, BOT = 2.5, -2.0              # plate top (pod floor sits 0.2 above) / underside
RIM_H = 3.0


def B(x0, y0, z0, x1, y1, z1):
    return box(extents=[x1 - x0, y1 - y0, z1 - z0], transform=TM([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]))


def main(vdir, out, pod_ext=24.0):
    man = json.load(open(f'{vdir}/kit_manifest.json'))
    cells = man['cells']
    foot = [(c['x'], c['z']) for c in cells if c['y'] == 0]           # creature (x, depth) of the floor layer
    grille = [(c['x'], c['z']) for c in cells if c['y'] == 0 and c['code'][0] == 'G']
    ring = [c for c in cells if c.get('tag') == 'door']
    zb = min(c['z'] for c in cells if c['y'] >= 2 and c['y'] <= 7)     # door / ring back layer
    xs = [x for x, _ in foot]
    px0, px1 = (min(c['x'] for c in ring if c['door_face'][0] == 0) + 1) * P, max(c['x'] for c in ring if c['door_face'][0] == 0) * P
    yo = zb * P - pod_ext                                              # pod back face
    x0 = min(min(xs) * P, px0) - 6
    x1 = max((max(xs) + 1) * P, px1) + 6
    y0 = yo - 6
    y1 = (max(z for _, z in foot) + 1) * P + 4
    plate = B(x0, y0, BOT, x1, y1, TOP)
    cuts = []
    for (x, z) in foot:                                                # recess for the bottom cubes
        cuts.append(B(x * P - CLR, z * P - CLR, 0, (x + 1) * P + CLR, (z + 1) * P + CLR, TOP + 1))
    for (x, z) in grille:                                              # let the speaker breathe
        c = cylinder(radius=4.5, height=10, sections=32); c.apply_translation([(x + 0.5) * P, (z + 0.5) * P, 0])
        cuts.append(c)
    base = trimesh.boolean.difference([plate] + cuts)
    # rim round the pod's foot (pod outline 0.2 inside the ring opening, + clearance)
    o0, o1 = px0 + 0.2 - CLR - 2, px1 - 0.2 + CLR + 2
    q0, q1 = yo - CLR - 2, zb * P
    rim = trimesh.boolean.difference([B(o0, q0, TOP - 0.01, o1, q1, TOP + RIM_H),
                                      B(o0 + 2, q0 + 2, TOP - 1, o1 - 2, q1 + 1, TOP + RIM_H + 1)])
    base = trimesh.boolean.union([base, rim])
    assert base.is_watertight
    base.apply_translation([-base.bounds[0][0], -base.bounds[0][1], -base.bounds[0][2]])
    os.makedirs(out, exist_ok=True)
    base.export(f'{out}/base.stl')
    print(f'base {np.round(base.extents, 1)} mm · {base.volume / 1000 * 1.24:.0f} g')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
