import { worldToScreen } from './camera';
import { drawText, measureText } from './font';

interface HudBit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

interface DamagePop {
  x: number;
  y: number;
  life: number;
  text: string;
}

const shower: HudBit[] = [];
const pops: DamagePop[] = [];

const POP_MS = 600;
const POP_RISE = 12;

export function spawnDamageNumber(x: number, y: number, amount: number): void {
  const n = Math.round(amount);
  if (n <= 0) {
    return;
  }
  pops.push({
    x: x + (Math.random() - 0.5) * 6,
    y,
    life: POP_MS,
    text: String(n),
  });
}

export function spawnHudShower(x: number, y: number, color: number, count = 36): void {
  const css = '#' + color.toString(16).padStart(6, '0');
  for (let i = 0; i < count; i++) {
    shower.push({
      x: x + (Math.random() - 0.5) * 8,
      y: y + (Math.random() - 0.5) * 4,
      vx: (Math.random() - 0.5) * 0.12,
      vy: 0.04 + Math.random() * 0.14,
      life: 520 + Math.random() * 380,
      color: css,
      size: Math.random() < 0.4 ? 3 : 2,
    });
  }
}

export function resetFx(): void {
  shower.length = 0;
  pops.length = 0;
}

export function updateDamagePops(dt: number): void {
  for (let i = pops.length - 1; i >= 0; i--) {
    pops[i].life -= dt;
    if (pops[i].life <= 0) {
      pops.splice(i, 1);
    }
  }
}

export function updateHudShower(dt: number): void {
  for (let i = shower.length - 1; i >= 0; i--) {
    const p = shower[i];
    p.vy += 0.00035 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) {
      shower.splice(i, 1);
    }
  }
}

export function drawFx(
  ctx: CanvasRenderingContext2D,
  viewWidth: number,
  viewHeight: number
): void {
  for (const pop of pops) {
    const t = 1 - pop.life / POP_MS;
    const { w, h } = measureText(pop.text);
    const s = worldToScreen(pop.x, 0, pop.y, viewWidth, viewHeight);
    const sx = Math.floor(s.x - w / 2);
    const sy = Math.floor(s.y - t * POP_RISE);
    if (sx + w < 0 || sy + h < 0 || sx > viewWidth || sy > viewHeight) {
      continue;
    }
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = '#000';
    ctx.fillRect(sx - 1, sy - 1, w + 2, h + 2);
    drawText(ctx, pop.text, sx, sy);
  }
  for (const p of shower) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 500));
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size);
  }
  ctx.globalAlpha = 1;
}
