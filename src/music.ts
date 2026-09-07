import pack, { ENEMY_HIT, expandSfx, HORN_ATTACK, NOVA_FIRE, PICKUP, POWERUP } from './pickup-sfx';
import song, { CPlayer } from './smallplayer';

type Box = {
  init(data: unknown): void;
  generate(): number;
  createAudioBuffer(ctx: AudioContext): AudioBuffer;
};

function box(): Box {
  return new (CPlayer as unknown as { new (): Box })();
}

const player = box();
player.init(song);

const sfxPlayers = pack.map((entry) => {
  const p = box();
  p.init(expandSfx(entry));
  while (p.generate() < 1) {}
  return p;
});

let ctx: AudioContext | undefined;
const sfxBufs: (AudioBuffer | undefined)[] = [];
let progress = 0;
let pumping = false;
let playing = false;

function pump(): void {
  if (pumping) {
    return;
  }
  pumping = true;
  const step = (): void => {
    if (progress < 1) {
      progress = player.generate();
      requestAnimationFrame(step);
      return;
    }
    pumping = false;
    if (!ctx || playing) {
      return;
    }
    playing = true;
    const src = ctx.createBufferSource();
    src.buffer = player.createAudioBuffer(ctx);
    src.loop = true;
    src.connect(ctx.destination);
    src.start();
  };
  step();
}

function audio(): AudioContext {
  ctx ||= new AudioContext();
  ctx.resume();
  return ctx;
}

function play(): void {
  audio();
  pump();
}

function playSfx(id: number): void {
  const ac = audio();
  sfxBufs[id] ||= sfxPlayers[id].createAudioBuffer(ac);
  const src = ac.createBufferSource();
  src.buffer = sfxBufs[id];
  src.connect(ac.destination);
  src.start();
}

export function playCrystal(): void {
  playSfx(PICKUP);
}

export function playPowerup(): void {
  playSfx(POWERUP);
}

export function playNova(): void {
  playSfx(NOVA_FIRE);
}

const HIT_WIN = 250;
const HIT_MAX = 5;
const hitTimes: number[] = [];

export function playHit(): void {
  const t = performance.now();
  while (hitTimes.length && t - hitTimes[0] >= HIT_WIN) {
    hitTimes.shift();
  }
  if (hitTimes.length >= HIT_MAX) {
    return;
  }
  hitTimes.push(t);
  playSfx(ENEMY_HIT);
}

export function playHorn(): void {
  playSfx(HORN_ATTACK);
}

/** Generate in the background; start looping on the first user gesture. */
export function initMusic(): void {
  pump();
  const unlock = (): void => {
    play();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}
