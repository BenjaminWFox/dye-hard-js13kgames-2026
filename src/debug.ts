import { WAVE_ORIGIN_R } from './constants';
import { spawnBurst } from './enemies';
import { wasPressed } from './input';
import {
  clearWave,
  RAINBOW_COLORS,
  setUnlockedBits,
  startWave,
  unlockedBits,
  waveColor,
  waveX,
  waveZ,
} from './palette';
import { spawnExplosion } from './particles';
import { playerFeet } from './player';

function startNextWave(): number {
  for (let i = 0; i < 7; i++) {
    if ((unlockedBits & (1 << i)) === 0 && waveColor !== i) {
      const ang = -Math.PI / 2 + (i * Math.PI * 2) / 7;
      startWave(Math.cos(ang) * WAVE_ORIGIN_R, Math.sin(ang) * WAVE_ORIGIN_R, i);
      return i;
    }
  }
  return -1;
}

function toggleColor(index: number): void {
  if (waveColor === index) {
    setUnlockedBits(unlockedBits | (1 << index));
    clearWave();
    return;
  }
  setUnlockedBits(unlockedBits ^ (1 << index));
}

/**
 * Dev-only: E starts the next color wave from its dummy portal; 1–7 toggle a bit.
 */
export function handleDebugKeys(): void {
  if (wasPressed('KeyE')) {
    const color = startNextWave();
    if (color >= 0) {
      spawnExplosion(waveX, waveZ, RAINBOW_COLORS[color]);
    }
  }
  for (let i = 0; i < 7; i++) {
    if (wasPressed('Digit' + (i + 1))) {
      toggleColor(i);
    }
  }
}

export function attachHooks(): void {
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
