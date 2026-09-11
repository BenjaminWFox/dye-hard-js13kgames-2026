import { TILE_H, TILE_W } from './constants';
import { cssColor, RAINBOW_COLORS, rainbowShade } from './palette';

/** Index of the white ground stamp. Slice tiles 0–6 / walls are Director's Cut. */
export const TILE_WHITE = 7;
export const TILE_WALL = 8;

/**
 * Vein overlay — independent of TILE_W / TILE_H.
 *   VEIN_W / VEIN_H — stamp pixels (2:1 is 6×12)
 *   VEIN_WIDTH / VEIN_GAP — band thickness and spacing, in vein-cells
 *   VEIN_STEP_X / VEIN_STEP_Y — diagonal in vein-cell space
 */
export const VEIN_W = 6;
export const VEIN_H = 12;
const VEIN_ALPHA = 0.25;
const VEIN_WIDTH = 1;
const VEIN_GAP = 8;
const VEIN_STRIDE = VEIN_WIDTH + VEIN_GAP;
const VEIN_PERIOD = VEIN_STRIDE * 7;

const veinCanvases: HTMLCanvasElement[] = [];

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Always white plaza ground. Veins are a separate overlay. */
export function getTile(_tx: number, _ty: number): number {
  return TILE_WHITE;
}

export const tileCanvases: HTMLCanvasElement[] = [];

export function bakeTiles(): void {
  let canvas = tileCanvases[TILE_WHITE];
  if (!canvas) {
    canvas = document.createElement('canvas');
    tileCanvases[TILE_WHITE] = canvas;
  }
  canvas.width = TILE_W;
  canvas.height = TILE_H;
  paintGround(
    canvas.getContext('2d') as CanvasRenderingContext2D,
    TILE_W,
    TILE_H,
    '#fff',
    '#cecece'
  );
  for (let color = 0; color < 7; color++) {
    let canvas = veinCanvases[color];
    if (!canvas) {
      canvas = document.createElement('canvas');
      veinCanvases[color] = canvas;
    }
    canvas.width = VEIN_W;
    canvas.height = VEIN_H;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    paintGround(
      ctx,
      VEIN_W,
      VEIN_H,
      cssColor(rainbowShade(color, 0.8)),
      cssColor(RAINBOW_COLORS[color])
    );
  }
}

function getVein(vx: number, vy: number): number {
  const d =
    (((vx + vy) % VEIN_PERIOD) + VEIN_PERIOD) % VEIN_PERIOD;
  if (d % VEIN_STRIDE < VEIN_WIDTH) {
    return (d / VEIN_STRIDE) | 0;
  }
  return -1;
}

/** Vein stamps on their own grid, drawn after white ground. */
export function drawVeins(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  viewWidth: number,
  viewHeight: number
): void {
  const x0 = Math.floor(cameraX / VEIN_W);
  const y0 = Math.floor(cameraY / VEIN_H);
  const x1 = Math.floor((cameraX + viewWidth) / VEIN_W);
  const y1 = Math.floor((cameraY + viewHeight) / VEIN_H);
  ctx.globalAlpha = VEIN_ALPHA;
  for (let vy = y0; vy <= y1; vy++) {
    for (let vx = x0; vx <= x1; vx++) {
      const color = getVein(vx, vy);
      if (color < 0) {
        continue;
      }
      ctx.drawImage(
        veinCanvases[color],
        Math.floor(vx * VEIN_W - cameraX),
        Math.floor(vy * VEIN_H - cameraY)
      );
    }
  }
  ctx.globalAlpha = 1;
}

function paintGround(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  fill: string,
  highlight: string
): void {
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = highlight;
  const random = mulberry32(7);
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(Math.floor(random() * w), Math.floor(random() * h), 2, 1);
  }
}
