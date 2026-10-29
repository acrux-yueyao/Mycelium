#!/usr/bin/env python3
"""
Moony rest station — one piece: a mosaic cube base the body stands in + a back plate that holds the
board, charging through the gap under the cap.

  · base: the robot footprint + 2 cubes on every side, one cube tall, a 12 mm mosaic on top. The 8
    floor cubes (y = 0) sit in a 12 mm through-cut and the second layer rests on the base, so the
    bottom can no longer wobble or slide. Round the dip, whole cubes stacked 0-2 high with a few
    smaller cubes on top — cubes only. The pit is open right through: the floor cubes stand on the
    table (speaker grille included), the base is exactly one cube tall around them.
  · back U: one cube thick, in the free layer behind the body (creature z = 4, under the cap): two posts
    either side of the door hole up to just under the cap (96 mm, the old cavity height) and a bar
    along the bottom, open in the middle. Its front is flush with the body's back plane, so the robot
    drops in from above. The board hangs on 4 thin tabs with M2 bosses, parts side facing back into
    the opening, wire side facing the door hole; USB-C goes straight up into the free cell under the
    cap (x = 7) and the cable leaves backward.

Built in the cube mesh frame (x, front, up); the body's floor is z = 0.
Usage: python3 hardware/station_gen.py <base.json> <variants_dir> <out_dir>
Writes station.stl (print pose), station_preview.png, station_spec.json
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
PILOT_R = 0.85       # M2 self-tapping pilot
BOSS_R = 2.6
ARM_LEN = 2          # U arms run this many cubes forward from the back wall
TAB_CLEAR = 3.6     # gap between the board's parts side and the mounting tabs (JST-SH bodies are 2.9)
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
    px0, px1 = hx0 - 2 * P, hx1 + 2 * P                     # back wall: two cubes either side of the hole
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
        parts.append(B(x * P - 0.01, z * P - 0.01, -0.01, (x + 1) * P + 0.01, (z + 1) * P + 0.01, GROUND - TILE_D))   # core
        h = min(GROUND, lowest[(x, z)] * P) if (x, z) in lowest else GROUND
        parts.append(B(x * P + GAP / 2, z * P + GAP / 2, -0.01, (x + 1) * P - GAP / 2, (z + 1) * P - GAP / 2, h))
        heights[(x, z)] = h
        # whole cubes stacked on the outer cells (never under any part of the body), now and then a small one
        if (x, z) in lowest or d == 0 or (px0 < (x + 1) * P and x * P < px1 and z == zb - 1):
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
    # ---- back U: one cube thick, two posts either side of the door hole up to just under the cap and a
    # bar along the bottom; open in the middle. The board hangs on 4 thin tabs with M2 bosses, its parts
    # facing back into the opening, wires facing the door hole; USB-C straight up under the cap.
    cxm, czm = (tx + 3.5) * P, (ty + 4) * P
    holes = ((cxm - 20, czm - 23), (cxm + 20, czm - 23), (cxm - 20, czm + 32), (cxm + 20, czm + 32))
    board_wire = front - BOARD_SINK                         # wire side of the board
    board_comp = board_wire - BOARD_T                       # component side (faces back)
    tab_front = board_comp - TAB_CLEAR                      # tabs stay this far behind the board: low parts pass over them
    board_bot = czm - 33
    parts.append(B(px0, PLATE_BACK, -0.01, hx0, front, top))                 # back wall, left of the hole
    parts.append(B(hx1, PLATE_BACK, -0.01, px1, front, top))                 # back wall, right of the hole
    parts.append(B(px0, PLATE_BACK, -0.01, px1, front, board_bot - 2))       # low bar under the board
    # arms of the U (seen from above): one cube wide, running forward along both sides of the body
    # from the back wall, as high as the body lets them (under the arms / cap) — they hug the body
    arm_h = {}
    for ax_, inner in ((int(px0 // P), (int(px0 // P) + 1) * P - CLR), (int(px1 // P) - 1, (int(px1 // P) - 1) * P + CLR)):
        zs_arm = [z for z in range(zb, zb + ARM_LEN)]
        h = min([lowest.get((ax_, z), 99) * P for z in zs_arm] + [top + CLR]) - CLR
        x0_, x1_ = (ax_ * P, inner) if inner > ax_ * P + 6 else (inner, (ax_ + 1) * P)
        parts.append(B(x0_, front - 0.01, -0.01, x1_, (zb + ARM_LEN) * P, h))
        arm_h[ax_] = h
    bosses = []
    for hx, hz in holes:
        side0, side1 = (hx0 - 0.01, hx + BOSS_R + 0.5) if hx < cxm else (hx - BOSS_R - 0.5, hx1 + 0.01)
        bosses.append(B(side0, PLATE_BACK, hz - 3.5, side1, tab_front, hz + 3.5))
        bosses.append(cyl(1, (hx, hz), BOSS_R, tab_front - 0.01, board_comp))
    cuts = []
    cuts_after = [cyl(1, (hx, hz), PILOT_R, PLATE_BACK - 1, board_comp + 1) for hx, hz in holes]
    st = trimesh.boolean.union(parts + bosses + deco, engine='manifold')
    # the 8 floor cubes: cut right through, snug
    for (x, z) in floor:
        cuts.append(B(x * P - FIT, z * P - FIT, -1, (x + 1) * P + FIT, (z + 1) * P + FIT, GROUND + 5))
    st = trimesh.boolean.difference([st] + cuts + cuts_after, engine='manifold')
    assert st.is_watertight and len(st.split(only_watertight=False)) == 1
    # ---- fit check: nothing of the station inside any cube of the robot
    robot = trimesh.boolean.union([B(x * P + 0.05, z * P + 0.05, y * P + 0.05, (x + 1) * P - 0.05, (z + 1) * P - 0.05, (y + 1) * P - 0.05)
                                   for (x, y, z) in K], engine='manifold')
    hit = trimesh.boolean.intersection([st, robot], engine='manifold')
    hit_v = hit.volume if len(hit.faces) else 0.0
    # drop-in check: the robot swept upward must not hit the station either
    sweep = trimesh.boolean.union([B(x * P + 0.05, z * P + 0.05, y * P + 0.05, (x + 1) * P - 0.05, (z + 1) * P - 0.05, 400)
                                   for (x, y, z) in K], engine='manifold')
    sw = trimesh.boolean.intersection([st, sweep], engine='manifold')
    sw_v = sw.volume if len(sw.faces) else 0.0
    # board (56 × 68, top edge 3 mm above the top holes — hardware/pcb/facebrd_gen.py) + parts up to TAB_CLEAR
    # behind it everywhere except on the screw bosses (taller parts sit in the open middle of the U)
    brd = B(cxm - 28 + 0.05, board_comp - TAB_CLEAR + 0.05, czm - 33 + 0.05, cxm + 28 - 0.05, board_wire - 0.05, czm + 35 - 0.05)
    brd = trimesh.boolean.difference([brd] + [cyl(1, (hx, hz), BOSS_R + 0.1, board_comp - 10, board_comp + 0.01) for hx, hz in holes],
                                     engine='manifold')
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
    usb = (7, 8, 4) not in K and (7, 9, 4) not in K and (7, 8, 3) not in K
    os.makedirs(out, exist_ok=True)
    st.export(f'{out}/station_meshframe.stl')
    pr = st.copy(); pr.apply_translation(-pr.bounds[0]); pr.export(f'{out}/station.stl')
    spec = {'size_mm': [round(v, 1) for v in pr.extents], 'solid_grams': round(st.volume / 1000 * 1.24),
            'plate': {'x': [px0, px1], 'back': PLATE_BACK, 'front': front, 'top': top, 'arm_heights': {str(k): round(v, 1) for k, v in arm_h.items()}, 'arm_front': (zb + ARM_LEN) * P},
            'board': {'wire_side': board_wire, 'parts_clear_over_tabs_mm': TAB_CLEAR, 'holes': holes},
            'overlap_with_robot_mm3': round(hit_v, 2), 'drop_in_overlap_mm3': round(sw_v, 2),
            'board_overlap_mm3': board_hit, 'usb_gap_under_cap_free': usb, 'fit': fit}
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
    views = (('休息站 · 从背后左上看(俯视 U 形背板兜住身体,中间镂空装主板)', [(st, pearl, 1)], 35, 215),
             ('休息站 · 从前面看(中间下凹,8 颗白块的位置镂空)', [(st, pearl, 1)], 40, 25),
             ('放上 Moony · 从背后看', [(st, pearl, 1)] + robot, 20, 200))
    fig, ax = plt.subplots(1, 3, figsize=(21, 7), facecolor='#f6f5f0')
    for a, (title, ms, el, az) in zip(ax, views):
        a.imshow(render(ms, az, el)); a.axis('off'); a.set_title(title, fontsize=13)
    fig.savefig(path, dpi=100, facecolor='#f6f5f0', bbox_inches='tight')


if __name__ == '__main__':
    main(*sys.argv[1:4])
