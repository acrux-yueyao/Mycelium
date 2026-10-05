#!/usr/bin/env python3
"""
Figurines and earrings from a spore's voxel model.

Takes the engine's <base>.json (voxels with colours), scales the creature
to a target height and writes:
  <name>.stl              one solid (single-colour print)
  <name>_<filament>.stl   one part per owned-filament colour (load them all
                          as one object in Bambu Studio for AMS multi-colour)
  <name>_preview.png

Options
  --height MM     overall height (default 40 figurine / 25 earring)
  --earring       relief: keep only the front --depth voxel layers of each
                  column, add a loop on top for a jump ring, no base
  --depth N       relief depth in voxels (default 2)
  --base          add a 1.5 mm oval base plate under the feet
  --mirror        mirrored copy (a left/right earring pair)

Usage: python3 hardware/figurine.py <base.json> <out_dir> [options]
"""
import json
import os
import sys

import numpy as np
import trimesh
from trimesh.creation import box, cylinder, annulus
from trimesh.transformations import translation_matrix as TM, rotation_matrix as RM

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_cubes import load_filaments, _lab


def snap(hexes):
    """source colour → owned filament (id, hex); identity if no palette."""
    fil = load_filaments()
    if not fil:
        return {h: (h.lstrip('#'), h) for h in hexes}
    flab = np.array([_lab(f['hex']) for f in fil])
    out = {}
    for h in hexes:
        d = ((flab - np.array(_lab(h))) ** 2).sum(1)
        f = fil[int(d.argmin())]
        out[h] = (f['id'], f['hex'])
    return out


def main(base, out, height=None, earring=False, depth=2, add_base=False, mirror=False):
    meta = json.load(open(base))
    name = os.path.splitext(os.path.basename(base))[0] + ('_earring' if earring else '_figurine') + ('_mirror' if mirror else '')
    os.makedirs(out, exist_ok=True)
    vox = {(x, y, z): h for x, y, z, h, *_ in meta['voxels']}
    if earring:                                   # relief with a FLAT back (prints lying down)
        front = {}
        for (x, y, z) in vox:
            front[(x, y)] = max(front.get((x, y), -1), z)
        zb = max(front.values()) - depth          # back plane
        rel = {}
        for (x, y), f in front.items():
            for z in range(zb, max(f, zb) + 1):
                rel[(x, y, z)] = vox.get((x, y, z)) or vox[(x, y, f)]
        vox = rel
    # keep one printable piece: the largest 6-connected component
    seen, comps = set(), []
    for k in vox:
        if k in seen:
            continue
        comp, st = set(), [k]
        while st:
            c = st.pop()
            if c in comp or c not in vox:
                continue
            comp.add(c)
            st.extend((c[0] + d[0], c[1] + d[1], c[2] + d[2]) for d in
                      ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)))
        seen |= comp; comps.append(comp)
    comps.sort(key=len, reverse=True)
    if len(comps) > 1:
        print(f'  dropped {sum(len(c) for c in comps[1:])} loose voxels in {len(comps) - 1} fragments')
        vox = {k: vox[k] for k in comps[0]}
    xs = [k[0] for k in vox]; ys = [k[1] for k in vox]; zs = [k[2] for k in vox]
    rows = max(ys) - min(ys) + 1
    height = height or (25.0 if earring else 40.0)
    s = height / rows                               # mm per voxel
    # build per colour; engine axes: x right, y up, z toward viewer → print frame x, y(depth), z(up)
    pal = snap(sorted(set(vox.values())))
    parts = {}
    for (x, y, z), h in vox.items():
        fid, fhex = pal[h]
        b = box(extents=[s, s, s], transform=TM([(x - min(xs) + 0.5) * s * (-1 if mirror else 1),
                                                   -(z - min(zs) + 0.5) * s, (y - min(ys) + 0.5) * s]))
        parts.setdefault(fid, []).append(b)
    meshes = {}
    for fid, boxes in parts.items():
        m = trimesh.boolean.union(boxes) if len(boxes) > 1 else boxes[0]
        meshes[fid] = m
    whole = trimesh.boolean.union(list(meshes.values()))
    extras = []
    if earring:                                   # loop on top, centred on the body's top row
        lo, hi = whole.bounds
        cx = (lo[0] + hi[0]) / 2; cy = (lo[1] + hi[1]) / 2
        ring = annulus(r_min=1.0, r_max=2.0, height=min(2.0, (hi[1] - lo[1])))
        ring.apply_transform(RM(np.pi / 2, [1, 0, 0]))        # hole axis along y (depth)
        ring.apply_transform(TM([cx, cy, hi[2] + 1.6]))
        extras.append(ring)
    if add_base:
        lo, hi = whole.bounds
        plate = cylinder(radius=max(hi[0] - lo[0], hi[1] - lo[1]) * 0.45 + 1, height=1.5, sections=48)
        plate.apply_transform(np.diag([1.0, 0.65, 1.0, 1.0]))
        plate.apply_transform(TM([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2] - 0.75]))
        extras.append(plate)
    if extras:
        whole = trimesh.boolean.union([whole] + extras)
        # extras take the most-used colour
        main_fid = max(meshes, key=lambda f: meshes[f].volume)
        meshes[main_fid] = trimesh.boolean.union([meshes[main_fid]] + extras)
    whole.export(f'{out}/{name}.stl')
    for fid, m in meshes.items():
        m.export(f'{out}/{name}_{fid}.stl')
    ext = whole.extents
    print(f'{name}: {len(vox)} voxels · {s:.2f} mm/voxel · {ext[0]:.1f}×{ext[1]:.1f}×{ext[2]:.1f} mm · '
          f'{whole.volume / 1000 * 1.24:.1f} g PLA · colours: ' + ', '.join(f'{f}({pal_hex})' for f, (pal_hex) in
                                                                          {f: next(v[1] for v in pal.values() if v[0] == f) for f in meshes}.items()))
    # preview
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection
    fig = plt.figure(figsize=(5, 5), facecolor='#f6f5f0')
    ax = fig.add_subplot(111, projection='3d'); ax.set_facecolor('#f6f5f0')
    light = np.array([0.3, -0.6, 0.75]); light /= np.linalg.norm(light)
    for fid, m in meshes.items():
        hx = next(v[1] for v in pal.values() if v[0] == fid)
        basec = np.array([int(hx[i:i + 2], 16) / 255 for i in (1, 3, 5)])
        sh = 0.5 + 0.5 * np.clip(m.face_normals @ light, 0, 1)
        ax.add_collection3d(Poly3DCollection(m.vertices[m.faces], facecolors=np.clip(basec[None] * sh[:, None], 0, 1), edgecolors='none'))
    lo, hi = whole.bounds; c = (lo + hi) / 2; r = max(hi - lo) / 2 + 2
    ax.set_xlim(c[0] - r, c[0] + r); ax.set_ylim(c[1] - r, c[1] + r); ax.set_zlim(c[2] - r, c[2] + r)
    ax.set_box_aspect((1, 1, 1)); ax.view_init(18, -65); ax.axis('off')
    ax.set_title(f'{name} · {ext[0]:.0f}×{ext[1]:.0f}×{ext[2]:.0f} mm', fontsize=9)
    fig.savefig(f'{out}/{name}_preview.png', dpi=130, facecolor='#f6f5f0', bbox_inches='tight')
    return whole


if __name__ == '__main__':
    opt = sys.argv
    h = float(opt[opt.index('--height') + 1]) if '--height' in opt else None
    d = int(opt[opt.index('--depth') + 1]) if '--depth' in opt else 2
    skip = {opt.index(k) + 1 for k in ('--height', '--depth') if k in opt}   # option values are not positionals
    args = [a for i, a in enumerate(opt) if i > 0 and not a.startswith('--') and i not in skip]
    main(args[0], args[1], h, '--earring' in opt, d, '--base' in opt, '--mirror' in opt)
