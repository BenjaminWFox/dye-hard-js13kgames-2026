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
attribute vec2 a;
uniform vec3 f;
uniform vec2 z;
uniform mat4 V,P;
void main(){
  vec4 p=V*vec4(f,1.0);
  p.xy+=a*z;
  gl_Position=P*p;
}
`;

const FS = `
precision mediump float;
uniform vec4 C;
void main(){gl_FragColor=C;}
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

function bindParticleProgram(gl: WebGLRenderingContext): void {
  gl.useProgram(program);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, 'V'), false, view);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, 'P'), false, proj);
  bindAttrib(gl, program, quad);
}

function stamp(
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
  gl.uniform3f(gl.getUniformLocation(program, 'f'), x, y, z);
  gl.uniform2f(gl.getUniformLocation(program, 'z'), w, h);
  gl.uniform4f(gl.getUniformLocation(program, 'C'), r, g, b, a);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

export function drawParticles(gl: WebGLRenderingContext): void {
  if (particles.length === 0) {
    return;
  }
  bindParticleProgram(gl);
  for (const p of particles) {
    stamp(gl, p.x, p.y, p.z, p.size, p.size, p.r, p.g, p.b, p.life / p.maxLife);
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
  bindParticleProgram(gl);
  stamp(gl, x, y, z, w, h, r, g, b, a);
}
