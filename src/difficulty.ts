/**
 * Viewport-based difficulty. Uses the playable view size (not the device),
 * so a resized/rotated window picks the right profile.
 *
 * Landscape (width >= height) is the baseline. Portrait is the thinner
 * profile — add knobs here as we tune.
 */
interface Difficulty {
  /** Multiplier on pack spawn frequency. 1 = current landscape. */
  spawnRate: number;
}

const LANDSCAPE: Difficulty = {
  spawnRate: 1,
};

const PORTRAIT: Difficulty = {
  spawnRate: 0.5,
};

export function difficultyFor(viewWidth: number, viewHeight: number): Difficulty {
  return viewHeight > viewWidth ? PORTRAIT : LANDSCAPE;
}
