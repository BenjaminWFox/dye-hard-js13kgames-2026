import { viewProj } from './camera';
import { VEIN_ALPHA, VEIN_H, VEIN_PERIOD, VEIN_STRIDE, VEIN_W } from './constants';
import { makeProgram } from './gl';
import { PALETTE_GLSL, RAINBOW_F32, setPaletteUniforms, unlockedBits } from './palette';

const PLANE = 800;

const VS = `
attribute vec2 aXZ;
uniform mat4 uViewProj;
varying vec2 vXZ;
void main() {
  vXZ = aXZ;
  gl_Position = uViewProj * vec4(aXZ.x, 0.0, aXZ.y, 1.0);
}
`;

const FS = `
precision mediump float;
varying vec2 vXZ;
${PALETTE_GLSL}
uniform vec2 uShadowPos;
uniform float uShadowRadius;

void main() {
  vec3 color = vec3(1.0);

  float vx = floor(vXZ.x / ${VEIN_W}.0);
  float vz = floor(vXZ.y / ${VEIN_H}.0);
  float d = mod(mod(vx + vz, ${VEIN_PERIOD}.0) + ${VEIN_PERIOD}.0, ${VEIN_PERIOD}.0);
  if (mod(d, ${VEIN_STRIDE}.0) < 1.0) {
    int idx = int(floor(d / ${VEIN_STRIDE}.0));
    vec3 vein = uRainbow[0];
    for (int i = 0; i < 7; i++) {
      if (i == idx) {
        vein = uRainbow[i];
      }
    }
    color = mix(color, applyPalette(vein, vXZ), ${VEIN_ALPHA});
  }

  if (uWaveColor >= 0.0 && uWaveRadius > 1.0) {
    float wd = abs(length(vXZ - uWaveOrigin) - uWaveRadius);
    float wring = 1.0 - smoothstep(0.0, 2.4, wd);
    vec3 wc = uRainbow[0];
    for (int i = 0; i < 7; i++) {
      if (abs(uWaveColor - float(i)) < 0.5) {
        wc = uRainbow[i];
      }
    }
    color = mix(color, wc, wring * 0.9);
  }

  if (uShadowRadius > 0.5) {
    float sd = length(vXZ - uShadowPos) / uShadowRadius;
    color *= 1.0 - (1.0 - smoothstep(0.2, 1.0, sd)) * 0.55;
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

const DISC_VS = `
attribute vec2 aCorner;
uniform vec2 uCenter;
uniform float uRadius;
uniform mat4 uViewProj;
varying vec2 vLocal;
void main() {
  vLocal = aCorner;
  vec2 xz = uCenter + aCorner * uRadius;
  gl_Position = uViewProj * vec4(xz.x, 0.0, xz.y, 1.0);
}
`;

const DISC_FS = `
precision mediump float;
varying vec2 vLocal;
uniform vec4 uColor;
uniform float uMode;
uniform vec3 uNovaStops[8];
uniform float uNovaCount;
void main() {
  float d = length(vLocal);
  if (d > 1.0) {
    discard;
  }
  if (uMode < 0.5) {
    gl_FragColor = vec4(uColor.rgb, uColor.a * (1.0 - smoothstep(0.2, 1.0, d)));
    return;
  }
  vec3 nc = uNovaStops[0];
  float n = max(uNovaCount - 1.0, 1.0);
  for (int i = 1; i < 8; i++) {
    float fi = float(i);
    float active = step(fi, uNovaCount - 0.5);
    float u = fi / n;
    float prev = (fi - 1.0) / n;
    float w = clamp((d - prev) / max(u - prev, 0.001), 0.0, 1.0) * active;
    nc = mix(nc, uNovaStops[i], w);
  }
  float ring = smoothstep(0.72, 0.88, d) * (1.0 - smoothstep(0.94, 1.0, d));
  float fill = (1.0 - d) * 0.35;
  float outline = smoothstep(0.9, 0.96, d) * (1.0 - smoothstep(0.96, 1.0, d));
  vec3 color = mix(nc, vec3(0.1), outline * 0.85);
  gl_FragColor = vec4(color, max(ring, fill) * uColor.a);
}
`;

let program: WebGLProgram;
let buffer: WebGLBuffer;
let discProgram: WebGLProgram;
let discQuad: WebGLBuffer;
const novaStops = new Float32Array(24);

export function initGround(gl: WebGLRenderingContext): void {
  program = makeProgram(gl, VS, FS);
  buffer = gl.createBuffer() as WebGLBuffer;
  discProgram = makeProgram(gl, DISC_VS, DISC_FS);
  discQuad = gl.createBuffer() as WebGLBuffer;
  gl.bindBuffer(gl.ARRAY_BUFFER, discQuad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW
  );
}

function writePlane(gl: WebGLRenderingContext, x: number, z: number): void {
  const x0 = x - PLANE;
  const z0 = z - PLANE;
  const x1 = x + PLANE;
  const z1 = z + PLANE;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([x0, z0, x1, z0, x0, z1, x1, z1]),
    gl.DYNAMIC_DRAW
  );
}

function fillNovaStops(stops: Float32Array): number {
  stops[0] = 1;
  stops[1] = 1;
  stops[2] = 1;
  let count = 1;
  for (let i = 0; i < 7; i++) {
    if (unlockedBits & (1 << i)) {
      stops[count * 3] = RAINBOW_F32[i * 3];
      stops[count * 3 + 1] = RAINBOW_F32[i * 3 + 1];
      stops[count * 3 + 2] = RAINBOW_F32[i * 3 + 2];
      count += 1;
    }
  }
  return count;
}

export function drawGround(
  gl: WebGLRenderingContext,
  x: number,
  z: number,
  shadowRadius: number
): void {
  writePlane(gl, x, z);
  gl.useProgram(program);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uViewProj'), false, viewProj);
  setPaletteUniforms(gl, program);
  gl.uniform2f(gl.getUniformLocation(program, 'uShadowPos'), x, z);
  gl.uniform1f(gl.getUniformLocation(program, 'uShadowRadius'), shadowRadius);

  const loc = gl.getAttribLocation(program, 'aXZ');
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function drawDisc(
  gl: WebGLRenderingContext,
  x: number,
  z: number,
  radius: number,
  r: number,
  g: number,
  b: number,
  a: number,
  mode: number,
  stopCount = 0
): void {
  if (radius < 0.5) {
    return;
  }
  gl.useProgram(discProgram);
  gl.uniformMatrix4fv(gl.getUniformLocation(discProgram, 'uViewProj'), false, viewProj);
  gl.uniform2f(gl.getUniformLocation(discProgram, 'uCenter'), x, z);
  gl.uniform1f(gl.getUniformLocation(discProgram, 'uRadius'), radius);
  gl.uniform4f(gl.getUniformLocation(discProgram, 'uColor'), r, g, b, a);
  gl.uniform1f(gl.getUniformLocation(discProgram, 'uMode'), mode);
  if (stopCount > 0) {
    gl.uniform3fv(gl.getUniformLocation(discProgram, 'uNovaStops'), novaStops);
    gl.uniform1f(gl.getUniformLocation(discProgram, 'uNovaCount'), stopCount);
  }
  const loc = gl.getAttribLocation(discProgram, 'aCorner');
  gl.bindBuffer(gl.ARRAY_BUFFER, discQuad);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

export function drawBlob(gl: WebGLRenderingContext, x: number, z: number, radius: number): void {
  drawDisc(gl, x, z, radius, 0, 0, 0, 0.55, 0);
}

export function drawColorDisc(
  gl: WebGLRenderingContext,
  x: number,
  z: number,
  radius: number,
  rgb: number
): void {
  novaStops[0] = ((rgb >> 16) & 255) / 255;
  novaStops[1] = ((rgb >> 8) & 255) / 255;
  novaStops[2] = (rgb & 255) / 255;
  drawDisc(gl, x, z, radius, 1, 1, 1, 1, 1, 1);
}

export function drawPlayerNova(
  gl: WebGLRenderingContext,
  x: number,
  z: number,
  radius: number
): void {
  drawDisc(gl, x, z, radius, 1, 1, 1, 1, 1, fillNovaStops(novaStops));
}
