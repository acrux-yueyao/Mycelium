"""
Mycelium asset pipeline.

Copies raw art into public/assets so Vite can serve them:
  public/assets/characters/
    char{0..5}_<name>.png           — original art with baked face
    char{0..5}_<name>_clean.png     — face-less bases (used by programmatic
                                      FaceOverlay so eyes can gaze + blink)
  public/assets/hybrids/
    hybrid_<A..F>_<A..F>.png        — 15 hand-drawn fusion pairs
  public/assets/characters/hybrid_rainbow.png — legacy, kept for fallback

Usage:
    pip install Pillow numpy --break-system-packages
    python3 scripts/process_assets.py
"""
from PIL import Image
import numpy as np
import os
import shutil

RAW_DIR = 'assets/raw'
HYBRIDS_DIR = 'assets/raw/hybrids'
COMMUNITY = 'assets/community.png'
OUT_CHARS_DIR = 'public/assets/characters'
OUT_HYBRIDS_DIR = 'public/assets/hybrids'

os.makedirs(OUT_CHARS_DIR, exist_ok=True)
os.makedirs(OUT_HYBRIDS_DIR, exist_ok=True)

# Original (baked-face) bases
CHARS_BAKED = [
    'char0_radial', 'char1_bubble', 'char2_mushroom',
    'char3_glitter', 'char4_cups', 'char5_shrub',
]

# New face-less bases (add `_clean` suffix in filename)
CHARS_CLEAN = [f'{name}_clean' for name in CHARS_BAKED]

# 15 hybrid pairs in alphabetical letter order (A=mushroom, B=glitter,
# C=shrub, D=bubble, E=radial, F=cups — see src/data/characters.ts)
HYBRIDS = [
    'hybrid_A_B', 'hybrid_A_C', 'hybrid_A_D', 'hybrid_A_E', 'hybrid_A_F',
    'hybrid_B_C', 'hybrid_B_D', 'hybrid_B_E', 'hybrid_B_F',
    'hybrid_C_D', 'hybrid_C_E', 'hybrid_C_F',
    'hybrid_D_E', 'hybrid_D_F',
    'hybrid_E_F',
]

# Legacy rainbow hybrid cropped from community.png (fallback when a pair
# has no hand-drawn hybrid — shouldn't happen now, but keep the asset).
HYBRID_BOX = (920, 80, 1110, 320)


def remove_color_bg(img: Image.Image,
                    bg_rgb=(253, 247, 239),
                    tolerance=12) -> Image.Image:
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    data = np.array(img)
    diff = np.abs(data[:, :, :3].astype(int) - np.array(bg_rgb)).sum(axis=2)
    hard = diff < tolerance * 3
    edge = (diff >= tolerance * 3) & (diff < tolerance * 6)
    data[:, :, 3] = 255
    data[hard, 3] = 0
    band = (diff[edge] - tolerance * 3) / (tolerance * 3)
    data[edge, 3] = (band * 255).clip(0, 255).astype(np.uint8)
    return Image.fromarray(data)


def copy_char(name: str):
    src = os.path.join(RAW_DIR, f'{name}.png')
    dst = os.path.join(OUT_CHARS_DIR, f'{name}.png')
    shutil.copyfile(src, dst)
    img = Image.open(dst)
    print(f'  {name}.png  {img.size[0]}x{img.size[1]}  {img.mode}')


def copy_hybrid(name: str):
    src = os.path.join(HYBRIDS_DIR, f'{name}.png')
    dst = os.path.join(OUT_HYBRIDS_DIR, f'{name}.png')
    # Convert palette-mode PNGs to RGBA so browser + motion.img renders alpha.
    img = Image.open(src).convert('RGBA')
    img.save(dst)
    print(f'  {name}.png  {img.size[0]}x{img.size[1]}  RGBA')


def crop_legacy_hybrid():
    img = Image.open(COMMUNITY)
    cropped = img.crop(HYBRID_BOX)
    cleaned = remove_color_bg(cropped)
    dst = os.path.join(OUT_CHARS_DIR, 'hybrid_rainbow.png')
    cleaned.save(dst)
    print(f'  hybrid_rainbow.png  {cleaned.size[0]}x{cleaned.size[1]}  RGBA (legacy)')


if __name__ == '__main__':
    print(f'Copying {len(CHARS_BAKED)} baked character PNGs \u2026')
    for name in CHARS_BAKED:
        copy_char(name)

    print(f'Copying {len(CHARS_CLEAN)} face-less (clean) bases \u2026')
    for name in CHARS_CLEAN:
        if os.path.exists(os.path.join(RAW_DIR, f'{name}.png')):
            copy_char(name)
        else:
            print(f'  SKIP {name}.png (not in raw/)')

    print(f'Copying {len(HYBRIDS)} hand-drawn hybrids \u2026')
    for name in HYBRIDS:
        src_path = os.path.join(HYBRIDS_DIR, f'{name}.png')
        if os.path.exists(src_path):
            copy_hybrid(name)
        else:
            print(f'  SKIP {name}.png (not in raw/hybrids/)')

    print(f'Cropping legacy rainbow from {COMMUNITY} \u2026')
    crop_legacy_hybrid()

    print(f'\nDone. Outputs:\n  {OUT_CHARS_DIR}/\n  {OUT_HYBRIDS_DIR}/')
