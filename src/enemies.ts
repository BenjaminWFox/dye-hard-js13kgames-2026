import { PLAYER_HEIGHT, PLAYER_WIDTH, WALK_FRAME_MS } from './constants';
import { difficultyFor } from './difficulty';
import { spawnDamageNumber, spawnExplosion } from './fx';
import { playHit } from './music';
import { RAINBOW_COLORS } from './palette';
import { dropEliteLoot, dropLoot } from './pickups';
import { damagePlayer, getPlayerHitbox, player } from './player';
import { createSprite, createWalkSprites, measureContentBox } from './sprites';
import { SHOP_KNOCK, shopRanks } from './stats';

/**
 * Difficulty ladder (easiest → hardest) mapped to sheet cell index within the
 * 7×9 enemy strip at (11,0). Ladder order: paperclip, pencil, binder clip,
 * pen, USB stick, stapler, calculator, scissors.
 */
const TIER_SHEET_INDEX = [4, 1, 0, 2, 6, 3, 5, 7];

const ENEMY_CAP = 150;
const ENEMY_CAP_PER_PORTAL = 50;
const MAX_SWARM_ELITES = 4;
/** Base regulars + 50/portal + swarm elites + one portal elite per color. */
const MAX_LIVING = ENEMY_CAP + ENEMY_CAP_PER_PORTAL * 7 + MAX_SWARM_ELITES + 8;
const ELITE_CHANCE = 0.04;
// Pack of 5 + 2 per portal; half pack before the first portal
const SPAWN_INTERVAL_MS = 500;
// Extra distance past the half view diagonal so spawns land just off-screen
const SPAWN_MARGIN = 16;
const CONTACT_TICK_MS = 500;
// px/ms — per-type speeds TBD; every type shares this for now (player is 0.046)
const ENEMY_SPEED = 0.032;
const BOB_PERIOD_MS = 900;

// Player-centered spatial hash (enemies stay near the camera)
const GRID_CELL = 22;
const GRID_W = 64;
const GRID_H = 64;
const GRID_SPAN = GRID_W * GRID_CELL;

interface EnemyType {
  canvas: HTMLCanvasElement;
  /** Content-sized hitbox, relative to the 7×9 cell origin. */
  hitX: number;
  hitY: number;
  hitW: number;
  hitH: number;
  /** Separation radius: half the larger hitbox dimension. */
  radius: number;
  contactDamage: number;
  /** Per-type HP; paperclip=8, +8 per tier. */
  hp: number;
}

const enemyTypes: EnemyType[] = [];

export interface Enemy {
  /** Top-left of the 7×9 sprite cell, world px. */
  x: number;
  y: number;
  /** Index into the difficulty ladder (0 = paperclip). */
  type: number;
  hp: number;
  /** Knockback velocity, px/ms. */
  kbX: number;
  kbY: number;
  bobTime: number;
  contactTimer: number;
  /** Remaining freeze (ms). Frozen entities take +25% damage. */
  frozen: number;
  /** Remaining slow (ms). */
  slowed: number;
  /** Elite / portal mini-boss. */
  boss: boolean;
  /** Nova color 0–6, or -1 if this enemy has no nova. */
  color: number;
  maxHp: number;
  cd: number;
  boost: number;
  chasing: boolean;
}

export const enemies: Enemy[] = [];

// Tiers allowed to spawn. Starts at paperclips; each portal unlocks the next.
let unlockedTiers = 1;

export let finalBossSprites: HTMLCanvasElement[] | undefined;
let slainFinal = false;

function hitOf(enemy: Enemy): EnemyType {
  return enemyTypes[enemy.type];
}

/** Bake one canvas + content hitbox per enemy type. Call once after the sheet loads. */
export function bakeEnemyTypes(): void {
  for (let tier = 0; tier < TIER_SHEET_INDEX.length; tier++) {
    const sheetIndex = TIER_SHEET_INDEX[tier];
    const sheetX = 11 + (sheetIndex % 4) * 7;
    const sheetY = sheetIndex < 4 ? 0 : 9;
    const box = measureContentBox(sheetX, sheetY, 7, 9);
    enemyTypes.push({
      canvas: createSprite(sheetX, sheetY, 7, 9),
      hitX: box.x,
      hitY: box.y,
      hitW: box.w,
      hitH: box.h,
      radius: Math.max(box.w, box.h) / 2,
      contactDamage: (tier + 1) * 3,
      hp: 8 + tier * 8,
    });
  }
  finalBossSprites = createWalkSprites(40, 0, PLAYER_WIDTH, PLAYER_HEIGHT);
  const box = measureContentBox(40, 0, PLAYER_WIDTH, PLAYER_HEIGHT);
  enemyTypes.push({
    canvas: finalBossSprites[0],
    hitX: box.x,
    hitY: box.y,
    hitW: box.w,
    hitH: box.h,
    radius: Math.max(box.w, box.h) / 2,
    contactDamage: 27,
    hp: 200,
  });
}

let spawnTimer = 0;
let regulars = 0;
let swarmElites = 0;

export function resetEnemies(): void {
  enemies.length = 0;
  spawnTimer = 0;
  unlockedTiers = 1;
  regulars = 0;
  swarmElites = 0;
  slainFinal = false;
}

function makeEnemy(x: number, y: number, hp: number, extra: Partial<Enemy>): Enemy {
  return {
    x,
    y,
    type: 0,
    hp,
    kbX: 0,
    kbY: 0,
    bobTime: 0,
    contactTimer: 0,
    frozen: 0,
    slowed: 0,
    boss: false,
    color: -1,
    maxHp: hp,
    cd: 0,
    boost: 0,
    chasing: false,
    ...extra,
  };
}

export function updateEnemies(dt: number, viewWidth: number, viewHeight: number): void {
  const spawnRadius = Math.hypot(viewWidth, viewHeight) / 2 + SPAWN_MARGIN;
  const playerHit = getPlayerHitbox();
  const playerCenterX = playerHit.x + playerHit.w / 2;
  const playerCenterY = playerHit.y + playerHit.h / 2;

  const spawnInterval = SPAWN_INTERVAL_MS / difficultyFor(viewWidth, viewHeight).spawnRate;
  spawnTimer += dt;
  while (spawnTimer >= spawnInterval) {
    spawnTimer -= spawnInterval;
    trySpawn(playerCenterX, playerCenterY, spawnRadius);
  }

  const halfW = viewWidth / 2 + SPAWN_MARGIN;
  const halfH = viewHeight / 2 + SPAWN_MARGIN;

  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    const type = hitOf(enemy);
    if (enemy.frozen > 0) {
      enemy.frozen = Math.max(0, enemy.frozen - dt);
    } else {
      enemy.bobTime += dt;
    }
    if (enemy.slowed > 0) {
      enemy.slowed = Math.max(0, enemy.slowed - dt);
    }
    if (enemy.boost > 0) {
      enemy.boost = Math.max(0, enemy.boost - dt);
    }
    enemy.contactTimer = Math.max(0, enemy.contactTimer - dt);

    const box = enemyHitbox(enemy);
    const centerX = box.x + box.w / 2;
    const centerY = box.y + box.h / 2;
    const towardX = playerCenterX - centerX;
    const towardY = playerCenterY - centerY;
    const dist = Math.hypot(towardX, towardY);
    const behind =
      (centerX - playerCenterX) * player.faceX + (centerY - playerCenterY) * player.faceY < 0;
    const offscreen =
      Math.abs(centerX - playerCenterX) > halfW || Math.abs(centerY - playerCenterY) > halfH;

    // Recycle off the trailing edge while moving. Idle must keep the full
    // ring — otherwise rear-half spawns get yanked back to last facing.
    if (player.moving && !enemy.boss && behind && offscreen) {
      const spot = findSpawnSpot(
        enemyTypes[enemy.type],
        playerCenterX,
        playerCenterY,
        spawnRadius
      );
      enemy.x = spot.x;
      enemy.y = spot.y;
      enemy.contactTimer = 0;
      enemy.kbX = 0;
      enemy.kbY = 0;
      continue;
    }

    if (enemy.kbX !== 0 || enemy.kbY !== 0) {
      const kbx = enemy.kbX * dt;
      const kby = enemy.kbY * dt;
      enemy.x += kbx;
      enemy.y += kby;
      const decay = Math.exp(-dt / 80);
      enemy.kbX *= decay;
      enemy.kbY *= decay;
      if (Math.hypot(enemy.kbX, enemy.kbY) < 0.01) {
        enemy.kbX = 0;
        enemy.kbY = 0;
      }
    }

    if (dist > 1 && enemy.frozen <= 0) {
      const step = ENEMY_SPEED * (enemy.slowed > 0 ? 0.5 : 1) * (enemy.boost > 0 ? 1.15 : 1) * dt;
      enemy.x += (towardX / dist) * step;
      enemy.y += (towardY / dist) * step;
    }

    // Contact at >10% of the smaller hitbox. Elites are 2×; measuring against
    // their full area made the 40% player-overlap cap in separate() unreachable.
    const hit = enemyHitbox(enemy);
    const overlapW =
      Math.min(hit.x + hit.w, playerHit.x + playerHit.w) - Math.max(hit.x, playerHit.x);
    const overlapH =
      Math.min(hit.y + hit.h, playerHit.y + playerHit.h) - Math.max(hit.y, playerHit.y);
    if (
      overlapW > 0 &&
      overlapH > 0 &&
      overlapW * overlapH > 0.1 * Math.min(hit.w * hit.h, playerHit.w * playerHit.h) &&
      enemy.contactTimer <= 0
    ) {
      damagePlayer(type.contactDamage);
      enemy.contactTimer = CONTACT_TICK_MS;
    }
  }

  separate();
}

function trySpawn(playerCenterX: number, playerCenterY: number, radius: number): void {
  for (
    let n = unlockedTiers > 1 ? 3 + unlockedTiers * 2 : 2;
    n-- && regulars < ENEMY_CAP + (unlockedTiers - 1) * ENEMY_CAP_PER_PORTAL;
  ) {
    spawnAt(playerCenterX, playerCenterY, radius, false);
  }
  if (unlockedTiers > 1 && Math.random() < ELITE_CHANCE && swarmElites < MAX_SWARM_ELITES) {
    spawnAt(playerCenterX, playerCenterY, radius, true);
  }
}

function spawnAt(
  playerCenterX: number,
  playerCenterY: number,
  radius: number,
  elite: boolean
): void {
  const tier = Math.floor(Math.random() * unlockedTiers);
  const type = enemyTypes[tier];
  const spot = findSpawnSpot(type, playerCenterX, playerCenterY, radius);
  if (elite) {
    pushElite(spot.x, spot.y, tier, (Math.random() * 7) | 0, false);
  } else {
    enemies.push(
      makeEnemy(spot.x, spot.y, type.hp, {
        type: tier,
        bobTime: Math.random() * BOB_PERIOD_MS,
      })
    );
    regulars++;
  }
}

function pushElite(x: number, y: number, tier: number, color: number, fromPortal: boolean): void {
  const type = enemyTypes[tier];
  // 5× after the first portal, +1× per portal after that (11× at 7).
  const hp = type.hp * (tier > 7 ? 1 : 3 + unlockedTiers);
  enemies.push(
    makeEnemy(x, y, hp, {
      type: tier,
      boss: true,
      color,
      maxHp: hp,
      chasing: fromPortal,
      cd: 400 + Math.random() * 800,
      bobTime: Math.random() * BOB_PERIOD_MS,
    })
  );
  if (!fromPortal) {
    swarmElites++;
  }
}

/** Portal death: elite of the newly unlocked tier, at the portal. Last portal → finale. */
export function spawnPortalElite(x: number, y: number): void {
  const tier = unlockedTiers > 7 ? 8 : unlockedTiers - 1;
  const type = enemyTypes[tier];
  pushElite(
    x - type.hitX - type.hitW / 2,
    y - type.hitY - type.hitH / 2,
    tier,
    (Math.random() * 7) | 0,
    true
  );
}

export function takeSlainFinal(): boolean {
  return slainFinal && !(slainFinal = false);
}

/** Off-screen ring: front half of heading while moving, full circle when idle. */
function findSpawnSpot(
  type: EnemyType,
  playerCenterX: number,
  playerCenterY: number,
  radius: number
): { x: number; y: number } {
  const angle = player.moving
    ? Math.atan2(player.faceY, player.faceX) + (Math.random() - 0.5) * Math.PI
    : Math.random() * Math.PI * 2;
  const hitLeft = playerCenterX + Math.cos(angle) * radius - type.hitW / 2;
  const hitTop = playerCenterY + Math.sin(angle) * radius - type.hitH / 2;
  return { x: hitLeft - type.hitX, y: hitTop - type.hitY };
}

// Linked-list spatial hash: gridHead per cell, gridNext per enemy index
const gridHead = new Int32Array(GRID_W * GRID_H);
const gridNext = new Int32Array(MAX_LIVING);

function cellCoord(value: number, origin: number, max: number): number {
  return Math.min(max - 1, Math.max(0, Math.floor((value - origin) / GRID_CELL)));
}

/**
 * Pairwise push-apart via the coarse grid: centers stay at least the
 * combined radii apart (edge-to-edge on the larger hitbox axis).
 * Enemies vs player: max 40% overlap (minDist = 60% of combined radii).
 */
function separate(): void {
  const playerHit = getPlayerHitbox();
  const originX = playerHit.x + playerHit.w / 2 - GRID_SPAN / 2;
  const originY = playerHit.y + playerHit.h / 2 - GRID_SPAN / 2;

  gridHead.fill(-1);
  const hashed = Math.min(enemies.length, gridNext.length);
  for (let i = 0; i < hashed; i++) {
    const enemy = enemies[i];
    const box = enemyHitbox(enemy);
    const cell =
      cellCoord(box.y + box.h / 2, originY, GRID_H) * GRID_W +
      cellCoord(box.x + box.w / 2, originX, GRID_W);
    gridNext[i] = gridHead[cell];
    gridHead[cell] = i;
  }

  for (let i = 0; i < hashed; i++) {
    const a = enemies[i];
    const boxA = enemyHitbox(a);
    const ax = boxA.x + boxA.w / 2;
    const ay = boxA.y + boxA.h / 2;
    const cellX = cellCoord(ax, originX, GRID_W);
    const cellY = cellCoord(ay, originY, GRID_H);
    for (let gy = Math.max(0, cellY - 1); gy <= Math.min(GRID_H - 1, cellY + 1); gy++) {
      for (let gx = Math.max(0, cellX - 1); gx <= Math.min(GRID_W - 1, cellX + 1); gx++) {
        for (let j = gridHead[gy * GRID_W + gx]; j !== -1; j = gridNext[j]) {
          if (j <= i) {
            continue;
          }
          const b = enemies[j];
          const boxB = enemyHitbox(b);
          const minDist = Math.max(boxA.w, boxA.h) / 2 + Math.max(boxB.w, boxB.h) / 2;
          let dx = boxB.x + boxB.w / 2 - ax;
          let dy = boxB.y + boxB.h / 2 - ay;
          let dist = Math.hypot(dx, dy);
          if (dist >= minDist) {
            continue;
          }
          if (dist < 0.01) {
            dx = 1;
            dy = 0;
            dist = 1;
          }
          const push = (minDist - dist) / 2 / dist;
          a.x -= dx * push;
          a.y -= dy * push;
          b.x += dx * push;
          b.y += dy * push;
        }
      }
    }
  }

  const px = playerHit.x + playerHit.w / 2;
  const py = playerHit.y + playerHit.h / 2;
  const pRadius = playerHit.w / 2;
  for (const enemy of enemies) {
    const box = enemyHitbox(enemy);
    const ex = box.x + box.w / 2;
    const ey = box.y + box.h / 2;
    // Circle 40% cap, but never so far that a 2× (tall/thin) AABB cannot overlap.
    const minDist = Math.min(
      (Math.max(box.w, box.h) / 2 + pRadius) * 0.6,
      ((box.w + playerHit.w) / 2) * 0.8,
      ((box.h + playerHit.h) / 2) * 0.8
    );
    let dx = ex - px;
    let dy = ey - py;
    let dist = Math.hypot(dx, dy);
    if (dist >= minDist) {
      continue;
    }
    if (dist < 0.01) {
      dx = 1;
      dy = 0;
      dist = 1;
    }
    const push = (minDist - dist) / dist;
    enemy.x += dx * push;
    enemy.y += dy * push;
  }
}

export function drawEnemies(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  viewWidth: number,
  viewHeight: number
): void {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  for (let pass = 0; pass < 2; pass++) {
    for (const enemy of enemies) {
      if ((enemy.type > 7) !== !!pass) {
        continue;
      }
      const type = hitOf(enemy);
      const canvas =
        enemy.type > 7
          ? finalBossSprites![enemy.frozen > 0 ? 0 : 1 + (((enemy.bobTime / WALK_FRAME_MS) | 0) % 2)]
          : type.canvas;
      const screenX = Math.floor(enemy.x - cameraX);
      const screenY = Math.floor(enemy.y - cameraY);
      const pad = enemy.boss ? canvas.width : 0;
      if (
        screenX + canvas.width + pad < 0 ||
        screenY + canvas.height + pad < 0 ||
        screenX - pad > viewWidth ||
        screenY - pad > viewHeight
      ) {
        continue;
      }
      const down = enemy.type > 7 || enemy.frozen > 0 || enemy.bobTime % BOB_PERIOD_MS < BOB_PERIOD_MS / 2;
      const scale = enemy.boss && enemy.type < 8 ? 2 : 1;
      const dw = canvas.width * scale;
      const dh = canvas.height * scale;
      const drawX = screenX - ((dw - canvas.width) >> 1);
      const drawY = screenY - (down ? 0 : 1) - ((dh - canvas.height) >> 1);
      const shadowW = (down ? 5 : 3) * scale;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(
        drawX + type.hitX * scale + ((type.hitW * scale - shadowW) >> 1),
        drawY + type.hitY * scale + type.hitH * scale,
        shadowW,
        1
      );
      ctx.drawImage(canvas, drawX, drawY, dw, dh);
      if (enemy.frozen > 0) {
        ctx.strokeStyle = '#8df';
        ctx.lineWidth = 1;
        ctx.strokeRect(
          screenX + type.hitX + 0.5,
          screenY + type.hitY - (down ? 0 : 1) + 0.5,
          type.hitW - 1,
          type.hitH - 1
        );
      }
    }
  }
}

/** World-space content hitbox. Elites match their 2× draw (centered on the 7×9 cell). */
export function enemyHitbox(enemy: Enemy): { x: number; y: number; w: number; h: number } {
  const type = hitOf(enemy);
  const s = enemy.boss && enemy.type < 8 ? 2 : 1;
  const pad = (type.canvas.width * (s - 1)) >> 1;
  return {
    x: enemy.x + type.hitX * s - pad,
    y: enemy.y + type.hitY * s - ((type.canvas.height * (s - 1)) >> 1),
    w: type.hitW * s,
    h: type.hitH * s,
  };
}

export function crowdControl(enemy: Enemy, freezeMs: number): void {
  if (enemy.boss) {
    enemy.slowed = Math.max(enemy.slowed, freezeMs * 2);
  } else {
    enemy.frozen = Math.max(enemy.frozen, freezeMs);
  }
}

export function crowdControlAt(x: number, y: number, radius: number, freezeMs: number): void {
  for (const enemy of enemies) {
    const box = enemyHitbox(enemy);
    if (Math.hypot(box.x + box.w / 2 - x, box.y + box.h / 2 - y) <= radius) {
      crowdControl(enemy, freezeMs);
    }
  }
}

/** Returns true if the enemy died. Safe to call while reverse-iterating `enemies`. */
export function hurtEnemyAt(index: number, amount: number): boolean {
  const enemy = enemies[index];
  if (enemy.frozen > 0) {
    amount *= 1.25;
  }
  const box = enemyHitbox(enemy);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  spawnDamageNumber(cx, enemy.y - 6, amount);
  playHit();
  enemy.hp -= amount;
  if (enemy.hp > 0) {
    return false;
  }
  spawnExplosion(cx, cy, enemy.boss && enemy.color >= 0 ? RAINBOW_COLORS[enemy.color] : 0xb1b1b1, 24);
  if (enemy.type > 7) {
    slainFinal = true;
  }
  if (enemy.boss) {
    dropEliteLoot(cx, cy);
    if (!enemy.chasing) {
      swarmElites--;
    }
  } else {
    dropLoot(cx, cy);
    regulars--;
  }
  enemies.splice(index, 1);
  return true;
}

export function unlockNextTier(): void {
  unlockedTiers = Math.min(8, unlockedTiers + 1);
}

export function applyKnockback(enemy: Enemy, fromX: number, fromY: number, speed: number): void {
  const box = enemyHitbox(enemy);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  let dx = cx - fromX;
  let dy = cy - fromY;
  let dist = Math.hypot(dx, dy);
  if (dist < 0.01) {
    dx = 1;
    dy = 0;
    dist = 1;
  }
  if (enemy.boss) {
    speed *= 0.5;
  }
  speed *= 1 + 0.2 * shopRanks[SHOP_KNOCK];
  enemy.kbX = (dx / dist) * speed;
  enemy.kbY = (dy / dist) * speed;
}
