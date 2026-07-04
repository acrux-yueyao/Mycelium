/* Mycelium pixel-spore generator — standalone, deterministic.
 * Ported verbatim from the approved preview so exported PNGs are
 * pixel-identical to what was reviewed. Exposes window.Mycelium. */
(function (root) {
  // ---- deterministic RNG (mirrors src/core/seed.ts) ----
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }
  function Rng(seed) { this.s = (seed >>> 0) || 1; }
  Rng.prototype.next = function () {
    this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0;
    return this.s / 4294967296;
  };
  Rng.prototype.range = function (a, b) { return a + this.next() * (b - a); };
  Rng.prototype.int = function (a, b) { return Math.floor(this.range(a, b)); };

  var CLUSTERS = [
    { id:0, name:'tender',    cn:'温柔 · 暖桃',   hue:24,  sat:0.62, emos:'tender · nostalgic · soft' },
    { id:1, name:'calm',      cn:'平静 · 冷蓝',   hue:205, sat:0.50, emos:'calm · clear · empty' },
    { id:2, name:'curious',   cn:'好奇 · 橙',     hue:32,  sat:0.72, emos:'curious · playful · clumsy' },
    { id:3, name:'dreamy',    cn:'梦幻 · 薰衣草', hue:268, sat:0.58, emos:'dreamy · excited · romantic', sparkle:true },
    { id:4, name:'companion', cn:'陪伴 · 薄荷',   hue:158, sat:0.52, emos:'companion · social · attached' },
    { id:5, name:'lonely',    cn:'孤独 · 冷灰',   hue:222, sat:0.16, emos:'lonely · restrained · quiet' },
  ];

  function hslStr(h, s, l) { return 'hsl(' + ((h % 360 + 360) % 360).toFixed(0) + ',' + Math.round(s * 100) + '%,' + Math.round(l * 100) + '%)'; }
  function lerpHue(a, b, t) { var d = ((b - a + 540) % 360) - 180; return a + d * t; }

  function buildPalette(cl, rng, tintHue, intensity, secondaryShift) {
    var h0 = cl.hue + rng.range(-16, 16);
    var hAccent = lerpHue(h0, tintHue, 0.35);
    var N = 5 + Math.round(intensity * 2);
    var hueSpread = 18 + intensity * 140;
    var baseS = cl.sat;
    var stops = [];
    for (var k = 0; k < N; k++) {
      var f = N > 1 ? k / (N - 1) : 0.5;
      var h = hAccent + (f - 0.5) * hueSpread + secondaryShift * (k % 2 === 0 ? 1 : -1);
      var L = 0.42 + f * 0.36;
      var S = baseS * (0.85 + rng.next() * 0.3);
      stops.push({ h: h, s: S, l: L });
    }
    return { stops: stops, sparkle: !!cl.sparkle };
  }
  function colorFromBand(pal, band, jitterL, darken) {
    var st = pal.stops[Math.max(0, Math.min(pal.stops.length - 1, band))];
    var L = Math.max(0.12, Math.min(0.9, st.l + jitterL - darken));
    return hslStr(st.h, st.s, L);
  }

  function buildMosaic(id, cl, morph, intensity, secondaryShift) {
    var rng = new Rng(xmur3(id + ':' + cl.id)());
    var cols = rng.int(10, 15);
    var rows = rng.int(12, 17);
    var center = (cols - 1) / 2;
    var proto = rng.int(0, 3);
    var density = morph.density;

    var capV = rng.range(0.44, 0.6);
    var shoulder = rng.range(0.40, 0.49) * cols;
    var stemW = rng.range(0.13, 0.22) * cols;
    var R = rng.range(0.44, 0.50) * cols;
    var bellP = rng.range(0.6, 0.95);
    var rowJit = [];
    for (var r = 0; r < rows; r++) rowJit.push(rng.range(-0.6, 0.6));

    function halfWidth(v) {
      var hw;
      if (proto === 0) {
        if (v < capV) {
          var d = (capV - v) / capV;
          hw = shoulder * Math.sqrt(Math.max(0, 1 - d * d));
          hw = Math.max(hw, 1.1);
        } else {
          var vv = (v - capV) / (1 - capV);
          hw = stemW * (1 - 0.35 * vv);
          if (vv > 0.8) hw *= Math.sqrt(Math.max(0, 1 - Math.pow((vv - 0.8) / 0.2, 2)));
        }
      } else if (proto === 1) {
        var t = 2 * v - 1;
        hw = R * Math.sqrt(Math.max(0, 1 - t * t));
        if (v > 0.86) hw = Math.max(hw, stemW * 0.9);
      } else {
        hw = shoulder * Math.pow(1 - v, bellP);
        hw = Math.max(hw, v < 0.9 ? 1.4 : 0.6);
      }
      return hw;
    }

    var mask = new Array(cols * rows).fill(false);
    var cells = [];
    var bottomWidth = 1;
    for (var r2 = 0; r2 < rows; r2++) {
      var v = rows > 1 ? r2 / (rows - 1) : 0.5;
      var hw = halfWidth(v) + rowJit[r2] * 0.5;
      if (hw < 0.4) continue;
      for (var c = 0; c < cols; c++) {
        var dx = Math.abs(c - center);
        if (dx > hw + 0.35) continue;
        mask[r2 * cols + c] = true;
        var edge = dx > hw - 1;
        var fillProb = 0.55 + density * 0.5 - (edge ? 0.35 * (1 - density) : 0);
        if (rng.next() > fillProb) continue;
        var N = morph._N;
        var band = Math.floor(v * N);
        var jumpProb = 0.12 + intensity * 0.18;
        if (rng.next() < jumpProb) band += rng.next() < 0.5 ? -1 : 1;
        var darken = 0.10 * (dx / (hw || 1));
        var jL = rng.range(-0.03, 0.03);
        var color = colorFromBand(morph._pal, band, jL, darken);
        var alpha = edge ? (0.35 + 0.65 * density) : 1;
        if (morph._pal.sparkle && rng.next() < 0.05) { color = 'hsl(' + (morph._pal.stops[band>=0?Math.min(band,N-1):0]||morph._pal.stops[0]).h.toFixed(0) + ',60%,92%)'; }
        cells.push({ c: c, r: r2, color: color, alpha: alpha, dyeBase: 0.5 + rng.range(-0.15, 0.15) });
        if (r2 > rows * 0.7) bottomWidth = Math.max(bottomWidth, dx);
      }
    }

    var eyeV = rng.range(0.44, 0.54);
    var eyeRow = Math.round(eyeV * (rows - 1));
    var mid = Math.round(center);
    var gap = rng.int(1, 3);
    var totalW = 2 + gap + 2;
    var leftmost = mid - Math.floor(totalW / 2);
    var L0 = leftmost;
    var R0 = leftmost + 2 + gap;
    function onBody(rr, cc) { return cc >= 0 && cc < cols && mask[rr * cols + cc]; }
    function eyeRowOK(rr, l0, r0) { return onBody(rr, l0) && onBody(rr, l0 + 1) && onBody(rr, r0) && onBody(rr, r0 + 1); }
    var er = eyeRow;
    for (var tries = 0; tries < 5 && !eyeRowOK(er, L0, R0); tries++) {
      if (gap > 1) { gap = 1; totalW = 6; leftmost = mid - 3; L0 = leftmost; R0 = leftmost + 3; }
      else { er = Math.max(0, er - 1); }
    }
    var eyes = { row: er, L0: L0, R0: R0 };

    return { cols: cols, rows: rows, cells: cells, eyes: eyes,
             blur: (1 - density) * 2.4, center: center,
             bottomWidthFrac: (bottomWidth * 2) / cols };
  }

  function makeMorph(id, cl, overrides) {
    overrides = overrides || {};
    var rng = new Rng(xmur3(id + ':m' + cl.id)());
    var density = overrides.density != null ? overrides.density : rng.range(0.28, 0.98);
    var intensity = overrides.intensity != null ? overrides.intensity : rng.range(0.15, 0.95);
    var tintHue = overrides.tintHue != null ? overrides.tintHue : rng.range(0, 360);
    var secondaryShift = rng.range(-14, 14);
    var pal = buildPalette(cl, new Rng(xmur3(id + ':p' + cl.id)()), tintHue, intensity, secondaryShift);
    var morph = { density: density, _pal: pal, _N: pal.stops.length };
    var spec = buildMosaic(id, cl, morph, intensity, secondaryShift);
    return { spec: spec, intensity: intensity, density: density, pal: pal };
  }

  // draw one spec onto a canvas at cellPx resolution; transparent bg.
  function drawInto(ctx, spec, cellPx, gaze) {
    ctx.imageSmoothingEnabled = false;
    for (var i = 0; i < spec.cells.length; i++) {
      var cell = spec.cells[i];
      ctx.globalAlpha = cell.alpha;
      ctx.fillStyle = cell.color;
      ctx.fillRect(cell.c * cellPx, cell.r * cellPx, cellPx, cellPx);
    }
    ctx.globalAlpha = 1;
    var gz = Math.max(-1, Math.min(1, gaze || 0));
    var y = spec.eyes.row * cellPx;
    function eye(col0) {
      var x = col0 * cellPx;
      ctx.fillStyle = '#fbfbf7';
      ctx.fillRect(x, y, cellPx * 2, cellPx);
      var px = x + (gz * 0.5 + 0.5) * cellPx;
      ctx.fillStyle = '#211d1a';
      ctx.fillRect(px, y, cellPx, cellPx);
    }
    eye(spec.eyes.L0); eye(spec.eyes.R0);
  }

  // render a specimen to a transparent PNG dataURL, blur baked in.
  function renderPNG(id, cl, overrides, cellPx) {
    cellPx = cellPx || 26;
    var m = makeMorph(id, cl, overrides);
    var spec = m.spec;
    var pad = 2; // cells of transparent margin
    var w = (spec.cols + pad * 2) * cellPx;
    var h = (spec.rows + pad * 2) * cellPx;
    var base = document.createElement('canvas'); base.width = w; base.height = h;
    var bctx = base.getContext('2d');
    bctx.save(); bctx.translate(pad * cellPx, pad * cellPx);
    // resting gaze from seed → clean one-white-one-black
    var gz = (new Rng(xmur3(id + ':restgaze')()).next() < 0.5 ? -1 : 1) * 0.9;
    drawInto(bctx, spec, cellPx, gz);
    bctx.restore();
    if (spec.blur > 0.05) {
      var out = document.createElement('canvas'); out.width = w; out.height = h;
      var octx = out.getContext('2d');
      octx.filter = 'blur(' + (spec.blur * (cellPx / 12)).toFixed(2) + 'px)';
      octx.drawImage(base, 0, 0);
      return out.toDataURL('image/png');
    }
    return base.toDataURL('image/png');
  }

  // the exact specimen manifest shown in the approved preview
  function manifest() {
    var out = [];
    // hero wall — 40 mixed (same cluster-pick logic as preview)
    for (var i = 0; i < 40; i++) {
      var cl = CLUSTERS[i % CLUSTERS.length];
      if (i >= 6) cl = CLUSTERS[Math.floor(new Rng(xmur3('wallpick' + i)()).range(0, 6))];
      out.push({ name: 'wall/' + pad2(i) + '_' + cl.name, id: 'wall-specimen-' + i, cluster: cl.id, overrides: {} });
    }
    // cluster families — 6 × 6 (intensity sweep)
    CLUSTERS.forEach(function (cl) {
      for (var k = 0; k < 6; k++) {
        var inten = 0.15 + k * 0.16;
        out.push({
          name: 'families/' + cl.name + '_i' + inten.toFixed(2).replace('.', ''),
          id: 'clu-' + cl.id + '-' + k, cluster: cl.id,
          overrides: { intensity: inten, density: 0.55 + (k % 3) * 0.15 },
        });
      }
    });
    // hybrid dye pair
    out.push({ name: 'hybrid/source_companion', id: 'dye-source-mushroom', cluster: 4, overrides: { intensity: 0.55, density: 0.85 } });
    out.push({ name: 'hybrid/target_dreamy',    id: 'dye-target-mushroom', cluster: 3, overrides: { intensity: 0.8, density: 0.9 } });
    // determinism sample
    out.push({ name: 'determinism/sample_tender', id: '我今天觉得有点累但还好', cluster: 0, overrides: { intensity: 0.5 } });
    return out;
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  root.Mycelium = {
    CLUSTERS: CLUSTERS, makeMorph: makeMorph, buildMosaic: buildMosaic,
    renderPNG: renderPNG, manifest: manifest, clusterById: function (id) { return CLUSTERS[id]; },
  };
})(window);
