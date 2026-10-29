#!/usr/bin/env python3
"""
Moony rest station — one piece: a mosaic cube base the body stands in + a back plate that holds the
board, charging through the gap under the cap.

  · base: the robot footprint + 2 cubes on every side, one cube tall, a 12 mm mosaic on top. The 8
    floor cubes (y = 0) sit in a 12 mm through-cut and the second layer rests on the base, so the
    bottom can no longer wobble or slide. Round the dip, whole cubes stacked 0-2 high with a few
    smaller cubes on top — cubes only. The pit is open right through: the floor cubes stand on the
    table (speaker grille included), the base is exactly one cube tall around them.
  · back layer: one extra cube layer behind the body, closed at the back, up to just under the cap
    (96 mm, the old cavity height), exactly as wide as the body (84 mm), nothing past its sides. The
    board hides inside it: a pocket open only toward the door hole (and at the top), 4 M2 holes through
    the back (no posts), parts side facing the back, wire side facing the body. USB-C goes straight up
    into the free cell under the cap (x = 7); the cable leaves backward.
    The robot drops in from above.

Built in the cube mesh frame (x, front, up); the body's floor is z = 0.
Usage: python3 hardware/station_gen.py <base.json> <variants_dir> <out_dir>
Writes station_base.stl + station_plate.stl (print poses), station_preview.png, station_spec.json
"""
import json
import os
import sys

import numpy as np
import trimesh
from trimesh.creation import box, cylinder
from trimesh.transformations import translation_matrix as TM

P = 12.0
CLR = 0.3            # robot-to-station clearance
GROUND = 12.0        # base top under the body = top of the floor layer: the 8 floor cubes sink into a full
                     # 12 mm pit and the second layer rests flat on the base
FIT = 0.15           # pit wall clearance per side (snug press-in; 0.3 if your cubes print fat)
TILE_D = 0.6         # mosaic groove depth
GAP = 0.8            # mosaic groove width
MARGIN = 2           # cubes of base on every side of the robot
PLATE_BACK = 48.0    # back plate = exactly the one free cube layer behind the body (48..60)
BOARD_T = 0.8
BOARD_SINK = 1.0     # board's wire side this far behind the plate front (solder joints don't scrape the body)
TONGUE_D = 8.0       # plate tongue depth into the base slot
TONGUE_IN = 2.0      # tongue inset from the plate outline (the plate's shoulders sit on the base top)
FIT_SLOT = 0.2       # slot play per side
SLOT_BACK_PLAY = 1.0 # extra slot length toward the back, room to adjust
SCREW_R = 1.15       # M2 through holes in the back (no posts: use your own spacers/nuts)
POCKET_FLOOR = 1.2   # closed back skin behind the board pocket
STACK_STEP = 0.5     # each stacked cube this much narrower per side than the one below


def B(x0, y0, z0, x1, y1, z1):
    return box(extents=[x1 - x0, y1 - y0, z1 - z0], transform=TM([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]))


def cyl(axis, c, r, h0, h1, sections=32):
    m = cylinder(radius=r, height=h1 - h0, sections=sections)
    if axis == 1:
        m.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
        m.apply_translation([c[0], (h0 + h1) / 2, c[1]])
    else:
        m.apply_translation([c[0], c[1], (h0 + h1) / 2])
    return m


def export_clean(m, path):
    """Write an STL that is still watertight once read back (float32 rounding can fold sliver faces)."""
    m = m.copy()
    m.vertices = np.round(m.vertices, 3)
    m.merge_vertices(); m.update_faces(m.nondegenerate_faces()); m.remove_unreferenced_vertices()
    m.export(path)
    back = trimesh.load(path)
    assert back.is_watertight and abs(back.volume - m.volume) < 1.0, f'{path} not watertight after export'


def hash01(*k):
    h = 2166136261
    for v in k:
        h = ((h ^ (v & 0xffff)) * 16777619) & 0xffffffff
    return h / 0xffffffff


def cube_stack(x, y, k, z0, inset0):
    """k whole 12 mm cubes stacked on cell (x, y) from z0, each a little narrower than the one under it
    so every cube reads on its own."""
    out = []
    for j in range(k):
        e = inset0 + STACK_STEP * (j + 1)
        out.append(B(x * P + e, y * P + e, z0 + j * P - 0.01, (x + 1) * P - e, (y + 1) * P - e, z0 + (j + 1) * P))
    return out


def main(base_p, vdir, out):
    meta = json.load(open(base_p)); man = json.load(open(f'{vdir}/kit_manifest.json'))
    tx, ty = meta['zone']['tx'], meta['zone']['ty']
    cells = man['cells']
    K = {(c['x'], c['y'], c['z']): c for c in cells}
    xs = [c['x'] for c in cells]; zs = [c['z'] for c in cells]
    bx0, bx1, bz0, bz1 = min(xs), max(xs), min(zs), max(zs)
    floor = [(c['x'], c['z']) for c in cells if c['y'] == 0]
    # the body's back plane over the door hole + plate span
    zb = min(z for (x, y, z) in K if x in (tx, tx + 6) and ty + 1 <= y <= ty + 6)       # door ring layer
    front = zb * P - CLR                                    # plate front face
    top = (ty + 7) * P - CLR                                # same height as the old cavity (just under the cap)
    hx0, hx1 = (tx + 1) * P, (tx + 6) * P                   # door hole, x
    px0, px1 = hx0 - P, hx1 + P                             # back layer = exactly the body's width (door ring x)
    for (x, y, z) in K:                                     # plate volume must be empty space
        if z * P < front and (z + 1) * P > PLATE_BACK and y * P < top and (x + 1) * P > px0 and x * P < px1:
            raise SystemExit(f'plate hits cube {(x, y, z)}')

    parts = []
    lowest = {}
    for (x, y, z) in K:
        lowest[(x, z)] = min(lowest.get((x, z), 99), y)
    # ---- outline: not a rectangle — every cell under the robot's shadow plus a wobbling 0-2 cube rim
    # round it, so the edge steps in and out cube by cube
    carry = set(lowest) | {(x, zb - 1) for x in range(int(px0 // P), int(px1 // P))}       # the robot's whole shadow + the U

    reach = {}
    for x in range(bx0 - 4, bx1 + 5):
        for z in range(bz0 - 4, bz1 + 5):
            d = min(max(abs(x - a), abs(z - b)) for a, b in carry)
            lim = int(hash01(x // 2, z // 2, 11) * 2.99)             # smooth-ish: shared by 2×2 blocks
            if d <= lim and (bx0 - 2) <= x <= (bx1 + 2) and (bz0 - 2) <= z <= (bz1 + 2):
                reach[(x, z)] = d
    keep, todo = set(), [c for c in carry if c in reach]           # side-connected only: one solid piece
    while todo:
        c = todo.pop()
        if c in keep:
            continue
        keep.add(c)
        todo += [n for n in ((c[0] + 1, c[1]), (c[0] - 1, c[1]), (c[0], c[1] + 1), (c[0], c[1] - 1)) if n in reach]
    reach = {c: d for c, d in reach.items() if c in keep}
    heights = {}
    deco = []
    for (x, z), d in reach.items():
        if (x, z) in floor:
            continue
        parts.append(B(x * P, z * P, 0, (x + 1) * P, (z + 1) * P, GROUND - TILE_D))   # core
        h = min(GROUND, lowest[(x, z)] * P) if (x, z) in lowest else GROUND
        parts.append(B(x * P + GAP / 2, z * P + GAP / 2, 0, (x + 1) * P - GAP / 2, (z + 1) * P - GAP / 2, h))
        heights[(x, z)] = h
        # whole cubes stacked on the outer cells (never under any part of the body), now and then a small one
        if (x, z) in lowest or d == 0 or (px0 - P < (x + 1) * P and x * P < px1 + P and z >= zb - 2):   # nothing against the back
            continue
        r = hash01(x, z)
        k = (0 if r < 0.5 else 1) if d == 1 else (1 if r < 0.55 else 2 if r < 0.85 else 0)
        deco += cube_stack(x, z, k, GROUND, GAP / 2)
        heights[(x, z)] = GROUND + k * P
        if hash01(z, x, 3) < 0.2:
            a = 6.0 if hash01(x, z, 5) < 0.5 else 8.0
            e = GAP / 2 + STACK_STEP * k
            ox = x * P + e + hash01(x, z, 9) * (P - 2 * e - a); oy = z * P + e + hash01(z, x, 9) * (P - 2 * e - a)
            deco.append(B(ox, oy, heights[(x, z)] - 0.01, ox + a, oy + a, heights[(x, z)] + a))
    # ---- back U: one extra cube layer behind the body, closed at the back, up to just under the cap,
    # with the board hidden inside it: a pocket open only toward the body (and at the top for the USB-C
    # plug), parts side facing the back, wire side facing the door hole; 4 M2 holes through the back, no posts.
    cxm, czm = (tx + 3.5) * P, (ty + 4) * P
    holes = ((cxm - 20, czm - 23), (cxm + 20, czm - 23), (cxm - 20, czm + 32), (cxm + 20, czm + 32))
    board_wire = front - BOARD_SINK                         # wire side of the board
    board_comp = board_wire - BOARD_T                       # component side (faces back)
    board_bot = czm - 33
    pk_back = PLATE_BACK + POCKET_FLOOR
    # ---- two prints. Base: everything below the base top, with a flat seat where the plate stands and a
    # slot for its tongue (FIT_SLOT play on every side, SLOT_BACK_PLAY extra toward the back so the plate
    # can be nudged or shimmed if the prints come out a little off).
    t0x, t1x, t0y, t1y = px0 + TONGUE_IN, px1 - TONGUE_IN, PLATE_BACK + POCKET_FLOOR / 2, front - TONGUE_IN
    parts.append(B(px0, PLATE_BACK, 0, px1, front, GROUND))             # flat seat under the plate
    base = trimesh.boolean.union(parts + deco, engine='manifold')
    cuts = [B(x * P - FIT, z * P - FIT, -1, (x + 1) * P + FIT, (z + 1) * P + FIT, GROUND + 5) for (x, z) in floor]   # 8 floor cubes, through
    cuts.append(B(t0x - FIT_SLOT, t0y - FIT_SLOT - SLOT_BACK_PLAY, GROUND - TONGUE_D - FIT_SLOT, t1x + FIT_SLOT, t1y + FIT_SLOT, GROUND + 1))
    base = trimesh.boolean.difference([base] + cuts, engine='manifold')
    # Plate: one cube thick, as wide as the body, from the base top to just under the cap, tongue below.
    # The board hides in a pocket open toward the body and at the top (USB-C); its floor is the tongue
    # top, flush with the base top, so there is no ledge. 4 M2 holes through the closed back.
    plate = trimesh.boolean.union([B(px0, PLATE_BACK, GROUND, px1, front, top),
                                   B(t0x, t0y, GROUND - TONGUE_D, t1x, t1y, GROUND + 0.01)], engine='manifold')
    plate = trimesh.boolean.difference([plate, B(hx0 - 2, pk_back, GROUND, hx1 + 2, front + 1, top + 1)]
                                       + [cyl(1, (hx, hz), SCREW_R, PLATE_BACK - 1, pk_back + 1) for hx, hz in holes], engine='manifold')
    for part in (plate, base):
        assert part.is_watertight and len(part.split(only_watertight=False)) == 1
    st = trimesh.boolean.union([base, plate], engine='manifold')        # assembled, for the fit checks below
    slot_info = {'tongue_mm': [round(t1x - t0x, 2), round(t1y - t0y, 2), TONGUE_D],
                 'slot_mm': [round(t1x - t0x + 2 * FIT_SLOT, 2), round(t1y - t0y + 2 * FIT_SLOT + SLOT_BACK_PLAY, 2), TONGUE_D + FIT_SLOT],
                 'play_sides_front_mm': FIT_SLOT, 'extra_play_backward_mm': SLOT_BACK_PLAY,
                 'floor_under_slot_mm': round(GROUND - TONGUE_D - FIT_SLOT, 2)}
    # ---- fit check: nothing of the station inside any cube of the robot
    robot = trimesh.boolean.union([B(x * P + 0.05, z * P + 0.05, y * P + 0.05, (x + 1) * P - 0.05, (z + 1) * P - 0.05, (y + 1) * P - 0.05)
                                   for (x, y, z) in K], engine='manifold')
    hit = trimesh.boolean.intersection([st, robot], engine='manifold')
    hit_v = hit.volume if len(hit.faces) else 0.0
    # drop-in check: the robot swept upward must not hit the station either
    e = FIT - 0.01                                          # must slide past with at least ~FIT everywhere
    sweep = trimesh.boolean.union([B(x * P + e, z * P + e, y * P + e, (x + 1) * P - e, (z + 1) * P - e, 400)
                                   for (x, y, z) in K], engine='manifold')
    sw = trimesh.boolean.intersection([st, sweep], engine='manifold')
    sw_v = sw.volume if len(sw.faces) else 0.0
    # board (56 × 68, top edge 3 mm above the top holes — hardware/pcb/facebrd_gen.py) + parts filling the
    # pocket depth behind it
    brd = B(cxm - 28 + 0.05, pk_back + 0.05, czm - 33 + 0.05, cxm + 28 - 0.05, board_wire - 0.05, czm + 35 - 0.05)
    bh = trimesh.boolean.intersection([st, brd], engine='manifold')
    board_hit = round(bh.volume if len(bh.faces) else 0.0, 2)
    # pit fit, measured on the mesh: rays from inside each floor cube to its walls / floor, and the base
    # surface under every second-layer cube
    rays_o, rays_d, expect = [], [], []
    for (x, z) in floor:
        for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if (x + dx, z + dz) in floor:
                continue
            for hgt in (2.0, 6.0, 10.0):
                rays_o.append([(x + 0.5) * P, (z + 0.5) * P, hgt]); rays_d.append([dx, dz, 0]); expect.append('wall')
    loc, ri, _ = st.ray.intersects_location(np.array(rays_o), np.array(rays_d), multiple_hits=False)
    walls, floors = [], []
    for p_, i in zip(loc, ri):
        dist = np.linalg.norm(p_ - rays_o[i])
        (walls if expect[i] == 'wall' else floors).append(dist - (P / 2 if expect[i] == 'wall' else 6.0))
    second = [(x, z) for (x, y, z) in K if y == 1 and (x, z) not in floor]
    probe = np.array([[(x + 0.5) * P + 2, (z + 0.5) * P + 2, GROUND + d] for (x, z) in second for d in (-0.3, 0.3)])
    inside = st.contains(probe).reshape(-1, 2)
    fit = {'pit_depth_mm': GROUND, 'pit_wall_gap_mm': [round(min(walls), 2), round(max(walls), 2)], 'wall_rays': len(walls),
           'pit_open_through': bool(not st.contains(np.array([[(x + 0.5) * P, (z + 0.5) * P, 0.5] for (x, z) in floor])).any()),
           'base_bottom_z': round(float(st.bounds[0][2]), 2),
           'second_layer_resting_on_base': f'{int((inside[:, 0] & ~inside[:, 1]).sum())}/{len(second)}'}
    # every exposed face of every robot cube: gap straight out along its normal to the station.
    # Only downward faces may touch (the body rests on the table / the base); everything else needs ≥ FIT.
    O, Dn, kind = [], [], []
    g = np.linspace(0.5, 11.5, 8)
    for (x, y, z) in K:
        for ax, sgn in ((0, -1), (0, 1), (1, -1), (1, 1), (2, -1), (2, 1)):
            n = [0, 0, 0]; n[ax] = sgn
            if (x + n[0], y + n[2], z + n[1]) in K:
                continue
            o = np.array([x * P, z * P, y * P], float); oth = [i for i in range(3) if i != ax]
            o[ax] += 0 if sgn < 0 else P
            for u in g:
                for v in g:
                    q = o.copy(); q[oth[0]] += u; q[oth[1]] += v
                    O.append(q - np.array(n) * 1e-4); Dn.append(n); kind.append('down' if (ax, sgn) == (2, -1) else 'side')
    O = np.array(O); Dn = np.array(Dn, float)
    loc, ri, _ = st.ray.intersects_location(O, Dn, multiple_hits=False)
    gaps = {'down': [], 'side': []}
    for q, i in zip(loc, ri):
        gaps[kind[i]].append(float(np.linalg.norm(q - O[i])) - 1e-4)
    side_min = min(gaps['side'])
    down_touch = sum(1 for v in gaps['down'] if v < 0.01)
    down_min_nonzero = min(v for v in gaps['down'] if v >= 0.01)
    assert side_min >= FIT - 1e-3, f'a side/back/top face is only {side_min:.3f} mm from the station'
    assert down_min_nonzero >= FIT - 1e-3, f'a downward face hovers {down_min_nonzero:.3f} mm over the station'
    face_gaps = {'side_faces_min_gap_mm': round(side_min, 3), 'down_faces_resting_points': down_touch,
                 'down_faces_min_gap_if_not_resting_mm': round(down_min_nonzero, 3), 'rays': len(O)}
    usb = (7, 8, 4) not in K and (7, 9, 4) not in K and (7, 8, 3) not in K
    os.makedirs(out, exist_ok=True)
    st.export(f'{out}/station_meshframe.stl'); base.export(f'{out}/base_meshframe.stl'); plate.export(f'{out}/plate_meshframe.stl')
    pr = base.copy(); pr.apply_translation(-pr.bounds[0]); export_clean(pr, f'{out}/station_base.stl')
    pl = plate.copy()                                     # print lying on its closed back, pocket up
    pl.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    pl.apply_translation(-pl.bounds[0]); export_clean(pl, f'{out}/station_plate.stl')
    spec = {'size_mm': [round(v, 1) for v in pr.extents], 'plate_print_mm': [round(v, 1) for v in pl.extents], 'slot': slot_info, 'solid_grams': round(st.volume / 1000 * 1.24),
            'plate': {'x': [px0, px1], 'back': PLATE_BACK, 'front': front, 'top': top},
            'board': {'wire_side': board_wire, 'parts_height_room_mm': round(board_comp - pk_back, 1), 'holes': holes},
            'overlap_with_robot_mm3': round(hit_v, 2), 'drop_in_overlap_mm3': round(sw_v, 2),
            'board_overlap_mm3': board_hit, 'usb_gap_under_cap_free': usb, 'fit': fit, 'face_gaps': face_gaps}
    json.dump(spec, open(f'{out}/station_spec.json', 'w'), indent=1)
    print(json.dumps(spec))
    preview(st, K, man, f'{out}/station_preview.png')


def render(meshes, az, el, W=900, H=700):
    """Tiny orthographic z-buffer renderer: [(mesh, rgb, alpha)] → image (matplotlib's 3D sorts badly)."""
    a, e = np.radians(az), np.radians(el)
    fwd = np.array([np.cos(e) * np.sin(a), -np.cos(e) * np.cos(a), -np.sin(e)])      # view direction
    right = np.cross(fwd, [0, 0, 1]); right /= np.linalg.norm(right); up = np.cross(right, fwd)
    light = -fwd + np.array([0.3, 0.2, 0.9]); light /= np.linalg.norm(light)
    allv = np.vstack([m.vertices for m, _, _ in meshes])
    u, v = allv @ right, allv @ up
    sc = 0.92 * min(W / np.ptp(u), H / np.ptp(v)); u0, v0 = u.min(), v.max()
    img = np.ones((H, W, 3)) * np.array([0.965, 0.96, 0.94]); zb = np.full((H, W), np.inf)
    for m, rgb, alpha in meshes:
        V = m.vertices; T = V[m.faces]
        px = ((T @ right) - u0) * sc + (W - np.ptp(u) * sc) / 2
        py = (v0 - (T @ up)) * sc + (H - np.ptp(v) * sc) / 2
        pz = T @ fwd
        nl = m.face_normals
        sh = 0.45 + 0.55 * np.clip(nl @ light, 0, 1)
        vis = nl @ fwd < 0
        for k in np.nonzero(vis)[0]:
            x, y, z = px[k], py[k], pz[k]
            xa, xb = int(max(0, np.floor(x.min()))), int(min(W - 1, np.ceil(x.max())))
            ya, yb = int(max(0, np.floor(y.min()))), int(min(H - 1, np.ceil(y.max())))
            if xa > xb or ya > yb:
                continue
            gx, gy = np.meshgrid(np.arange(xa, xb + 1) + 0.5, np.arange(ya, yb + 1) + 0.5)
            d = (y[1] - y[2]) * (x[0] - x[2]) + (x[2] - x[1]) * (y[0] - y[2])
            if abs(d) < 1e-9:
                continue
            l0 = ((y[1] - y[2]) * (gx - x[2]) + (x[2] - x[1]) * (gy - y[2])) / d
            l1 = ((y[2] - y[0]) * (gx - x[2]) + (x[0] - x[2]) * (gy - y[2])) / d
            l2 = 1 - l0 - l1
            inside = (l0 >= -1e-6) & (l1 >= -1e-6) & (l2 >= -1e-6)
            zz = l0 * z[0] + l1 * z[1] + l2 * z[2]
            sub = zb[ya:yb + 1, xa:xb + 1]
            hit = inside & (zz < sub)
            if hit.any():
                sub[hit] = zz[hit]
                im = img[ya:yb + 1, xa:xb + 1]
                im[hit] = np.clip(np.array(rgb) * sh[k], 0, 1) * alpha + im[hit] * (1 - alpha)
    return img


def preview(st, K, man, path):
    import matplotlib
    matplotlib.use('Agg')
    matplotlib.rcParams['font.family'] = 'sans-serif'
    matplotlib.rcParams['font.sans-serif'] = ['Noto Sans CJK SC', 'DejaVu Sans']
    import matplotlib.pyplot as plt
    pearl = (0.93, 0.91, 0.86)
    robot = []
    for (x, y, z), c in K.items():
        robot.append((B(x * P + 0.3, z * P + 0.3, y * P + 0.3, (x + 1) * P - 0.3, (z + 1) * P - 0.3, (y + 1) * P - 0.3),
                      matplotlib.colors.to_rgb(man['colors'][c['ci']]), 1.0))
    views = (('休息站 · 从背后左上看(背后封闭,主板藏在这一层里)', [(st, pearl, 1)], 35, 215),
             ('休息站 · 从前面看(中间下凹,8 颗白块的位置镂空)', [(st, pearl, 1)], 40, 25),
             ('放上 Moony · 从背后看', [(st, pearl, 1)] + robot, 20, 200))
    fig, ax = plt.subplots(1, 3, figsize=(21, 7), facecolor='#f6f5f0')
    for a, (title, ms, el, az) in zip(ax, views):
        a.imshow(render(ms, az, el)); a.axis('off'); a.set_title(title, fontsize=13)
    fig.savefig(path, dpi=100, facecolor='#f6f5f0', bbox_inches='tight')


if __name__ == '__main__':
    main(*sys.argv[1:4])
