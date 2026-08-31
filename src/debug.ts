import { wasPressed } from './input';
import { startNextWave, toggleColor } from './palette';

/**
 * Dev-only: E starts the next color wave from its dummy portal; 1–7 toggle a bit.
 * Returns the color index if a wave started this frame, else −1.
 */
export function handleDebugKeys(): number {
  if (wasPressed('KeyE')) {
    return startNextWave();
  }
  for (let i = 0; i < 7; i++) {
    if (wasPressed('Digit' + (i + 1))) {
      toggleColor(i);
    }
  }
  return -1;
}
