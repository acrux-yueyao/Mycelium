#!/usr/bin/env python3
"""
磁袋校准件 —— 量出这台打印机在三种朝向下的实际孔径偏差。

同一个 Ø4.3 的坑,朝上打、贴板打、侧面打,出来的尺寸能差 0.3mm:
朝上的最准,贴板的因为象脚被挤小,侧面的因为横向孔顶部塌垂而偏小偏椭。
所以设计值不能一刀切,要按朝向分别补偿。

这个件在一次打印里同时提供三组坑,每组 5 个直径(4.3 → 4.7,步进 0.1),
坑旁边的凹点数量 = 序号(1 点 = 4.3,5 点 = 4.7)。

用法:
  python3 hardware/magnet_gauge.py out_dir
  平放打印(不用支撑),然后拿 Ø4×2 磁铁逐个试,
  记下每组"第一个能不费力塞到底、且不松动"的序号,告诉我数字即可。

Deps: trimesh + manifold3d
"""
import sys

import numpy as np
import trimesh
from trimesh.creation import box, cylinder
from trimesh.transformations import translation_matrix as TM, rotation_matrix as RM

DIAS = [4.3, 4.4, 4.5, 4.6, 4.7]     # 待测直径
DEPTH = 2.2                          # 坑深(磁铁 2.0 + 0.2)
PITCH = 12.0                         # 坑间距
L, W, H = len(DIAS) * PITCH, 16.0, 12.0


def B(x0, y0, z0, x1, y1, z1):
    return box(extents=[x1 - x0, y1 - y0, z1 - z0],
               transform=TM([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]))


def pocket(cx, cy, cz, dia, axis, positive):
    """一个磁袋:圆柱 + 入口 45° 导角(导角让稍紧的孔也能自对中)。"""
    r = dia / 2
    parts = []
    cyl = cylinder(radius=r, height=DEPTH + 2, sections=48)
    cone = trimesh.creation.cone(radius=r + 0.45, height=0.45, sections=48)
    if axis == 2:                                    # 上下面
        z = cz + (DEPTH + 2) / 2 - DEPTH if positive else cz - (DEPTH + 2) / 2 + DEPTH
        cyl.apply_transform(TM([cx, cy, z]))
        c = cone.copy()
        if positive:
            c.apply_transform(RM(np.pi, [1, 0, 0]))
            c.apply_transform(TM([cx, cy, cz + 0.45]))
        else:
            c.apply_transform(TM([cx, cy, cz - 0.45]))
        parts += [cyl, c]
    else:                                            # 侧面(+y)
        cyl.apply_transform(RM(np.pi / 2, [1, 0, 0]))
        cyl.apply_transform(TM([cx, cy - (DEPTH + 2) / 2 + DEPTH, cz]))
        c = cone.copy()
        c.apply_transform(RM(-np.pi / 2, [1, 0, 0]))
        c.apply_transform(TM([cx, cy - 0.45, cz]))
        parts += [cyl, c]
    return trimesh.boolean.union(parts)


def dots(cx, cy, cz, n, axis, positive):
    """序号凹点:n 个 Ø1.2 深 0.5 的小坑,排成一行。"""
    out = []
    for k in range(n):
        off = (k - (n - 1) / 2) * 1.8
        d = cylinder(radius=0.6, height=1.4, sections=16)
        if axis == 2:
            z = cz - 0.2 if positive else cz + 0.2
            d.apply_transform(TM([cx + off, cy, z]))
        else:
            d.apply_transform(RM(np.pi / 2, [1, 0, 0]))
            d.apply_transform(TM([cx + off, cy - 0.2, cz + 0]))
        out.append(d)
    return trimesh.boolean.union(out)


def main(out):
    m = B(0, 0, 0, L, W, H)
    for i, dia in enumerate(DIAS):
        x = PITCH / 2 + i * PITCH
        # A 组:朝上
        m = trimesh.boolean.difference([m, pocket(x, 5.0, H, dia, 2, True)])
        m = trimesh.boolean.difference([m, dots(x, 5.0, H, i + 1, 2, True)])
        # B 组:贴板(朝下)
        m = trimesh.boolean.difference([m, pocket(x, 5.0, 0, dia, 2, False)])
        m = trimesh.boolean.difference([m, dots(x, 5.0, 0, i + 1, 2, False)])
        # C 组:侧面(+y 面)
        m = trimesh.boolean.difference([m, pocket(x, W, H / 2, dia, 1, True)])
        m = trimesh.boolean.difference([m, dots(x, W, H / 2 - 4.2, i + 1, 1, True)])
    m.fix_normals()
    assert m.is_watertight, '非水密'
    m.export(f'{out}/magnet_gauge.stl')
    print(f'magnet_gauge  {L:.0f}×{W:.0f}×{H:.0f} mm  水密={m.is_watertight} '
          f'面={len(m.faces)}')
    print('A组=顶面朝上 · B组=底面贴板 · C组=侧面 · 点数即序号(1→4.3 … 5→4.7)')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
