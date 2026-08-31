import { updateCamera, worldToScreen } from './camera';
import {
  boltColor,
  HORN_SH,
  HORN_SW,
  hornLash,
  eliteNovaStates,
  liveBolts,
  playerNovaState,
  updateCombat,
} from './combat';
import { PLAYER_HEIGHT, PLAYER_WIDTH, TARGET_VIEW_HEIGHT } from './constants';
import { enemies, enemyShadow, initEnemyTypes, queueEnemies, spawnBurst, updateEnemies } from './enemies';
import { drawFx, updateDamagePops } from './fx';
import { drawBlob, drawColorDisc, drawGround, initGround } from './ground';
import { bakeHud, drawHud, drawPlayerHp } from './hud';
import { clearPressedKeys, initInput, wasPressed } from './input';
import { initMusic } from './music';
import {
  drawOverlays,
  initOverlays,
  isWorldFrozen,
  runTime,
  SCENE_RUN,
  scene,
  updateOverlays,
} from './overlays';
import { RAINBOW_COLORS, startNextWave, updateWave, waveX, waveZ } from './palette';
import { drawParticles, drawQuad, initParticles, spawnExplosion, updateParticles } from './particles';
import { bakePickups, queuePickups, updatePickups } from './pickups';
import { bobLift, player, playerFeet, shadowRadius, updatePlayer } from './player';
import { bakePortals, drawPortalBars, drawPortalMarkers, queuePortals } from './portals';
import { beginSprites, flushSprites, initSprites, playerUv, queueSprite, sheetUv } from './sprites';

const glCanvas = document.querySelector('#gl') as HTMLCanvasElement;
const hudCanvas = document.querySelector('#hud') as HTMLCanvasElement;
const gl = glCanvas.getContext('webgl', {
  alpha: false,
  antialias: false,
  depth: false,
}) as WebGLRenderingContext;
const hud = hudCanvas.getContext('2d') as CanvasRenderingContext2D;

let debug: typeof import('./debug') | undefined;
let viewWidth = 1;
let viewHeight = 1;
const hornUv = { u0: 0, v0: 0, u1: 1, v1: 1 };

function sizeCanvas(canvas: HTMLCanvasElement, width: number, height: number, scale: number): void {
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = width * scale + 'px';
  canvas.style.height = height * scale + 'px';
}

function resize(): void {
  const scale = Math.max(1, Math.round(window.innerHeight / TARGET_VIEW_HEIGHT));
  viewWidth = Math.ceil(window.innerWidth / scale);
  viewHeight = Math.ceil(window.innerHeight / scale);
  sizeCanvas(glCanvas, viewWidth, viewHeight, scale);
  sizeCanvas(hudCanvas, viewWidth, viewHeight, scale);
  gl.viewport(0, 0, viewWidth, viewHeight);
  hud.imageSmoothingEnabled = false;
}

async function main(): Promise<void> {
  initInput(hudCanvas);
  initGround(gl);
  initParticles(gl);
  await initSprites(gl);
  Object.assign(hornUv, sheetUv(26, 29, HORN_SW, HORN_SH));
  initEnemyTypes();
  bakePickups();
  bakePortals();
  bakeHud();
  initMusic();
  initOverlays();
  if (import.meta.env.DEV) {
    debug = await import('./debug');
    const w = window as unknown as {
      explode: () => void;
      wave: () => void;
      swarm: () => void;
    };
    w.explode = () => {
      const feet = playerFeet();
      spawnExplosion(feet.x, feet.z, 0x222222);
    };
    w.wave = () => {
      const color = startNextWave();
      if (color >= 0) {
        spawnExplosion(waveX, waveZ, RAINBOW_COLORS[color]);
      }
    };
    w.swarm = () => spawnBurst(20);
  }
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(gameLoop);
}

let lastTime = 0;

function gameLoop(time: number): void {
  requestAnimationFrame(gameLoop);
  const dt = Math.min(time - lastTime, 1000 / 30);
  lastTime = time;

  updateOverlays(viewWidth, viewHeight, dt);

  if (!isWorldFrozen()) {
    const waved = debug ? debug.handleDebugKeys() : wasPressed('KeyE') ? startNextWave() : -1;
    if (waved >= 0) {
      spawnExplosion(waveX, waveZ, RAINBOW_COLORS[waved]);
    }
    updatePlayer(dt);
    updateCombat(dt, viewWidth, viewHeight);
    updateEnemies(dt, viewWidth, viewHeight);
    updatePickups(dt);
    updateWave(dt);
    updateDamagePops(dt);
  }
  updateParticles(dt);

  const feet = playerFeet();
  updateCamera(feet.x, feet.z, viewWidth, viewHeight);
  render();
  clearPressedKeys();
}

function render(): void {
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(1, 1, 1, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const feet = playerFeet();
  const nova = playerNovaState();
  drawGround(
    gl,
    feet.x,
    feet.z,
    shadowRadius(),
    nova ? nova.x : feet.x,
    nova ? nova.y : feet.z,
    nova ? nova.r : 0
  );

  if (scene === SCENE_RUN) {
    for (const enemy of enemies) {
      if (enemy.hp <= 0) {
        continue;
      }
      const blob = enemyShadow(enemy);
      drawBlob(gl, blob.x, blob.z, blob.r);
    }
    for (const n of eliteNovaStates()) {
      drawColorDisc(gl, n.x, n.y, n.r, RAINBOW_COLORS[n.color]);
    }
  }

  beginSprites();
  queuePickups();
  if (scene === SCENE_RUN) {
    queuePortals();
    queueEnemies();
  }
  const lash = hornLash();
  if (lash) {
    queueSprite(
      feet.x,
      bobLift() + (PLAYER_HEIGHT - HORN_SH) / 2,
      feet.z,
      HORN_SW,
      HORN_SH,
      hornUv,
      lash < 0,
      (lash * (PLAYER_WIDTH + HORN_SW)) / 2
    );
  }
  if (player.iframes <= 0 || ((player.iframes / 80) | 0) % 2 === 0) {
    queueSprite(feet.x, bobLift(), feet.z, PLAYER_WIDTH, PLAYER_HEIGHT, playerUv);
  }
  flushSprites(gl);

  drawParticles(gl);
  for (const bolt of liveBolts()) {
    const rgb = RAINBOW_COLORS[boltColor(bolt)];
    drawQuad(
      gl,
      bolt.x,
      3,
      bolt.y,
      4,
      4,
      ((rgb >> 16) & 255) / 255,
      ((rgb >> 8) & 255) / 255,
      (rgb & 255) / 255,
      1
    );
  }

  hud.clearRect(0, 0, viewWidth, viewHeight);
  if (scene === SCENE_RUN) {
    const screen = worldToScreen(feet.x, 0, feet.z, viewWidth, viewHeight);
    drawPlayerHp(hud, Math.floor(screen.x - PLAYER_WIDTH / 2), Math.floor(screen.y + 1));
    drawPortalBars(hud, viewWidth, viewHeight);
    drawHud(hud, viewWidth, viewHeight, runTime);
    drawPortalMarkers(hud, viewWidth, viewHeight);
    if (player.frozen > 0) {
      hud.globalAlpha = 0.35;
      hud.fillStyle = '#8df';
      hud.fillRect(
        Math.floor(screen.x - PLAYER_WIDTH / 2),
        Math.floor(screen.y - PLAYER_HEIGHT - bobLift()),
        PLAYER_WIDTH,
        PLAYER_HEIGHT
      );
      hud.globalAlpha = 1;
    }
    drawFx(hud, viewWidth, viewHeight);
  }
  drawOverlays(hud, viewWidth, viewHeight);
}

main();
