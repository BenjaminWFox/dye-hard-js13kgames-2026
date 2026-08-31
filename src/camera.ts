import { PITCH, YAW } from './constants';

export const view = new Float32Array(16);
export const proj = new Float32Array(16);
export const viewProj = new Float32Array(16);

/** Screen-right on the XZ plane (already unit length). */
export let moveRightX = 1;
export let moveRightZ = 0;
/** Screen-up on the XZ plane (already unit length). */
export let moveForwardX = 0;
export let moveForwardZ = 1;

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
  const cy = Math.cos(YAW);
  const sy = Math.sin(YAW);
  const cp = Math.cos(PITCH);
  const sp = Math.sin(PITCH);

  // R = Rx(-pitch) * Ry(-yaw)
  const r00 = cy;
  const r02 = -sy;
  const r10 = sp * sy;
  const r11 = cp;
  const r12 = sp * cy;
  const r20 = cp * sy;
  const r21 = -sp;
  const r22 = cp * cy;

  view[0] = r00;
  view[1] = r10;
  view[2] = r20;
  view[3] = 0;
  view[4] = 0;
  view[5] = r11;
  view[6] = r21;
  view[7] = 0;
  view[8] = r02;
  view[9] = r12;
  view[10] = r22;
  view[11] = 0;
  view[12] = -(r00 * targetX + r02 * targetZ);
  view[13] = -(r10 * targetX + r12 * targetZ);
  view[14] = -(r20 * targetX + r22 * targetZ);
  view[15] = 1;

  const near = -1000;
  const far = 1000;
  proj.fill(0);
  proj[0] = 2 / viewWidth;
  proj[5] = 2 / viewHeight;
  proj[10] = -2 / (far - near);
  proj[14] = -(far + near) / (far - near);
  proj[15] = 1;

  multiply(viewProj, proj, view);

  moveRightX = cy;
  moveRightZ = -sy;
  const fl = Math.hypot(sy * sp, cy * sp) || 1;
  moveForwardX = (sy * sp) / fl;
  moveForwardZ = (cy * sp) / fl;
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
