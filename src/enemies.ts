import { spawnDamageNumber } from './fx';
import { playHit } from './music';
import { RAINBOW_COLORS } from './palette';
import { spawnExplosion } from './particles';
import { dropEliteLoot, dropLoot } from './pickups';
import { damagePlayer, getPlayerHitbox } from './player';
import { measureContentBox, queueSprite, sheetUv } from './sprites';

const TIER_SHEET_INDEX = [4, 1, 0, 2, 6, 3, 5, 7];
const ENEMY_OX = 11;
const CELL_W = 7;
const CELL_H = 9;

const ENEMY_CAP = 150;
const MAX_SWARM_ELITES = 4;
const ELITE_CHANCE = 0.04;
const ELITE_HP_MUL = 10;
const SPAWN_INTERVAL_MS = 500;
const SPAWN_MARGIN = 16;
const TELEPORT_FACTOR = 1.75;
const CONTACT_TICK_MS = 500;
const ENEMY_SPEED = 0.03;
const BOB_PERIOD_MS = 900;

const GRID_CELL = 22;
const GRID_W = 64;
const GRID_H = 64;
const GRID_SPAN = GRID_W * GRID_CELL;

interface EnemyType {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  hitX: number;
  hitY: number;
  hitW: number;
  hitH: number;
  radius: number;
  contactDamage: number;
  hp: number;
}

const enemyTypes: EnemyType[] = [];

export interface Enemy {
  x: number;
  y: number;
  type: number;
  hp: number;
  kbX: number;
  kbY: number;
  bobTime: number;
  contactTimer: number;
  frozen: number;
  slowed: number;
  boss: boolean;
  color: number;
  maxHp: number;
  cd: number;
  boost: number;
  chasing: boolean;
}

export const enemies: Enemy[] = [];

let unlockedTiers = 1;

function hitOf(enemy: Enemy): EnemyType {
  return enemyTypes[enemy.type];
}

export function initEnemyTypes(): void {
  enemyTypes.length = 0;
  for (let tier = 0; tier < TIER_SHEET_INDEX.length; tier++) {
    const sheetIndex = TIER_SHEET_INDEX[tier];
    const sheetX = ENEMY_OX + (sheetIndex % 4) * CELL_W;
    const sheetY = sheetIndex < 4 ? 0 : CELL_H;
    const box = measureContentBox(sheetX, sheetY, CELL_W, CELL_H);
    const uv = sheetUv(sheetX, sheetY, CELL_W, CELL_H);
    enemyTypes.push({
      u0: uv.u0,
      v0: uv.v0,
      u1: uv.u1,
      v1: uv.v1,
      hitX: box.x,
      hitY: box.y,
      hitW: box.w,
      hitH: box.h,
      radius: Math.max(box.w, box.h) / 2,
      contactDamage: tier + 1,
      hp: 8 + tier * 4,
    });
  }
}

let spawnTimer = 0;
let lastSpawnRadius = 200;
let regulars = 0;
let swarmElites = 0;

export function resetEnemies(): void {
  enemies.length = 0;
  spawnTimer = 0;
  unlockedTiers = 1;
  regulars = 0;
  swarmElites = 0;
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
  lastSpawnRadius = spawnRadius;
  const playerHit = getPlayerHitbox();
  const playerCenterX = playerHit.x + playerHit.w / 2;
  const playerCenterY = playerHit.y + playerHit.h / 2;

  spawnTimer += dt;
  while (spawnTimer >= SPAWN_INTERVAL_MS) {
    spawnTimer -= SPAWN_INTERVAL_MS;
    trySpawn(playerCenterX, playerCenterY, spawnRadius);
  }

  const teleportRadius = spawnRadius * TELEPORT_FACTOR;

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

    const centerX = enemy.x + type.hitX + type.hitW / 2;
    const centerY = enemy.y + type.hitY + type.hitH / 2;
    const towardX = playerCenterX - centerX;
    const towardY = playerCenterY - centerY;
    const dist = Math.hypot(towardX, towardY);

    if (!enemy.boss && dist > teleportRadius) {
      if (regulars >= ENEMY_CAP - 5) {
        enemies.splice(i, 1);
        regulars--;
      } else {
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
      }
      continue;
    }

    if (enemy.kbX !== 0 || enemy.kbY !== 0) {
      enemy.x += enemy.kbX * dt;
      enemy.y += enemy.kbY * dt;
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

    const hitLeft = enemy.x + type.hitX;
    const hitTop = enemy.y + type.hitY;
    const overlapW =
      Math.min(hitLeft + type.hitW, playerHit.x + playerHit.w) - Math.max(hitLeft, playerHit.x);
    const overlapH =
      Math.min(hitTop + type.hitH, playerHit.y + playerHit.h) - Math.max(hitTop, playerHit.y);
    if (
      overlapW > 0 &&
      overlapH > 0 &&
      overlapW * overlapH > 0.1 * type.hitW * type.hitH &&
      enemy.contactTimer <= 0
    ) {
      damagePlayer(type.contactDamage);
      enemy.contactTimer = CONTACT_TICK_MS;
    }
  }

  separate();
}

function trySpawn(playerCenterX: number, playerCenterY: number, radius: number): void {
  if (regulars < ENEMY_CAP) {
    spawnAt(playerCenterX, playerCenterY, radius, false);
  }
  if (Math.random() < ELITE_CHANCE && swarmElites < MAX_SWARM_ELITES) {
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
  const hp = type.hp * ELITE_HP_MUL;
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

export function spawnPortalElite(x: number, y: number): void {
  const tier = Math.min(7, unlockedTiers - 1);
  const type = enemyTypes[tier];
  pushElite(x - type.hitX - type.hitW / 2, y - type.hitY - type.hitH / 2, tier, (Math.random() * 7) | 0, true);
}

export function spawnBurst(count: number): void {
  const playerHit = getPlayerHitbox();
  for (let i = 0; i < count; i++) {
    trySpawn(playerHit.x + playerHit.w / 2, playerHit.y + playerHit.h / 2, lastSpawnRadius);
  }
}

function findSpawnSpot(
  type: EnemyType,
  playerCenterX: number,
  playerCenterY: number,
  radius: number
): { x: number; y: number } {
  const angle = Math.random() * Math.PI * 2;
  const hitLeft = playerCenterX + Math.cos(angle) * radius - type.hitW / 2;
  const hitTop = playerCenterY + Math.sin(angle) * radius - type.hitH / 2;
  return { x: hitLeft - type.hitX, y: hitTop - type.hitY };
}

const gridHead = new Int32Array(GRID_W * GRID_H);
const gridNext = new Int32Array(ENEMY_CAP);

function cellCoord(value: number, origin: number, max: number): number {
  return Math.min(max - 1, Math.max(0, Math.floor((value - origin) / GRID_CELL)));
}

function separate(): void {
  const playerHit = getPlayerHitbox();
  const originX = playerHit.x + playerHit.w / 2 - GRID_SPAN / 2;
  const originY = playerHit.y + playerHit.h / 2 - GRID_SPAN / 2;

  gridHead.fill(-1);
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    const type = hitOf(enemy);
    const cell =
      cellCoord(enemy.y + type.hitY + type.hitH / 2, originY, GRID_H) * GRID_W +
      cellCoord(enemy.x + type.hitX + type.hitW / 2, originX, GRID_W);
    gridNext[i] = gridHead[cell];
    gridHead[cell] = i;
  }

  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    const typeA = hitOf(a);
    const ax = a.x + typeA.hitX + typeA.hitW / 2;
    const ay = a.y + typeA.hitY + typeA.hitH / 2;
    const cellX = cellCoord(ax, originX, GRID_W);
    const cellY = cellCoord(ay, originY, GRID_H);
    for (let gy = Math.max(0, cellY - 1); gy <= Math.min(GRID_H - 1, cellY + 1); gy++) {
      for (let gx = Math.max(0, cellX - 1); gx <= Math.min(GRID_W - 1, cellX + 1); gx++) {
        for (let j = gridHead[gy * GRID_W + gx]; j !== -1; j = gridNext[j]) {
          if (j <= i) {
            continue;
          }
          const b = enemies[j];
          const typeB = hitOf(b);
          const minDist = (typeA.radius + typeB.radius) * 0.5;
          let dx = b.x + typeB.hitX + typeB.hitW / 2 - ax;
          let dy = b.y + typeB.hitY + typeB.hitH / 2 - ay;
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
    const type = hitOf(enemy);
    const ex = enemy.x + type.hitX + type.hitW / 2;
    const ey = enemy.y + type.hitY + type.hitH / 2;
    const minDist = (type.radius + pRadius) * 0.6;
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

function enemyDown(enemy: Enemy): boolean {
  return enemy.frozen > 0 || enemy.bobTime % BOB_PERIOD_MS < BOB_PERIOD_MS / 2;
}

export function enemyFeet(enemy: Enemy): { x: number; z: number; scale: number; down: boolean } {
  const scale = enemy.boss ? 2 : 1;
  const down = enemyDown(enemy);
  return {
    x: enemy.x + CELL_W / 2,
    z: enemy.y + CELL_H / 2 + (CELL_H * scale) / 2 - (down ? 0 : 1),
    scale,
    down,
  };
}

export function queueEnemies(): void {
  for (const enemy of enemies) {
    const type = hitOf(enemy);
    const feet = enemyFeet(enemy);
    queueSprite(
      feet.x,
      0,
      feet.z,
      CELL_W * feet.scale,
      CELL_H * feet.scale,
      { u0: type.u0, v0: type.v0, u1: type.u1, v1: type.v1 }
    );
  }
}

export function enemyShadow(enemy: Enemy): { x: number; z: number; r: number } {
  const feet = enemyFeet(enemy);
  return { x: feet.x, z: feet.z, r: (feet.down ? 5 : 3) * feet.scale };
}

export function enemyHitbox(enemy: Enemy): { x: number; y: number; w: number; h: number } {
  const type = hitOf(enemy);
  return { x: enemy.x + type.hitX, y: enemy.y + type.hitY, w: type.hitW, h: type.hitH };
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
  enemy.kbX = (dx / dist) * speed;
  enemy.kbY = (dy / dist) * speed;
}
