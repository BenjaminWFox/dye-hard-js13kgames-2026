export const view = new Float32Array(16);
export const proj = new Float32Array(16);
export const viewProj = new Float32Array(16);

const H = Math.SQRT1_2;
const T = Math.sqrt(3) / 2;
const H2 = H * 0.5;
const TH = T * H;

view[0] = H;
view[1] = H2;
view[2] = TH;
view[5] = T;
view[6] = -0.5;
view[8] = -H;
view[9] = H2;
view[10] = TH;
view[15] = 1;
proj[10] = -0.001;
proj[15] = 1;

/** Screen-right on the XZ plane (already unit length). */
export const moveRightX = H;
export const moveRightZ = -H;
/** Screen-up on the XZ plane (already unit length). */
export const moveForwardX = H;
export const moveForwardZ = H;

function multiply(out: Float32Array, a: Float32Array, b: Float32Array): void {
  const t = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      t[col * 4 + row] =
        a[row] * b[col * 4] +
        a[4 + row] * b[col * 4 + 1] +
        a[8 + row] * b[col * 4 + 2] +
        a[12 + row] * b[col * 4 + 3];
    }
  }
  out.set(t);
}

/**
 * Ortho isometric view looking at (targetX, 0, targetZ).
 * Vertical frustum extent equals `viewHeight` (1 world unit = 1 pixel).
 */
export function updateCamera(
  targetX: number,
  targetZ: number,
  viewWidth: number,
  viewHeight: number
): void {
  view[12] = H * (targetZ - targetX);
  view[13] = -H2 * (targetX + targetZ);
  view[14] = -TH * (targetX + targetZ);
  proj[0] = 2 / viewWidth;
  proj[5] = 2 / viewHeight;
  multiply(viewProj, proj, view);
}

/** View-space origin is screen center; +Y is up in view, down on the 2D overlay. */
export function worldToScreen(
  x: number,
  y: number,
  z: number,
  viewWidth: number,
  viewHeight: number
): { x: number; y: number } {
  const vx = view[0] * x + view[4] * y + view[8] * z + view[12];
  const vy = view[1] * x + view[5] * y + view[9] * z + view[13];
  return { x: viewWidth / 2 + vx, y: viewHeight / 2 - vy };
}
