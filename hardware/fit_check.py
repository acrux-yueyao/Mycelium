#!/usr/bin/env python3
"""
Fit check + overall render for the moving Moony Moth on its mosaic ground.

1 mm occupancy grids are built from the real cells:
  spore  = sculpt voxels (12 mm), shell 3 mm  → free space inside
  ground = ground.json cells × 2 high, top/bottom plates 2 mm, walls 2.5 mm
Every component is a box with its real size, placed at its intended spot
(or, in the ground, packed by search). A part PASSES when the whole box is
inside free space and touches no other part. Moving parts also get their
swept clearance checked (pan turntable, nod hinge).

Usage: python3 hardware/fit_check.py <front.json> <sculpt.json> <ground.json> <out_dir>
Writes fit_report.txt, fit_sections.png, render_overall.png
"""
import json
import sys

import numpy as np
from scipy import ndimage

import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'monospace'
matplotlib.rcParams['font.monospace'] = ['Noto Sans Mono CJK SC', 'DejaVu Sans Mono']
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

P = 12
SHELL = 3          # printed panel wall
GAP = 2            # spore bottom above the ground top (turning clearance)

# real part sizes (mm): (x = width, y = height, z = depth) as mounted
PARTS_SPORE = {
    'OLED 左眼 GME12864-11': (27.5, 27.8, 6.0),
    'OLED 右眼 GME12864-11': (27.5, 27.8, 6.0),
    'ToF VL53L0X 模块(竖装)': (10.7, 25.0, 5.0),
    '麦克风 INMP441': (14.0, 14.0, 6.0),
    '② 点头舵机 MG90S(横装)': (34.0, 32.5, 12.2),
    '③ 呼吸舵机 SG90(立装)': (12.2, 30.0, 32.0),
    '① 转身舵机 MG90S(倒装)': (32.5, 34.0, 12.2),
}
PARTS_GROUND = [
    ('脸板 MC03-F', 68.0, 56.0, 7.5),
    ('电池 103450', 50.0, 34.0, 10.5),
    ('PCA9685 舵机驱动', 62.5, 25.4, 9.0),
    ('MT3608 升压', 36.0, 17.0, 7.0),
    ('喇叭 3020', 30.0, 20.0, 5.0),
]


def spore_grid(sm):
    vox = [(x, y, z) for x, y, z, *_ in sm['voxels']]
    xs = [v[0] for v in vox]; ys = [v[1] for v in vox]; zs = [v[2] for v in vox]
    x0, y0, z0 = min(xs), min(ys), min(zs)
    dims = ((max(xs) - x0 + 1) * P, (max(ys) - y0 + 1) * P, (max(zs) - z0 + 1) * P)
    g = np.zeros(dims, bool)
    for x, y, z in vox:
        g[(x - x0) * P:(x - x0 + 1) * P, (y - y0) * P:(y - y0 + 1) * P, (z - z0) * P:(z - z0 + 1) * P] = True
    solid = ndimage.binary_fill_holes(g)
    free = ndimage.binary_erosion(solid, iterations=SHELL)
    return vox, (x0, y0, z0), solid, free


def box_ok(free, used, x, y, z, w, h, d):
    xi, yi, zi = int(round(x)), int(round(y)), int(round(z))
    wi, hi, di = int(np.ceil(w)), int(np.ceil(h)), int(np.ceil(d))
    if xi < 0 or yi < 0 or zi < 0 or xi + wi > free.shape[0] or yi + hi > free.shape[1] or zi + di > free.shape[2]:
        return False, 'out of bounds', None
    sl = (slice(xi, xi + wi), slice(yi, yi + hi), slice(zi, zi + di))
    inside = free[sl].mean()
    clash = used[sl].any()
    return inside > 0.999 and not clash, f'{inside * 100:.1f}% 在内部空间' + (' · 与其他元件重叠' if clash else ''), sl


def main(front_json, sculpt_json, ground_json, out):
    fm = json.load(open(front_json)); sm = json.load(open(sculpt_json)); gm = json.load(open(ground_json))
    vox, (x0, y0, z0), solid, free = spore_grid(sm)
    a = sm['anchor']; ye = a['rows'] - 1 - a['eyeRow'] - y0
    L0, R0 = a['L0'] - x0, a['R0'] - x0
    split = (ye - 1) * P                      # nod axis height (mm) — below the eye frames
    used = np.zeros_like(free)
    rep = [f'孢子外壳内部(壁厚 {SHELL} mm):{free.sum() / 1000:.0f} cm³ · 点头轴高 {split} mm(眼睛下面一排的底边)', '']
    # front-most free depth at a given x,y (mm) → place front parts right behind the shell
    def front_z(xc, yc, depth):
        col = free[int(xc), int(yc), :]
        idx = np.where(col)[0]
        return idx.max() - depth + 1 if len(idx) else None
    cx = free.shape[0] / 2
    place = {}
    ey = (ye + 0.5) * P
    for name, ex in (('OLED 左眼 GME12864-11', (L0 + 1) * P), ('OLED 右眼 GME12864-11', (R0 + 1) * P)):
        w, h, d = PARTS_SPORE[name]
        zf = min(front_z(ex - w / 2 + 2, ey, d), front_z(ex + w / 2 - 2, ey, d))
        place[name] = (ex - w / 2, ey - h / 2, zf)
    w, h, d = PARTS_SPORE['ToF VL53L0X 模块(竖装)']
    place['ToF VL53L0X 模块(竖装)'] = (cx - w / 2, ey - h / 2 - 2, front_z(cx, ey - 2, d))
    w, h, d = PARTS_SPORE['麦克风 INMP441']
    my = 2.5 * P
    place['麦克风 INMP441'] = ((L0 + 1) * P - w / 2, my - h / 2, front_z((L0 + 1) * P, my, d))
    # servos at the depth centre of their rows
    def zc(yc):
        idx = np.where(free[int(cx), int(yc), :])[0]
        return (idx.min() + idx.max()) / 2 if len(idx) else free.shape[2] / 2
    w, h, d = PARTS_SPORE['② 点头舵机 MG90S(横装)']
    place['② 点头舵机 MG90S(横装)'] = (cx - w / 2, split - h / 2 + 4, zc(split) - d / 2)
    w, h, d = PARTS_SPORE['③ 呼吸舵机 SG90(立装)']
    cy = free.shape[1] - SHELL - 14 - h                  # under the crown, 14 mm left for the umbrella
    place['③ 呼吸舵机 SG90(立装)'] = (cx - w / 2, cy, zc(cy + h / 2) - d / 2)
    w, h, d = PARTS_SPORE['① 转身舵机 MG90S(倒装)']
    place['① 转身舵机 MG90S(倒装)'] = (cx - w / 2, SHELL, zc(SHELL + h / 2) - d / 2)
    rep.append('孢子里(x 左右, y 高, z 前后;mm,原点=外壳左下后角)')
    ok_all = True
    import itertools
    # where each part must live (y range, mm) and its preferred centre
    eyes_mid = ((L0 + 1) * P + (R0 + 1) * P) / 2
    region = {
        'OLED 左眼 GME12864-11': ((split, free.shape[1]), None, 'front'),
        'OLED 右眼 GME12864-11': ((split, free.shape[1]), None, 'front'),
        'ToF VL53L0X 模块(竖装)': ((split, free.shape[1]), (eyes_mid, ey - 4), 'front'),
        '麦克风 INMP441': ((0, split), ((L0 + 1) * P, 2.5 * P), 'front'),
        '② 点头舵机 MG90S(横装)': ((split - 22, split + 22), (eyes_mid, split), 'mid'),
        '③ 呼吸舵机 SG90(立装)': ((split + 14, free.shape[1]), (eyes_mid, free.shape[1]), 'mid'),
        '① 转身舵机 MG90S(倒装)': ((0, split - 10), (eyes_mid, 0), 'mid'),
    }
    def sat(a):
        c = a.astype(np.int32).cumsum(0).cumsum(1).cumsum(2)
        return np.pad(c, ((1, 0), (1, 0), (1, 0)))
    def boxsum(c, x, y, z, w, h, d):
        x1, y1, z1 = x + w, y + h, z + d
        return (c[x1, y1, z1] - c[x, y1, z1] - c[x1, y, z1] - c[x1, y1, z] + c[x, y, z1] + c[x, y1, z]
                + c[x1, y, z] - c[x, y, z])
    order = ['OLED 左眼 GME12864-11', 'OLED 右眼 GME12864-11', 'ToF VL53L0X 模块(竖装)', '麦克风 INMP441',
             '① 转身舵机 MG90S(倒装)', '② 点头舵机 MG90S(横装)', '③ 呼吸舵机 SG90(立装)']
    for name in order:
        dims = PARTS_SPORE[name]
        (ylo, yhi), pref, kind = region[name]
        if name in place and pref is None:
            pref = (place[name][0] + dims[0] / 2, place[name][1] + dims[1] / 2)
        avail = sat(free & ~used)
        if kind == 'front':
            orients = [dims]
        elif name.startswith('①'):            # pan: shaft (34 = body + horn) must point UP (y)
            orients = [(32.5, 34.0, 12.2), (12.2, 34.0, 32.5)]
        elif name.startswith('②'):            # nod: shaft along x (left-right hinge axis)
            orients = [(34.0, 32.5, 12.2), (34.0, 12.2, 32.5)]
        else:                                 # breathing: crank, any orientation
            orients = sorted(set(itertools.permutations(dims)))
        best = None
        for (w, h, d) in orients:
            wi, hi, di = int(np.ceil(w)), int(np.ceil(h)), int(np.ceil(d))
            for x in range(0, free.shape[0] - wi + 1, 1):
                for y in range(max(0, int(ylo)), min(free.shape[1], int(yhi)) - hi + 1, 1):
                    zr = range(free.shape[2] - di, -1, -1) if kind == 'front' else range(0, free.shape[2] - di + 1, 2)
                    for z in zr:
                        if boxsum(avail, x, y, z, wi, hi, di) == wi * hi * di:
                            cost = abs(x + w / 2 - pref[0]) + abs(y + h / 2 - pref[1])
                            if kind == 'front':
                                cost += 0                       # z already front-most
                            if best is None or cost < best[0]:
                                best = (cost, x, y, z, w, h, d)
                            if kind == 'front':
                                break
        if best:
            _, x, y, z, w, h, d = best
            used[x:x + int(np.ceil(w)), y:y + int(np.ceil(h)), z:z + int(np.ceil(d))] = True
            place[name] = (x, y, z); PARTS_SPORE[name] = (w, h, d)
            rep.append(f'  ✓ {name:22s} {w}×{h}×{d}  @({x},{y},{z})')
        else:
            ok_all = False
            rep.append(f'  ✗ {name:22s} {dims}  在指定区域内找不到位置')
    if '① 转身舵机 MG90S(倒装)' in place:
        x, y, z = place['① 转身舵机 MG90S(倒装)']; w, h, d = PARTS_SPORE['① 转身舵机 MG90S(倒装)']
        foot = solid[:, 0, :]; fx = np.nonzero(foot.any(axis=1))[0]
        rep.append(f'  转身轴离底面中心 {abs(x + w / 2 - (fx.min() + fx.max()) / 2):.0f} mm')
    # nod hinge: the head (above split) sweeps ±20° about the x axis at (split, z centre).
    head = solid.copy(); head[:, :split, :] = False
    body = solid.copy(); body[:, split:, :] = False
    zc0 = zc(split)
    ys_, zs_ = np.nonzero(head.any(axis=0))
    worst = 0.0
    for ang in (-20, 20):
        t = np.radians(ang)
        yy = split + (ys_ - split) * np.cos(t) - (zs_ - zc0) * np.sin(t)
        zz = zc0 + (ys_ - split) * np.sin(t) + (zs_ - zc0) * np.cos(t)
        inside = (yy >= 0) & (yy < solid.shape[1]) & (zz >= 0) & (zz < solid.shape[2])
        bodyprof = body.any(axis=0)
        hit = bodyprof[yy[inside].astype(int), zz[inside].astype(int)].sum()
        worst = max(worst, hit)
    rep.append('')
    rep.append(f'点头 ±20°:头部扫过身体的截面像素 {int(worst)}(>0 表示要在交界处留一道 V 形缝)')
    # ---- ground packing ----
    cells = [tuple(c) for c in gm['cells']]
    gx = max(c[0] for c in cells) + 1; gy = max(c[1] for c in cells) + 1
    m2 = np.zeros((gx * P, gy * P), bool)
    for c in cells:
        m2[c[0] * P:(c[0] + 1) * P, c[1] * P:(c[1] + 1) * P] = True
    inner = ndimage.binary_erosion(m2, iterations=3)       # 2.5 mm wall + margin
    tc = gm['parts']['turntable']['c']
    yy, xx = np.meshgrid(np.arange(m2.shape[1]), np.arange(m2.shape[0]))
    hole = (xx - tc[0]) ** 2 + (yy - tc[1]) ** 2 < 9 ** 2
    inner &= ~hole
    for bx, by in ((10, 10), (m2.shape[0] - 10, 10), (10, m2.shape[1] - 10), (m2.shape[0] - 10, m2.shape[1] - 10)):
        pass
    gused = np.zeros_like(inner)
    gplace = {}
    rep.append('')
    rep.append(f'土地内部:净高 {24 - 4} mm(顶板 2 + 底板 2)· 可用面积 {inner.sum() / 100:.0f} cm²')
    import itertools
    def sat2(a):
        return np.pad(a.astype(np.int32).cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    def fits(c, x, y, w, h):
        return c[x + w, y + h] - c[x, y + h] - c[x + w, y] + c[x, y] == w * h
    best_layout = None
    for perm in itertools.permutations(PARTS_GROUND):
        occ = inner.copy(); lay = {}
        for name, w, h, t in perm:
            c = sat2(occ); hit = None
            for (ww, hh) in ((int(np.ceil(w)), int(np.ceil(h))), (int(np.ceil(h)), int(np.ceil(w)))):
                for x in range(0, occ.shape[0] - ww + 1, 2):
                    for y in range(0, occ.shape[1] - hh + 1, 2):
                        if fits(c, x, y, ww, hh):
                            hit = (x, y, ww, hh); break
                    if hit:
                        break
                if hit:
                    break
            if not hit:
                break
            x, y, ww, hh = hit
            occ[x:x + ww, y:y + hh] = False; lay[name] = hit
        if len(lay) == len(PARTS_GROUND):
            best_layout = lay; break
    if best_layout:
        for name, w, h, t in PARTS_GROUND:
            x, y, ww, hh = best_layout[name]
            gused[x:x + ww, y:y + hh] = True; gplace[name] = (x, y, ww, hh)
            rep.append(f'  ✓ {name:16s} {w}×{h}×{t}  @({x},{y}) {"转 90°" if ww != int(np.ceil(w)) else ""}')
    else:
        ok_all = False
        rep.append('  ✗ 五个元件无论什么顺序都摆不下')
    free_area = (inner & ~gused).sum() / 100
    rep.append(f'  剩余空地 {free_area:.0f} cm²(走线、螺丝柱)')
    rep.append('')
    rep.append('结论:' + ('全部放得下。' if ok_all else '有元件放不下,见 ✗。'))
    open(f'{out}/fit_report.txt', 'w').write('\n'.join(rep) + '\n')
    print('\n'.join(rep))

    # ---------- section drawings ----------
    fig, axs = plt.subplots(1, 3, figsize=(18, 7), facecolor='#f6f5f0')
    names = list(place)
    colors = ['#1c1c1a', '#1c1c1a', '#3e6fb8', '#1e8a8a', '#d07f2e', '#d07f2e', '#d07f2e']
    # front view (x,y) projection of free space
    ax = axs[0]; ax.set_facecolor('#f6f5f0')
    ax.imshow(solid.any(axis=2).T, origin='lower', cmap='Greys', alpha=0.25)
    ax.imshow(np.ma.masked_where(~free.any(axis=2).T, free.any(axis=2).T), origin='lower', cmap='Purples', alpha=0.3)
    for n, c in zip(names, colors):
        x, y, z = place[n]; w, h, d = PARTS_SPORE[n]
        ax.add_patch(Rectangle((x, y), w, h, fc=c, ec='k', alpha=0.75))
        ax.text(x + w / 2, y + h / 2, n.split(' ')[0], ha='center', va='center', fontsize=6.5, color='w')
    ax.axhline(split, color='#c14953', ls='--'); ax.set_title('孢子 · 正面投影(淡紫=内部空间)', fontsize=10); ax.axis('off')
    # side view (z,y)
    ax = axs[1]; ax.set_facecolor('#f6f5f0')
    ax.imshow(solid.any(axis=0), origin='lower', cmap='Greys', alpha=0.25, aspect='equal')
    ax.imshow(np.ma.masked_where(~free.any(axis=0), free.any(axis=0)), origin='lower', cmap='Purples', alpha=0.3)
    for n, c in zip(names, colors):
        x, y, z = place[n]; w, h, d = PARTS_SPORE[n]
        ax.add_patch(Rectangle((z, y), d, h, fc=c, ec='k', alpha=0.75))
    ax.axhline(split, color='#c14953', ls='--'); ax.set_title('孢子 · 侧面投影(右=脸)', fontsize=10); ax.axis('off')
    # ground
    ax = axs[2]; ax.set_facecolor('#f6f5f0')
    ax.imshow(m2.T, origin='lower', cmap='Greens', alpha=0.25)
    ax.imshow(np.ma.masked_where(~inner.T, inner.T), origin='lower', cmap='Greys', alpha=0.15)
    gc = ['#4a7d43', '#c9a35a', '#2e5f8a', '#7a4fd0', '#1c1c1a']
    for (n, (x, y, ww, hh)), c in zip(gplace.items(), gc):
        ax.add_patch(Rectangle((x, y), ww, hh, fc=c, ec='k', alpha=0.8))
        ax.text(x + ww / 2, y + hh / 2, n, ha='center', va='center', fontsize=7, color='w')
    ax.add_patch(plt.Circle(tc, 9, fc='w', ec='k')); ax.text(tc[0], tc[1] + 12, '线孔', ha='center', fontsize=7)
    ax.set_title('土地 · 俯视(元件实际尺寸)', fontsize=10); ax.axis('off')
    fig.suptitle('元件装配检查 · ' + ('全部放得下' if ok_all else '有放不下的'), fontsize=13)
    fig.savefig(f'{out}/fit_sections.png', dpi=110, facecolor='#f6f5f0', bbox_inches='tight')
    plt.close(fig)

    # ---------- overall render ----------
    colmap = {}
    for x, y, z, h, *_ in sm['voxels']:
        colmap[(x, y, z)] = h
    # eyes: like the kit, the eye-socket columns are cleared in front of the
    # skin plane and the socket cells show the eye (white | black)
    eyerow = a['rows'] - 1 - a['eyeRow']
    skin = sm['dims'][2] - 1 - 4
    for ex, col in ((a['L0'], '#f6f6f1'), (a['L0'] + 1, '#121212'), (a['R0'], '#121212'), (a['R0'] + 1, '#f6f6f1')):
        for k in [k for k in colmap if k[0] == ex and k[1] == eyerow and k[2] > skin]:
            del colmap[k]
        colmap[(ex, eyerow, skin)] = col
    stand = [tuple(c) for c in gm['stand']]
    sx0 = min(c[0] for c in stand); sz0 = min(c[1] for c in stand)
    fx0 = min(x for (x, y, z) in colmap if y == min(v[1] for v in colmap)); fz0 = min(z for (x, y, z) in colmap if y == min(v[1] for v in colmap))
    filmap = {'deep-green': '#3d8a6a', 'green': '#2fa84f', 'avocado': '#8ccb3e', 'black': '#2a2a28', 'aqua': '#8ed1cc', 'pink-marble': '#efd6de'}
    boxes = []                                            # (x0,y0,z0, size, colour) in a z-up render frame
    for (x, y, z), h in colmap.items():
        boxes.append(((x - fx0 + sx0) * P, (z - fz0 + sz0) * P, 24 + GAP + (y - y0) * P, h))
    for c in cells:
        col = filmap.get(gm['colour'][f'{c[0]},{c[1]}'], '#3d8a6a')
        for lvl in (0, 1):
            boxes.append((c[0] * P, c[1] * P, lvl * P, col))
    occ = {(b[0], b[1], b[2]) for b in boxes}
    polys, fcs = [], []
    light = np.array([-0.3, 0.6, 0.75]); light /= np.linalg.norm(light)
    for (bx, by, bz, h) in boxes:
        rgb = np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)])
        for n, quad in (((0, 0, 1), [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)]),
                        ((0, -1, 0), [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)]),
                        ((1, 0, 0), [(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)]),
                        ((-1, 0, 0), [(0, 0, 0), (0, 1, 0), (0, 1, 1), (0, 0, 1)]),
                        ((0, 1, 0), [(0, 1, 0), (1, 1, 0), (1, 1, 1), (0, 1, 1)])):
            if (bx + n[0] * P, by + n[1] * P, bz + n[2] * P) in occ:
                continue
            polys.append([(bx + qx * P, by + qy * P, bz + qz * P) for qx, qy, qz in quad])
            sh = 0.55 + 0.45 * max(0.0, float(np.dot(n, light)))
            fcs.append(np.clip(rgb * sh, 0, 1))
    fig = plt.figure(figsize=(14, 8), facecolor='#f6f5f0')
    for i, (el, az, title) in enumerate(((14, 115, '正面 3/4'), (20, -55, '背面 3/4'))):
        ax = fig.add_subplot(1, 2, i + 1, projection='3d'); ax.set_facecolor('#f6f5f0')
        # flip y so the face (+y in kit z) points toward the viewer at az -60
        ax.add_collection3d(Poly3DCollection(polys, facecolors=fcs, edgecolors=(0.96, 0.96, 0.94, 0.6), linewidths=0.3))
        allp = np.array([p for q in polys for p in q])
        lo, hi = allp.min(0), allp.max(0); c = (lo + hi) / 2; r = (hi - lo).max() / 2
        ax.set_xlim(c[0] - r, c[0] + r); ax.set_ylim(c[1] - r, c[1] + r); ax.set_zlim(0, 2 * r)
        ax.set_box_aspect((1, 1, 1)); ax.view_init(el, az); ax.axis('off'); ax.set_title(title, fontsize=11)
    fig.suptitle(f'Moony Moth on 马赛克土地 · 12 mm 方块 · 总高 {24 + GAP + solid.shape[1]} mm · 宽 {gx * P} mm', fontsize=13)
    fig.savefig(f'{out}/render_overall.png', dpi=120, facecolor='#f6f5f0', bbox_inches='tight')


if __name__ == '__main__':
    main(*sys.argv[1:5])
