// The canvas fills the whole viewport at an integer pixel scale chosen so the
// visible world height is as close to this as possible.
export const TARGET_VIEW_HEIGHT = 300;

/** Square ground stamps. Veins use VEIN_W / VEIN_H in map.ts — not these. */
export const TILE_W = 11;
export const TILE_H = 11;

export const PLAYER_HIT = 11;
export const PLAYER_WIDTH = 11;
export const PLAYER_HEIGHT = 19;

/** Infinite-map origin. */
export const PLAYER_SPAWN_X = 0;
export const PLAYER_SPAWN_Y = 0;

// Pixels per millisecond
export const PLAYER_SPEED = 0.046;

// Walk-cycle cadence (§3 Animation): ms per leg-cut frame while moving
export const WALK_FRAME_MS = 150;
