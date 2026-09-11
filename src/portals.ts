import { PLAYER_SPAWN_X, PLAYER_SPAWN_Y } from './constants';
import { spawnDamageNumber } from './fx';
import { playHit } from './music';
import { hex, RAINBOW_COLORS } from './palette';
import { createSprite } from './sprites';

export const PORTAL_W = 12;
export const PORTAL_H = 20;
/** Base HP; remaining portals gain this again each time one is destroyed. */
const PORTAL_HP = 25;
/** Test ring around spawn. */
const RING = 500;
const MARKER_PAD = 14;
/** Half-length of the edge marker triangle (tip to base). */
const MARKER_LEN = 7;
const MARKER_HALF = 5;
const SURFACE = 0xcecece;
const BODY = 0x747474;
const STATIC_MS = 80;

interface Portal {
  x: number;
  y: number;
  hp: number;
}

export const portals: Portal[] = [];
/** Bit i set = portal i is gone. */
let portalsGone = 0;

/** [color][frame] — light surface tinted; frame 1 mirrors the crackle. */
let portalSpr: HTMLCanvasElement[][];
/** Single pending death; portals are far enough that one pulse cannot kill two. */
let slain: { color: number; x: number; y: number } | null = null;

function tintPortal(base: HTMLCanvasElement, color: number, mirror: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = PORTAL_W;
  canvas.height = PORTAL_H;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const src = (base.getContext('2d') as CanvasRenderingContext2D).getImageData(
    0,
    0,
    PORTAL_W,
    PORTAL_H
  ).data;
  const img = ctx.createImageData(PORTAL_W, PORTAL_H);
  const d = img.data;
  const cr = (color >> 16) & 255;
  const cg = (color >> 8) & 255;
  const cb = color & 255;
  for (let y = 0; y < PORTAL_H; y++) {
    for (let x = 0; x < PORTAL_W; x++) {
      const i = (y * PORTAL_W + x) << 2;
      const a = src[i + 3];
      if (!a) {
        continue;
      }
      const rgb = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
      const si = (y * PORTAL_W + (mirror ? PORTAL_W - 1 - x : x)) << 2;
      const light = ((src[si] << 16) | (src[si + 1] << 8) | src[si + 2]) === SURFACE;
      const tint = light && (rgb === SURFACE || rgb === BODY);
      d[i] = tint ? cr : src[i];
      d[i + 1] = tint ? cg : src[i + 1];
      d[i + 2] = tint ? cb : src[i + 2];
      d[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function bakePortals(): void {
  const base = createSprite(0, 19, PORTAL_W, PORTAL_H);
  portalSpr = [];
  for (let i = 0; i < 7; i++) {
    portalSpr.push([
      tintPortal(base, RAINBOW_COLORS[i], false),
      tintPortal(base, RAINBOW_COLORS[i], true),
    ]);
  }
}

export function resetPortals(): void {
  portals.length = 0;
  portalsGone = 0;
  slain = null;
  for (let i = 0; i < 7; i++) {
    // Red at 12 o'clock, ROYGBIV clockwise.
    const ang = -Math.PI / 2 + (i * Math.PI * 2) / 7;
    portals.push({
      x: PLAYER_SPAWN_X + Math.cos(ang) * RING - PORTAL_W / 2,
      y: PLAYER_SPAWN_Y + Math.sin(ang) * RING - PORTAL_H / 2,
      hp: PORTAL_HP,
    });
  }
  // DEBUGSTUB: leave only the red (12 o'clock) portal. Delete these two lines.
  // portalsGone = 126;
  // portals[0].hp = PORTAL_HP * 7;
}

/** True if portal `i` is still a target. */
export function portalLive(i: number): boolean {
  return i < 7 && !(portalsGone & (1 << i)) && !!portals[i];
}

/** 25 + 25 per destroyed portal. */
function portalMaxHp(): number {
  let gone = 0;
  for (let g = portalsGone; g; g >>= 1) {
    gone += g & 1;
  }
  return PORTAL_HP * (1 + gone);
}

/** True if this hit killed the portal. */
export function damagePortal(i: number, amount: number): boolean {
  if (!portalLive(i) || amount <= 0 || portals[i].hp <= 0) {
    return false;
  }
  const p = portals[i];
  spawnDamageNumber(p.x + PORTAL_W / 2, p.y - 6, amount);
  playHit();
  p.hp -= amount;
  if (p.hp > 0) {
    return false;
  }
  p.hp = 0;
  portalsGone |= 1 << i;
  for (let j = 0; j < 7; j++) {
    if (portalLive(j)) {
      portals[j].hp += PORTAL_HP;
    }
  }
  slain = { color: i, x: p.x + PORTAL_W / 2, y: p.y + PORTAL_H / 2 };
  return true;
}

export function takeSlainPortal(): { color: number; x: number; y: number } | null {
  const out = slain;
  slain = null;
  return out;
}

/**
 * Damage portals whose center is inside radius `r`.
 * `seen` is a 7-bit mask; returns the updated mask.
 */
export function hurtPortalsRing(cx: number, cy: number, r: number, amount: number, seen: number): number {
  for (let i = 0; i < 7; i++) {
    if (seen & (1 << i) || !portalLive(i)) {
      continue;
    }
    const p = portals[i];
    if (Math.hypot(p.x + PORTAL_W / 2 - cx, p.y + PORTAL_H / 2 - cy) <= r) {
      damagePortal(i, amount);
      seen |= 1 << i;
    }
  }
  return seen;
}

export function drawPortals(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  viewWidth: number,
  viewHeight: number
): void {
  for (let i = 0; i < 7; i++) {
    if (!portalLive(i)) {
      continue;
    }
    const p = portals[i];
    const sx = Math.floor(p.x - cameraX);
    const sy = Math.floor(p.y - cameraY);
    if (sx + PORTAL_W < 0 || sy + PORTAL_H < 0 || sx > viewWidth || sy > viewHeight) {
      continue;
    }
    ctx.drawImage(portalSpr[i][((Date.now() / STATIC_MS) | 0) & 1], sx, sy);
    ctx.fillStyle = '#000';
    ctx.fillRect(sx, sy + PORTAL_H + 1, PORTAL_W, 3);
    ctx.fillStyle = '#fff';
    ctx.fillRect(sx + 1, sy + PORTAL_H + 2, Math.round((PORTAL_W - 2) * (p.hp / portalMaxHp())), 1);
  }
}

/** Colored edge triangles toward off-screen live portals. */
export function drawPortalMarkers(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  viewWidth: number,
  viewHeight: number
): void {
  const cx = viewWidth / 2;
  const cy = viewHeight / 2;
  const hw = cx - MARKER_PAD;
  const hh = cy - MARKER_PAD;
  for (let i = 0; i < 7; i++) {
    if (!portalLive(i)) {
      continue;
    }
    const p = portals[i];
    const left = p.x - cameraX;
    const top = p.y - cameraY;
    if (left + PORTAL_W > 0 && top + PORTAL_H > 0 && left < viewWidth && top < viewHeight) {
      continue;
    }
    const sx = left + PORTAL_W / 2;
    const sy = top + PORTAL_H / 2;
    const dx = sx - cx;
    const dy = sy - cy;
    let t = 1;
    if (dx !== 0) {
      t = Math.min(t, hw / Math.abs(dx));
    }
    if (dy !== 0) {
      t = Math.min(t, hh / Math.abs(dy));
    }
    const mx = Math.floor(cx + dx * t) + 0.5;
    const my = Math.floor(cy + dy * t) + 0.5;
    const snap = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const cos = Math.cos(snap);
    const sin = Math.sin(snap);
    // Tip at +MARKER_LEN along heading; base corners offset perpendicular.
    const tipX = mx + cos * MARKER_LEN;
    const tipY = my + sin * MARKER_LEN;
    const bx = mx - cos * (MARKER_LEN - 2);
    const by = my - sin * (MARKER_LEN - 2);
    const px = -sin * MARKER_HALF;
    const py = cos * MARKER_HALF;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(bx + px, by + py);
    ctx.lineTo(bx - px, by - py);
    ctx.closePath();
    ctx.fillStyle = hex(RAINBOW_COLORS[i]);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
