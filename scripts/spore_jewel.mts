/**
 * spore_jewel — turn a whispered sentence into a wearable spore.
 *
 * Same engine, same hash, same spore number as the site and the brick
 * companion (scripts/spore3d.mts) — but the body is flattened into a
 * small mosaic plaque that hangs from a ring: a pendant, a charm, or a
 * mirrored pair of earrings.
 *
 * Three build modes:
 *
 *   --mode mosaic    (default) real tesserae: the plate is a tray with one
 *       square pocket per cell and --grout walls between them; every colour
 *       is a pile of identical small square tiles (cell − grout − 2·fit) you
 *       place yourself following <name>_map.svg (lettered cells + legend).
 *       <name>_tile_<colour>[_hK].stl is one tile to print ×N. Tiles come in
 *       --heights steps (default 3): --height-by edt makes the body domed
 *       (edge low, centre tall), band makes lighter cells taller, flat = one.
 *
  *   Shape and colour follow the site's engine: the plate is exactly the cells
 *   the site draws (dither holes stay open, like spore3d) plus a --rim wall,
 *   and the body colours are that spore's own palette, quantised to a few
 *   filaments. --plate-fill mask fills the whole silhouette envelope instead.
 *
 *   --mode assembly  (default) parts for a single-colour printer, glued:
 *       plate   the full silhouette, with pockets where the colour tiles sit;
 *               plate-only (un-dithered) cells stay full height as texture
 *       tiles   one STL per colour; each connected patch of that colour is a
 *               separate inlay, shrunk --fit mm per side (default 0.1) so it
 *               drops into its pocket. Tiles stand --relief above the plate;
 *               wispy edge cells half as high
 *       eyes    eye whites and pupils are their own tiny tiles (white/black)
 *               print once in bulk, glue in — or --eyes merge to fold them
 *               into the body colours / the plate
 *   --mode relief    one solid piece (plate + raised cells), for mono printing
 *               or a multi-material printer (--split: one closed STL per colour)
 *
 *   loop     a round ring (jump-ring ready) grown from the top edge, or
 *            --loop hole drilled through for laser-cut acrylic
 *   back     the spore number MYC-XXXXXX engraved in a 3×5 pixel font
 *
 * Colours are simplified for printing first:
 *   --colors N   quantise the body cells into N colours (assembly default 2,
 *                relief --split default 3, 0 = every palette band). The plate
 *                is always its own colour.
 *   --spool-map inventory|auto|family   inventory (default when
 *                design/filaments.json has entries): the spore's own colours,
 *                each lightness band snapped to the nearest spool you own
 *                (CIE Lab, chroma-weighted; plate = a darker owned spool).
 *                auto: each colour = the mean of that spore's own cells,
 *                plate = its darkest band — exact engine colours, no spools.
 *                family: fixed spools per family (tender peach, calm blue,
 *                curious orange, dreamy lavender, companion mint, lonely grey)
 *                derived from the engine's FAMILY table — batchable, 6 sets.
 *   --eyes own|merge   own = white + black parts (assembly default);
 *                merge = whites take the lightest colour, pupils the plate
 *   --no-smooth  keep single-cell islands (default: a cell whose colour matches
 *                none of its neighbours joins the majority around it)
 *   --spools "#hex,#hex,…"   snap every body cell to the nearest of these
 *                filament colours instead of --colors (one fixed spool set
 *                for a whole batch of creatures); spools sorted dark→light take
 *                the lightness bands, or --spool-map nearest to keep family hues
 *                · --plate "#hex" plate colour · --palette <name> a named
 *                preset of both (see PALETTES / design/JEWELRY.md). Colours
 *                may also be names from design/filaments.json, your own
 *                spool inventory (--list-filaments prints it)
 *
 * Outputs (out/jewel/<name>*):
 *   .stl / .ply   the piece (relief) or _assembled.stl (assembly) · colour preview
 *   .svg          front view in mm: cells + cut outline (laser / acrylic)
 *   _views.svg    三视图: GB first-angle three-view drawing on A4 with dimensions,
 *                 parts list and title block (--no-views to skip)
 *   .json         meta (spore number, size, weight, parts)
 *   _plate.stl, _<colour>.stl, _parts.txt   (assembly) parts + bill
 *
 *   npx tsx scripts/spore_jewel.mts --text "…" [--piece pendant|earring|charm]
 *       [--mode assembly|relief] [--family dreamy] [--size 32] [--cell 2.4]
 *       [--base 1.6] [--relief 0.8] [--pocket 0.6] [--fit 0.1]
 *       [--loop ring|hole|none] [--pair] [--colors 2] [--eyes own|merge]
 *       [--palette cream] [--spools "#hex,…"] [--plate "#hex"] [--split] [--no-smooth] [--no-id] [--out out/jewel]
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildMosaic, FAMILY, type MosaicCell } from '../src/core/mosaic';
import { xmur3 } from '../src/core/seed';
import { sporeId as makeSporeId } from '../src/core/sporeId';
import type { CharId } from '../src/data/characters';
import { PALETTES } from './jewel_palettes';
import { renderViews } from './jewel_views';

// ---------- args ----------
const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const flag = (k: string) => process.argv.includes(`--${k}`);
const SPOOLS_GIVEN = () => !!(arg('spools') || arg('palette'));
const FAMS = ['tender', 'calm', 'curious', 'dreamy', 'companion', 'lonely'] as const;
const text = arg('text', 'today, my heart feels like…')!;
const h0 = xmur3(text)();
const famArg = arg('family');
const charId = (famArg ? FAMS.indexOf(famArg as (typeof FAMS)[number]) : h0 % 6) as CharId;
if (charId < 0) throw new Error(`--family must be one of ${FAMS.join('|')}`);
const piece = arg('piece', 'pendant')!;
if (!['pendant', 'earring', 'charm'].includes(piece)) throw new Error('--piece pendant|earring|charm');
const intensity = Number(arg('intensity', '0.65'));
const density = Number(arg('density', '0.7'));
const tintHue = Number(arg('tint', String(h0 % 360)));
const id = `w:${h0.toString(16)}`;
const sporeId = makeSporeId({ text, id, charId });

// piece presets: target body height (mm) · plate · relief · mosaic cell (one tile per cell needs bigger cells)
// mosaic presets (m*): a thin tray and tall tesserae — plate 1.0, pockets 0.4, tiles stand up to 2.0 above the walls
const PRESET = {
  pendant: { size: 32, base: 1.6, relief: 0.8, mcell: 2.6, mbase: 1.0, mpocket: 0.4, mrelief: 2.0 },
  charm:   { size: 24, base: 1.4, relief: 0.7, mcell: 2.2, mbase: 0.9, mpocket: 0.4, mrelief: 1.6 },
  earring: { size: 20, base: 1.2, relief: 0.6, mcell: 1.8, mbase: 0.8, mpocket: 0.35, mrelief: 1.4 },
}[piece as 'pendant' | 'charm' | 'earring'];
// mosaic (default): one square tile per cell in its own pocket, grout walls between — real tesserae you
// place yourself · assembly: one tile per connected colour patch · relief: one solid piece
const MODE = arg('mode', 'mosaic')!;
if (!['mosaic', 'assembly', 'relief'].includes(MODE)) throw new Error('--mode mosaic|assembly|relief');
const MOSAIC = MODE === 'mosaic';
const ASSEMBLY = MODE !== 'relief';              // both pocketed modes
const loopMode = arg('loop', 'ring')!;           // ring | hole | none
const PAIR = flag('pair') || piece === 'earring';
const SPLIT = ASSEMBLY || flag('split');
const COLORS = Number(arg('colors', ASSEMBLY ? '2' : flag('split') ? '3' : '0'));   // 0 = every palette band
const EYES = arg('eyes', ASSEMBLY ? 'own' : SPLIT || COLORS > 0 ? 'merge' : 'own')!;
const SMOOTH = !flag('no-smooth') && (SPLIT || COLORS > 0 || !!arg('spools'));
// your own spool inventory (design/filaments.json): --spools / --plate accept its names as well as #rrggbb
interface Filament { name: string; hex: string; zh?: string; no?: string; brand?: string; material?: string; note?: string }
interface FamilySet { plate: string; spools: string[] }
const INV_FILE = (() => {
  try { return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'design/filaments.json'), 'utf8')); } catch { return {}; }
})();
const INVENTORY: Filament[] = INV_FILE.filaments ?? [];
const FAMILY_SETS: Record<string, FamilySet> = INV_FILE.families ?? {};
const parseHex = (h: string): [number, number, number] => {
  const hit = INVENTORY.find((f) => f.name.toLowerCase() === h.trim().toLowerCase());
  const src = hit ? hit.hex : h;
  const m = src.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) throw new Error(`bad colour ${h} — use #rrggbb or a name from design/filaments.json (${INVENTORY.map((f) => f.name).join(', ') || 'empty'})`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as [number, number, number];
};
if (flag('list-filaments')) {
  console.log(INVENTORY.length ? INVENTORY.map((f) => `${f.name}\t${f.hex}\t${f.brand ?? ''} ${f.material ?? ''} ${f.note ?? ''}`).join('\n') : 'design/filaments.json has no entries yet');
  process.exit(0);
}
const PALETTE = arg('palette');
if (PALETTE && !PALETTES[PALETTE]) throw new Error(`--palette must be one of ${Object.keys(PALETTES).join('|')}`);
const SPOOLS = arg('spools') ? arg('spools')!.split(',').map(parseHex)
  : PALETTE ? PALETTES[PALETTE].spools.map(parseHex) : null;
const PLATE_HEX = arg('plate') ?? (PALETTE ? PALETTES[PALETTE].plate : undefined);
const ENGRAVE = !flag('no-id');
// plate footprint: 'cells' = exactly the cells the site draws (dither holes stay open, like
// spore3d) + a thin rim so the pockets have a wall · 'mask' = the full silhouette envelope
const PLATE_FILL = arg('plate-fill', 'cells')!;
if (!['cells', 'mask'].includes(PLATE_FILL)) throw new Error('--plate-fill cells|mask');
const RIM = PLATE_FILL === 'cells' && ASSEMBLY ? Number(arg('rim', '0.6')) : 0;
// auto | inventory | family | bands | nearest — with a spool inventory on disk the default is
// inventory: the spore's own colours, each snapped to the nearest spool you actually own
const SPOOL_MAP = arg('spool-map', SPOOLS_GIVEN() ? 'bands' : INVENTORY.length ? 'inventory' : 'auto')!;
const SNAP = SPOOL_MAP === 'inventory' || (SPOOL_MAP === 'family' && INVENTORY.length > 0);
const name = arg('name') ?? `jewel_${piece}_${FAMS[charId]}_${h0.toString(16).slice(0, 6)}`;
const outDir = arg('out', 'out/jewel')!;

// ---------- 1) the exact creature the site would grow ----------
const spec = buildMosaic({
  id, charId, intensity,
  morphology: { density, agitation: 0.4, tendrilCount: 5, glow: 0.5, tintHue, particles: false },
} as Parameters<typeof buildMosaic>[0]);
const { cols, rows, cells, eyes, palette, mask } = spec;

// cell size: --cell wins, else derive from the target height
const cell = Number(arg('cell', arg('size') || !MOSAIC
  ? String(Math.round((Number(arg('size', String(PRESET.size))) / rows) * 10) / 10)
  : String(PRESET.mcell)));
const BASE = Number(arg('base', String(MOSAIC ? PRESET.mbase : PRESET.base)));
const RELIEF = Number(arg('relief', String(MOSAIC ? PRESET.mrelief : PRESET.relief)));  // mosaic: total relief range, split into height steps
const EYE_EXTRA = 0.3;                           // eye whites stand this much prouder
// pocket depth: keep ≥ 0.5 mm of floor under it (mosaic tiles are located by the grout walls, so pockets can be shallow)
const POCKET = ASSEMBLY ? Math.min(Number(arg('pocket', String(MOSAIC ? PRESET.mpocket : Math.min(0.6, BASE * 0.4)))), BASE - 0.5) : 0;
if (ASSEMBLY && BASE - POCKET < 0.5) console.warn(`warning: only ${(BASE - POCKET).toFixed(2)} mm of plate under the pockets`);
const FIT = ASSEMBLY ? Number(arg('fit', '0.1')) : 0;    // tile clearance per side
const GROUT = MOSAIC ? Number(arg('grout', '0.4')) : 0;   // wall between neighbouring pockets (0.4 = two 0.2 lines)
// tile heights: mosaic tiles come in --heights steps (default 3) chosen by --height-by:
//   edt   distance from the silhouette edge → centre tall, edge low (the site's domed body, like spore3d --sculpt)
//   band  lighter cells taller · flat  all one height. Wispy edge cells are always the lowest step; eye whites
//   sit one notch above the top step, pupils on the lowest.
const HEIGHTS = MOSAIC ? Math.max(1, Number(arg('heights', '3'))) : 2;
const HEIGHT_BY = MOSAIC ? arg('height-by', HEIGHTS === 1 ? 'flat' : 'edt')! : 'kind';
if (!['edt', 'band', 'flat', 'kind'].includes(HEIGHT_BY)) throw new Error('--height-by edt|band|flat');
const TILE = cell - GROUT - 2 * FIT;                      // mosaic tile side
if (MOSAIC && TILE < 0.9) console.warn(`warning: tiles are ${TILE.toFixed(2)} mm — hard to handle; use --cell ≥ ${(0.9 + GROUT + 2 * FIT).toFixed(1)}`);
const ENG = Math.min(0.4, (BASE - POCKET) * 0.35);       // engraving depth into the back (under the pocket floor)
const SUB = 4;                                   // engraving pixels per cell
// fine grid per cell: assembly splits each cell into [fit, a, a, a, a, fit] so
// tiles can be shrunk by exactly --fit; relief uses 4 equal pixels
// mosaic: [grout/2, fit, a, a, a, a, fit, grout/2] — wall strip, clearance strip, tile
const PAT = MOSAIC ? [GROUT / 2, FIT, ...Array(4).fill(TILE / 4), FIT, GROUT / 2]
  : ASSEMBLY ? [FIT, ...Array(4).fill((cell - 2 * FIT) / 4), FIT] : Array(SUB).fill(cell / SUB);
const SUBN = PAT.length;
const INNER0 = MOSAIC ? 2 : 1, INNER1 = SUBN - 1 - INNER0;                       // sub index range of the tile body
const pixOf = (j: number) => (ASSEMBLY ? Math.max(0, Math.min(SUB - 1, j - INNER0)) : j);  // sub → engraving pixel
const q = cell / SUB;                            // engraving pixel size

// ---------- colours ----------
type RGB = [number, number, number];
const hslRe = /hsl\((-?\d+),(\d+)%,(\d+)%\)/;
const hsl2rgb = (h: number, s: number, l: number): RGB => {
  h = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as RGB;
};
const parseHsl = (c: string): [number, number, number] => {
  const m = c.match(hslRe);
  return m ? [+m[1], +m[2] / 100, +m[3] / 100] : [0, 0, 0.7];
};
const rgbOf = (c: string): RGB => hsl2rgb(...parseHsl(c));
const hex = (c: RGB) => `#${c.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
const WHITE: RGB = [246, 246, 241];
const BLACK: RGB = [18, 18, 18];
const g0 = palette.stops[0];
let BASE_RGB: RGB = PLATE_HEX ? parseHex(PLATE_HEX)
  : hsl2rgb(g0.h, g0.s * 0.55, Math.max(0.2, g0.l - 0.14)); // plate: the creature's "ground"

// colour group of a cell = nearest palette stop (for --split filament bins)
const groupOf = (c: string): number => {
  const [h, , l] = parseHsl(c);
  let best = 0, bd = 1e9;
  palette.stops.forEach((st, k) => {
    const dh = Math.abs((((h - st.h) % 360) + 540) % 360 - 180);
    const d = dh / 60 + Math.abs(l - st.l) * 4;
    if (d < bd) { bd = d; best = k; }
  });
  return best;
};

// ---------- 2) the 2D plan: one entry per mosaic cell ----------
// kind: 0 plate only · 1 filled · 2 wispy · 3 eye white · 4 pupil
interface Plan { kind: number; rgb: RGB; group: string; h: number }   // h = height step 0..HEIGHTS-1
const plan = new Map<string, Plan>();
const K = (c: number, r: number) => `${c},${r}`;
if (PLATE_FILL === 'mask')
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (mask[r * cols + c]) plan.set(K(c, r), { kind: 0, rgb: BASE_RGB, group: 'base', h: 0 });
for (const cl of cells as MosaicCell[])
  plan.set(K(cl.col, cl.row), { kind: cl.alpha < 0.9 ? 2 : 1, rgb: rgbOf(cl.color), group: `band${groupOf(cl.color)}`, h: 0 });
for (const [c, kind] of [[eyes.L0, 3], [eyes.L0 + 1, 4], [eyes.R0, 4], [eyes.R0 + 1, 3]] as Array<[number, number]>)
  plan.set(K(c, eyes.row), { kind, rgb: kind === 3 ? WHITE : BLACK, group: kind === 3 ? 'white' : 'black', h: 0 });

// keep the largest 4-connected component of the plate (a skipped thin row can strand the stem tip)
{
  const seen = new Set<string>(); let best: string[] = [];
  for (const k of plan.keys()) {
    if (seen.has(k)) continue;
    const comp: string[] = []; const st = [k]; seen.add(k);
    while (st.length) {
      const cur = st.pop()!; comp.push(cur);
      const [c, r] = cur.split(',').map(Number);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = K(c + dc, r + dr);
        if (plan.has(n) && !seen.has(n)) { seen.add(n); st.push(n); }
      }
    }
    if (comp.length > best.length) best = comp;
  }
  const keep = new Set(best);
  for (const k of [...plan.keys()]) if (!keep.has(k)) plan.delete(k);
}

// ---------- 2.5) simplify for the printer: few filaments, no lone islands ----------
// representative colour per group (for --split bill and previews)
const groupRGB = new Map<string, RGB>([['base', BASE_RGB], ['white', WHITE], ['black', BLACK]]);
palette.stops.forEach((st, k) => groupRGB.set(`band${k}`, hsl2rgb(st.h, st.s, st.l)));
const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
// perceptual distance (CIE Lab) for snapping engine colours to real spools
const toLab = (c: RGB): [number, number, number] => {
  const f = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = [f(c[0]), f(c[1]), f(c[2])];
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, y = r * 0.2126 + g * 0.7152 + b * 0.0722, z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const h = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * h(y) - 16, 500 * (h(x) - h(y)), 200 * (h(y) - h(z))];
};
const dE = (a: RGB, b: RGB) => { const p = toLab(a), q = toLab(b); return Math.hypot(p[0] - q[0], 1.4 * (p[1] - q[1]), 1.4 * (p[2] - q[2])); }; // chroma weighted: hue matters most
const spoolName = new Map<string, string>();      // group → inventory name
const INV_RGB = INVENTORY.map((f) => ({ f, rgb: parseHex(f.hex) }));
// snap a dark→light list of target colours to distinct inventory spools (greedy, darkest first),
// keeping the lightness order so the body's gradient survives
const snapSet = (targets: RGB[], taken: Set<string>): Array<{ rgb: RGB; name: string }> => {
  const out: Array<{ rgb: RGB; name: string }> = [];
  let minL = -1;
  for (const t of targets) {
    const cands = INV_RGB.filter((c) => !taken.has(c.f.name) && !['white', 'black'].includes(c.f.name))
      .map((c) => ({ c, d: dE(t, c.rgb) + Math.max(0, minL - toLab(c.rgb)[0]) * 0.6 }))   // penalise going darker than the previous band
      .sort((a, b) => a.d - b.d);
    const pick = cands[0]?.c ?? INV_RGB[0];
    taken.add(pick.f.name); minL = toLab(pick.rgb)[0];
    out.push({ rgb: pick.rgb, name: pick.f.name });
  }
  return out;
};
// the plate wants a spool darker than the body's darkest band and close to the engine's ground colour
const snapPlate = (target: RGB, taken: Set<string>, bodyDarkL: number): { rgb: RGB; name: string } => {
  const cands = INV_RGB.filter((c) => !taken.has(c.f.name))
    .map((c) => ({ c, d: dE(target, c.rgb) + Math.max(0, toLab(c.rgb)[0] - bodyDarkL) * 1.2 }))   // not lighter than the body's dark band
    .sort((a, b) => a.d - b.d);
  const pick = cands[0]?.c ?? INV_RGB[0];
  taken.add(pick.f.name);
  return { rgb: pick.rgb, name: pick.f.name };
};
// N bins by lightness quantile — the body's vertical gradient becomes N clean bands
const quantise = (N: number, prefix: string, reps?: RGB[]) => {
  const body = [...plan.values()].filter((p) => p.kind === 1 || p.kind === 2);
  const ls = body.map((p) => lum(p.rgb)).sort((a, b) => a - b);
  const bin = (p: Plan) => {
    const rank = ls.findIndex((v) => v >= lum(p.rgb));
    return Math.min(N - 1, Math.floor((rank / ls.length) * N));
  };
  const sums = Array.from({ length: N }, () => [0, 0, 0, 0]);
  for (const p of body) { const b = bin(p); sums[b][0] += p.rgb[0]; sums[b][1] += p.rgb[1]; sums[b][2] += p.rgb[2]; sums[b][3]++; }
  const mean: RGB[] = sums.map((v) => (v[3] ? [v[0] / v[3], v[1] / v[3], v[2] / v[3]].map(Math.round) as RGB : BASE_RGB));
  for (const p of body) p.group = `${prefix}${bin(p)}`;
  (reps ?? mean).forEach((c, k) => groupRGB.set(`${prefix}${k}`, c));
};
// family spool set: fixed per family (tender/calm/curious/dreamy/companion/lonely), derived from
// the engine's own FAMILY hue + saturation, so a batch shares spools yet every family keeps its colour
const familySpools = (N: number): { plate: RGB; spools: RGB[] } => {
  const fam = FAMILY[charId];
  const Ls = N === 1 ? [0.6] : Array.from({ length: N }, (_, k) => 0.48 + (k / (N - 1)) * 0.28);
  return { plate: hsl2rgb(fam.hue, fam.sat * 0.55, 0.26), spools: Ls.map((L) => hsl2rgb(fam.hue, fam.sat * 0.95, L)) };
};
const snapGroups = (prefix: string, targets: RGB[], plateTarget: RGB) => {
  const taken = new Set<string>();
  // plate first: the engine's ground colour usually has one obvious owned spool (deep green, deep red,
  // klein…); picking it before the body keeps the plate in the family hue instead of falling to black
  if (PLATE_HEX) { const hit = INVENTORY.find((f) => parseHex(f.hex).join() === BASE_RGB.join()); if (hit) { spoolName.set('base', hit.name); taken.add(hit.name); } }
  else { const pl = snapPlate(plateTarget, taken, toLab(targets[0])[0]); BASE_RGB = pl.rgb; spoolName.set('base', pl.name); }
  groupRGB.set('base', BASE_RGB);
  const body = snapSet(targets, taken);
  body.forEach((b, k) => { groupRGB.set(`${prefix}${k}`, b.rgb); spoolName.set(`${prefix}${k}`, b.name); });
  for (const [g, n] of [['white', 'white'], ['black', 'black']]) {
    const hit = INVENTORY.find((f) => f.name === n);
    if (hit) { groupRGB.set(g, parseHex(hit.hex)); spoolName.set(g, hit.name); }
  }
};
if (!SPOOLS && SPOOL_MAP === 'inventory') {
  // own palette → N lightness bands (means) → each band to the nearest spool you own
  const N = Math.max(1, COLORS);
  quantise(N, 'c');
  const means = Array.from({ length: N }, (_, k) => groupRGB.get(`c${k}`)!);
  snapGroups('c', means, BASE_RGB);
} else if (!SPOOLS && SPOOL_MAP === 'family' && FAMILY_SETS[FAMS[charId]]) {
  // hand-picked per-family set from the inventory file: take N spools dark→light (1 = middle, 2 = ends, 3 = all)
  const set = FAMILY_SETS[FAMS[charId]];
  const N = Math.max(1, Math.min(COLORS || 2, set.spools.length));
  const idx = N === 1 ? [set.spools.length >> 1] : Array.from({ length: N }, (_, k) => Math.round((k / (N - 1)) * (set.spools.length - 1)));
  const picks = idx.map((i) => set.spools[i]);
  if (!PLATE_HEX) { BASE_RGB = parseHex(set.plate); spoolName.set('base', set.plate); }
  groupRGB.set('base', BASE_RGB);
  quantise(N, 's', picks.map(parseHex));
  picks.forEach((n, k) => spoolName.set(`s${k}`, n));
  for (const [g, n] of [['white', 'white'], ['black', 'black']]) {
    const hit = INVENTORY.find((f) => f.name === n);
    if (hit) { groupRGB.set(g, parseHex(hit.hex)); spoolName.set(g, hit.name); }
  }
} else if (!SPOOLS && SPOOL_MAP === 'family') {
  const fs_ = familySpools(Math.max(1, COLORS));
  if (SNAP) { quantise(fs_.spools.length, 's'); snapGroups('s', fs_.spools, fs_.plate); }
  else { if (!PLATE_HEX) BASE_RGB = fs_.plate; groupRGB.set('base', BASE_RGB); quantise(fs_.spools.length, 's', fs_.spools); }
} else if (SPOOLS && SPOOL_MAP === 'nearest') {
  // every body cell becomes the nearest spool (perceptual-ish RGB distance): keeps the family hue
  const dist = (a: RGB, b: RGB) => 2 * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + 3 * (a[2] - b[2]) ** 2;
  for (const p of plan.values()) {
    if (p.kind !== 1 && p.kind !== 2) continue;
    let best = 0;
    SPOOLS.forEach((sp, k) => { if (dist(p.rgb, sp) < dist(p.rgb, SPOOLS[best])) best = k; });
    p.group = `s${best}`;
  }
  SPOOLS.forEach((sp, k) => groupRGB.set(`s${k}`, sp));
} else if (SPOOLS) {
  // default: spools sorted dark→light take the body's lightness bands, so every
  // creature in a batch uses the whole spool set in gradient order
  quantise(SPOOLS.length, 's', [...SPOOLS].sort((a, b) => lum(a) - lum(b)));
} else if (COLORS > 0) {
  quantise(COLORS, 'c');
}
if (EYES === 'merge') {
  // eye whites → lightest filament, pupils → plate colour: zero extra spools for the face
  let lightest = 'base', bestL = -1;
  const prefix = SPOOLS || SPOOL_MAP === 'family' ? 's' : COLORS > 0 || SPOOL_MAP === 'inventory' ? 'c' : 'band';
  for (const [g, c] of groupRGB) if (g.startsWith(prefix) && lum(c) > bestL) { bestL = lum(c); lightest = g; }
  for (const p of plan.values()) {
    if (p.kind === 3) p.group = lightest;
    if (p.kind === 4) p.group = 'base';
  }
}
if (SMOOTH) {
  // a cell whose colour group matches none of its filled 4-neighbours joins
  // the majority group around it — kills one-cell islands (= one tool change each)
  for (let pass = 0; pass < 2; pass++)
    for (const [k, p] of plan) {
      if (p.kind !== 1 && p.kind !== 2) continue;
      const [c, r] = k.split(',').map(Number);
      const votes = new Map<string, number>();
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = plan.get(K(c + dc, r + dr));
        if (!n || n.kind === 0 || n.kind === 4) continue;
        votes.set(n.group, (votes.get(n.group) ?? 0) + 1);
      }
      if (!votes.size || votes.has(p.group)) continue;
      p.group = [...votes].sort((a, b) => b[1] - a[1])[0][0];
    }
}
if (SPOOLS || SPOOL_MAP === 'family' || SPOOL_MAP === 'inventory' || COLORS > 0 || EYES === 'merge') {
  // previews show what the printer will actually lay down
  for (const p of plan.values()) if (p.kind !== 0) p.rgb = groupRGB.get(p.group) ?? p.rgb;
  for (const p of plan.values()) if (p.kind === 0) p.rgb = BASE_RGB;
}
// colour regions = separate islands per group (each is roughly one colour change per layer)
const countRegions = (): Map<string, number> => {
  const seen = new Set<string>(); const out = new Map<string, number>();
  for (const [k, p] of plan) {
    if (p.kind === 0 || seen.has(k)) continue;
    const g = p.group; out.set(g, (out.get(g) ?? 0) + 1);
    const st = [k]; seen.add(k);
    while (st.length) {
      const cur = st.pop()!; const [c, r] = cur.split(',').map(Number);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = K(c + dc, r + dr); const np = plan.get(n);
        if (np && np.kind !== 0 && np.group === g && !seen.has(n)) { seen.add(n); st.push(n); }
      }
    }
  }
  return out;
};
const regions = countRegions();

// ---------- 2.7) height steps ----------
{
  const body = [...plan.entries()].filter(([, p]) => p.kind !== 0);
  const top = HEIGHTS - 1;
  if (HEIGHT_BY === 'kind') {                       // relief / assembly: full or half (wispy, pupil)
    for (const [, p] of body) p.h = p.kind === 2 || p.kind === 4 ? 0 : top;
  } else if (HEIGHT_BY === 'flat') {
    for (const [, p] of body) p.h = top;
  } else if (HEIGHT_BY === 'band') {                // lighter → taller, by lightness quantile
    const ls = body.map(([, p]) => lum(p.rgb)).sort((a, b) => a - b);
    for (const [, p] of body) p.h = Math.min(top, Math.floor((ls.findIndex((v) => v >= lum(p.rgb)) / ls.length) * HEIGHTS));
  } else {                                          // edt: BFS distance (4-neighbour) from the nearest empty cell
    const dist = new Map<string, number>();
    const q: string[] = [];
    for (const [k, p] of body) {
      const [c, r] = k.split(',').map(Number);
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => { const n = plan.get(K(c + dc, r + dr)); return !n || n.kind === 0; });
      if (edge) { dist.set(k, 1); q.push(k); }
      void p;
    }
    while (q.length) {
      const k = q.shift()!; const d = dist.get(k)!;
      const [c, r] = k.split(',').map(Number);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = K(c + dc, r + dr); const np = plan.get(n);
        if (np && np.kind !== 0 && !dist.has(n)) { dist.set(n, d + 1); q.push(n); }
      }
    }
    const dmax = Math.max(1, ...dist.values());
    for (const [k, p] of body) {
      const d = dist.get(k) ?? 1;
      // spread the steps over the available depth: d=1 is always the lowest step, the deepest cells the top
      p.h = dmax <= 1 ? top : Math.min(top, Math.round(((d - 1) / (dmax - 1)) * top));
    }
  }
  for (const [, p] of body) { if (p.kind === 2) p.h = 0; if (p.kind === 4) p.h = 0; if (p.kind === 3) p.h = top; }
}

// ---------- 3) 3×5 pixel font for the back engraving ----------
const FONT: Record<string, string[]> = {
  '0': ['111','101','101','101','111'], '1': ['010','110','010','010','111'],
  '2': ['111','001','111','100','111'], '3': ['111','001','111','001','111'],
  '4': ['101','101','111','001','001'], '5': ['111','100','111','001','111'],
  '6': ['111','100','111','101','111'], '7': ['111','001','001','010','010'],
  '8': ['111','101','111','101','111'], '9': ['111','101','111','001','111'],
  'A': ['010','101','111','101','101'], 'B': ['110','101','110','101','110'],
  'C': ['111','100','100','100','111'], 'D': ['110','101','101','101','110'],
  'E': ['111','100','111','100','111'], 'F': ['111','100','111','100','100'],
  'G': ['111','100','101','101','111'], 'H': ['101','101','111','101','101'],
  'J': ['001','001','001','101','111'], 'K': ['101','101','110','101','101'],
  'M': ['101','111','111','101','101'], 'N': ['110','101','101','101','101'],
  'P': ['111','101','111','100','100'], 'Q': ['111','101','101','111','001'],
  'R': ['110','101','110','101','101'], 'S': ['111','100','111','001','111'],
  'T': ['111','010','010','010','010'], 'V': ['101','101','101','101','010'],
  'W': ['101','101','111','111','101'], 'X': ['101','101','010','101','101'],
  'Y': ['101','101','010','010','010'], 'Z': ['111','001','010','100','111'],
  '-': ['000','000','111','000','000'], ' ': ['000','000','000','000','000'],
};
const textPixels = (s: string): boolean[][] => {
  const rowsPx: boolean[][] = Array.from({ length: 5 }, () => []);
  [...s].forEach((ch, i) => {
    const g = FONT[ch] ?? FONT[' '];
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 3; x++) rowsPx[y].push(g[y][x] === '1');
      if (i < s.length - 1) rowsPx[y].push(false);
    }
  });
  return rowsPx;
};

// ---------- 4) build one piece (optionally mirrored) ----------
type V = [number, number, number];
interface Tri { a: V; b: V; c: V; col: RGB; group: string }
// kind → top z-level name
// top z-level name of a cell: plate-only → base · eye white → eye · otherwise its height step
const topOf = (p: Plan) => (p.kind === 0 ? 'base' : p.kind === 3 ? 'eye' : `r${p.h}`);

function buildPiece(mirror: boolean) {
  // one empty cell of margin all round so the rim has room; grid cell (gc, gy) = (c + 1, rows - 1 - r + 1)
  const GC = cols + 2, GR = rows + 2;
  const FX = GC * SUBN, FY = GR * SUBN;
  const xs: number[] = [0], ys: number[] = [0];
  for (let i = 0; i < FX; i++) xs.push(xs[i] + PAT[i % SUBN]);
  for (let i = 0; i < FY; i++) ys.push(ys[i] + PAT[i % SUBN]);
  // z-levels (assembly: pocket floor sits below the plate top)
  const steps: Array<[string, number]> = Array.from({ length: HEIGHTS }, (_, k) => [`r${k}`, BASE + RELIEF * ((k + 1) / HEIGHTS)]);
  const Zl: Array<[string, number]> = [
    ['bot', 0], ['eng', ENG], ...(ASSEMBLY ? [['pocket', BASE - POCKET] as [string, number]] : []), ['base', BASE],
    ...steps, ['eye', BASE + RELIEF + EYE_EXTRA]];
  const Z = Zl.map((z) => z[1]);
  const ZI: Record<string, number> = Object.fromEntries(Zl.map((z, i) => [z[0], i]));
  if (ASSEMBLY) ZI.pocket = ZI.pocket; else ZI.pocket = ZI.base;
  const fi = (x: number, y: number) => x + FX * y;

  // a part = a set of columns, each solid between z-level indices [zb, zt)
  interface Part { name: string; group: string; zb: Int8Array; zt: Int8Array; rgb: RGB[]; grp: string[] }
  const newPart = (name: string, group: string): Part => ({
    name, group, zb: new Int8Array(FX * FY).fill(-1), zt: new Int8Array(FX * FY).fill(-1), rgb: new Array(FX * FY), grp: new Array(FX * FY),
  });
  const cellAt = (c0: number, r: number) => plan.get(K(mirror ? cols - 1 - c0 : c0, r));   // plan lookup in output coords
  const same = (c: number, r: number, g: string) => { const p = cellAt(c, r); return !!p && p.kind !== 0 && p.group === g; };

  const plate = newPart('plate', 'base');
  const tiles = new Map<string, Part>();
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const p = cellAt(c, r);
      if (!p) continue;
      const yCell = rows - 1 - r + 1, gc = c + 1;
      const onPlate = !ASSEMBLY || p.group === 'base';
      for (let sy = 0; sy < SUBN; sy++)
        for (let sx = 0; sx < SUBN; sx++) {
          const i = fi(gc * SUBN + sx, yCell * SUBN + sy);
          const wall = MOSAIC && (sx === 0 || sx === SUBN - 1 || sy === 0 || sy === SUBN - 1);   // grout strip
          plate.zb[i] = 0;
          plate.zt[i] = onPlate ? ZI[topOf(p)] : wall ? ZI.base : ZI.pocket;
          plate.rgb[i] = onPlate ? p.rgb : BASE_RGB; plate.grp[i] = onPlate ? p.group : 'base';
          if (onPlate) continue;
          if (MOSAIC) {
            // one square tile per cell, inset by grout/2 + fit on every side
            if (sx < INNER0 || sx > INNER1 || sy < INNER0 || sy > INNER1) continue;
            const g = p.group;
            const t = tiles.get(g) ?? tiles.set(g, newPart(g, g)).get(g)!;
            t.zb[i] = ZI.pocket; t.zt[i] = ZI[topOf(p)]; t.rgb[i] = p.rgb; t.grp[i] = g;
            continue;
          }
          // tile: erode the colour patch by --fit (L∞), so it drops into the pocket
          const L = sx === 0, R = sx === SUBN - 1, B = sy === 0, T = sy === SUBN - 1;  // y up: sy=0 is the lower row
          const g = p.group;
          const okX = (!L || same(c - 1, r, g)) && (!R || same(c + 1, r, g));
          const okY = (!B || same(c, r + 1, g)) && (!T || same(c, r - 1, g));
          const okD = !((L || R) && (B || T)) || same(c + (L ? -1 : 1), r + (B ? 1 : -1), g);
          if (!(okX && okY && okD)) continue;
          const t = tiles.get(g) ?? tiles.set(g, newPart(g, g)).get(g)!;
          t.zb[i] = ZI.pocket; t.zt[i] = ZI[topOf(p)]; t.rgb[i] = p.rgb; t.grp[i] = g;
        }
    }
  // rim: every fine column within RIM mm (Chebyshev) of a cell becomes full-height plate — the pocket wall
  if (RIM > 0) {
    const rects: Array<[number, number, number, number]> = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (cellAt(c, r)) rects.push([(c + 1) * cell, (rows - 1 - r + 1) * cell, (c + 2) * cell, (rows - r + 1) * cell]);
    for (let y = 0; y < FY; y++)
      for (let x = 0; x < FX; x++) {
        const i = fi(x, y);
        if (plate.zb[i] >= 0) continue;
        const px = (xs[x] + xs[x + 1]) / 2, py = (ys[y] + ys[y + 1]) / 2;
        for (const [x0, y0, x1, y1] of rects) {
          const d = Math.max(x0 - px, px - x1, y0 - py, py - y1);   // Chebyshev distance to the rect (<0 inside)
          if (d <= RIM) { plate.zb[i] = 0; plate.zt[i] = ZI.base; plate.rgb[i] = BASE_RGB; plate.grp[i] = 'base'; break; }
        }
      }
  }
  const parts: Part[] = [plate, ...[...tiles.keys()].sort().map((g) => tiles.get(g)!)];

  // loop anchor: topmost plate cell nearest the centre
  let topRow = -1, topCol = 0;
  for (let r = 0; r < rows && topRow < 0; r++) {
    const cs: number[] = [];
    for (let c = 0; c < cols; c++) if (cellAt(c, r)) cs.push(c);
    if (cs.length) {
      topRow = r;
      topCol = cs.reduce((b, c) => Math.abs(c - (cols - 1) / 2) < Math.abs(b - (cols - 1) / 2) ? c : b, cs[0]);
    }
  }
  const loopX = (topCol + 1.5) * cell;
  // top edge of the plate footprint (rim included) under the loop column
  let topY = (rows - topRow + 1) * cell;
  { let xi = 0; while (xi + 1 < FX && xs[xi + 1] < loopX) xi++;
    for (let y = FY - 1; y >= 0; y--) if (plate.zb[fi(xi, y)] >= 0) { topY = ys[y + 1]; break; } }
  const RO = Math.max(2.4, cell * 1.1), RI = Math.max(1.2, RO * 0.5);
  const SINK = Math.min(0.8, cell * 0.4);        // how deep the ring sits into the body
  const loopY = topY + RO - SINK;

  // --loop hole: drill through the top cells instead (laser-friendly)
  let hole: { x: number; y: number; r: number } | null = null;
  if (loopMode === 'hole') {
    // through the centre of the topmost cell under the loop column (rim + 0.2 cell of wall around it)
    hole = { x: loopX, y: (rows - topRow + 0.5) * cell, r: Math.max(0.7, cell * 0.3) };
    for (let y = 0; y < FY; y++)
      for (let x = 0; x < FX; x++) {
        const px = (xs[x] + xs[x + 1]) / 2, py = (ys[y] + ys[y + 1]) / 2;
        if (Math.hypot(px - hole.x, py - hole.y) <= hole.r) for (const p of parts) p.zb[fi(x, y)] = -1;
      }
  }

  // engraving: the spore number on the back of the plate, where it is wide enough
  let engraved = false;
  if (ENGRAVE && q >= 0.33) {
    const PX = GC * SUB, PY = GR * SUB;
    // engraving pixel is usable iff every fine column under it is plate from the very bottom
    const usable = new Uint8Array(PX * PY).fill(1);
    for (let y = 0; y < FY; y++)
      for (let x = 0; x < FX; x++)
        if (plate.zb[fi(x, y)] !== 0) usable[(x / SUBN | 0) * SUB + pixOf(x % SUBN) + PX * ((y / SUBN | 0) * SUB + pixOf(y % SUBN))] = 0;
    const Hh = 5, PAD = 1;
    const eyeY = (rows - 1 - eyes.row + 1) * SUB;
    let px: boolean[][] = [], W = 0;
    let bestY = -1, bestD = 1e9, bestX = 0;
    for (const label of [sporeId, sporeId.slice(4)]) {   // "MYC-TRY6HP", then just "TRY6HP"
      if (bestY >= 0) break;
      px = textPixels(label); W = px[0].length;
      for (let y = 0; y + Hh + 2 * PAD <= PY; y++) {
        let runL = -1, bestL = 0, bestLen = 0;
        for (let x = 0; x <= PX; x++) {
          let ok = x < PX;
          for (let yy = y; ok && yy < y + Hh + 2 * PAD; yy++) ok = usable[x + PX * yy] === 1;
          if (ok) { if (runL < 0) runL = x; }
          else if (runL >= 0) { if (x - runL > bestLen) { bestLen = x - runL; bestL = runL; } runL = -1; }
        }
        if (bestLen >= W + 2 * PAD && Math.abs(y - eyeY) < bestD) {
          bestD = Math.abs(y - eyeY); bestY = y; bestX = bestL + Math.floor((bestLen - W) / 2);
        }
      }
    }
    if (bestY >= 0) {
      const lit = new Set<number>();
      for (let yy = 0; yy < Hh; yy++)
        for (let xx = 0; xx < W; xx++)
          if (px[Hh - 1 - yy][mirror ? xx : W - 1 - xx])   // reads right when flipped over
            lit.add((bestX + xx) + PX * (bestY + PAD + yy));
      for (let y = 0; y < FY; y++)
        for (let x = 0; x < FX; x++)
          if (lit.has((x / SUBN | 0) * SUB + pixOf(x % SUBN) + PX * ((y / SUBN | 0) * SUB + pixOf(y % SUBN))))
            plate.zb[fi(x, y)] = ZI.eng;
      engraved = true;
    }
  }

  // mesh a part: per z-slab voxel with face culling → closed shell. In relief
  // mode a slab below the plate top belongs to 'base'; `only` restricts to one
  // colour group and culls only against it, so each --split part is closed.
  const P = (x: number, y: number, z: number): V => [xs[x], ys[y], z];
  const groupAt = (p: Part, i: number, k: number) => (!ASSEMBLY && k < ZI.base ? 'base' : p.grp[i]);
  const colourAt = (p: Part, i: number, k: number) => (!ASSEMBLY && k < ZI.base ? BASE_RGB : p.rgb[i]);
  const quadTo = (tris: Tri[], a: V, b: V, c: V, d: V, col: RGB, group: string) => {
    tris.push({ a, b, c, col, group }); tris.push({ a, b: c, c: d, col, group });
  };
  const mesh = (p: Part, only?: string): Tri[] => {
    const tris: Tri[] = [];
    const solid = (x: number, y: number, k: number) => {
      if (x < 0 || y < 0 || x >= FX || y >= FY) return false;
      const i = fi(x, y);
      if (p.zb[i] < 0 || k < p.zb[i] || k >= p.zt[i]) return false;
      return only === undefined || groupAt(p, i, k) === only;
    };
    for (let y = 0; y < FY; y++)
      for (let x = 0; x < FX; x++) {
        const i = fi(x, y);
        if (p.zb[i] < 0) continue;
        for (let k = p.zb[i]; k < p.zt[i]; k++) {
          const g = groupAt(p, i, k);
          if (only !== undefined && g !== only) continue;
          const col = colourAt(p, i, k);
          const z0 = Z[k], z1 = Z[k + 1];
          const x0 = x, x1 = x + 1, y0 = y, y1 = y + 1;
          if (!solid(x + 1, y, k)) quadTo(tris, P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1), col, g);
          if (!solid(x - 1, y, k)) quadTo(tris, P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), P(x0, y0, z0), col, g);
          if (!solid(x, y + 1, k)) quadTo(tris, P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), col, g);
          if (!solid(x, y - 1, k)) quadTo(tris, P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), col, g);
          if (!solid(x, y, k + 1)) quadTo(tris, P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), col, g);
          if (!solid(x, y, k - 1)) quadTo(tris, P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), P(x1, y0, z0), col, g);
        }
      }
    return tris;
  };

  // the ring: an annulus extruded to plate height, overlapping the body by SINK; part of the plate
  let ring: { x: number; y: number; ro: number; ri: number } | null = null;
  const ringTris: Tri[] = [];
  if (loopMode === 'ring') {
    ring = { x: loopX, y: loopY, ro: RO, ri: RI };
    const N = 48, z0 = 0, z1 = BASE;
    const pt = (rad: number, a: number, z: number): V => [loopX + Math.cos(a) * rad, loopY + Math.sin(a) * rad, z];
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
      quadTo(ringTris, pt(RO, a0, z0), pt(RO, a1, z0), pt(RO, a1, z1), pt(RO, a0, z1), BASE_RGB, 'base');   // outer wall
      quadTo(ringTris, pt(RI, a0, z1), pt(RI, a1, z1), pt(RI, a1, z0), pt(RI, a0, z0), BASE_RGB, 'base');   // inner wall
      quadTo(ringTris, pt(RI, a0, z1), pt(RO, a0, z1), pt(RO, a1, z1), pt(RI, a1, z1), BASE_RGB, 'base');   // top
      quadTo(ringTris, pt(RO, a0, z0), pt(RI, a0, z0), pt(RI, a1, z0), pt(RO, a1, z0), BASE_RGB, 'base');   // bottom
    }
  }

  // output sets: assembled view + printable parts
  const partMeshes = new Map<string, Tri[]>();
  if (ASSEMBLY) {
    for (const p of parts) partMeshes.set(p.name, p.name === 'plate' ? [...mesh(p), ...ringTris] : mesh(p));
  } else {
    const groups = new Set<string>();
    for (let i = 0; i < FX * FY; i++) if (plate.zb[i] >= 0) for (let k = plate.zb[i]; k < plate.zt[i]; k++) groups.add(groupAt(plate, i, k));
    for (const g of [...groups].sort()) partMeshes.set(g, g === 'base' ? [...mesh(plate, 'base'), ...ringTris] : mesh(plate, g));
  }
  const tris: Tri[] = ASSEMBLY ? [...partMeshes.values()].flat() : [...mesh(plate), ...ringTris];

  // volume (signed tetrahedra over the parts) → weight estimate
  let vol = 0;
  for (const t of [...partMeshes.values()].flat()) {
    const [a, b, c] = [t.a, t.b, t.c];
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  // ring/body overlap is counted twice; subtract the sunk cap roughly
  const w = Math.max(cell, 2 * Math.sqrt(Math.max(0, RO * RO - (RO - SINK) ** 2)));
  if (ring) vol -= SINK * w * BASE * 0.7;
  // plate footprint for the drawing: horizontal runs of fine columns, in mm
  const runs: Array<[number, number, number, number]> = [];
  let minX = 1e9, maxX = -1e9, minY = 1e9;
  for (let y = 0; y < FY; y++) {
    let x = 0;
    while (x < FX) {
      if (plate.zb[fi(x, y)] < 0) { x++; continue; }
      let x1 = x; while (x1 + 1 < FX && plate.zb[fi(x1 + 1, y)] >= 0) x1++;
      runs.push([xs[x], ys[y], xs[x1 + 1], ys[y + 1]]);
      minX = Math.min(minX, xs[x]); maxX = Math.max(maxX, xs[x1 + 1]); minY = Math.min(minY, ys[y]);
      x = x1 + 1;
    }
  }
  const isPlate = (x: number, y: number) => x >= 0 && y >= 0 && x < FX && y < FY && plate.zb[fi(x, y)] >= 0;
  const edges: string[] = [];
  for (let y = 0; y < FY; y++)
    for (let x = 0; x < FX; x++) {
      if (!isPlate(x, y)) continue;
      if (!isPlate(x + 1, y)) edges.push(`M${xs[x + 1].toFixed(2)} ${ys[y].toFixed(2)}V${ys[y + 1].toFixed(2)}`);
      if (!isPlate(x - 1, y)) edges.push(`M${xs[x].toFixed(2)} ${ys[y].toFixed(2)}V${ys[y + 1].toFixed(2)}`);
      if (!isPlate(x, y + 1)) edges.push(`M${xs[x].toFixed(2)} ${ys[y + 1].toFixed(2)}H${xs[x + 1].toFixed(2)}`);
      if (!isPlate(x, y - 1)) edges.push(`M${xs[x].toFixed(2)} ${ys[y].toFixed(2)}H${xs[x + 1].toFixed(2)}`);
    }
  return { tris, parts: partMeshes, ring, hole, engraved, volMM3: Math.abs(vol), runs, edges,
           grid: { xs, ys, Z, FX, FY, columns: parts, colourAt },
           bbox: { minX, maxX, minY, maxY: ring ? loopY + RO : topY }, loopTop: ring ? loopY + RO : topY };
}

// ---------- 5) writers ----------
fs.mkdirSync(outDir, { recursive: true });

function writeSTL(file: string, tris: Tri[], header: string) {
  const buf = Buffer.alloc(84 + tris.length * 50);
  buf.write(header.slice(0, 79), 0, 'ascii');
  buf.writeUInt32LE(tris.length, 80);
  let o = 84;
  for (const t of tris) {
    const ux = t.b[0] - t.a[0], uy = t.b[1] - t.a[1], uz = t.b[2] - t.a[2];
    const vx = t.c[0] - t.a[0], vy = t.c[1] - t.a[1], vz = t.c[2] - t.a[2];
    const n: V = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const len = Math.hypot(...n) || 1;
    for (const v of [n.map((c) => c / len) as V, t.a, t.b, t.c])
      for (const c of v) { buf.writeFloatLE(c, o); o += 4; }
    buf.writeUInt16LE(0, o); o += 2;
  }
  fs.writeFileSync(file, buf);
}

function writePLY(file: string, tris: Tri[]) {
  const L: string[] = ['ply', 'format ascii 1.0', `element vertex ${tris.length * 3}`,
    'property float x', 'property float y', 'property float z',
    'property uchar red', 'property uchar green', 'property uchar blue',
    `element face ${tris.length}`, 'property list uchar int vertex_indices', 'end_header'];
  for (const t of tris)
    for (const v of [t.a, t.b, t.c])
      L.push(`${v[0].toFixed(3)} ${v[1].toFixed(3)} ${v[2].toFixed(3)} ${t.col[0]} ${t.col[1]} ${t.col[2]}`);
  for (let i = 0; i < tris.length; i++) L.push(`3 ${i * 3} ${i * 3 + 1} ${i * 3 + 2}`);
  fs.writeFileSync(file, L.join('\n'));
}

// front view in mm (y flipped to SVG). Layers: "plate" (footprint) · "art" (cells) · "cut" (outline + hole, laser)
function writeSVG(file: string, mirror: boolean, r: ReturnType<typeof buildPiece>) {
  const { minX, maxX, minY, maxY } = r.bbox;
  const M = 1.5, W = maxX - minX, H = maxY - minY;
  const X = (x: number) => (x - minX).toFixed(2), Y = (y: number) => (maxY - y).toFixed(2);
  const plateRects = r.runs.map(([x0, y0, x1, y1]) =>
    `<rect x="${X(x0)}" y="${Y(y1)}" width="${(x1 - x0 + 0.03).toFixed(2)}" height="${(y1 - y0 + 0.03).toFixed(2)}" fill="${hex(BASE_RGB)}"/>`);  // +0.03: no renderer seams
  const rects: string[] = [];
  for (let rr = 0; rr < rows; rr++)
    for (let c = 0; c < cols; c++) {
      const p = plan.get(K(mirror ? cols - 1 - c : c, rr));
      if (!p || p.kind === 0) continue;
      const x = (c + 1) * cell + FIT, y = (rows - rr) * cell + FIT - FIT;   // tile outline incl. clearance
      const op = p.kind === 2 ? 0.6 : 1;
      rects.push(`<rect x="${X(x)}" y="${Y((rows - rr + 1) * cell - FIT)}" width="${(cell - 2 * FIT).toFixed(2)}" height="${(cell - 2 * FIT).toFixed(2)}" fill="${hex(p.rgb)}" fill-opacity="${op}"/>`);
      void y;
    }
  // cut path: translate the mm edges into SVG space
  const cut = r.edges.map((e) => e.replace(/M([\d.]+) ([\d.]+)([VH])([\d.]+)/, (_m, a, b, dir, d) =>
    dir === 'V' ? `M${X(+a)} ${Y(+b)}V${Y(+d)}` : `M${X(+a)} ${Y(+b)}H${X(+d)}`)).join('');
  const loop = r.ring
    ? `<circle cx="${X(r.ring.x)}" cy="${Y(r.ring.y)}" r="${((r.ring.ro + r.ring.ri) / 2).toFixed(2)}" fill="none" stroke="${hex(BASE_RGB)}" stroke-width="${(r.ring.ro - r.ring.ri).toFixed(2)}"/>`
    : r.hole
      ? `<circle cx="${X(r.hole.x)}" cy="${Y(r.hole.y)}" r="${r.hole.r.toFixed(2)}" fill="#fff" stroke="#f00" stroke-width="0.05"/>`
      : '';
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${(W + 2 * M).toFixed(2)}mm" height="${(H + 2 * M).toFixed(2)}mm" viewBox="${-M} ${-M} ${(W + 2 * M).toFixed(2)} ${(H + 2 * M).toFixed(2)}">
  <title>${sporeId} · ${piece}${mirror ? ' (mirrored)' : ''}</title>
  <desc>${text.replace(/[<&]/g, ' ')}</desc>
  <g id="plate" shape-rendering="crispEdges">
    ${plateRects.join('\n    ')}
    ${loop}
  </g>
  <g id="art" shape-rendering="crispEdges">
    ${rects.join('\n    ')}
  </g>
  <g id="cut" fill="none" stroke="#f00" stroke-width="0.05">
    <path d="${cut}"/>
  </g>
</svg>
`;
  fs.writeFileSync(file, svg);
}

// split an in-situ tile mesh into its tiles (one per cell), group them by height, and return one
// representative tile per height moved to the origin, with how many of that height there are
function tilesByHeight(ts: Tri[]): Array<{ tris: Tri[]; w: number; h: number; count: number }> {
  if (!ts.length) return [];
  const key = (t: Tri) => `${Math.floor(Math.min(t.a[0], t.b[0], t.c[0]) / cell)},${Math.floor(Math.min(t.a[1], t.b[1], t.c[1]) / cell)}`;
  const groups = new Map<string, Tri[]>();
  for (const t of ts) (groups.get(key(t)) ?? groups.set(key(t), []).get(key(t))!).push(t);
  const byH = new Map<string, { tris: Tri[]; count: number }>();
  for (const g of groups.values()) {
    const zs = g.flatMap((t) => [t.a[2], t.b[2], t.c[2]]);
    const hk = (Math.max(...zs) - Math.min(...zs)).toFixed(2);
    const e = byH.get(hk); if (e) e.count++; else byH.set(hk, { tris: g, count: 1 });
  }
  return [...byH].sort(([a], [b]) => +a - +b).map(([hk, { tris: best, count }]) => {
    const xs0 = best.flatMap((t) => [t.a[0], t.b[0], t.c[0]]), ys0 = best.flatMap((t) => [t.a[1], t.b[1], t.c[1]]), zs0 = best.flatMap((t) => [t.a[2], t.b[2], t.c[2]]);
    const mx = Math.min(...xs0), my = Math.min(...ys0), mz = Math.min(...zs0);
    const mv = (v: V): V => [v[0] - mx, v[1] - my, v[2] - mz];
    return { tris: best.map((t) => ({ ...t, a: mv(t.a), b: mv(t.b), c: mv(t.c) })), w: Math.max(...xs0) - mx, h: +hk, count };
  });
}

// assembly chart (拼装图): the grid with column letters / row numbers, one lettered tile per cell, legend with counts
function writeMap(file: string, mirror: boolean, r: ReturnType<typeof buildPiece>) {
  const groups = [...new Set([...plan.values()].filter((p) => p.kind !== 0).map((p) => p.group))].sort((a, b) => a.localeCompare(b));
  const code = new Map(groups.map((g, i) => [g, String.fromCharCode(65 + i)]));   // A, B, C…
  const S = 7, M = 14, LEG = 36;                                                   // mm per cell on paper · margins · legend width
  const gw = cols * S, gh = rows * S;
  const X = (c: number) => M + 8 + c * S, Y = (rr: number) => M + 14 + rr * S;
  const out: string[] = [];
  const t = (x: number, y: number, s: string, size = 2.6, anchor = 'middle', fill = '#333') =>
    out.push(`<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="${size}" text-anchor="${anchor}" fill="${fill}">${s.replace(/[<&]/g, ' ')}</text>`);
  // grid
  for (let c = 0; c <= cols; c++) out.push(`<path d="M${X(c)} ${Y(0)}V${Y(rows)}" stroke="#ccc" stroke-width="0.15"/>`);
  for (let rr = 0; rr <= rows; rr++) out.push(`<path d="M${X(0)} ${Y(rr)}H${X(cols)}" stroke="#ccc" stroke-width="0.15"/>`);
  for (let c = 0; c < cols; c++) t(X(c) + S / 2, Y(0) - 1.5, String.fromCharCode(97 + c), 2.4, 'middle', '#888');
  for (let rr = 0; rr < rows; rr++) t(X(0) - 2, Y(rr) + S / 2 + 0.9, String(rr + 1), 2.4, 'end', '#888');
  // plate footprint (cells + rim) as a soft fill, then tiles
  for (const [x0, y0, x1, y1] of r.runs) {
    const px0 = X(0) + (x0 - cell) / cell * S, px1 = X(0) + (x1 - cell) / cell * S;
    const py0 = Y(rows) - (y1 - cell) / cell * S, py1 = Y(rows) - (y0 - cell) / cell * S;
    out.push(`<rect x="${px0.toFixed(2)}" y="${py0.toFixed(2)}" width="${(px1 - px0 + 0.02).toFixed(2)}" height="${(py1 - py0 + 0.02).toFixed(2)}" fill="${hex(BASE_RGB)}" fill-opacity="0.35"/>`);
  }
  for (let rr = 0; rr < rows; rr++)
    for (let c = 0; c < cols; c++) {
      const p = plan.get(K(mirror ? cols - 1 - c : c, rr));
      if (!p || p.kind === 0) continue;
      const lum_ = 0.2126 * p.rgb[0] + 0.7152 * p.rgb[1] + 0.0722 * p.rgb[2];
      out.push(`<rect x="${(X(c) + 0.6).toFixed(2)}" y="${(Y(rr) + 0.6).toFixed(2)}" width="${(S - 1.2).toFixed(2)}" height="${(S - 1.2).toFixed(2)}" fill="${hex(p.rgb)}" stroke="#333" stroke-width="0.15"/>`);
      const lbl = HEIGHTS > 1 && p.kind !== 3 && p.kind !== 4 ? `${code.get(p.group)}${p.h + 1}` : code.get(p.group)!;
      t(X(c) + S / 2, Y(rr) + S / 2 + 1.0, lbl, HEIGHTS > 1 ? 2.6 : 3, 'middle', lum_ > 140 ? '#222' : '#fff');
    }
  // legend
  const lx = X(cols) + 8, ly0 = Y(0);
  t(lx, ly0 - 1.5, '图例 · 每格一片', 2.8, 'start');
  groups.forEach((g, i) => {
    const y = ly0 + 2 + i * 8;
    const rgb = groupRGB.get(g) ?? BASE_RGB;
    const n = [...plan.values()].filter((p) => p.kind !== 0 && p.group === g).length;
    const nm = spoolName.get(g); const zh = INVENTORY.find((f) => f.name === nm)?.zh ?? nm ?? '';
    out.push(`<rect x="${lx}" y="${y}" width="6" height="6" fill="${hex(rgb)}" stroke="#333" stroke-width="0.15"/>`);
    t(lx + 3, y + 4.3, code.get(g)!, 3, 'middle', (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) > 140 ? '#222' : '#fff');
    t(lx + 8, y + 2.6, `${g === 'white' ? '眼白' : g === 'black' ? '瞳孔' : '镶片'} · ${zh} ${hex(rgb)}`, 2.5, 'start');
    const perH = Array.from({ length: HEIGHTS }, (_, k) => [...plan.values()].filter((p) => p.kind !== 0 && p.group === g && (p.kind === 3 ? k === HEIGHTS - 1 : p.kind === 4 ? k === 0 : p.h === k)).length);
    const hNote = HEIGHTS > 1 && (g !== 'white' && g !== 'black') ? ` · 高 ${perH.map((c, k) => `${k + 1}:${c}`).filter((_, k) => perH[k] > 0).join(' ')}` : '';
    t(lx + 8, y + 5.6, `${n} 片 · ${TILE.toFixed(1)} mm 方${hNote}`, 2.5, 'start', '#666');
  });
  const by = ly0 + 4 + groups.length * 8;
  out.push(`<rect x="${lx}" y="${by}" width="6" height="6" fill="${hex(BASE_RGB)}" stroke="#333" stroke-width="0.15"/>`);
  t(lx + 8, by + 2.6, `底板 · ${INVENTORY.find((f) => f.name === spoolName.get('base'))?.zh ?? ''} ${hex(BASE_RGB)}`, 2.5, 'start');
  t(lx + 8, by + 5.6, `格 ${cell} · 缝 ${GROUT} · 口袋深 ${POCKET.toFixed(2)} · 间隙 ${FIT}`, 2.5, 'start', '#666');
  const W = M * 2 + 8 + gw + 8 + LEG + 30, H = M * 2 + 14 + gh + 10;
  fs.writeFileSync(file, `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="'Noto Sans CJK SC','PingFang SC',Arial,sans-serif">
  <rect width="${W}" height="${H}" fill="#fff"/>
  <text x="${M}" y="${M}" font-size="4.2" fill="#222">${sporeId} · ${piece}${mirror ? ' (R 镜像)' : ''} · 拼装图</text>
  <text x="${M}" y="${M + 5.5}" font-size="3" fill="#666">“${text.replace(/[<&]/g, ' ')}” · 正面朝上,列 a→ 右,行 1→ 下 · 字母 = 颜色${HEIGHTS > 1 ? ` · 数字 = 高度档(1 最矮 … ${HEIGHTS} 最高)` : ''}</text>
  ${out.join('\n  ')}
</svg>
`);
}

const variants: Array<[string, boolean]> = PAIR ? [['_L', false], ['_R', true]] : [['', false]];
const summary: Record<string, unknown>[] = [];
for (const [suffix, mirror] of variants) {
  const r = buildPiece(mirror);
  const base = path.join(outDir, name + suffix);
  // assembly: the all-parts view is for looking at, so it is named as such — print the parts
  writeSTL(`${base}${ASSEMBLY ? '_assembled' : ''}.stl`, r.tris, `mycelium ${sporeId} ${piece}`);
  writePLY(`${base}.ply`, r.tris);
  writeSVG(`${base}.svg`, mirror, r);
  // mosaic: how many tiles of each colour (and height) — every tile of a group is identical
  const tileCount = (g: string, kindFilter?: (k: number) => boolean) =>
    [...plan.values()].filter((p) => p.kind !== 0 && p.group === g && (!kindFilter || kindFilter(p.kind))).length;
  const countOf = (g: string) => (MOSAIC ? tileCount(g) : g === 'plate' || g === 'base' ? 1 : regions.get(g) ?? 1);
  let nParts = 0;
  if (SPLIT) {
    const bill: string[] = [];
    for (const [g, ts] of r.parts) {
      writeSTL(`${base}_${g}.stl`, ts, `mycelium ${sporeId} ${g}`);
      const col = groupRGB.get(g === 'plate' ? 'base' : g) ?? BASE_RGB;
      const nm = spoolName.get(g === 'plate' ? 'base' : g);
      const n = g === 'plate' ? 1 : countOf(g);
      nParts += n;
      const unit = !ASSEMBLY ? 'regions' : g === 'plate' ? 'plate' : n === 1 ? 'tile' : 'tiles';
      let extra = '';
      if (MOSAIC && g !== 'plate') {
        // one tile per height step at the origin, to print ×count each
        const variantsH = tilesByHeight(ts);
        extra = variantsH.map((v, k) => {
          const f = `${base}_tile_${g}${variantsH.length > 1 ? `_h${k + 1}` : ''}.stl`;
          writeSTL(f, v.tris, `mycelium ${sporeId} tile ${g} h${k + 1}`);
          return `\t${v.w.toFixed(2)}×${v.w.toFixed(2)}×${v.h.toFixed(2)} mm → ${path.basename(f)} ×${v.count}`;
        }).join('');
      }
      bill.push(`${path.basename(base)}_${g}.stl\t${hex(col)}${nm ? ` ${nm}${INVENTORY.find((f) => f.name === nm)?.zh ? ' ' + INVENTORY.find((f) => f.name === nm)!.zh : ''}` : ''}\t${n} ${unit}${extra}`);
    }
    fs.writeFileSync(`${base}_${ASSEMBLY ? 'parts' : 'colors'}.txt`, bill.join('\n') + '\n');
  }
  if (MOSAIC) writeMap(`${base}_map.svg`, mirror, r);
  // three-view drawing (GB first-angle), A4 landscape
  if (!flag('no-views')) {
    const FAM_ZH: Record<string, string> = { tender: '温柔', calm: '平静', curious: '好奇', dreamy: '梦幻', companion: '陪伴', lonely: '孤独' };
    const billRows = [...r.parts.keys()].flatMap((g) => {
      const key = g === 'plate' ? 'base' : g;
      const nm = spoolName.get(key) ?? '';
      const zh = INVENTORY.find((f) => f.name === nm)?.zh ?? nm, hexc = hex(groupRGB.get(key) ?? BASE_RGB);
      const baseName = g === 'plate' ? '底板' : g === 'white' ? '眼白' : g === 'black' ? '瞳孔' : `镶片 ${g}`;
      if (MOSAIC && HEIGHTS > 1 && g !== 'plate' && g !== 'white' && g !== 'black') {
        // one row per height step that is actually used
        return Array.from({ length: HEIGHTS }, (_, k) => ({ k, n: [...plan.values()].filter((p) => (p.kind === 1 || p.kind === 2) && p.group === g && p.h === k).length }))
          .filter((x) => x.n > 0)
          .map((x) => ({ file: `${path.basename(base)}_tile_${g}_h${x.k + 1}.stl`, name: `${baseName} · 高${x.k + 1} (${(POCKET + RELIEF * ((x.k + 1) / HEIGHTS)).toFixed(1)})`, zh, hexc, count: x.n, unit: '片' }));
      }
      return [{ file: `${path.basename(base)}_${g}.stl`, name: baseName, zh, hexc, count: g === 'plate' ? 1 : countOf(g), unit: g === 'plate' ? '块' : '片' }];
    });
    fs.writeFileSync(`${base}_views.svg`, renderViews({
      xs: r.grid.xs, ys: r.grid.ys, Z: r.grid.Z, FX: r.grid.FX, FY: r.grid.FY, parts: r.grid.columns, colourAt: (p, i, k) => r.grid.colourAt(p as Parameters<typeof r.grid.colourAt>[0], i, k), ring: r.ring, hole: r.hole, bbox: r.bbox, baseRGB: BASE_RGB, cell, fit: FIT, pocket: POCKET, relief: RELIEF, base: BASE,
      meta: { sporeId, text, piece, family: FAMS[charId], familyZh: FAM_ZH[FAMS[charId]], mirror, grams: r.volMM3 / 1000 * 1.24, mode: MODE },
      bill: billRows, date: new Date().toISOString().slice(0, 10),
    }));
  }
  const wPLA = r.volMM3 / 1000 * 1.24, wResin = r.volMM3 / 1000 * 1.1;
  const info = {
    file: path.basename(base), mirror, sporeId, family: FAMS[charId], piece, text,
    mode: MODE, plateFill: PLATE_FILL, rim: RIM, palette: PALETTE ?? (SPOOLS ? 'custom' : SPOOL_MAP), cell, base: BASE, relief: RELIEF, pocket: POCKET, fit: FIT, loop: loopMode, engraved: r.engraved,
    parts: nParts,
    widthMM: +(r.bbox.maxX - r.bbox.minX).toFixed(1), heightMM: +(r.bbox.maxY - r.bbox.minY).toFixed(1),
    thickMM: +(BASE + RELIEF + EYE_EXTRA).toFixed(2),
    cells: cells.length, plateCells: plan.size, tris: r.tris.length,
    filaments: Object.fromEntries([...new Set([...plan.values()].map((p) => p.group))].sort().map((g) => [g, hex(groupRGB.get(g) ?? BASE_RGB)])),
    spools: Object.fromEntries([...spoolName].map(([g, n]) => [g, { name: n, zh: INVENTORY.find((f) => f.name === n)?.zh ?? '' }])),
    colourRegions: Object.fromEntries(regions),
    volumeMM3: +r.volMM3.toFixed(0), gramsPLA: +wPLA.toFixed(2), gramsResin: +wResin.toFixed(2),
  };
  summary.push(info);
  const nFil = Object.keys(info.filaments).length, nReg = [...regions.values()].reduce((a, b) => a + b, 0);
  console.log(`${info.file}: ${sporeId} ${piece} ${FAMS[charId]} ${MODE} · ${info.widthMM}×${info.heightMM}×${info.thickMM} mm · cell ${cell} · ${info.plateCells} cells · ~${info.gramsPLA} g PLA · ${nFil} colours / ${nReg} regions${ASSEMBLY ? ` / ${nParts} parts to glue` : ''} · id ${r.engraved ? 'engraved' : 'skipped (too small)'}`);
}
fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(summary, null, 2));
