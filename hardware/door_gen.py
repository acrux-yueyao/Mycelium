#!/usr/bin/env python3
"""
MC04-D back door — the cavity's back wall as a removable mosaic panel.

Fills the 5×6 core-cavity opening in the body's back layer (z = cavity
back) flush with the surrounding cubes. Outer face: 30 tile faces in
the colours of their skin columns (grooves between them, other colours
as flush inlays). Inside: a hollow box (battery lies in it) with four
Ø6 standoffs that carry the face board at the right depth behind the
skin. Held by 8 magnets (no pins: it slides in from the back) on the 8 door-anchor cubes of the ring
(kit_cubes marks them; same polarity rule as every cube face).

Built in the cube mesh frame (x, front, up) so it prints and mirrors
exactly like the cubes. Prints outer face DOWN, no supports.

Usage: python3 hardware/door_gen.py <base.json> <variants_dir> <out_dir> [post_trim_mm]
Writes door_body_<colour>.stl, door_tiles_<colour>.stl, door_preview.png
"""
import json
import os
import sys

import numpy as np
import trimesh
from trimesh.creation import box, cylinder
from trimesh.transformations import translation_matrix as TM, rotation_matrix as RM

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from brick_lib import MAG_R, MAG_D, NUB_R, NUB_H, DIM_R, DIM_D, OFF
from kit_cubes import load_filaments, _lab, POLE

P = 12.0
CLR = 0.2            # door-to-ring clearance per side
WALL, BACK = 1.6, 1.6
BOSS = 1.6           # local thickening behind each magnet pocket
TILE_GAP, GROOVE = 0.6, 0.4
INLAY_D = 0.5
BOARD_FRONT_GAP = 4.5 + 0.8     # XIAO USB-C height + board thickness (board bottom this far behind the skin)
# extra room in front of the board, shortening the standoffs by as much: the modules on the board front
# (ToF, mic, PH sockets with their leads) stand taller than the XIAO's USB-C (argv[4], mm)
# 'flush': the board sits right on the door's rim — the standoffs end inside the door box and the
# screws come in from the OUTER face (counterbored, hidden under a mosaic tile, nut on the board front)
# 'holes': no standoffs at all — four M2 through-holes in the back (a 2 mm ring inside so the sunk head
# keeps some wall); the board hangs on the screws themselves (nuts set its height)
# 'pod': a deeper back pod instead of a flat door — the ring part is the same, behind it the box grows
# POD_EXT mm outward and down to the base, so the board sits lower (room for a USB-C plug above the
# XIAO) with its cable leaving through a slot in the back. The board hangs on short posts.
POD = len(sys.argv) > 4 and sys.argv[4] in ('pod', 'podbase')
# 'podbase': pod and base in one print — the pod reaches the floor and a flat plate runs forward under
# the body (no recess: the body slides back onto it as the pod goes into the ring), with side rails
PODBASE = len(sys.argv) > 4 and sys.argv[4] == 'podbase'
POD_EXT, POD_BOTTOM = 24.0, (0.0 if PODBASE else 2.7)   # extra depth behind the ring; pod floor height
PLATE_T, RAIL_H, RAIL_W = 3.0, 3.0, 2.0
POD_BOARD_BACK = 14.0                    # board back this far in front of the pod's back face
POD_DROP = 12.0                          # board sits this much lower than in the cavity
FLUSH = len(sys.argv) > 4 and sys.argv[4] in ('flush', 'holes')
NOPOST = len(sys.argv) > 4 and sys.argv[4] == 'holes'
POST_TRIM = 0.0 if FLUSH or POD or len(sys.argv) <= 4 else float(sys.argv[4])
SCREW_R, HEAD_R = 1.1, 2.15        # M2 clearance hole, pan-head counterbore


def B(x0, y0, z0, x1, y1, z1):
    return box(extents=[x1 - x0, y1 - y0, z1 - z0], transform=TM([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]))


def cyl(axis, c, r, h0, h1):
    """cylinder along `axis` through point c (other two coords) from h0 to h1."""
    m = cylinder(radius=r, height=h1 - h0, sections=32)
    if axis == 0:
        m.apply_transform(RM(np.pi / 2, [0, 1, 0])); m.apply_transform(TM([(h0 + h1) / 2, c[0], c[1]]))
    elif axis == 1:
        m.apply_transform(RM(np.pi / 2, [1, 0, 0])); m.apply_transform(TM([c[0], (h0 + h1) / 2, c[1]]))
    else:
        m.apply_transform(TM([c[0], c[1], (h0 + h1) / 2]))
    return m


def main(base, vdir, out):
    meta = json.load(open(base)); man = json.load(open(f'{vdir}/kit_manifest.json'))
    os.makedirs(out, exist_ok=True)
    tx, ty = meta['zone']['tx'], meta['zone']['ty']
    Z = meta['dims'][2]; SKIN = Z - 1 - 4
    K = {(c['x'], c['y'], c['z']): c for c in man['cells']}
    zb = min(z for (x, y, z) in K if tx + 1 <= x <= tx + 5 and ty + 1 <= y <= ty + 6) - 0  # ring back layer
    zb = min(z for (x, y, z) in K if (x in (tx, tx + 6)) and ty + 1 <= y <= ty + 6)
    # door volume in mesh frame: x, y=front (creature z), z=up (creature y)
    x0, x1 = (tx + 1) * P + CLR, (tx + 6) * P - CLR
    z0, z1 = (ty + 1) * P + CLR, (ty + 7) * P - CLR
    y0, y1 = zb * P, (zb + 1) * P                       # back face at y0, open toward +y
    yo = y0 - POD_EXT if POD else y0                    # outer (back) face
    if POD:
        body = trimesh.boolean.union([B(x0, y0, z0, x1, y1, z1), B(x0, yo, POD_BOTTOM, x1, y0 + 0.01, z1)])
        body = trimesh.boolean.difference([body, B(x0 + WALL, y0 - 1, z0 + WALL, x1 - WALL, y1 + 1, z1 - WALL),
                                           B(x0 + WALL, yo + BACK, POD_BOTTOM + WALL, x1 - WALL, y0 + 0.5, z1 - WALL)])
    else:
        body = B(x0, y0, z0, x1, y1, z1)
        body = trimesh.boolean.difference([body, B(x0 + WALL, y0 + BACK, z0 + WALL, x1 - WALL, y1 + 1, z1 - WALL)])
    cuts, adds = [], []
    # ---- tiles on the outer face (y0): grooves + colour inlays
    fil = load_filaments(); flab = np.array([_lab(f['hex']) for f in fil])
    def snap(h):
        return fil[int(((flab - np.array(_lab(h))) ** 2).sum(1).argmin())]
    tiles = {}
    for x in range(tx + 1, tx + 6):
        for y in range(ty + 1, ty + 7):
            col = next((K[(x, y, z)] for z in range(SKIN, SKIN + 3) if (x, y, z) in K), None)
            hexc = man['colors'][col['ci']] if col else man['colors'][0]
            tiles[(x, y)] = snap(hexc)['id']
    dom = max(set(tiles.values()), key=list(tiles.values()).count)
    cxm, czm = (tx + 3.5) * P, (ty + 4) * P
    HOLES = ((cxm - 20, czm - 23), (cxm + 20, czm - 23), (cxm - 20, czm + 32), (cxm + 20, czm + 32))
    cover = {(int((hx + dx) // P), int((hz + dz) // P)) for hx, hz in HOLES       # every tile a screw head touches
             for dx in (-HEAD_R, HEAD_R) for dz in (-HEAD_R, HEAD_R)} if FLUSH else set()
    for (x, y), fid in tiles.items():
        cx0, cx1 = x * P + TILE_GAP / 2, (x + 1) * P - TILE_GAP / 2
        cz0, cz1 = y * P + TILE_GAP / 2, (y + 1) * P - TILE_GAP / 2
        if fid != dom or (x, y) in cover:
            cuts.append(B(cx0 - 0.08, yo - 1, cz0 - 0.08, cx1 + 0.08, yo + INLAY_D, cz1 + 0.08))   # pocket
    # grooves between tiles (both directions) on the outer face
    zb0 = POD_BOTTOM if POD else z0
    for x in range(tx + 1, tx + 7):
        cuts.append(B(x * P - TILE_GAP / 2, yo - 1, zb0 - 1, x * P + TILE_GAP / 2, yo + GROOVE, z1 + 1))
    for y in range(int(zb0 // P) + 1 if POD else ty + 1, ty + 8):
        cuts.append(B(x0 - 1, yo - 1, y * P - TILE_GAP / 2, x1 + 1, yo + GROOVE, y * P + TILE_GAP / 2))
    # finger notch, bottom edge centre of the outer face
    mx = (x0 + x1) / 2
    if not POD:
        cuts.append(B(mx - 7, y0 - 1, z0 - 1, mx + 7, y0 + 3.0, z0 + 2.5))
    # ---- door anchors: pocket + pins/dimples on the side walls toward the ring cubes
    anchors = [c for c in man['cells'] if c.get('tag') == 'door']
    from seq_plates import build_order
    for i, cc in enumerate(build_order(man['cells'])[0]):
        cc['seq'] = i + 1
    ym = (y0 + y1) / 2                                  # cube-face centre depth
    adds = []
    for c in anchors:
        face = tuple(c['door_face'])
        if face[0] == 0:
            door_face = (0, not face[1])                # door's own face key
            xw = x0 if door_face[1] is False else x1    # wall plane
            cz = (c['y'] + 0.5) * P
            inner = xw + (WALL + BOSS) if door_face == (0, False) else xw - (WALL + BOSS)
            adds.append(B(min(xw, inner), y0, cz - 3.5, max(xw, inner), y1, cz + 3.5))
            sgn = -1 if door_face == (0, False) else 1          # outward normal direction
            pocket_h = (xw, xw - sgn * MAG_D)                   # from wall plane inward
            cuts.append(cyl(0, (ym, cz), MAG_R, min(pocket_h) - (1 if sgn < 0 else 0), max(pocket_h) + (1 if sgn > 0 else 0)))
        else:
            door_face = (2, not face[1])
            zw = z0 if door_face[1] is False else z1
            cx = (c['x'] + 0.5) * P
            inner = zw + (WALL + BOSS) if door_face == (2, False) else zw - (WALL + BOSS)
            adds.append(B(cx - 3.5, y0, min(zw, inner), cx + 3.5, y1, max(zw, inner)))
            sgn = -1 if door_face == (2, False) else 1
            pocket_h = (zw, zw - sgn * MAG_D)
            cuts.append(cyl(2, (cx, ym), MAG_R, min(pocket_h) - (1 if sgn < 0 else 0), max(pocket_h) + (1 if sgn > 0 else 0)))
    # ---- board standoffs: board holes are 40×55 about the cavity centre
    skin_rear = SKIN * P
    board_bottom = y1 if FLUSH else skin_rear - BOARD_FRONT_GAP - POST_TRIM
    if POD:
        board_bottom = yo + POD_BOARD_BACK
        HOLES = tuple((hx, hz - POD_DROP) for hx, hz in HOLES)
        # cable slot high in the back: the plug turns back above the board and leaves straight out
        cuts.append(B(mx - 8, yo - 1, z1 - WALL - 11, mx + 8, yo + BACK + 1, z1 - WALL - 1))
    if PODBASE:
        foot = [(c['x'], c['z']) for c in man['cells'] if c['y'] == 0]
        fx0, fx1 = min(x for x, _ in foot) * P, (max(x for x, _ in foot) + 1) * P
        fz1 = (max(z for _, z in foot) + 1) * P
        adds.append(B(min(x0, fx0 - RAIL_W) - 0.01, yo, -PLATE_T, max(x1, fx1 + RAIL_W), fz1 + 4, 0.01))   # plate
        for xa, xb in ((fx0 - 0.3 - RAIL_W, fx0 - 0.3), (fx1 + 0.3, fx1 + 0.3 + RAIL_W)):                # rails
            adds.append(B(xa, zb * P - 0.01, -0.01, xb, fz1 + 4, RAIL_H))
        for c in man['cells']:                                                    # under the speaker grille
            if c['y'] == 0 and c['code'][0] == 'G':
                cuts.append(cyl(2, ((c['x'] + 0.5) * P, (c['z'] + 0.5) * P), 4.5, -PLATE_T - 1, 1))
    for hx, hz in HOLES:
        adds.append(cyl(1, (hx, hz), 3.0, yo + BACK - 0.01, yo + BACK + 2.0 if NOPOST else board_bottom))
        if FLUSH:                                   # through hole, head sunk below the tile pocket
            cuts.append(cyl(1, (hx, hz), SCREW_R, y0 - 1, y1 + 1))
            cuts.append(cyl(1, (hx, hz), HEAD_R, y0 - 1, y0 + INLAY_D + 1.5))
        else:
            cuts.append(cyl(1, (hx, hz), 0.85, board_bottom - 6, board_bottom + 1))
    door = trimesh.boolean.union([body] + adds)
    door = trimesh.boolean.difference([door] + cuts)
    assert door.is_watertight
    # inlay tiles per colour (flush: thickness = pocket depth)
    tile_meshes = {}
    for (x, y), fid in tiles.items():
        if fid == dom and (x, y) not in cover:
            continue
        cx0, cx1 = x * P + TILE_GAP / 2, (x + 1) * P - TILE_GAP / 2
        cz0, cz1 = y * P + TILE_GAP / 2, (y + 1) * P - TILE_GAP / 2
        tile_meshes.setdefault(fid, []).append(B(cx0, 0, cz0, cx1, INLAY_D, cz1))
    # export: door printed outer face down → rotate so -y (outer) becomes -z
    R = RM(-np.pi / 2, [1, 0, 0])                       # y → z ... maps -y to +z? check: (0,-1,0)→(0,0,1)
    R = RM(np.pi / 2, [1, 0, 0])                        # (0,-1,0) → (0,0,-1): outer face down
    d = door.copy(); d.apply_transform(R); lo = d.bounds[0]; d.apply_transform(TM(-lo))
    d.export(f'{out}/door_body_{dom}.stl')
    for fid, ms in tile_meshes.items():          # tiles print flat, coloured face up
        t = trimesh.util.concatenate(ms); t.apply_transform(RM(-np.pi / 2, [1, 0, 0]))
        t.apply_transform(TM(-t.bounds[0])); t.export(f'{out}/door_tiles_{fid}.stl')
    spec = {'outer_mm': [round(x1 - x0, 1), round(z1 - z0, 1), round(y1 - y0, 1)], 'dominant': dom,
            'tiles': {f'{x},{y}': fid for (x, y), fid in tiles.items()}, 'anchors': len(anchors),
            'standoff_mm': 0 if NOPOST else round(board_bottom - (yo + BACK), 1)}
    json.dump(spec, open(f'{out}/door_spec.json', 'w'), indent=1)
    print(f"door {spec['outer_mm']} mm · body {dom} · inlays {dict((f, len(m)) for f, m in tile_meshes.items())} · "
          f"anchors {len(anchors)} · standoffs {spec['standoff_mm']} mm · {door.volume/1000*1.24:.0f} g")
    # preview: outer face
    import matplotlib
    matplotlib.use('Agg')
    matplotlib.rcParams['font.family'] = 'monospace'
    matplotlib.rcParams['font.monospace'] = ['Noto Sans Mono CJK SC', 'DejaVu Sans Mono']
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle, Circle
    fig, ax = plt.subplots(1, 2, figsize=(11, 6), facecolor='#f6f5f0')
    for a in ax:
        a.set_facecolor('#f6f5f0'); a.set_aspect('equal'); a.axis('off')
    fh = {f['id']: f['hex'] for f in fil}
    for (x, y), fid in tiles.items():            # seen from BEHIND: kit x grows to the builder's right
        ax[0].add_patch(Rectangle((x, y), 1, 1, fc=fh[fid], ec='#1c1c1a', lw=0.6))
    for c in anchors:
        ax[0].add_patch(Circle((c['x'] + 0.5, c['y'] + 0.5), 0.3, fc='none', ec='#c14953', lw=2))
        ax[0].text(c['x'] + 0.5, c['y'] + 0.5, str(c.get('seq', '')), ha='center', va='center', fontsize=7, color='#c14953')
    ax[0].set_xlim(tx - 0.5, tx + 7.5); ax[0].set_ylim(ty - 0.5, ty + 8.5)
    ax[0].text(tx - 0.4, ty - 0.3, '← 你的左手', fontsize=8, color='#6d6a62')
    ax[0].text(tx + 7.4, ty - 0.3, '你的右手 →', fontsize=8, color='#6d6a62', ha='right')
    ax[0].set_title('门板外面(站在机器人背后看)· 红圈+序号=周围 8 颗锚定方块', fontsize=9)
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection
    ax[1].remove(); ax3 = fig.add_subplot(122, projection='3d'); ax3.set_facecolor('#f6f5f0')
    light = np.array([0.3, -0.5, 0.8]); light /= np.linalg.norm(light)
    sh = 0.5 + 0.5 * np.clip(d.face_normals @ light, 0, 1)
    ax3.add_collection3d(Poly3DCollection(d.vertices[d.faces], facecolors=np.clip(np.array([0.45, 0.6, 0.85])[None] * sh[:, None], 0, 1), edgecolors='none'))
    lo, hi = d.bounds; cc = (lo + hi) / 2; r = max(hi - lo) / 2 + 2
    ax3.set_xlim(cc[0] - r, cc[0] + r); ax3.set_ylim(cc[1] - r, cc[1] + r); ax3.set_zlim(cc[2] - r, cc[2] + r)
    ax3.set_box_aspect((1, 1, 1)); ax3.view_init(35, -60); ax3.axis('off'); ax3.set_title('打印姿态(外面朝下)· 内侧:4 根板柱 + 8 个磁铁座', fontsize=9)
    fig.savefig(f'{out}/door_preview.png', dpi=120, facecolor='#f6f5f0', bbox_inches='tight')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3])
