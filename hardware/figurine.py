#!/usr/bin/env python3
"""
Figurines, pixel charms and earrings from a spore.

Three styles from the engine's <base>.json:
  pixel   the website's front-view mosaic as a flat tile plate (2 mm):
          one raised tile per cell, eyes drawn in, loop on top for a
          jump ring, optional keychain hole — earrings / charms
  smooth  the voxel body blurred into a soft rounded mushroom and
          re-meshed (marching cubes); colours by region — a figurine
  voxel   the raw cubes (the robot look, scaled)

Every style writes one solid STL plus one STL per owned-filament colour
(load them together as one object in Bambu Studio for AMS), a preview PNG
and a line of stats.

Usage: python3 hardware/figurine.py <base.json> <out_dir> [--style pixel|smooth|voxel]
         [--height MM] [--loop] [--keyhole] [--mirror] [--base] [--colors N]
"""
import json
import os
import sys

import numpy as np
import trimesh
from trimesh.creation import box, cylinder, annulus
from trimesh.transformations import translation_matrix as TM

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_cubes import load_filaments, _lab

WHITE, BLACK = '#f4f2ea', '#1c1c1a'


def snap(counts, n_colors=None):
    """source colour → owned filament (id, hex); at most the N most-used filaments."""
    fil = load_filaments()
    if not fil:
        return {h: (h.lstrip('#'), h) for h in counts}
    flab = np.array([_lab(f['hex']) for f in fil])
    pick = {}
    for h in counts:
        d = ((flab - np.array(_lab(h))) ** 2).sum(1)
        pick[h] = int(d.argmin())
    if n_colors:
        use = {}
        for h, i in pick.items():
            use[i] = use.get(i, 0) + counts[h]
        keep = sorted(use, key=lambda i: -use[i])[:n_colors]
        for h in pick:
            if pick[h] not in keep:
                d = ((flab[keep] - np.array(_lab(h))) ** 2).sum(1)
                pick[h] = keep[int(d.argmin())]
    return {h: (fil[i]['id'], fil[i]['hex']) for h, i in pick.items()}


def load(base, with_eyes=True):
    meta = json.load(open(base))
    vox = {(x, y, z): h for x, y, z, h, *_ in meta['voxels']}
    a = meta.get('anchor', {})
    if with_eyes and meta.get('zone') and a:          # sculpt models carry no eye pixels
        ye = a['rows'] - 1 - a['eyeRow']
        front = {}
        for (x, y, z) in vox:
            front[(x, y)] = max(front.get((x, y), -1), z)
        for x, col in ((a['L0'], WHITE), (a['L0'] + 1, BLACK), (a['R0'], BLACK), (a['R0'] + 1, WHITE)):
            if (x, ye) in front:
                vox[(x, ye, front[(x, ye)])] = col
    return meta, vox


def largest_component(vox):
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
    return {k: vox[k] for k in comps[0]}


def union(ms):
    return trimesh.boolean.union(ms) if len(ms) > 1 else ms[0]


def counts_of(vals):
    c = {}
    for h in vals:
        c[h] = c.get(h, 0) + 1
    return c


def oval_base(m, scale=0.42, pad=1.5):
    lo, hi = m.bounds
    plate = cylinder(radius=max(hi[0] - lo[0], hi[1] - lo[1]) * scale + pad, height=1.5, sections=64)
    plate.apply_transform(np.diag([1.0, 0.7, 1.0, 1.0]))
    plate.apply_transform(TM([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2] - 0.5]))
    return plate


def style_pixel(vox, height, mirror, loop, keyhole, n_colors):
    """Front-view mosaic → 2.0 mm plate: 1.4 base + 0.6 colour tiles."""
    front = {}
    for (x, y, z), h in vox.items():
        if (x, y) not in front or z > front[(x, y)][0]:
            front[(x, y)] = (z, h)
    cells = {k: h for k, (z, h) in front.items()}
    seen, comps = set(), []                            # largest 4-connected blob
    for k in cells:
        if k in seen:
            continue
        comp, st = set(), [k]
        while st:
            c = st.pop()
            if c in comp or c not in cells:
                continue
            comp.add(c); st.extend(((c[0] + 1, c[1]), (c[0] - 1, c[1]), (c[0], c[1] + 1), (c[0], c[1] - 1)))
        seen |= comp; comps.append(comp)
    cells = {k: cells[k] for k in max(comps, key=len)}
    xs = [k[0] for k in cells]; ys = [k[1] for k in cells]
    s = height / (max(ys) - min(ys) + 1)
    pal = snap(counts_of(cells.values()), n_colors)
    BASE, TILE, GAP = 1.4, 0.6, 0.12 * s
    base_parts, tiles = [], {}
    for (x, y), h in cells.items():
        cx = (x - min(xs) + 0.5) * s * (-1 if mirror else 1)
        cy = (y - min(ys) + 0.5) * s
        base_parts.append(box(extents=[s, s, BASE], transform=TM([cx, cy, BASE / 2])))
        tiles.setdefault(pal[h][0], []).append(box(extents=[s - GAP, s - GAP, TILE], transform=TM([cx, cy, BASE + TILE / 2])))
    base = union(base_parts)
    meshes = {fid: union(ts) for fid, ts in tiles.items()}
    main_fid = max(meshes, key=lambda f: meshes[f].volume)
    lo, hi = base.bounds
    extras = []
    if loop:
        r = annulus(r_min=0.9, r_max=1.8, height=BASE + TILE)
        r.apply_transform(TM([(lo[0] + hi[0]) / 2, hi[1] + 1.3, (BASE + TILE) / 2]))
        extras.append(r)
    if keyhole:
        r = annulus(r_min=1.6, r_max=3.0, height=BASE + TILE)
        r.apply_transform(TM([(lo[0] + hi[0]) / 2, hi[1] + 2.2, (BASE + TILE) / 2]))
        extras.append(r)
    if extras:
        base = union([base] + extras)
    meshes[main_fid] = union([meshes[main_fid], base])      # plate prints in the dominant colour
    whole = union([base] + list(meshes.values()))
    colours = {fid: next(v[1] for v in pal.values() if v[0] == fid) for fid in meshes}
    return whole, meshes, colours, s


def style_smooth(vox, height, mirror, add_base, n_colors, sigma=0.9):
    """Blur the voxel body and re-mesh it: a soft, rounded figure."""
    from scipy import ndimage
    from scipy.spatial import cKDTree
    from skimage import measure
    keys = np.array(list(vox))
    lo = keys.min(0); dims = keys.max(0) - lo + 1
    pad, up = 3, 3                                     # 3× supersampling for a clean surface
    grid = np.zeros((dims + 2 * pad) * up, dtype=float)
    for (x, y, z) in vox:
        i, j, k = (np.array((x, y, z)) - lo + pad) * up
        grid[i:i + up, j:j + up, k:k + up] = 1.0
    grid = ndimage.gaussian_filter(grid, sigma * up)
    verts, faces, _, _ = measure.marching_cubes(grid, level=0.5)
    verts = verts / up - pad                            # voxel units, origin = lo
    s = height / dims[1]
    sx = -1 if mirror else 1
    pts = np.stack([verts[:, 0] * s * sx, -verts[:, 2] * s, verts[:, 1] * s], 1)
    m = trimesh.Trimesh(pts, faces[:, ::-1] if mirror else faces, process=True)
    m.fix_normals()
    # colour by the front-view mosaic: every face takes the colour of the
    # nearest (x,y) column's front cell, so the figure reads like the 2D spore
    front = {}
    for (x, y, z), h in vox.items():
        if (x, y) not in front or z > front[(x, y)][0]:
            front[(x, y)] = (z, h)
    pal = snap(counts_of(h for _, h in front.values()), n_colors)
    cols = list(front)
    tree = cKDTree(np.array(cols, float) - lo[:2] + 0.5)
    cen = m.triangles_center
    cen_xy = np.stack([cen[:, 0] / s * sx, cen[:, 2] / s], 1)
    _, idx = tree.query(cen_xy)
    labels = np.array([pal[front[cols[i]][1]][0] for i in idx])
    meshes = {fid: m.submesh([np.where(labels == fid)[0]], append=True) for fid in sorted(set(labels))}
    whole = m
    if add_base:
        plate = oval_base(m)
        whole = union([m, plate])
        main_fid = max(meshes, key=lambda f: meshes[f].area)
        meshes[main_fid] = trimesh.util.concatenate([meshes[main_fid], plate])
    colours = {fid: next(v[1] for v in pal.values() if v[0] == fid) for fid in meshes}
    return whole, meshes, colours, s


def style_voxel(vox, height, mirror, add_base, n_colors):
    keys = np.array(list(vox)); lo = keys.min(0)
    s = height / (keys[:, 1].max() - lo[1] + 1)
    pal = snap(counts_of(vox.values()), n_colors)
    parts = {}
    for (x, y, z), h in vox.items():
        parts.setdefault(pal[h][0], []).append(box(extents=[s, s, s], transform=TM(
            [(x - lo[0] + 0.5) * s * (-1 if mirror else 1), -(z - lo[2] + 0.5) * s, (y - lo[1] + 0.5) * s])))
    meshes = {fid: union(b) for fid, b in parts.items()}
    whole = union(list(meshes.values()))
    if add_base:
        plate = oval_base(whole, 0.45, 1.0)
        whole = union([whole, plate])
        main_fid = max(meshes, key=lambda f: meshes[f].volume)
        meshes[main_fid] = union([meshes[main_fid], plate])
    colours = {fid: next(v[1] for v in pal.values() if v[0] == fid) for fid in meshes}
    return whole, meshes, colours, s


def preview(whole, meshes, colours, path, title, view=(22, -62)):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection
    fig = plt.figure(figsize=(5, 5), facecolor='#f6f5f0')
    ax = fig.add_subplot(111, projection='3d'); ax.set_facecolor('#f6f5f0')
    light = np.array([0.3, -0.6, 0.75]); light /= np.linalg.norm(light)
    for fid, m in meshes.items():
        hx = colours[fid]
        basec = np.array([int(hx[i:i + 2], 16) / 255 for i in (1, 3, 5)])
        sh = 0.55 + 0.45 * np.clip(m.face_normals @ light, 0, 1)
        ax.add_collection3d(Poly3DCollection(m.vertices[m.faces], facecolors=np.clip(basec[None] * sh[:, None], 0, 1), edgecolors='none'))
    lo, hi = whole.bounds; c = (lo + hi) / 2; r = max(hi - lo) / 2 + 2
    ax.set_xlim(c[0] - r, c[0] + r); ax.set_ylim(c[1] - r, c[1] + r); ax.set_zlim(c[2] - r, c[2] + r)
    ax.set_box_aspect((1, 1, 1)); ax.view_init(*view); ax.axis('off'); ax.set_title(title, fontsize=9)
    fig.savefig(path, dpi=130, facecolor='#f6f5f0', bbox_inches='tight'); plt.close(fig)


def main(base, out, style='pixel', height=None, loop=False, mirror=False, add_base=False, n_colors=None, keyhole=False):
    meta, vox = load(base)
    vox = largest_component(vox)
    stem = os.path.splitext(os.path.basename(base))[0]
    name = f"{stem}_{style}" + ('_mirror' if mirror else '')
    os.makedirs(out, exist_ok=True)
    if style == 'pixel':
        whole, meshes, colours, s = style_pixel(vox, height or 25.0, mirror, loop, keyhole, n_colors)
        view = (90, -90)
    elif style == 'smooth':
        whole, meshes, colours, s = style_smooth(vox, height or 40.0, mirror, add_base, n_colors)
        view = (18, -62)
    else:
        whole, meshes, colours, s = style_voxel(vox, height or 40.0, mirror, add_base, n_colors)
        view = (18, -62)
    whole.export(f'{out}/{name}.stl')
    for fid, m in meshes.items():
        m.export(f'{out}/{name}_{fid}.stl')
    ext = whole.extents
    preview(whole, meshes, colours, f'{out}/{name}_preview.png',
            f'{name} · {ext[0]:.0f}×{ext[1]:.0f}×{ext[2]:.0f} mm · {len(meshes)} 色', view)
    print(f'{name}: {ext[0]:.1f}×{ext[1]:.1f}×{ext[2]:.1f} mm · {s:.2f} mm/cell · '
          f'{whole.volume / 1000 * 1.24:.1f} g · ' + ', '.join(meshes))


if __name__ == '__main__':
    opt = sys.argv
    val = {k: opt[opt.index(k) + 1] for k in ('--height', '--colors', '--style') if k in opt}
    skip = {opt.index(k) + 1 for k in val}
    args = [a for i, a in enumerate(opt) if i > 0 and not a.startswith('--') and i not in skip]
    main(args[0], args[1], val.get('--style', 'pixel'), float(val['--height']) if '--height' in val else None,
         '--loop' in opt, '--mirror' in opt, '--base' in opt, int(val['--colors']) if '--colors' in val else None,
         '--keyhole' in opt)
