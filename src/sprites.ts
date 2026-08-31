import { proj, view } from './camera';
import { PLAYER_HEIGHT, PLAYER_WIDTH } from './constants';
import { bindAttrib, makeProgram, makeUnitQuad, uploadTexture } from './gl';
import { PALETTE_GLSL, setPaletteUniforms, snapAlias } from './palette';

const VS = `
attribute vec2 a;
uniform vec3 f;
uniform vec2 z,o;
uniform vec4 v;
uniform mat4 V,P;
varying vec2 t,x;
void main(){
  t=mix(v.xy,v.zw,vec2(a.x+.5,a.y));
  x=f.xz;
  vec4 p=V*vec4(f,1.0);
  p.xy+=a*z+o;
  gl_Position=P*p;
}
`;

const FS = `
precision mediump float;
varying vec2 t,x;
uniform sampler2D T;
${PALETTE_GLSL}
void main(){
  vec4 e=texture2D(T,t);
  if(e.a<.5)discard;
  gl_FragColor=vec4(p(e.rgb,x),e.a);
}
`;

interface SpriteDraw {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

const queue: SpriteDraw[] = [];
let program: WebGLProgram;
let quad: WebGLBuffer;
let texture: WebGLTexture;
let sheetCanvas: HTMLCanvasElement;
let sheetPixels: ImageData;
let sheetW = 1;
let sheetH = 1;
let locView: WebGLUniformLocation;
let locProj: WebGLUniformLocation;
let locFeet: WebGLUniformLocation;
let locSize: WebGLUniformLocation;
let locUv: WebGLUniformLocation;
let locTex: WebGLUniformLocation;
let locViewOff: WebGLUniformLocation;

export let playerUv = { u0: 0, v0: 0, u1: 1, v1: 1 };

export function sheetUv(
  sx: number,
  sy: number,
  sw: number,
  sh: number
): { u0: number; v0: number; u1: number; v1: number } {
  return {
    u0: sx / sheetW,
    v0: 1 - (sy + sh) / sheetH,
    u1: (sx + sw) / sheetW,
    v1: 1 - sy / sheetH,
  };
}

export function measureContentBox(
  sourceX: number,
  sourceY: number,
  width: number,
  height: number
): { x: number; y: number; w: number; h: number } {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const data = sheetPixels.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[((sourceY + y) * sheetPixels.width + sourceX + x) * 4 + 3];
      if (alpha === 0) {
        continue;
      }
      if (x < minX) {
        minX = x;
      }
      if (y < minY) {
        minY = y;
      }
      if (x > maxX) {
        maxX = x;
      }
      if (y > maxY) {
        maxY = y;
      }
    }
  }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function bakeCell(sx: number, sy: number, sw: number, sh: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.drawImage(sheetCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

export async function initSprites(gl: WebGLRenderingContext): Promise<void> {
  program = makeProgram(gl, VS, FS);
  quad = makeUnitQuad(gl);
  locView = gl.getUniformLocation(program, 'V') as WebGLUniformLocation;
  locProj = gl.getUniformLocation(program, 'P') as WebGLUniformLocation;
  locFeet = gl.getUniformLocation(program, 'f') as WebGLUniformLocation;
  locSize = gl.getUniformLocation(program, 'z') as WebGLUniformLocation;
  locUv = gl.getUniformLocation(program, 'v') as WebGLUniformLocation;
  locTex = gl.getUniformLocation(program, 'T') as WebGLUniformLocation;
  locViewOff = gl.getUniformLocation(program, 'o') as WebGLUniformLocation;

  const image = new Image();
  image.src = 'sprites.png';
  await image.decode();
  sheetCanvas = document.createElement('canvas');
  sheetCanvas.width = image.width;
  sheetCanvas.height = image.height;
  const ctx = sheetCanvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.drawImage(image, 0, 0);
  sheetPixels = ctx.getImageData(0, 0, image.width, image.height);
  const data = sheetPixels.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) {
      continue;
    }
    const rgb = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    const snapped = snapAlias(rgb);
    if (snapped !== rgb) {
      data[i] = (snapped >> 16) & 255;
      data[i + 1] = (snapped >> 8) & 255;
      data[i + 2] = snapped & 255;
    }
  }
  ctx.putImageData(sheetPixels, 0, 0);
  texture = uploadTexture(gl, sheetCanvas);
  sheetW = image.width;
  sheetH = image.height;
  playerUv = sheetUv(0, 0, PLAYER_WIDTH, PLAYER_HEIGHT);
}

export function beginSprites(): void {
  queue.length = 0;
}

export function queueSprite(
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  uv: { u0: number; v0: number; u1: number; v1: number },
  flipH = false,
  viewOffX = 0,
  viewOffY = 0
): void {
  queue.push({
    x,
    y,
    z,
    w,
    h,
    ox: viewOffX,
    oy: viewOffY,
    u0: flipH ? uv.u1 : uv.u0,
    v0: uv.v0,
    u1: flipH ? uv.u0 : uv.u1,
    v1: uv.v1,
  });
}

export function flushSprites(gl: WebGLRenderingContext): void {
  if (queue.length === 0) {
    return;
  }
  queue.sort((a, b) => view[2] * b.x + view[10] * b.z - (view[2] * a.x + view[10] * a.z));
  gl.useProgram(program);
  gl.uniformMatrix4fv(locView, false, view);
  gl.uniformMatrix4fv(locProj, false, proj);
  setPaletteUniforms(gl, program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(locTex, 0);
  bindAttrib(gl, program, quad);
  for (const s of queue) {
    gl.uniform3f(locFeet, s.x, s.y, s.z);
    gl.uniform2f(locSize, s.w, s.h);
    gl.uniform2f(locViewOff, s.ox, s.oy);
    gl.uniform4f(locUv, s.u0, s.v0, s.u1, s.v1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
