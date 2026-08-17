#!/usr/bin/env python3
"""
MC02-AB clearance audit — every part as a 3D box, pairwise checked.

Frame: x along columns (mm, col c centre = (c-1)*2.54), y along rows,
z above the board surface. Module PCBs ride their header spacers at
z 2.5-6.5; the XIAO slab rides its sockets at 8.5-12.5; bus wires hug
the surface. J1-J5 must be RIGHT-ANGLE headers pointing off the board
edge (a vertical dupont housing is ~14mm tall and would not clear the
cavity). Run after any layout change; exits non-zero on overlap.
"""
import itertools
import sys


def X(c):
    return (c - 1) * 2.54


def Y(r):
    return (r - 1) * 2.54


# name: (x0, x1, y0, y1, z0, z1)
PARTS = {
    'XIAO插座列6':   (X(6) - 1.3, X(6) + 1.3, Y(17) - 1.3, Y(23) + 1.3, 0, 8.5),
    'XIAO插座列12':  (X(12) - 1.3, X(12) + 1.3, Y(17) - 1.3, Y(23) + 1.3, 0, 8.5),
    'XIAO本体':      (X(6) - 1.3, X(12) + 1.3, Y(17) - 2.9, Y(23) + 2.9, 8.5, 12.5),
    'MPU6050体':     (X(11) - 1.3, X(18) + 1.3, Y(16) - 15.4, Y(16) + 1.0, 2.5, 6.0),
    'MAX98357体':    (X(12) - 1.3, X(18) + 1.3, Y(3) - 1.0, Y(3) + 15.4, 2.5, 6.5),
    'MPR121体':      (X(2) - 1.3, X(2) + 20.3, Y(9.5) - 15.3, Y(9.5) + 15.3, 2.5, 6.0),
    '母线区':        (X(8) - 0.6, X(11) + 0.6, Y(3) - 0.6, Y(15) + 0.6, 0, 1.0),
    'J2弯针壳(下出)': (X(2) - 1.3, X(6) + 1.3, Y(2) - 9, Y(2) + 1.3, 0, 7.0),
    'J5弯针壳(下出)': (X(11) - 1.3, X(13) + 1.3, Y(2) - 9, Y(2) + 1.3, 0, 7.0),
    'J4弯针壳(下出)': (X(15) - 1.3, X(16) + 1.3, Y(2) - 9, Y(2) + 1.3, 0, 7.0),
    'J3弯针壳(左出)': (X(2) - 9, X(2) + 1.3, Y(17) - 1.3, Y(22) + 1.3, 0, 7.0),
    'J1弯针壳(上出)': (X(15) - 1.3, X(18) + 1.3, Y(23) - 1.3, Y(23) + 9, 0, 7.0),
}
BOARD_TOP_CLEAR = 12.9      # cavity front − board surface (boss 6.5 stack)


def overlap(a, b):
    v = 1.0
    for i in range(3):
        lo = max(a[2 * i], b[2 * i])
        hi = min(a[2 * i + 1], b[2 * i + 1])
        if hi - lo <= 0.05:                     # touching ≠ colliding
            return 0.0
        v *= hi - lo
    return v


def main():
    bad = 0
    for (na, a), (nb, b) in itertools.combinations(PARTS.items(), 2):
        v = overlap(PARTS[na], PARTS[nb]) if isinstance(a, tuple) else 0
        if v > 0:
            print(f'✗ {na} × {nb}: 交叠 {v:.0f} mm3')
            bad += 1
    for name, p in PARTS.items():
        if p[5] > BOARD_TOP_CLEAR:
            print(f'✗ {name} 高 {p[5]} > 腔内净空 {BOARD_TOP_CLEAR}')
            bad += 1
    hi = max(p[5] for p in PARTS.values())
    print(f'{"全部无碰撞" if bad == 0 else f"{bad} 处碰撞"} · 最高件 {hi}mm '
          f'/ 净空 {BOARD_TOP_CLEAR}mm(余量 {BOARD_TOP_CLEAR - hi:.1f})')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
