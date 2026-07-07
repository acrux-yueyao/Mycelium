/**
 * share — encode a grown creature into a compact, self-contained URL token
 * and back. Because generation is fully deterministic, a link that carries
 * the creature's reading reproduces the *exact* same spore on any device
 * with no backend lookup — the "reproducible & claimable" promise from the
 * visual-identity spec.
 */
import type { FieldCreature } from '../components/DitherField';
import type { Morphology } from './emotion';
import type { CharId } from '../data/characters';

// URL-safe base64 over UTF-8 bytes (handles Chinese names / sentences).
function b64urlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// Short keys keep the token compact.
interface Packed {
  i: string; c: number; m: Morphology; n: number; s?: string;
  e: number; na?: string; p?: string; r?: string; b?: number; t?: string;
}

export function encodeCreature(c: FieldCreature): string {
  const packed: Packed = {
    i: c.id, c: c.charId, m: c.morphology, n: c.intensity, s: c.secondaryLabel,
    e: c.cell, na: c.name, p: c.primaryLabel, r: c.rationale, b: c.bornAt, t: c.text,
  };
  return b64urlEncode(JSON.stringify(packed));
}

export function decodeCreature(token: string): FieldCreature | null {
  try {
    const p = JSON.parse(b64urlDecode(token)) as Packed;
    if (typeof p.i !== 'string' || typeof p.c !== 'number' || !p.m) return null;
    if (p.c < 0 || p.c > 6) return null;
    return {
      id: p.i,
      charId: p.c as CharId,
      morphology: p.m,
      intensity: typeof p.n === 'number' ? p.n : 0.5,
      secondaryLabel: p.s,
      // position isn't shared — drop it somewhere pleasant if it ever joins.
      x: 0.3 + Math.random() * 0.4,
      y: 0.28 + Math.random() * 0.4,
      cell: typeof p.e === 'number' ? p.e : 5,
      name: p.na,
      primaryLabel: p.p,
      rationale: p.r,
      bornAt: p.b,
      text: p.t,
    };
  } catch {
    return null;
  }
}

/** Full shareable URL for a creature (origin + path + ?s=token). */
export function shareUrl(c: FieldCreature): string {
  const base =
    typeof window !== 'undefined'
      ? window.location.origin + window.location.pathname
      : '';
  return `${base}?s=${encodeCreature(c)}`;
}
