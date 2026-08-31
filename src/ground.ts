import { viewProj } from './camera';
import { VEIN_ALPHA, VEIN_H, VEIN_PERIOD, VEIN_STRIDE, VEIN_W } from './constants';
import { bindAttrib, makeProgram } from './gl';
import { PALETTE_GLSL, RAINBOW_F32, setPaletteUniforms, unlockedBits } from './palette';

const PLANE = 800;

const VS = `
attribute vec2 a;
uniform mediump vec2 c;
uniform mediump float d;
uniform mat4 M;
varying vec2 x;
void main(){
  x=c+a*d;
  gl_Position=M*vec4(x.x,0.0,x.y,1.0);
}
`;

const FS = `
precision mediump float;
varying vec2 x;
${PALETTE_GLSL}
uniform vec2 c;
uniform float s;
void main(){
  vec3 color=vec3(1.0);
  float vx=floor(x.x/${VEIN_W}.0);
  float vz=floor(x.y/${VEIN_H}.0);
  float d=mod(mod(vx+vz,${VEIN_PERIOD}.0)+${VEIN_PERIOD}.0,${VEIN_PERIOD}.0);
  if(mod(d,${VEIN_STRIDE}.0)<1.0){
    int idx=int(floor(d/${VEIN_STRIDE}.0));
    vec3 vein=R[0];
    for(int i=0;i<7;i++){
      if(i==idx)vein=R[i];
    }
    color=mix(color,p(vein,x),${VEIN_ALPHA});
  }
  if(I>=0.0&&W>1.0){
    float wd=abs(length(x-O)-W);
    vec3 wc=R[0];
    for(int i=0;i<7;i++){
      if(abs(I-float(i))<.5)wc=R[i];
    }
    color=mix(color,wc,(1.0-smoothstep(0.0,2.4,wd))*.9);
  }
  if(s>.5){
    float sd=length(x-c)/s;
    color*=1.0-(1.0-smoothstep(.2,1.0,sd))*.55;
  }
  gl_FragColor=vec4(color,1.0);
}
`;

const DISC_FS = `
precision mediump float;
varying vec2 x;
uniform vec2 c;
uniform float d,m,n;
uniform vec4 C;
uniform vec3 N[8];
void main(){
  float l=length((x-c)/d);
  if(l>1.0)discard;
  if(m<.5){
    gl_FragColor=vec4(C.rgb,C.a*(1.0-smoothstep(.2,1.0,l)));
    return;
  }
  vec3 nc=N[0];
  float q=max(n-1.0,1.0);
  for(int i=1;i<8;i++){
    float fi=float(i),u=fi/q,prev=(fi-1.0)/q;
    nc=mix(nc,N[i],clamp((l-prev)/max(u-prev,.001),0.0,1.0)*step(fi,n-.5));
  }
  float ring=smoothstep(.72,.88,l)*(1.0-smoothstep(.94,1.0,l));
  float outline=smoothstep(.9,.96,l)*(1.0-smoothstep(.96,1.0,l));
  gl_FragColor=vec4(mix(nc,vec3(.1),outline*.85),max(ring,(1.0-l)*.35)*C.a);
}
`;

let program: WebGLProgram;
let discProgram: WebGLProgram;
let quad: WebGLBuffer;
const novaStops = new Float32Array(24);

export function initGround(gl: WebGLRenderingContext): void {
  program = makeProgram(gl, VS, FS);
  discProgram = makeProgram(gl, VS, DISC_FS);
  quad = gl.createBuffer() as WebGLBuffer;
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
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
  gl.useProgram(program);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, 'M'), false, viewProj);
  setPaletteUniforms(gl, program);
  gl.uniform2f(gl.getUniformLocation(program, 'c'), x, z);
  gl.uniform1f(gl.getUniformLocation(program, 'd'), PLANE);
  gl.uniform1f(gl.getUniformLocation(program, 's'), shadowRadius);
  bindAttrib(gl, program, quad);
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
  gl.uniformMatrix4fv(gl.getUniformLocation(discProgram, 'M'), false, viewProj);
  gl.uniform2f(gl.getUniformLocation(discProgram, 'c'), x, z);
  gl.uniform1f(gl.getUniformLocation(discProgram, 'd'), radius);
  gl.uniform4f(gl.getUniformLocation(discProgram, 'C'), r, g, b, a);
  gl.uniform1f(gl.getUniformLocation(discProgram, 'm'), mode);
  if (stopCount > 0) {
    gl.uniform3fv(gl.getUniformLocation(discProgram, 'N'), novaStops);
    gl.uniform1f(gl.getUniformLocation(discProgram, 'n'), stopCount);
  }
  bindAttrib(gl, discProgram, quad);
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
