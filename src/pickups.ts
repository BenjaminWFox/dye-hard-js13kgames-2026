import { PLAYER_SPEED, PLAYER_WIDTH } from './constants';
import { playCrystal } from './music';
import { getPlayerHitbox } from './player';
import { bakeCell, queueSprite, sheetUv } from './sprites';
import { SHOP_MAGNET, shopRanks } from './stats';

export const PICKUP_CRYSTAL = 0;
export const PICKUP_SCRAP = 1;

const CRYSTAL_CHANCE = 0.5;
const SCRAP_CHANCE = 0.2;

const MAGNET_RADIUS = PLAYER_WIDTH * 2;
const PULL_SPEED = PLAYER_SPEED * 1.5;
const MAGNET_DELAY_MS = 500;
export const CRYSTAL_W = 4;
export const CRYSTAL_H = 6;
export const SCRAP_W = 6;
export const SCRAP_H = 6;

interface Pickup {
  x: number;
  y: number;
  kind: number;
  delay: number;
}

export const pickups: Pickup[] = [];

export let xp = 0;
export let level = 1;
export let scrap = 0;
export let pendingLevelUps = 0;

const crystalUv = { u0: 0, v0: 0, u1: 1, v1: 1 };
const scrapUv = { u0: 0, v0: 0, u1: 1, v1: 1 };
export let scrapSprite: HTMLCanvasElement;

export function xpNeeded(): number {
  return 5 * level;
}

export function addXp(amount: number): void {
  xp += amount;
  while (xp >= xpNeeded()) {
    xp -= xpNeeded();
    level++;
    pendingLevelUps++;
  }
}

export function consumeLevelUp(): boolean {
  if (pendingLevelUps <= 0) {
    return false;
  }
  pendingLevelUps--;
  return true;
}

export function setScrap(n: number): void {
  scrap = Math.max(0, n | 0);
}

export function spendScrap(amount: number): boolean {
  if (scrap < amount) {
    return false;
  }
  scrap -= amount;
  return true;
}

export function resetPickups(): void {
  pickups.length = 0;
  xp = 0;
  level = 1;
  pendingLevelUps = 0;
}

export function bakePickups(): void {
  Object.assign(crystalUv, sheetUv(12, 29, CRYSTAL_W, CRYSTAL_H));
  Object.assign(scrapUv, sheetUv(16, 29, SCRAP_W, SCRAP_H));
  scrapSprite = bakeCell(16, 29, SCRAP_W, SCRAP_H);
}

export function dropEliteLoot(x: number, y: number): void {
  for (let i = 0; i < 3; i++) {
    dropLoot(x + (Math.random() - 0.5) * 12, y + (Math.random() - 0.5) * 12);
  }
  for (let i = 0; i < 2; i++) {
    pickups.push({
      x: x - SCRAP_W / 2 + (Math.random() - 0.5) * 12,
      y: y - SCRAP_H / 2 + (Math.random() - 0.5) * 12,
      kind: PICKUP_SCRAP,
      delay: MAGNET_DELAY_MS,
    });
  }
}

export function dropLoot(x: number, y: number): void {
  if (Math.random() < CRYSTAL_CHANCE) {
    pickups.push({
      x: x - CRYSTAL_W / 2 + (Math.random() - 0.5) * 4,
      y: y - CRYSTAL_H / 2 + (Math.random() - 0.5) * 4,
      kind: PICKUP_CRYSTAL,
      delay: MAGNET_DELAY_MS,
    });
  }
  if (Math.random() < SCRAP_CHANCE) {
    pickups.push({
      x: x - SCRAP_W / 2 + (Math.random() - 0.5) * 4,
      y: y - SCRAP_H / 2 + (Math.random() - 0.5) * 4,
      kind: PICKUP_SCRAP,
      delay: MAGNET_DELAY_MS,
    });
  }
}

export function updatePickups(dt: number): void {
  const hit = getPlayerHitbox();
  const cx = hit.x + hit.w / 2;
  const cy = hit.y + hit.h / 2;
  const pull = PULL_SPEED * dt;
  const magnet = MAGNET_RADIUS * (1 + 0.25 * shopRanks[SHOP_MAGNET]);

  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    if (p.delay > 0) {
      p.delay -= dt;
      continue;
    }
    const pw = p.kind === PICKUP_CRYSTAL ? CRYSTAL_W : SCRAP_W;
    const ph = p.kind === PICKUP_CRYSTAL ? CRYSTAL_H : SCRAP_H;
    const pcx = p.x + pw / 2;
    const pcy = p.y + ph / 2;
    const dx = cx - pcx;
    const dy = cy - pcy;
    const dist = Math.hypot(dx, dy);

    if (dist < magnet && dist > 0.01) {
      const step = Math.min(pull, dist);
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
    }

    if (p.x < hit.x + hit.w && p.x + pw > hit.x && p.y < hit.y + hit.h && p.y + ph > hit.y) {
      if (p.kind === PICKUP_CRYSTAL) {
        addXp(1);
        playCrystal();
      } else {
        scrap += 1;
      }
      pickups.splice(i, 1);
    }
  }
}

export function queuePickups(): void {
  for (const p of pickups) {
    const crystal = p.kind === PICKUP_CRYSTAL;
    const w = crystal ? CRYSTAL_W : SCRAP_W;
    const h = crystal ? CRYSTAL_H : SCRAP_H;
    queueSprite(p.x + w / 2, 0, p.y + h, w, h, crystal ? crystalUv : scrapUv);
  }
}
