const downKeys = new Set<string>();
const pressedKeys = new Set<string>();

export const mouse = {
  x: 0,
  y: 0,
  clicked: false,
};

export function initInput(canvas: HTMLCanvasElement): void {
  window.addEventListener('keydown', (event) => {
    if (!event.repeat) {
      pressedKeys.add(event.code);
    }
    downKeys.add(event.code);
    if (event.code.startsWith('Arrow') || event.code === 'Space') {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    downKeys.delete(event.code);
  });

  const syncMouse = (event: MouseEvent): void => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    mouse.y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  };
  canvas.addEventListener('mousemove', syncMouse);
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      syncMouse(event);
      mouse.clicked = true;
    }
  });
}

export function isDown(code: string): boolean {
  return downKeys.has(code);
}

export function wasPressed(code: string): boolean {
  return pressedKeys.has(code);
}

export function clearPressedKeys(): void {
  pressedKeys.clear();
  mouse.clicked = false;
}

export function moveAxis(): { x: number; y: number } {
  let x = 0;
  let y = 0;
  if (isDown('KeyD') || isDown('ArrowRight')) {
    x += 1;
  }
  if (isDown('KeyA') || isDown('ArrowLeft')) {
    x -= 1;
  }
  if (isDown('KeyW') || isDown('ArrowUp')) {
    y += 1;
  }
  if (isDown('KeyS') || isDown('ArrowDown')) {
    y -= 1;
  }
  const len = Math.hypot(x, y);
  if (len > 0) {
    x /= len;
    y /= len;
  }
  return { x, y };
}
