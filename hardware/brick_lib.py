#!/usr/bin/env python3
"""
Stud-coupling brick library — 12 mm pitch, FDM-tuned.

LEGO-style clutch made printable by CRUSH RIBS: the socket side grips studs
through thin vertical ribs at deliberate 0.15 mm interference — the first
insertion crushes them into a perfect per-printer fit. Tune TUNE by ±0.1 if
the test coupon is too tight/loose, reprint the coupon only.

Geometry (pitch P=12):
  stud     Ø6.0 × h2.4, on 12 mm centres
  body     wall 1.6 · top plate 2.4 · brick height 12 (cube module)
  2×2+     inner tubes Ø10.9/Ø6.4 grip 4 studs (LEGO-style)
  1×N      side ribs grip the stud between the two long walls
  ribs     3 per contact, 0.6 wide, 0.15 interference (crush)

Usage: python3 hardware/brick_lib.py out_dir   → test coupons
Import: from brick_lib import brick            → kit generators
"""
import math
import sys

import numpy as np
import trimesh
from trimesh.creation import box, cylinder
from trimesh.transformations import translation_matrix as TM

P = 12.0          # pitch
STUD_D = 6.0
STUD_H = 2.4
WALL = 1.6
TOP = 2.4
H = 12.0          # brick height (cube module)
TUNE = 0.0        # global fit trim: + looser, - tighter
CRUSH = 0.15      # rib interference


def U(parts):
    return trimesh.boolean.union(parts)


def D(a, b):
    return trimesh.boolean.difference([a, b])


def B(x0, y0, z0, x1, y1, z1):
    return box(extents=[x1-x0, y1-y0, z1-z0],
               transform=TM([(x0+x1)/2, (y0+y1)/2, (z0+z1)/2]))


def CYL(cx, cy, z0, z1, r, seg=48):
    c = cylinder(radius=r, height=z1-z0, sections=seg)
    c.apply_transform(TM([cx, cy, (z0+z1)/2]))
    return c


def TUBE(cx, cy, z0, z1, r_out, r_in, seg=48):
    return D(CYL(cx, cy, z0, z1, r_out, seg), CYL(cx, cy, z0-1, z1+1, r_in, seg))


def brick(L, W, height=H):
    """L×W modules, studs on top, gripping cavity underneath."""
    parts = []
    lx, ly = L*P, W*P
    body = B(0, 0, 0, lx, ly, height)
    body = D(body, B(WALL, WALL, -0.1, lx-WALL, ly-WALL, height-TOP))
    parts.append(body)
    for i in range(L):                                   # studs
        for j in range(W):
            parts.append(CYL(i*P + P/2, j*P + P/2, height, height+STUD_H, STUD_D/2))
    cav_top = height - TOP
    if L >= 2 and W >= 2:                                # interior tubes
        r_out = (P*math.sqrt(2) - STUD_D)/2 - TUNE       # ≈5.45 grips 4 studs
        for i in range(1, L):
            for j in range(1, W):
                parts.append(TUBE(i*P, j*P, 0, cav_top, r_out, STUD_D/2 + 0.2))
    elif L == 1 or W == 1:                               # rib grip for thin bricks
        n = max(L, W)
        along_x = L >= W
        gap = P - 2*WALL                                 # 8.8 between walls
        rib = (gap - STUD_D)/2 + CRUSH - TUNE            # ≈1.55 interference
        for k in range(n):
            c = k*P + P/2
            for third in (-1, 0, 1):                     # 3 ribs per contact
                off = third * 2.2
                if along_x:
                    parts.append(B(c+off-0.3, WALL, 0, c+off+0.3, WALL+rib, cav_top))
                    parts.append(B(c+off-0.3, ly-WALL-rib, 0, c+off+0.3, ly-WALL, cav_top))
                else:
                    parts.append(B(WALL, c+off-0.3, 0, WALL+rib, c+off+0.3, cav_top))
                    parts.append(B(lx-WALL-rib, c+off-0.3, 0, lx-WALL, c+off+0.3, cav_top))
    m = U(parts)
    m.fix_normals()
    return m


def _dome(face_axis, positive, cx, cy, pitch, dome=True):
    """Spherical-cap shear lock, interference-free.

    dome=True : cap 0.5 proud, base O3.4 — built as sphere INTERSECTED
                with the outside half-space, so no underground body ever
                touches neighbouring faces or the magnet pocket.
    dome=False: dimple 0.9 deep — sphere centred OUTSIDE the face, only
                a shallow lens (lateral r2.3) enters the material.
    Diagonal offsets (cx, cy) of +-3.5 keep both clear of edges (2.5mm)
    and of the centre pocket (4.95mm > 4.45 needed)."""
    h = pitch / 2
    if dome:
        sp = trimesh.creation.icosphere(subdivisions=2, radius=3.2)
        along = (pitch - 2.7) if positive else 2.7
        slab_lo = pitch if positive else -2
        slab_hi = pitch + 2 if positive else 0
    else:
        sp = trimesh.creation.icosphere(subdivisions=2, radius=3.4)
        along = (pitch + 2.5) if positive else -2.5
    if face_axis == 0:
        sp.apply_transform(TM([along, h + cx, h + cy]))
        if dome:
            sp = trimesh.boolean.intersection([sp, B(slab_lo, -20, -20, slab_hi, 40, 40)])
    elif face_axis == 1:
        sp.apply_transform(TM([h + cx, along, h + cy]))
        if dome:
            sp = trimesh.boolean.intersection([sp, B(-20, slab_lo, -20, 40, slab_hi, 40)])
    else:
        sp.apply_transform(TM([h + cx, h + cy, along]))
        if dome:
            sp = trimesh.boolean.intersection([sp, B(-20, -20, slab_lo, 40, 40, slab_hi)])
    return sp


def mosaic_cube(pitch=P):
    """Flat-faced mosaic voxel, 12 mm: magnets on +x/+y/+z faces, steel
    discs on -x/-y/-z (polarity-free: magnet always meets steel), diagonal
    nub/dimple pairs lock shear. All cubes assemble in ONE orientation —
    the voxel grid's own logic. Pockets are face-open; glue inserts flush.
    """
    c = B(0, 0, 0, pitch, pitch, pitch)
    h = pitch/2
    MAG_R, MAG_D = 2.15, 2.1     # O4.3 x 2.1 pocket for O4x2 magnet
    STL_R, STL_D = 2.65, 0.7     # O5.3 x 0.7 pocket for O5x0.5 steel disc
    NUB_R, NUB_H = 1.2, 0.5
    DIM_R, DIM_D = 1.45, 0.65
    OFF = 3.5                     # diagonal nub offset

    def face_cyl(axis, positive, r, depth, cx=0.0, cy=0.0, add=False):
        """cylinder on a face: axis 0/1/2; (cx,cy) offsets in the face plane.
        add=True → protruding nub; add=False → pocket cut exactly `depth`
        into the face (overshoots outward for a clean boolean)."""
        if add:
            hgt = depth + 0.02
            pos = pitch + depth/2 if positive else -depth/2
        else:
            hgt = depth + 2
            pos = (pitch - depth/2 + 1) if positive else (depth/2 - 1)
        cyl = cylinder(radius=r, height=hgt, sections=32)
        if axis == 0:
            cyl.apply_transform(trimesh.transformations.rotation_matrix(math.pi/2, [0, 1, 0]))
            cyl.apply_transform(TM([pos, h+cx, h+cy]))
        elif axis == 1:
            cyl.apply_transform(trimesh.transformations.rotation_matrix(math.pi/2, [1, 0, 0]))
            cyl.apply_transform(TM([h+cx, pos, h+cy]))
        else:
            cyl.apply_transform(TM([h+cx, h+cy, pos]))
        return cyl

    # DUAL-MAGNET: every face gets a magnet pocket. Polarity convention:
    # +faces glued N-out, -faces glued S-out (load from opposite stack ends).
    for axis in range(3):
        c = D(c, face_cyl(axis, True, MAG_R, MAG_D))
        c = D(c, face_cyl(axis, False, MAG_R, MAG_D))
        for s_ in (+OFF, -OFF):
            c = U([c, _dome(axis, True, s_, s_, pitch, dome=True)])
            c = D(c, _dome(axis, False, s_, s_, pitch, dome=False))
    c.fix_normals()
    return c


def window_cube(pitch=P):
    """Hollow through-cube for eye/ToF cells — thin 1.6 walls keep the
    8.8 window; each side pocket gets a LOCAL internal boss (6 wide,
    1.4 proud) so a full 2mm magnet still seats with a 0.9 floor. The
    four bosses read as small mid-edge steps inside the light tunnel."""
    c = B(0, 0, 0, pitch, pitch, pitch)
    c = D(c, B(1.6, -1, 1.6, pitch-1.6, pitch+1, pitch-1.6))
    h = pitch/2
    MAG_R, MAG_D = 2.15, 2.1
    for axis in (0, 2):
        for positive in (True, False):
            # boss behind the pocket
            if axis == 0:
                bx = (pitch-3.0, pitch-1.6) if positive else (1.6, 3.0)
                c = U([c, B(bx[0], h-3, h-3, bx[1], h+3, h+3)])
            else:
                bz = (pitch-3.0, pitch-1.6) if positive else (1.6, 3.0)
                c = U([c, B(h-3, h-3, bz[0], h+3, h+3, bz[1])])
            cyl = cylinder(radius=MAG_R, height=MAG_D+2, sections=32)
            pos = (pitch - MAG_D/2 + 1) if positive else (MAG_D/2 - 1)
            if axis == 0:
                cyl.apply_transform(trimesh.transformations.rotation_matrix(math.pi/2, [0, 1, 0]))
                cyl.apply_transform(TM([pos, h, h]))
            else:
                cyl.apply_transform(TM([h, h, pos]))
            c = D(c, cyl)
    c.fix_normals()
    return c


def hole_cube(pitch=P, hole=2.5):
    """Standard mosaic cube with a through-hole (mic / vent / USB access)."""
    c = mosaic_cube(pitch)
    drill = cylinder(radius=hole/2, height=pitch+4, sections=24)
    drill.apply_transform(trimesh.transformations.rotation_matrix(math.pi/2, [1, 0, 0]))
    drill.apply_transform(TM([pitch/2, pitch/2, pitch/2]))
    c = D(c, drill)
    c.fix_normals()
    return c


def eye_module(win_col=1, pitch=P):
    """3×3-cell eye module (36×36×12): swallows a whole 0.96" SSD1306 so
    the glass sits 1.2 mm behind the mosaic surface. Front face carries
    0.4 mm grid grooves (reads as 9 tiles) and a 22×11 window over the
    creature's eye pair — win_col 0/1 picks which local column pair.
    PCB slides in from the back between side rails; pigtail notch at the
    bottom. Perimeter cell-faces keep the standard magnet/steel coupling.
    """
    W = 3 * pitch
    m = B(0, 0, 0, W, W, pitch)
    m = D(m, B(1.6, 1.6, 1.2, W - 1.6, W - 1.6, pitch + 1))      # shell, back open
    # PCB side rails: pocket 27.6 wide, module retained against front wall
    m = U([m, B(1.6, 2.6, 1.2, (W - 27.6) / 2, W - 2.6, 5.0)])
    m = U([m, B(W - (W - 27.6) / 2, 2.6, 1.2, W - 1.6, W - 2.6, 5.0)])
    # window over the eye pair: 22×11 centred on local cols win_col..win_col+1, mid row
    wx = (win_col + 1) * pitch
    m = D(m, B(wx - 11, 1.5 * pitch - 5.5, -1, wx + 11, 1.5 * pitch + 5.5, 1.3))
    # face grooves at the internal cell seams
    for i in (1, 2):
        m = D(m, B(i * pitch - 0.2, -1, -0.01, i * pitch + 0.2, W + 1, 0.4))
        m = D(m, B(-1, i * pitch - 0.2, -0.01, W + 1, i * pitch + 0.2, 0.4))
    # pigtail notch, bottom back edge
    m = D(m, B(W / 2 - 4, -1, 8, W / 2 + 4, 2.7, pitch + 1))
    # perimeter coupling: 3 cells per side — magnets on +x/+y, steel on -x/-y
    MAG_R, MAG_D = 2.15, 1.3
    STL_R, STL_D = 2.65, 0.7
    for k in range(3):
        cc = k * pitch + pitch / 2
        for positive, r, d_ in ((True, MAG_R, MAG_D), (False, STL_R, STL_D)):
            for axis in (0, 1):
                cyl = cylinder(radius=r, height=d_ + 2, sections=32)
                pos = (W - d_/2 + 1) if positive else (d_/2 - 1)
                if axis == 0:
                    cyl.apply_transform(trimesh.transformations.rotation_matrix(math.pi/2, [0, 1, 0]))
                    cyl.apply_transform(TM([pos, cc, pitch / 2]))
                else:
                    cyl.apply_transform(trimesh.transformations.rotation_matrix(math.pi/2, [1, 0, 0]))
                    cyl.apply_transform(TM([cc, pos, pitch / 2]))
                m = D(m, cyl)
    m.fix_normals()
    return m


def eye_patch_kit(eye_cells=((1, 1), (1, 2)), pitch=P, pocket_d=8.0):
    """The 3x3 eye module as NINE single-cell pieces — deep-pocket edition.

    The shared screen pocket now reaches pocket_d (8mm) into the pieces,
    so the OLED glass sits only ~4mm behind the mosaic surface. Because
    the pocket eats the face centres, the INTERNAL seam couplings
    (magnet/steel + nubs) move forward into the 4mm front band (centre
    y=10); all patch-EXTERNAL faces keep the standard centre coupling so
    the patch mates normally with the surrounding wall. Front and back
    faces carry no coupling (exterior / open). Bottom-centre piece has
    the pigtail channel. Returns {name: mesh}.
    """
    W = 3 * pitch
    MAG_R, MAG_D = 2.15, 2.1
    STL_R, STL_D = 2.65, 0.7
    NUB_R, NUB_H = 1.2, 0.5
    DIM_R, DIM_D = 1.45, 0.65
    OFF = 3.5
    ySEAM = pitch - (pitch - pocket_d) / 2 - 0.0  # centre of front band
    ySEAM = pocket_d + (pitch - pocket_d) / 2     # = 10 for pocket 8

    def face_kit(m, axis, positive, internal, ox, oy, oz):
        """couplings on one side face of a cube at origin (ox,oy,oz).
        axis 0=x, 2=z; y offset of pocket centres: 6 external, ySEAM internal."""
        yc = ySEAM if internal else pitch / 2
        r, d_ = MAG_R, MAG_D          # dual-magnet everywhere
        def cyl(rr, dep, c1, c2, add=False):
            hgt = dep + (0.02 if add else 2)
            if add:
                pos = pitch + dep/2 if positive else -dep/2
            else:
                pos = (pitch - dep/2 + 1) if positive else (dep/2 - 1)
            cy = cylinder(radius=rr, height=hgt, sections=24)
            if axis == 0:
                cy.apply_transform(trimesh.transformations.rotation_matrix(math.pi/2, [0, 1, 0]))
                cy.apply_transform(TM([ox + pos, oy + c1, oz + c2]))
            else:
                cy.apply_transform(TM([ox + c2, oy + c1, oz + pos]))
            return cy
        m = D(m, cyl(r, d_, yc, pitch / 2))
        for s_ in (+3.5, -3.5):
            if positive:
                m = U([m, _dome(0 if axis == 0 else 2, positive,
                                yc - pitch/2 + s_ * 0.4, s_, pitch, dome=True)])
            else:
                m = D(m, _dome(0 if axis == 0 else 2, positive,
                               yc - pitch/2 + s_ * 0.4, s_, pitch, dome=False))
        return m

    pocket = B((W - 28) / 2, -1, (W - 28) / 2, (W + 28) / 2, pocket_d, (W + 28) / 2)
    chan = B(W/2 - 4, -1, -1, W/2 + 4, pocket_d, 6)
    out = {}
    for r in range(3):
        for c in range(3):
            ox, oz = c * pitch, (2 - r) * pitch
            m = B(ox, 0, oz, ox + pitch, pitch, oz + pitch)
            if (r, c) in eye_cells:                     # window: open through
                m = D(m, B(ox + 1.6, -1, oz + 1.6, ox + pitch - 1.6, pitch + 1, oz + pitch - 1.6))
                # local bosses under the seam pockets (front band, y~10)
                for side in range(4):
                    if side == 0:  bb = B(ox+pitch-3.0, 7.6, oz+3, ox+pitch-1.6, 12, oz+9)
                    elif side==1:  bb = B(ox+1.6, 7.6, oz+3, ox+3.0, 12, oz+9)
                    elif side==2:  bb = B(ox+3, 7.6, oz+pitch-3.0, ox+9, 12, oz+pitch-1.6)
                    else:          bb = B(ox+3, 7.6, oz+1.6, ox+9, 12, oz+3.0)
                    m = U([m, bb])
            m = D(m, pocket)
            if (r, c) == (2, 1):
                m = D(m, chan)
            # side couplings: internal seams vs patch-external faces
            m = face_kit(m, 0, True,  c < 2, ox, 0, oz)   # +x
            m = face_kit(m, 0, False, c > 0, ox, 0, oz)   # -x
            m = face_kit(m, 2, True,  r > 0, ox, 0, oz)   # +z (up): internal if a row above
            m = face_kit(m, 2, False, r < 2, ox, 0, oz)   # -z (down)
            m.apply_transform(TM([-ox, 0, -oz]))
            m.fix_normals()
            out[f'eyepatch_r{r}c{c}'] = m
    return out


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    coupons = {'coupon_2x2': brick(2, 2), 'coupon_1x4': brick(1, 4),
               'coupon_2x4': brick(2, 4), 'mosaic_cube': mosaic_cube(),
               'window_cube': window_cube(), 'hole_cube': hole_cube()}
    coupons.update(eye_patch_kit())
    for name, m in coupons.items():
        print(name, 'watertight', m.is_watertight, 'tris', len(m.faces))
        m.export(f'{out}/{name}.stl')
