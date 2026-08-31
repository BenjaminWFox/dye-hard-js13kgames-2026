import { moveForwardX, moveForwardZ, moveRightX, moveRightZ } from './camera';
import { BOB_MS, PLAYER_HEIGHT, PLAYER_HIT, PLAYER_SPEED, PLAYER_WIDTH } from './constants';
import { moveAxis } from './input';
import { spawnExplosion } from './particles';
import {
  CON_HP_PER_RANK,
  SHOP_REVIVE,
  SHOP_START_HP,
  START_HP_PER_RANK,
  STAT_CON,
  STAT_DEX,
  shopRanks,
  speedMul,
  totalStat,
} from './stats';

export const player = {
  // Top-left of the 11×19 sprite, gameplay (x, y) → world (x, 0, y)
  x: 0,
  y: 0,
  moving: false,
  bobTime: 0,
  hp: 100,
  maxHp: 100,
  frozen: 0,
  boost: 0,
  lives: 0,
  iframes: 0,
};

const IFRAME_MS = 2000;

export function playerFeet(): { x: number; z: number } {
  return { x: player.x + PLAYER_WIDTH / 2, z: player.y + PLAYER_HEIGHT };
}

export function damagePlayer(amount: number): void {
  if (amount <= 0 || player.hp <= 0 || player.iframes > 0) {
    return;
  }
  if (player.frozen > 0) {
    amount *= 1.25;
  }
  amount *= 1 - 0.1 * totalStat(STAT_DEX);
  const hit = getPlayerHitbox();
  const cx = hit.x + hit.w / 2;
  const cy = hit.y + hit.h / 2;
  spawnExplosion(cx, cy, 0x000000, 5);
  spawnExplosion(cx, cy, 0xffffff, 5);
  player.hp = Math.max(0, player.hp - amount);
}

export function freezePlayer(ms: number): void {
  if (player.iframes > 0) {
    return;
  }
  player.frozen = Math.max(player.frozen, ms);
}

export function tryRevive(): boolean {
  if (player.hp > 0 || player.lives <= 0) {
    return false;
  }
  player.lives--;
  player.hp = player.maxHp;
  player.frozen = 0;
  player.iframes = IFRAME_MS;
  const hit = getPlayerHitbox();
  spawnExplosion(hit.x + hit.w / 2, hit.y + hit.h / 2, 0xffffff, 16);
  spawnExplosion(hit.x + hit.w / 2, hit.y + hit.h / 2, 0xcecece, 10);
  return true;
}

export function resetPlayer(): void {
  player.x = 0;
  player.y = 0;
  player.moving = false;
  player.bobTime = 0;
  player.maxHp =
    100 + CON_HP_PER_RANK * totalStat(STAT_CON) + START_HP_PER_RANK * shopRanks[SHOP_START_HP];
  player.hp = player.maxHp;
  player.frozen = 0;
  player.boost = 0;
  player.lives = shopRanks[SHOP_REVIVE];
  player.iframes = 0;
}

export function updatePlayer(dt: number): void {
  if (player.iframes > 0) {
    player.iframes = Math.max(0, player.iframes - dt);
  }
  if (player.boost > 0) {
    player.boost = Math.max(0, player.boost - dt);
  }
  if (player.frozen > 0) {
    player.frozen = Math.max(0, player.frozen - dt);
    player.moving = false;
    return;
  }

  const axis = moveAxis();
  player.moving = axis.x !== 0 || axis.y !== 0;
  if (!player.moving) {
    return;
  }
  player.bobTime += dt;
  const speed = PLAYER_SPEED * speedMul(player.boost);
  player.x += (moveRightX * axis.x + moveForwardX * axis.y) * speed * dt;
  player.y += (moveRightZ * axis.x + moveForwardZ * axis.y) * speed * dt;
}

/** 1 while the sprite is on the "up" bob frame, else 0. */
export function bobLift(): number {
  return ((player.bobTime / BOB_MS) | 0) % 2;
}

export function shadowRadius(): number {
  return bobLift() ? 8 : 11;
}

/** 11×11 hitbox aligned to the bottom of the 11×19 sprite. */
export function getPlayerHitbox(
  x = player.x,
  y = player.y
): { x: number; y: number; w: number; h: number } {
  return {
    x,
    y: y + (PLAYER_HEIGHT - PLAYER_HIT),
    w: PLAYER_HIT,
    h: PLAYER_HIT,
  };
}
