import { WAVE_MAX, WAVE_ORIGIN_R, WAVE_SPEED } from './constants';

export const RAINBOW_COLORS = [
  0xe40404, 0xff8200, 0xf1e300, 0x08ba00, 0x0030e2, 0x6c00ef, 0xa656ff,
];

/** Sheet exports sometimes quantize a channel by 1. */
const ALIASES = new Map<number, number>([
  [0xff8300, 0xff8200],
  [0xff8100, 0xff8200],
  [0xff8000, 0xff8200],
  [0xf1e500, 0xf1e300],
  [0xf1e600, 0xf1e300],
  [0xf1e400, 0xf1e300],
  [0x6e00ef, 0x6c00ef],
  [0x6d00ef, 0x6c00ef],
  [0x6b00ef, 0x6c00ef],
  [0x6f00ef, 0x6c00ef],
]);

export function snapAlias(rgb: number): number {
  return ALIASES.get(rgb) ?? rgb;
}

/** 7 rgb triples, 0–1, for `uniform vec3 uRainbow[7]`. */
export const RAINBOW_F32 = new Float32Array(21);
for (let i = 0; i < 7; i++) {
  const rgb = RAINBOW_COLORS[i];
  RAINBOW_F32[i * 3] = ((rgb >> 16) & 255) / 255;
  RAINBOW_F32[i * 3 + 1] = ((rgb >> 8) & 255) / 255;
  RAINBOW_F32[i * 3 + 2] = (rgb & 255) / 255;
}

/** Bit 0 = red … bit 6 = violet. 0 = all locked (slice start). */
export let unlockedBits = 0;

export function setUnlockedBits(bits: number): void {
  unlockedBits = bits;
}

export function colorLive(index: number): boolean {
  return (unlockedBits & (1 << index)) !== 0;
}

export function greyOf(rgb: number): number {
  const r = (rgb >> 16) & 255;
  const g = (rgb >> 8) & 255;
  const b = rgb & 255;
  const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) >> 1;
  return (lightness << 16) | (lightness << 8) | lightness;
}

/** CPU palette for baked UI (title letters, etc.). */
export function currentColor(rgb: number): number {
  const snapped = snapAlias(rgb);
  const index = RAINBOW_COLORS.indexOf(snapped);
  if (index < 0 || colorLive(index)) {
    return snapped;
  }
  return greyOf(snapped);
}

export let waveX = 0;
export let waveZ = 0;
export let waveRadius = 0;
/** −1 = idle. */
export let waveColor = -1;

/** Red at 12 o'clock, ROYGBIV clockwise. Same formula as V1 portals. */
export function portalXZ(color: number, radius = WAVE_ORIGIN_R): { x: number; z: number } {
  const ang = -Math.PI / 2 + (color * Math.PI * 2) / 7;
  return { x: Math.cos(ang) * radius, z: Math.sin(ang) * radius };
}

export function clearWave(): void {
  waveColor = -1;
  waveRadius = 0;
}

function finishWave(): void {
  if (waveColor < 0) {
    return;
  }
  unlockedBits |= 1 << waveColor;
  waveColor = -1;
  waveRadius = 0;
}

export function startWave(x: number, z: number, color: number): void {
  finishWave();
  waveX = x;
  waveZ = z;
  waveRadius = 0;
  waveColor = color;
}

/** Start the next locked color from its dummy portal. Returns the color, or −1. */
export function startNextWave(): number {
  for (let i = 0; i < 7; i++) {
    if ((unlockedBits & (1 << i)) === 0 && waveColor !== i) {
      const origin = portalXZ(i);
      startWave(origin.x, origin.z, i);
      return i;
    }
  }
  return -1;
}

export function updateWave(dt: number): void {
  if (waveColor < 0) {
    return;
  }
  waveRadius += WAVE_SPEED * dt;
  if (waveRadius >= WAVE_MAX) {
    finishWave();
  }
}

export function toggleColor(index: number): void {
  if (waveColor === index) {
    finishWave();
    return;
  }
  unlockedBits ^= 1 << index;
}

/**
 * Shared GLSL: locked rainbow → HSL-lightness grey; optional color wave.
 * Paste into every program that samples art or veins.
 */
export const PALETTE_GLSL = `
uniform vec3 uRainbow[7];
uniform float uUnlocked;
uniform vec2 uWaveOrigin;
uniform float uWaveRadius;
uniform float uWaveColor;

vec3 greyOf(vec3 c) {
  float lo = min(min(c.r, c.g), c.b);
  float hi = max(max(c.r, c.g), c.b);
  float g = floor((hi + lo) * 127.5) / 255.0;
  return vec3(g);
}

bool isUnlocked(int i, vec2 xz) {
  float bit = floor(mod(uUnlocked / pow(2.0, float(i)), 2.0));
  if (bit > 0.5) {
    return true;
  }
  if (uWaveColor < 0.0) {
    return false;
  }
  if (abs(uWaveColor - float(i)) > 0.5) {
    return false;
  }
  return distance(xz, uWaveOrigin) < uWaveRadius;
}

vec3 applyPalette(vec3 rgb, vec2 xz) {
  for (int i = 0; i < 7; i++) {
    if (distance(rgb, uRainbow[i]) < 0.008) {
      if (!isUnlocked(i, xz)) {
        return greyOf(rgb);
      }
      return rgb;
    }
  }
  return rgb;
}
`;

export function setPaletteUniforms(gl: WebGLRenderingContext, program: WebGLProgram): void {
  gl.uniform3fv(gl.getUniformLocation(program, 'uRainbow'), RAINBOW_F32);
  gl.uniform1f(gl.getUniformLocation(program, 'uUnlocked'), unlockedBits);
  gl.uniform2f(gl.getUniformLocation(program, 'uWaveOrigin'), waveX, waveZ);
  gl.uniform1f(gl.getUniformLocation(program, 'uWaveRadius'), waveRadius);
  gl.uniform1f(gl.getUniformLocation(program, 'uWaveColor'), waveColor);
}
