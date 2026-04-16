"""
Mycelium asset pipeline.

- 6 character PNGs in assets/raw/ are already transparent RGBA → just copy.
- Hybrid rainbow is baked into assets/community.png → crop + cream-key removal.

Output: public/assets/characters/{char0..5, hybrid_rainbow}.png

Usage:
    pip install Pillow numpy
    python3 scripts/process_assets.py
"""
from PIL import Image
import numpy as np
import os
import shutil

RAW_DIR = 'assets/raw'
COMMUNITY = 'assets/community.png'
OUT_DIR = 'public/assets/characters'
os.makedirs(OUT_DIR, exist_ok=True)

CHARS = [
    'char0_radial', 'char1_bubble', 'char2_mushroom',
    'char3_glitter', 'char4_cups', 'char5_shrub',
]

# Bounding box of the rainbow Hybrid inside community.png (1536x1024).
HYBRID_BOX = (920, 80, 1110, 320)


def remove_color_bg(img: Image.Image,
                    bg_rgb=(253, 247, 239),
                    tolerance=12) -> Image.Image:
    """Color-key removal with an edge-feathering band.

    Pixels within `tolerance*3` of the bg color get alpha=0.
    Pixels between `tolerance*3` and `tolerance*6` get a linear alpha ramp.
    """
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
    dst = os.path.join(OUT_DIR, f'{name}.png')
    shutil.copyfile(src, dst)
    img = Image.open(dst)
    print(f'  {name}.png  {img.size[0]}x{img.size[1]}  {img.mode}')


def crop_hybrid():
    img = Image.open(COMMUNITY)
    cropped = img.crop(HYBRID_BOX)
    cleaned = remove_color_bg(cropped)
    dst = os.path.join(OUT_DIR, 'hybrid_rainbow.png')
    cleaned.save(dst)
    print(f'  hybrid_rainbow.png  {cleaned.size[0]}x{cleaned.size[1]}  RGBA')


if __name__ == '__main__':
    print(f'Copying {len(CHARS)} transparent character PNGs \u2026')
    for name in CHARS:
        copy_char(name)
    print(f'Cropping Hybrid from {COMMUNITY} box={HYBRID_BOX} \u2026')
    crop_hybrid()
    print('Done. Outputs in', OUT_DIR)
