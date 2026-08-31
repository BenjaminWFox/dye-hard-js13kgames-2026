import { spawnBurst } from './enemies';
import { wasPressed } from './input';
import { RAINBOW_COLORS, startNextWave, toggleColor, waveX, waveZ } from './palette';
import { spawnExplosion } from './particles';
import { playerFeet } from './player';

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
