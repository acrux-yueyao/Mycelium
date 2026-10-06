/**
 * jewel_views — an orthographic three-view drawing (三视图) of one wearable
 * spore, GB first-angle layout: 主视图 (front) top-left, 俯视图 (top) below
 * it, 左视图 (left) to its right, plus dimensions, a parts list and a title
 * block. Views are rendered straight from the generator's column grid (every
 * fine column knows which part is solid between which z-levels), so they are
 * exact, not re-meshed. Output is an A4-landscape SVG in mm; scale is picked
 * automatically (5:1 … 2:1) so the views fill the sheet.
 */

export type RGB = [number, number, number];
export interface ViewPart { name: string; zb: Int8Array; zt: Int8Array; rgb: RGB[] }
export interface ViewInput {
  xs: number[]; ys: number[]; Z: number[]; FX: number; FY: number;
  parts: ViewPart[];                       // plate first, then tiles (draw order: later = on top)
  colourAt: (p: ViewPart, i: number, k: number) => RGB;
  ring: { x: number; y: number; ro: number; ri: number } | null;
  hole: { x: number; y: number; r: number } | null;
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
  baseRGB: RGB; cell: number; fit: number; pocket: number; relief: number; base: number;
  meta: { sporeId: string; text: string; piece: string; family: string; familyZh: string; mirror: boolean; grams: number; mode: string };
  bill: Array<{ file: string; name: string; zh: string; hexc: string; count: number; unit: string }>;
  date: string;
}

const hex = (c: RGB) => `#${c.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;
const f2 = (n: number) => n.toFixed(2);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** rectangles + silhouette edges of a 2D occupancy grid with arbitrary axis coordinates */
function rasterise(
  U: number[], V: number[], NU: number, NV: number,
  colour: (u: number, v: number) => RGB | null,
): { rects: string[]; edges: string[] } {
  const occ = new Uint8Array(NU * NV);
  const col: (RGB | null)[] = new Array(NU * NV);
  for (let v = 0; v < NV; v++) for (let u = 0; u < NU; u++) { const c = colour(u, v); col[u + NU * v] = c; occ[u + NU * v] = c ? 1 : 0; }
  const rects: string[] = [];
  for (let v = 0; v < NV; v++) {
    let u = 0;
    while (u < NU) {
      const c = col[u + NU * v];
      if (!c) { u++; continue; }
      let u1 = u;
      while (u1 + 1 < NU && col[u1 + 1 + NU * v] && hex(col[u1 + 1 + NU * v]!) === hex(c)) u1++;
      rects.push(`<rect x="${f2(U[u])}" y="${f2(V[v])}" width="${f2(U[u1 + 1] - U[u] + 0.02)}" height="${f2(V[v + 1] - V[v] + 0.02)}" fill="${hex(c)}"/>`);
      u = u1 + 1;
    }
  }
  const is = (u: number, v: number) => u >= 0 && v >= 0 && u < NU && v < NV && occ[u + NU * v] === 1;
  const edges: string[] = [];
  for (let v = 0; v < NV; v++) for (let u = 0; u < NU; u++) {
    if (!is(u, v)) continue;
    if (!is(u + 1, v)) edges.push(`M${f2(U[u + 1])} ${f2(V[v])}V${f2(V[v + 1])}`);
    if (!is(u - 1, v)) edges.push(`M${f2(U[u])} ${f2(V[v])}V${f2(V[v + 1])}`);
    if (!is(u, v + 1)) edges.push(`M${f2(U[u])} ${f2(V[v + 1])}H${f2(U[u + 1])}`);
    if (!is(u, v - 1)) edges.push(`M${f2(U[u])} ${f2(V[v])}H${f2(U[u + 1])}`);
  }
  return { rects, edges };
}

export function renderViews(inp: ViewInput): string {
  const { xs, ys, Z, FX, FY, parts, colourAt, ring, hole, bbox, meta } = inp;
  const fi = (x: number, y: number) => x + FX * y;
  const K = Z.length - 1;
  const zMax = Z[K];
  const solid = (p: ViewPart, x: number, y: number, k: number) => p.zb[fi(x, y)] >= 0 && k >= p.zb[fi(x, y)] && k < p.zt[fi(x, y)];
  // visible part at a column from the front (+z): the one whose top is highest
  const frontColour = (x: number, y: number): RGB | null => {
    let best: RGB | null = null, bz = -1;
    for (const p of parts) { const i = fi(x, y); if (p.zb[i] >= 0 && p.zt[i] > bz) { bz = p.zt[i]; best = colourAt(p, i, p.zt[i] - 1); } }
    return best;
  };
  // seen from above (+y): first solid column scanning y downwards, per (x, slab)
  const topColour = (x: number, k: number): RGB | null => {
    for (let y = FY - 1; y >= 0; y--) for (const p of [...parts].reverse()) if (solid(p, x, y, k)) return colourAt(p, fi(x, y), k);
    return null;
  };
  // seen from the left (−x): first solid column scanning x upwards, per (slab, y)
  const leftColour = (k: number, y: number): RGB | null => {
    for (let x = 0; x < FX; x++) for (const p of [...parts].reverse()) if (solid(p, x, y, k)) return colourAt(p, fi(x, y), k);
    return null;
  };

  // --- the three views in model mm, each with its own (u, v) axes; v grows downwards on paper ---
  // front: u = x, v = -y   · top: u = x, v = zMax - z (front face nearest the front view) · left: u = zMax - z, v = -y
  const Zrev = Z.map((z) => zMax - z).reverse();                    // ascending 0..zMax
  const negY = ys.map((y) => -y).reverse();                        // ascending
  const front = rasterise(xs, negY, FX, FY, (u, v) => frontColour(u, FY - 1 - v));
  const top = rasterise(xs, Zrev, FX, K, (u, v) => topColour(u, K - 1 - v));
  const left = rasterise(Zrev, negY, K, FY, (u, v) => leftColour(K - 1 - u, FY - 1 - v));

  // extents (model mm)
  const W = bbox.maxX - bbox.minX, H = bbox.maxY - bbox.minY, T = zMax;
  const bodyTop = (() => { for (let y = FY - 1; y >= 0; y--) for (const p of parts) for (let x = 0; x < FX; x++) if (p.zb[fi(x, y)] >= 0) return ys[y + 1]; return bbox.maxY; })();

  // --- sheet layout (paper mm, A4 landscape) ---
  const SW = 297, SH = 210, M = 12, GAP = 22, TB_W = 118, TB_H = 46;
  const availW = SW - 2 * M - GAP - TB_W - 4, availH = SH - 2 * M - GAP;   // views left of the title block column
  let S = 5;
  for (const s of [5, 4, 3, 2.5, 2, 1.5, 1]) { S = s; if ((W + T) * s + GAP <= availW && (H + T) * s + GAP + 24 <= availH) break; }
  const ox = M + 14, oy = M + 10;                                   // front-view origin on paper
  const P = (u: number, v: number, du: number, dv: number) => `translate(${f2(ox + du)} ${f2(oy + dv)}) scale(${S})`;
  const fx0 = bbox.minX, fy0 = -bbox.maxY;                         // front view: model (x, -y) at its top-left
  const frontG = `<g transform="${P(0, 0, 0, 0)} translate(${f2(-fx0)} ${f2(-fy0)})">`;
  const topDV = H * S + GAP, leftDU = W * S + GAP;
  const topG = `<g transform="${P(0, 0, 0, topDV)} translate(${f2(-fx0)} 0)">`;
  const leftG = `<g transform="${P(0, 0, leftDU, 0)} translate(0 ${f2(-fy0)})">`;

  const stroke = 0.18 / S;                                          // 0.18 mm on paper, in model units
  const ringFront = ring ? `<circle cx="${f2(ring.x)}" cy="${f2(-ring.y)}" r="${f2((ring.ro + ring.ri) / 2)}" fill="none" stroke="${hex(inp.baseRGB)}" stroke-width="${f2(ring.ro - ring.ri)}"/>
      <circle cx="${f2(ring.x)}" cy="${f2(-ring.y)}" r="${f2(ring.ro)}" fill="none" stroke="#222" stroke-width="${f2(stroke)}"/>
      <circle cx="${f2(ring.x)}" cy="${f2(-ring.y)}" r="${f2(ring.ri)}" fill="none" stroke="#222" stroke-width="${f2(stroke)}"/>` : '';
  const holeFront = hole ? `<circle cx="${f2(hole.x)}" cy="${f2(-hole.y)}" r="${f2(hole.r)}" fill="#fff" stroke="#222" stroke-width="${f2(stroke)}"/>` : '';
  // ring in top view: a bar z∈[0,base] across its x range (nearest the viewer from above); in left view a bar at the top
  const ringTop = ring ? `<rect x="${f2(ring.x - ring.ro)}" y="${f2(zMax - inp.base)}" width="${f2(2 * ring.ro)}" height="${f2(inp.base)}" fill="${hex(inp.baseRGB)}" stroke="#222" stroke-width="${f2(stroke)}"/>` : '';
  const ringLeft = ring ? `<rect x="${f2(zMax - inp.base)}" y="${f2(-(ring.y + ring.ro))}" width="${f2(inp.base)}" height="${f2(2 * ring.ro)}" fill="${hex(inp.baseRGB)}" stroke="#222" stroke-width="${f2(stroke)}"/>` : '';

  // --- dimensions (paper mm) ---
  const dims: string[] = [];
  const txt = (x: number, y: number, s: string, anchor = 'middle', size = 3.2, rot = 0) =>
    `<text x="${f2(x)}" y="${f2(y)}" font-size="${size}" text-anchor="${anchor}"${rot ? ` transform="rotate(${rot} ${f2(x)} ${f2(y)})"` : ''}>${esc(s)}</text>`;
  const dimH = (x0: number, x1: number, y: number, label: string, ext0: number, ext1: number) => dims.push(
    `<path d="M${f2(x0)} ${f2(ext0)}V${f2(y + 1.5)}M${f2(x1)} ${f2(ext1)}V${f2(y + 1.5)}M${f2(x0)} ${f2(y)}H${f2(x1)}"/>`,
    `<path d="M${f2(x0)} ${f2(y)}l2.2 -0.7v1.4zM${f2(x1)} ${f2(y)}l-2.2 -0.7v1.4z" fill="#222"/>`, txt((x0 + x1) / 2, y - 1.2, label));
  // vertical dimension; `side` = which side of the view the line sits on (text goes outward)
  const dimV = (y0: number, y1: number, x: number, label: string, ext0: number, ext1: number, side: 'right' | 'left' = 'right') => dims.push(
    `<path d="M${f2(ext0)} ${f2(y0)}H${f2(x + (side === 'right' ? -1.5 : 1.5))}M${f2(ext1)} ${f2(y1)}H${f2(x + (side === 'right' ? -1.5 : 1.5))}M${f2(x)} ${f2(y0)}V${f2(y1)}"/>`,
    `<path d="M${f2(x)} ${f2(y0)}l-0.7 2.2h1.4zM${f2(x)} ${f2(y1)}l-0.7 -2.2h1.4z" fill="#222"/>`,
    txt(x + (side === 'right' ? 1.2 : -1.2), (y0 + y1) / 2, label, 'middle', 3.2, side === 'right' ? -90 : 90));
  // paper coords of the views
  const fL = ox, fR = ox + W * S, fT = oy, fB = oy + H * S;
  const tT = oy + topDV, tB = tT + T * S;
  const lL = ox + leftDU, lR = lL + T * S;
  dimH(fL, fR, tB + 9, `${W.toFixed(1)}`, tB, tB);                                        // overall width, under the top view
  dimV(fT, fB, lR + 10, `${H.toFixed(1)}`, lR, lR);                                        // overall height, right of the left view
  dimV(tT, tB, fL - 7, `${T.toFixed(1)}`, fL, fL, 'left');                                 // thickness, left of the top view
  const bodyH = bodyTop - bbox.minY;
  if (ring) dimV(fT + (H - bodyH) * S, fB, lR + 19, `${bodyH.toFixed(1)}`, lR + 10, lR + 10);   // body height without the ring
  if (ring) {
    const rx = ox + (ring.x - bbox.minX) * S, ry = oy + (bbox.maxY - ring.y) * S;
    dims.push(`<path d="M${f2(rx + ring.ri * S * 0.7)} ${f2(ry - ring.ri * S * 0.7)}L${f2(rx + 12)} ${f2(ry - 9)}H${f2(rx + 30)}"/>`, txt(rx + 21, ry - 10.2, `Ø${(2 * ring.ri).toFixed(1)} 内 / Ø${(2 * ring.ro).toFixed(1)} 外`, 'middle', 2.8));
  }
  if (hole) {
    const hx = ox + (hole.x - bbox.minX) * S, hy = oy + (bbox.maxY - hole.y) * S;
    dims.push(`<path d="M${f2(hx + hole.r * S * 0.7)} ${f2(hy - hole.r * S * 0.7)}L${f2(hx + 12)} ${f2(hy - 9)}H${f2(hx + 22)}"/>`, txt(hx + 17, hy - 10.2, `Ø${(2 * hole.r).toFixed(1)} 孔`, 'middle', 2.8));
  }
  // cell + clearance callout on the front view (one tile edge)
  dims.push(txt(fL, fB + 6, `格 ${inp.cell} mm · 镶片间隙 ${(2 * inp.fit).toFixed(1)} mm · 口袋深 ${inp.pocket.toFixed(2)} · 浮雕 ${inp.relief.toFixed(2)} · 底板 ${inp.base.toFixed(2)}`, 'start', 2.8));

  // --- parts list + title block (paper mm), bottom-right ---
  const tbX = SW - M - TB_W, tbY = SH - M - TB_H;
  const rows = inp.bill;
  const rowH = 5.2, plH = rowH * (rows.length + 1);
  const plY = tbY - plH - 2;
  const pl: string[] = [`<rect x="${tbX}" y="${f2(plY)}" width="${TB_W}" height="${f2(plH)}" fill="none"/>`];
  const cols = [0, 8, 40, 92, 104];
  const hdr = ['序号', '零件', '耗材', '数量', ''];
  for (let c = 1; c < cols.length; c++) pl.push(`<path d="M${f2(tbX + cols[c])} ${f2(plY)}V${f2(plY + plH)}"/>`);
  hdr.forEach((h, c) => pl.push(txt(tbX + cols[c] + 1.5, plY + 3.8, h, 'start', 2.8)));
  rows.forEach((r, i) => {
    const y = plY + rowH * (i + 1);
    pl.push(`<path d="M${tbX} ${f2(y)}H${tbX + TB_W}"/>`);
    pl.push(txt(tbX + 1.5, y + 3.8, String(i + 1), 'start', 2.8), txt(tbX + cols[1] + 1.5, y + 3.8, r.name, 'start', 2.8),
      `<rect x="${f2(tbX + cols[2] + 1.5)}" y="${f2(y + 1.1)}" width="3" height="3" fill="${r.hexc}" stroke="#222" stroke-width="0.15"/>`,
      txt(tbX + cols[2] + 6, y + 3.8, `${r.zh || r.name} ${r.hexc}`, 'start', 2.6), txt(tbX + cols[3] + 1.5, y + 3.8, `${r.count} ${r.unit}`, 'start', 2.8));
  });
  const tb = [
    `<rect x="${tbX}" y="${tbY}" width="${TB_W}" height="${TB_H}" fill="none" stroke-width="0.5"/>`,
    `<path d="M${tbX} ${tbY + 12}H${tbX + TB_W}M${tbX} ${tbY + 24}H${tbX + TB_W}M${tbX} ${tbY + 35}H${tbX + TB_W}M${tbX + 60} ${tbY + 24}V${tbY + TB_H}M${tbX + 90} ${tbY + 24}V${tbY + TB_H}"/>`,
    txt(tbX + 2, tbY + 8.5, `Mycelium 孢子首饰 · ${meta.piece}${meta.mirror ? ' (镜像 R)' : ''}`, 'start', 4.2),
    txt(tbX + 2, tbY + 20, `${meta.sporeId} · ${meta.familyZh} ${meta.family}`, 'start', 3.6),
    txt(tbX + 2, tbY + 31.5, `“${meta.text}”`, 'start', 3),
    txt(tbX + 2, tbY + 42, `比例 ${S}:1`, 'start', 3), txt(tbX + 62, tbY + 42, `单位 mm · ${meta.grams.toFixed(2)} g PLA`, 'start', 3), txt(tbX + 92, tbY + 42, inp.date, 'start', 3),
    txt(tbX + 62, tbY + 31.5, `第一角画法 · ${meta.mode === 'assembly' ? '分件胶装' : '一体浮雕'}`, 'start', 3),
  ];
  // first-angle projection symbol (truncated cone: small circle left of trapezoid) near the title block
  const symX = tbX - 22, symY = tbY + TB_H - 8;
  const sym = `<g fill="none" stroke="#222" stroke-width="0.3"><circle cx="${symX}" cy="${symY}" r="2.6"/><circle cx="${symX}" cy="${symY}" r="1.3"/><path d="M${symX + 6} ${symY - 2.6}V${symY + 2.6}L${symX + 14} ${symY + 4.2}V${symY - 4.2}Z"/><path d="M${symX + 3.5} ${symY - 5}V${symY + 5}" stroke-dasharray="1.2 0.8"/></g>`;

  const label = (x: number, y: number, s: string) => txt(x, y, s, 'start', 3.4);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SW}mm" height="${SH}mm" viewBox="0 0 ${SW} ${SH}" font-family="'Noto Sans CJK SC','PingFang SC','Helvetica Neue',Arial,sans-serif" fill="#222">
  <title>${esc(meta.sporeId)} ${esc(meta.piece)} 三视图</title>
  <rect width="${SW}" height="${SH}" fill="#fff"/>
  <rect x="${M - 4}" y="${M - 4}" width="${SW - 2 * M + 8}" height="${SH - 2 * M + 8}" fill="none" stroke="#222" stroke-width="0.5"/>
  <g shape-rendering="crispEdges">
    ${frontG}${front.rects.join('')}${ringFront}${holeFront}<path d="${front.edges.join('')}" fill="none" stroke="#222" stroke-width="${f2(stroke)}"/></g>
    ${topG}${ringTop}${top.rects.join('')}<path d="${top.edges.join('')}" fill="none" stroke="#222" stroke-width="${f2(stroke)}"/></g>
    ${leftG}${ringLeft}${left.rects.join('')}<path d="${left.edges.join('')}" fill="none" stroke="#222" stroke-width="${f2(stroke)}"/></g>
  </g>
  ${label(fL, fT - 3, '主视图')}${label(fL, tT - 3, '俯视图')}${label(lL, fT - 3, '左视图')}
  <g fill="none" stroke="#222" stroke-width="0.2">${dims.join('')}</g>
  <g fill="none" stroke="#222" stroke-width="0.3">${pl.join('')}${tb.join('')}</g>
  ${sym}
</svg>
`;
}
