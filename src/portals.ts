import { worldToScreen } from './camera';
import { WAVE_ORIGIN_R } from './constants';
import { spawnDamageNumber } from './fx';
import { playHit } from './music';
import { queueSprite, sheetUv } from './sprites';

export const PORTAL_W = 12;
export const PORTAL_H = 23;
export const PORTAL_MAX_HP = 100;
const MARKER_PAD = 14;
const MARKER_LEN = 7;
const MARKER_HALF = 5;

interface Portal {
  x: number;
  y: number;
  hp: number;
}

export const portals: Portal[] = [];
let portalsGone = 0;
const portalUv = { u0: 0, v0: 0, u1: 1, v1: 1 };
let slain: { color: number; x: number; y: number } | null = null;

export function bakePortals(): void {
  Object.assign(portalUv, sheetUv(0, 19, PORTAL_W, PORTAL_H));
}

export function resetPortals(): void {
  portals.length = 0;
  portalsGone = 0;
  slain = null;
  for (let i = 0; i < 7; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI * 2) / 7;
    portals.push({
      x: Math.cos(ang) * WAVE_ORIGIN_R - PORTAL_W / 2,
      y: Math.sin(ang) * WAVE_ORIGIN_R - PORTAL_H / 2,
      hp: PORTAL_MAX_HP,
    });
  }
}

export function portalLive(i: number): boolean {
  return i < 7 && !(portalsGone & (1 << i)) && !!portals[i];
}

export function allPortalsGone(): boolean {
  return portalsGone === 127;
}

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
  slain = { color: i, x: p.x + PORTAL_W / 2, y: p.y + PORTAL_H / 2 };
  return true;
}

export function takeSlainPortal(): { color: number; x: number; y: number } | null {
  const out = slain;
  slain = null;
  return out;
}

export function hurtPortalsRing(
  cx: number,
  cy: number,
  r: number,
  amount: number,
  seen: number
): number {
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

export function queuePortals(): void {
  for (let i = 0; i < 7; i++) {
    if (!portalLive(i)) {
      continue;
    }
    const p = portals[i];
    queueSprite(p.x + PORTAL_W / 2, 0, p.y + PORTAL_H, PORTAL_W, PORTAL_H, portalUv);
  }
}

export function drawPortalBars(
  ctx: CanvasRenderingContext2D,
  viewWidth: number,
  viewHeight: number
): void {
  for (let i = 0; i < 7; i++) {
    if (!portalLive(i)) {
      continue;
    }
    const p = portals[i];
    const s = worldToScreen(p.x + PORTAL_W / 2, 0, p.y + PORTAL_H, viewWidth, viewHeight);
    const sx = Math.floor(s.x - PORTAL_W / 2);
    const sy = Math.floor(s.y + 1);
    ctx.fillStyle = '#000';
    ctx.fillRect(sx, sy, PORTAL_W, 3);
    ctx.fillStyle = '#fff';
    ctx.fillRect(sx + 1, sy + 1, Math.round((PORTAL_W - 2) * (p.hp / PORTAL_MAX_HP)), 1);
  }
}

export function drawPortalMarkers(
  ctx: CanvasRenderingContext2D,
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
    const s = worldToScreen(p.x + PORTAL_W / 2, 0, p.y + PORTAL_H / 2, viewWidth, viewHeight);
    if (s.x > 0 && s.y > 0 && s.x < viewWidth && s.y < viewHeight) {
      continue;
    }
    const dx = s.x - cx;
    const dy = s.y - cy;
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
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
