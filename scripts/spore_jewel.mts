/**
 * spore_jewel — turn a whispered sentence into a wearable spore.
 *
 * Same engine, same hash, same spore number as the site and the brick
 * companion (scripts/spore3d.mts) — but the body is flattened into a
 * small mosaic plaque that hangs from a ring: a pendant, a charm, or a
 * mirrored pair of earrings.
 *
 * Two build modes:
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
 *   --spool-map auto|family   auto (default): each colour = the mean of that
 *                spore's own cells, plate = its darkest band — most faithful.
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

// piece presets: target body height (mm) · plate · relief
const PRESET = {
  pendant: { size: 32, base: 1.6, relief: 0.8 },
  charm:   { size: 24, base: 1.4, relief: 0.7 },
  earring: { size: 20, base: 1.2, relief: 0.6 },
}[piece as 'pendant' | 'charm' | 'earring'];
const MODE = arg('mode', 'assembly')!;           // assembly | relief
if (!['assembly', 'relief'].includes(MODE)) throw new Error('--mode assembly|relief');
const ASSEMBLY = MODE === 'assembly';
const loopMode = arg('loop', 'ring')!;           // ring | hole | none
const PAIR = flag('pair') || piece === 'earring';
const SPLIT = ASSEMBLY || flag('split');
const COLORS = Number(arg('colors', ASSEMBLY ? '2' : flag('split') ? '3' : '0'));   // 0 = every palette band
const EYES = arg('eyes', ASSEMBLY ? 'own' : SPLIT || COLORS > 0 ? 'merge' : 'own')!;
const SMOOTH = !flag('no-smooth') && (SPLIT || COLORS > 0 || !!arg('spools'));
// your own spool inventory (design/filaments.json): --spools / --plate accept its names as well as #rrggbb
interface Filament { name: string; hex: string; brand?: string; material?: string; note?: string }
const INVENTORY: Filament[] = (() => {
  const f = path.resolve(process.cwd(), 'design/filaments.json');
  try { return (JSON.parse(fs.readFileSync(f, 'utf8')).filaments ?? []) as Filament[]; } catch { return []; }
})();
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
const RIM = PLATE_FILL === 'cells' && (MODE === 'assembly') ? Number(arg('rim', '0.6')) : 0;
const SPOOL_MAP = arg('spool-map', SPOOLS_GIVEN() ? 'bands' : 'auto')!;   // auto | family | bands | nearest
const name = arg('name') ?? `jewel_${piece}_${FAMS[charId]}_${h0.toString(16).slice(0, 6)}`;
const outDir = arg('out', 'out/jewel')!;

// ---------- 1) the exact creature the site would grow ----------
const spec = buildMosaic({
  id, charId, intensity,
  morphology: { density, agitation: 0.4, tendrilCount: 5, glow: 0.5, tintHue, particles: false },
} as Parameters<typeof buildMosaic>[0]);
const { cols, rows, cells, eyes, palette, mask } = spec;

// cell size: --cell wins, else derive from the target height
const cell = Number(arg('cell', String(Math.round((Number(arg('size', String(PRESET.size))) / rows) * 10) / 10)));
const BASE = Number(arg('base', String(PRESET.base)));
const RELIEF = Number(arg('relief', String(PRESET.relief)));
const EYE_EXTRA = 0.3;                           // eye whites stand this much prouder
const POCKET = ASSEMBLY ? Math.min(Number(arg('pocket', String(Math.min(0.6, BASE * 0.4)))), BASE - 0.6) : 0;
const FIT = ASSEMBLY ? Number(arg('fit', '0.1')) : 0;    // tile clearance per side
const ENG = Math.min(0.4, (BASE - POCKET) * 0.35);       // engraving depth into the back (under the pocket floor)
const SUB = 4;                                   // engraving pixels per cell
// fine grid per cell: assembly splits each cell into [fit, a, a, a, a, fit] so
// tiles can be shrunk by exactly --fit; relief uses 4 equal pixels
const PAT = ASSEMBLY ? [FIT, ...Array(4).fill((cell - 2 * FIT) / 4), FIT] : Array(SUB).fill(cell / SUB);
const SUBN = PAT.length;
const pixOf = (j: number) => (ASSEMBLY ? Math.max(0, Math.min(SUB - 1, j - 1)) : j);  // sub → engraving pixel
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
interface Plan { kind: number; rgb: RGB; group: string }
const plan = new Map<string, Plan>();
const K = (c: number, r: number) => `${c},${r}`;
if (PLATE_FILL === 'mask')
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (mask[r * cols + c]) plan.set(K(c, r), { kind: 0, rgb: BASE_RGB, group: 'base' });
for (const cl of cells as MosaicCell[])
  plan.set(K(cl.col, cl.row), { kind: cl.alpha < 0.9 ? 2 : 1, rgb: rgbOf(cl.color), group: `band${groupOf(cl.color)}` });
for (const [c, kind] of [[eyes.L0, 3], [eyes.L0 + 1, 4], [eyes.R0, 4], [eyes.R0 + 1, 3]] as Array<[number, number]>)
  plan.set(K(c, eyes.row), { kind, rgb: kind === 3 ? WHITE : BLACK, group: kind === 3 ? 'white' : 'black' });

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
if (!SPOOLS && SPOOL_MAP === 'family') {
  const fs_ = familySpools(Math.max(1, COLORS));
  if (!PLATE_HEX) BASE_RGB = fs_.plate;
  groupRGB.set('base', BASE_RGB);
  quantise(fs_.spools.length, 's', fs_.spools);
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
  const prefix = SPOOLS || SPOOL_MAP === 'family' ? 's' : COLORS > 0 ? 'c' : 'band';
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
if (SPOOLS || SPOOL_MAP === 'family' || COLORS > 0 || EYES === 'merge') {
  // previews show what the printer will actually lay down
  for (const p of plan.values()) if (p.kind !== 0) p.rgb = groupRGB.get(p.group) ?? p.rgb;
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
const TOP_OF = ['base', 'full', 'half', 'eye', 'half'] as const;

function buildPiece(mirror: boolean) {
  // one empty cell of margin all round so the rim has room; grid cell (gc, gy) = (c + 1, rows - 1 - r + 1)
  const GC = cols + 2, GR = rows + 2;
  const FX = GC * SUBN, FY = GR * SUBN;
  const xs: number[] = [0], ys: number[] = [0];
  for (let i = 0; i < FX; i++) xs.push(xs[i] + PAT[i % SUBN]);
  for (let i = 0; i < FY; i++) ys.push(ys[i] + PAT[i % SUBN]);
  // z-levels (assembly: pocket floor sits below the plate top)
  const Zl: Array<[string, number]> = ASSEMBLY
    ? [['bot', 0], ['eng', ENG], ['pocket', BASE - POCKET], ['base', BASE], ['half', BASE + RELIEF / 2], ['full', BASE + RELIEF], ['eye', BASE + RELIEF + EYE_EXTRA]]
    : [['bot', 0], ['eng', ENG], ['base', BASE], ['half', BASE + RELIEF / 2], ['full', BASE + RELIEF], ['eye', BASE + RELIEF + EYE_EXTRA]];
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
          plate.zb[i] = 0;
          plate.zt[i] = onPlate ? ZI[TOP_OF[p.kind]] : ZI.pocket;
          plate.rgb[i] = onPlate ? p.rgb : BASE_RGB; plate.grp[i] = onPlate ? p.group : 'base';
          if (onPlate) continue;
          // tile: erode the colour patch by --fit (L∞), so it drops into the pocket
          const L = sx === 0, R = sx === SUBN - 1, B = sy === 0, T = sy === SUBN - 1;  // y up: sy=0 is the lower row
          const g = p.group;
          const okX = (!L || same(c - 1, r, g)) && (!R || same(c + 1, r, g));
          const okY = (!B || same(c, r + 1, g)) && (!T || same(c, r - 1, g));
          const okD = !((L || R) && (B || T)) || same(c + (L ? -1 : 1), r + (B ? 1 : -1), g);
          if (!(okX && okY && okD)) continue;
          const t = tiles.get(g) ?? tiles.set(g, newPart(g, g)).get(g)!;
          t.zb[i] = ZI.pocket; t.zt[i] = ZI[TOP_OF[p.kind]]; t.rgb[i] = p.rgb; t.grp[i] = g;
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

const variants: Array<[string, boolean]> = PAIR ? [['_L', false], ['_R', true]] : [['', false]];
const summary: Record<string, unknown>[] = [];
for (const [suffix, mirror] of variants) {
  const r = buildPiece(mirror);
  const base = path.join(outDir, name + suffix);
  // assembly: the all-parts view is for looking at, so it is named as such — print the parts
  writeSTL(`${base}${ASSEMBLY ? '_assembled' : ''}.stl`, r.tris, `mycelium ${sporeId} ${piece}`);
  writePLY(`${base}.ply`, r.tris);
  writeSVG(`${base}.svg`, mirror, r);
  let nParts = 0;
  if (SPLIT) {
    const bill: string[] = [];
    for (const [g, ts] of r.parts) {
      writeSTL(`${base}_${g}.stl`, ts, `mycelium ${sporeId} ${g}`);
      const col = groupRGB.get(g === 'plate' ? 'base' : g) ?? BASE_RGB;
      const n = g === 'plate' || g === 'base' ? 1 : regions.get(g) ?? 1;
      nParts += n;
      const unit = !ASSEMBLY ? 'regions' : g === 'plate' ? 'plate' : n === 1 ? 'tile' : 'tiles';
      bill.push(`${path.basename(base)}_${g}.stl\t${hex(col)}\t${n} ${unit}\t${ts.length / 2} faces`);
    }
    fs.writeFileSync(`${base}_${ASSEMBLY ? 'parts' : 'colors'}.txt`, bill.join('\n') + '\n');
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
    colourRegions: Object.fromEntries(regions),
    volumeMM3: +r.volMM3.toFixed(0), gramsPLA: +wPLA.toFixed(2), gramsResin: +wResin.toFixed(2),
  };
  summary.push(info);
  const nFil = Object.keys(info.filaments).length, nReg = [...regions.values()].reduce((a, b) => a + b, 0);
  console.log(`${info.file}: ${sporeId} ${piece} ${FAMS[charId]} ${MODE} · ${info.widthMM}×${info.heightMM}×${info.thickMM} mm · cell ${cell} · ${info.plateCells} cells · ~${info.gramsPLA} g PLA · ${nFil} colours / ${nReg} regions${ASSEMBLY ? ` / ${nParts} parts to glue` : ''} · id ${r.engraved ? 'engraved' : 'skipped (too small)'}`);
}
fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(summary, null, 2));
