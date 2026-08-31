import { proj, view } from './camera';
import { EXPLOSION_COUNT, EXPLOSION_LIFE } from './constants';
import { bindAttrib, makeProgram, makeUnitQuad } from './gl';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  r: number;
  g: number;
  b: number;
}

const VS = `
attribute vec2 aCorner;
uniform vec3 uPos;
uniform vec2 uSize;
uniform mat4 uView;
uniform mat4 uProj;
void main() {
  vec4 viewPos = uView * vec4(uPos, 1.0);
  viewPos.xy += aCorner * uSize;
  gl_Position = uProj * viewPos;
}
`;

const FS = `
precision mediump float;
uniform vec4 uColor;
void main() {
  gl_FragColor = uColor;
}
`;

const particles: Particle[] = [];
let program: WebGLProgram;
let quad: WebGLBuffer;

export function initParticles(gl: WebGLRenderingContext): void {
  program = makeProgram(gl, VS, FS);
  quad = makeUnitQuad(gl);
}

export function resetParticles(): void {
  particles.length = 0;
}

export function spawnExplosion(x: number, y: number, color = 0x222222, count = EXPLOSION_COUNT): void {
  const r = ((color >> 16) & 255) / 255;
  const g = ((color >> 8) & 255) / 255;
  const b = (color & 255) / 255;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.08 + Math.random() * 0.24;
    const life = EXPLOSION_LIFE * (0.85 + Math.random() * 0.4);
    particles.push({
      x: x + (Math.random() - 0.5) * 8,
      y: 4 + Math.random() * 6,
      z: y + (Math.random() - 0.5) * 8,
      vx: Math.cos(angle) * speed,
      vy: (Math.random() - 0.5) * speed,
      vz: Math.sin(angle) * speed,
      life,
      maxLife: life,
      size: Math.random() < 0.35 ? 3 : 2,
      r,
      g,
      b,
    });
  }
}

export function updateParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
  }
}

export function drawParticles(gl: WebGLRenderingContext): void {
  if (particles.length === 0) {
    return;
  }
  gl.useProgram(program);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uView'), false, view);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uProj'), false, proj);
  bindAttrib(gl, program, 'aCorner', 2, quad);
  for (const p of particles) {
    gl.uniform3f(gl.getUniformLocation(program, 'uPos'), p.x, p.y, p.z);
    gl.uniform2f(gl.getUniformLocation(program, 'uSize'), p.size, p.size);
    gl.uniform4f(gl.getUniformLocation(program, 'uColor'), p.r, p.g, p.b, p.life / p.maxLife);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

export function drawQuad(
  gl: WebGLRenderingContext,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  gl.useProgram(program);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uView'), false, view);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uProj'), false, proj);
  bindAttrib(gl, program, 'aCorner', 2, quad);
  gl.uniform3f(gl.getUniformLocation(program, 'uPos'), x, y, z);
  gl.uniform2f(gl.getUniformLocation(program, 'uSize'), w, h);
  gl.uniform4f(gl.getUniformLocation(program, 'uColor'), r, g, b, a);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
