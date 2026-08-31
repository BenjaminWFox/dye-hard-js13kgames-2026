# Dye Hard — Engine Spec (V2 Isometric WebGL)

A js13kgames compo entry. Total zipped package (code, graphics, audio) must be
**under 13,312 bytes**.

This document is the **engine and visuals** spec. Gameplay, combat numbers, run
loop, shop, audio, and sprite-sheet layout stay in
[`SPEC_V1-Flat.md`](SPEC_V1-Flat.md) unless a row below explicitly overrides
them. If the two specs disagree on presentation, this file wins.

The V1 canvas engine lives in [`src/_v1-flat-pixels/`](src/_v1-flat-pixels/) as
an archive. Do not import it from the production entry.

---

## 0. Decisions (locked for the first slice)

| Topic | Choice | Why |
|-------|--------|-----|
| Scope | Visual / engine rewrite only | Same run, portals, nova bits, shop |
| Ground | Flat XZ plane, no height, no props, no lighting | Veins + color carry the look; geometry is unique bytes |
| Camera | Orthographic isometric, `TARGET_VIEW_HEIGHT = 250` | Same zoom knob as V1; retune after the slice |
| Movement | Screen-relative WASD | Forward is up the screen, not world +Y |
| Renderer | One WebGL world (approach B) | Shadows, nova, explosions, and sprites share one projection |
| Framebuffer | Low-res integer buffer, `NEAREST`, CSS pixel-upscale | Pixel sprites and the floor must be the same game |
| Palette | Full-color atlas + shader remap | Unlock and the color wave are uniforms, not a rebake |
| Shadows | Soft blob, instanced | Cheaper and faster than projected silhouettes |
| Nova | 3D disc on the plane, radial gradient | Owned colors append to the gradient |
| Color wave | Shader, from the destroyed portal | Cheaper than V1’s dual-bake clip |
| HUD | 2D canvas overlay first | Packed font + menus stay; system-font fallback if the zip demands it |

---

## 1. Development Rules

These rules govern how code is written for this project. They are the same
rules as V1.

1. **Readable first, golfed later.** The build pipeline (Terser → Roadroller →
   advzip/ECT via `js13k-vite-plugins`) does heavy minification and compression.
   Write clear, human-readable TypeScript with descriptive variable and function
   names. Hyper-golfing is a deliberate, late-stage activity once the game is
   mature — never a default style.
2. **Efficient, not clever.** Prefer simple data structures and straightforward
   algorithms. Avoid abstractions, classes, and indirection that don't pay for
   themselves. The sample game in `src/_sample-game/` shows the preferred idioms
   (plain modules, const enums as numbers, flat entity arrays).
3. **Repetition compresses well.** Roadroller and zip both reward self-similar
   code. Don't contort code to deduplicate a few lines; consistent, repetitive
   patterns often produce a smaller final package than "DRY" cleverness.
   Copying the same GLSL palette snippet into two programs is fine — measure
   before extracting a shader “framework.”
4. **One asset, derived variants.** Ship a single sprite sheet; derive all
   palette variants at runtime. Never ship two images that differ only by palette.
5. **Measure, don't guess.** Run `npm run build` regularly and track the zipped
   size. Byte costs are unintuitive post-compression; decisions between
   approaches should be settled by building both when practical.
6. **Budget awareness.** Track the live number in [`SIZE_LOG.md`](SIZE_LOG.md).
   V1’s last shipped zip (**2026-08-28: 12,006 B / 13,312, headroom 1,306 B**)
   is a **gameplay-complete reference**, not the V2 baseline. V2 starts from an
   empty production entry; the first number that matters is the vertical-slice
   zip in §6.

   WebGL is unique tokens (shaders, buffers, uniforms). It only wins if it
   **replaces** V1 world + FX code, not if it sits beside a second pipeline.

   Rough working split after the slice (revise with real numbers):

   - Sprite sheet PNG: ~0.5 KB packed
   - WebGL engine (context, projection, ground, billboards, FX): unknown —
     this is the number the slice exists to measure
   - Gameplay port (swarm / combat / powers): treat V1’s ~1.5–2 KB as the floor
   - UI: packed-font 2D overlay ~1.5 KB, **or** system fonts for cheaper
   - Audio: same as V1 (SoundBox + song + 5 SFX)

   If the zip goes over, spend from this **engine fallback ladder**, cheapest
   pain first, **then** the V1 gameplay ladder in
   [`SPEC_V1-Flat.md`](SPEC_V1-Flat.md) §1 rule 6:

   1. Drop the packed font / 2D overlay. HUD and menus use system fonts (DOM
      or `fillText` on a thin overlay). Raise `TARGET_VIEW_HEIGHT` so the
      3D view still reads. **This is the planned UI escape hatch.**
   2. Instant color unlock (keep the shader palette; skip the expanding wave).
   3. Soft blob shadows → a single shared dark disc, or no shadows.
   4. CPU `drawImage` overlay for sprites (approach A) if billboards +
      instancing lose the byte fight. Last resort — it splits the renderer.
   5. Then V1 gameplay cuts (shop rows, remaining cutscene, etc.).
7. **No external dependencies at runtime.** No WebGL wrappers, no matrix libs,
   no extra PNG. Hand-rolled WebGL1.
8. **TypeScript strictness stays on.** Types are free — they're erased at
   build time.
9. **Dev tooling is isolated.** Debug keys/overlays live in `src/debug.ts` and
   are loaded only behind `import.meta.env.DEV`.
10. **Director's Cut.** Features cut for the 13 KB zip stay in the repo,
    isolated so they are **not imported by the production entry**. Do not
    delete them. When cutting: move under `src/directors-cut/`, leave a comment
    at the old call site, and add a row below.

    Currently isolated:

    | Module | What it restores | How to enable |
    |--------|------------------|---------------|
    | [`src/_v1-flat-pixels/`](src/_v1-flat-pixels/) | Entire V1 bake-once canvas engine + production game | Archive only. Do not import from `src/index.ts`. |
    | [`src/directors-cut/pipe-snake.ts`](src/directors-cut/pipe-snake.ts) | Occupancy-grid snake pipes | See V1 spec. |
    | [`src/directors-cut/pipes.ts`](src/directors-cut/pipes.ts) | Competition pipes, edge portals, plaza portal | See V1 spec. |
    | [`src/directors-cut/cutscene.ts`](src/directors-cut/cutscene.ts) | Opening cutscene | See V1 spec. |
    | Tile wall tests (git history) | Player / enemy / bolt vs walls | Infinite white map has no solids. |

All timing in this spec is expressed in **real time** (seconds/minutes), never
frames.

---

## 2. What changes vs V1

Gameplay is unchanged: survivors-like, move-only, horn + nova, 7 ring portals,
color bits, swarm, shop, persistence. World space stays **2D** — gameplay
`(x, y)` maps to world `(x, 0, y)` so V1 distances (portal ring **500**, nova
**66**, magnet **22**, …) keep their numbers.

| V1 | V2 |
|----|----|
| 2D canvas world (white stamps + vein `drawImage`) | WebGL isometric plane, veins in the ground shader |
| Sprites via `drawImage` of baked canvases | Screen-aligned billboards from one atlas texture |
| CPU palette bake + rebake on unlock | Full-color atlas; shader remaps locked colors to grey |
| Instant color unlock (wave was Director's Cut) | Expanding shader wave from the portal; sprites included |
| Nova = 1px concentric canvas strokes | Expanding disc on the plane, radial color gradient |
| Pixel explosion = CPU particles + `fillRect` | Instanced WebGL pixel quads |
| Enemy shadow = 2-frame canvas circle | Soft blob on the plane, scaled with the float bob |
| Code-drawn fireball / frostball | Generated billboard orbs (still not sheet art) |
| Camera = top-down follow | Orthographic isometric follow |
| WASD = world axes | WASD = screen axes |
| HUD / font / overlays = 2D canvas | Same, stacked on the WebGL view — until the font fallback |

HUD color shower and damage numbers stay **screen-space**. First home is the 2D
overlay; they move to WebGL only if the overlay goes away.

---

## 3. Technical Design

### 3.1 Contexts and layers

Production `index.html` has two stacked canvases at the **same internal
resolution**:

1. **WebGL** — ground, shadows, nova, projectiles, sprites, world explosions.
2. **2D overlay** — HUD, packed font, menus, cards, shop, pause, title,
   damage numbers, HUD color shower.

Both fill the viewport. Pointer events hit the top canvas. If fallback
ladder #1 fires, delete the 2D canvas and the packed font.

No `twgl`, no `gl-matrix`, no WebGL2 requirement. Use **WebGL1**. Instancing
via `ANGLE_instanced_arrays` (or a rebuilt dynamic buffer if the extension
path is uniquely expensive — measure).

Three programs is the starting budget:

- **Ground** — plane + veins + color wave + blob shadows + nova disc.
- **Sprite** — atlas sample + palette remap + billboard.
- **Particle** — tinted pixel quads (explosions; projectiles may share this).

If ground + shadows + nova as one program is too much unique GLSL, split nova
out. Measure; don't pre-split.

### 3.2 Resolution and pixelation

Same resize rule as V1:

- `scale = max(1, round(innerHeight / TARGET_VIEW_HEIGHT))`
- Internal buffer = `ceil(innerWidth / scale)` × `ceil(innerHeight / scale)`
- CSS size = buffer × `scale`, `image-rendering: pixelated`
- Start **`TARGET_VIEW_HEIGHT = 250`**. This is the only zoom knob.

WebGL state that must stay on:

- `NEAREST` min/mag on every sprite / atlas texture
- No MSAA, no anisotropic filtering
- `imageSmoothingEnabled = false` on the 2D overlay

The 3D plane is quantized by the low-res buffer, not by a second pixelate
pass. If the floor still looks “too smooth” next to sprites, snap world-to-
screen positions to integers in the vertex shader (same `floor` as V1’s
camera blit).

### 3.3 Camera and coordinates

- **World:** XZ is the floor, Y is up. Gameplay `player.y` is world Z.
- **Projection:** orthographic. Vertical world extent = `viewHeight` (the
  internal buffer height, ~250). Horizontal extent follows aspect.
- **Orientation:** yaw **45°**, pitch **30°** (game isometric, not true
  35.264°). Look-at the point on the plane under the player. Tweak pitch
  only after the slice is on screen.
- **Follow:** camera target = player XZ. No look-ahead.
- **1 world unit = 1 V1 pixel.** Portal ring, nova radius, speeds, and
  hitboxes are unchanged.

**Screen-relative move basis** (recomputed if the camera yaw changes; it
shouldn't):

- `right` = camera right, projected onto XZ, normalized
- `forward` = camera “screen up”, projected onto XZ, normalized
- W/S = ±`forward`, A/D = ∓/`+` `right`
- Normalize the sum so diagonals are not faster

Combat, magnet, spawn ring, and portal markers all keep using gameplay
`(x, y)` / XZ. Markers that were screen-edge triangles in V1 project the
portal XZ through the camera, then clamp to the 2D overlay.

### 3.4 Palette: color is still the source of truth

`sprites.png` is still authored in full color. Locked rainbow colors render
as HSL lightness grey:

`grey = floor((max(r,g,b) + min(r,g,b)) / 2)`

Neutrals (`000000`, `747474`, `b1b1b1`, `cecece`, `ffffff`) never remap.
Yellow / indigo near-aliases snap to the canonical hex **once on the CPU**
when the atlas is packed, so the shader only tests the 7 rainbow colors.

**Atlas pack (once at load, full color — no grey bake):**

1. Load `sprites.png`, `getImageData`, snap aliases.
2. Blit each sprite into one atlas canvas, applying V1 transforms that are
   still pixel surgery: flip, `rot90`, pipe `recolorFrom` → `recolorTo`
   (`keepRecolor`), **leg-cut walk frames**.
3. Upload the atlas as an RGBA texture (`NEAREST`, clamp).
4. Remember UV rects.

Do **not** rebake on color unlock. Unlock flips a bit in a `uUnlocked`
uniform (0–7, bit 0 = red … bit 6 = violet). White kit stomp is not a
rainbow bit; it is always available on the player nova.

Shared GLSL (paste into every program that samples color art or veins):

- If the texel matches rainbow `i` and bit `i` is locked **and** the
  fragment is outside the live color wave, output `grey`.
- Otherwise output the authored color.

This is why the wave is cheaper than V1: one distance test, no second
atlas, no `clip()`.

### 3.5 Ground shader

A single full-screen (or large) quad in XZ. No tile stamps, no `TILE_W`
loop.

**Albedo:** infinite white plaza. Optional seeded speckles (V1 had 8
`fillRect`s) only if they survive a build-both — they are decoration.

**Veins:** port V1’s cell math into the fragment shader (`VEIN_W=6`,
`VEIN_H=12`, `VEIN_WIDTH=1`, `VEIN_GAP=8`, step 1/1, 7-band period,
alpha **0.25**). Each band is that rainbow color, then the palette
function greys locked bands. No vein canvases.

**Color wave:** uniforms `uWaveOrigin` (XZ), `uWaveRadius`, `uWaveColor`
(0–6 or −1 if idle). While a wave is live, color `uWaveColor` is treated
as unlocked for fragments whose XZ distance to the origin is `< uWaveRadius`.
When the wave finishes, set that bit in `uUnlocked` and clear the wave.

Wave speed: start from V1’s unused `WAVE_SPEED` if it is still in git;
otherwise pick a 1.2–1.8s feel and tune in play. Pause freezes the radius
(same pause semantics as V1).

The 7th-portal wave can run under the win overlay.

### 3.6 Sprites (billboards)

Screen-aligned quads, size = authored pixel size in world units
(unicorn **11×19**, enemies **7×9**, etc.). Anchor at the **feet** (bottom
center of the quad sits on the plane at entity XZ).

Draw **after** ground / shadows / nova. Sort back-to-front by camera-depth
of the feet (flat plane — no GPU depth tricks required). i-frames still
blink by skipping a draw.

Walk cycle: three atlas rects (idle / left-cut / right-cut), same 150ms
cadence as V1. Facing flips stay TBD.

**150-enemy cap:** one instanced sprite draw (or one buffer rebuild) per
frame, not 150 `drawArrays` calls.

### 3.7 Shadows

Soft blob — a dark, transparent ellipse on the plane under each floater
(enemies today; player optional). Two sizes tied to the 1px bob: larger
on the “down” frame, smaller on “up” (V1’s 2-frame idea, not a sprite
silhouette).

Instance with the sprite pass or as a cheap extra in the ground program
(a short list of XZ + scale). If the uniform list becomes the unique-byte
tax, put blob centers in the instance buffer.

No projected silhouette unless blobs look wrong **and** a build-both says
the silhouette is cheap. That is not the first slice.

### 3.8 Nova

Gameplay is still V1: one pulse, **500ms**, **66 px** (elites **33**),
**2s** period, bits, swept hit, knockback, projectiles on fire. The
**hit edge** is the expanding gameplay circle on XZ. Only the **picture**
changes.

Visual: a disc (or thin ring-with-fill) on the plane, centered on the
caster, radius = current wavefront. **Radial gradient**, not 1px
concentric strokes.

- Player: **white** at the center (kit stomp), then each **owned** rainbow
  color in ROYGBIV order toward the edge. Missing bits are omitted — the
  gradient jumps to the next owned color. No empty grey bands.
- Elite / future boss: a single-color disc in that nova bit’s color.
- Unowned colors never appear.

The disc follows the caster for the pulse (V1). Additive or alpha blending
is a look test, not a spec requirement — pick whichever reads on white
ground at 250px zoom.

Violet ward, freeze, damage, and bolt-eat stay gameplay on the wavefront.
They do not need extra meshes.

### 3.9 Explosions and projectiles

**Pixel explosion:** instanced 2×2 / 3×3 quads (V1 sizes), tintable,
~480ms, used for deaths, player hit, portal pop. Motion can have a little
Y bounce so they leave the plane, but they are allowed to be flat XZ
bursts if that compresses better. Same spawn counts as V1 to start
(22 world, 36 HUD shower).

**HUD shower:** screen-space, 2D overlay first.

**Fireball / frostball:** generated orbs (colored billboard or particle),
not sheet art. Frostball impact radius stays **14 px** gameplay.

**Damage numbers:** 2D overlay + packed font first.

### 3.10 Game state and modules

Unchanged idioms: flat entity arrays, module-level state, one scene flag,
localStorage blob for scrap + shop ranks only. New modules should be
plain files (`gl.ts`, `camera.ts`, `ground.ts`, …) — not a renderer class
hierarchy.

The production entry is `src/index.ts`. It must not import
`src/_v1-flat-pixels/` or `src/_sample-game/`.

---

## 4. Sprites and palette

Sheet, frames, hitboxes, and the 11-color palette are **V1 §4**. Do not
duplicate the tables here.

Overrides:

- No per-sprite grey bake. The atlas is full color.
- Leg-cut, flip, `rot90`, and pipe stripe remap still happen on the CPU,
  once, at atlas pack.
- Ground tiles and vein stamps are **gone** — the ground shader replaces
  them.
- Code-drawn V1 primitives that this spec moves to WebGL: nova, enemy
  shadows, pixel explosion, projectiles. HUD primitives stay 2D until the
  font fallback.

Asset rules from V1 still apply: never ship `sprites-grey.png`; one
`sprites.png`; new pixels stay in the 11-color palette.

---

## 5. Open questions / TBD

Engine TBDs (tune in the slice, then lock):

- Pitch 30° vs a slightly steeper or flatter iso once sprites sit on the
  floor.
- Whether to integer-snap billboard origins to kill 1px swim.
- Vein cell scale vs 250px zoom (V1’s 6×12 may feel tight or huge in iso).
- Wave duration / easing.
- Nova blend mode and how many gradient stops look readable at 66 px.
- Blob shadow alpha, size, and whether the player gets one.
- `ANGLE_instanced_arrays` vs a dynamic buffer — build both if the zip is
  close.
- Overlay vs system fonts: decide after the slice zip, not before.

Gameplay TBDs stay in V1 §5 (XP curve, shop prices, revive i-frames, …).

---

## 6. Build order

Measure `npm run build` at the end of every phase. Log the zip in
`SIZE_LOG.md`. Do **not** port the run loop until phase 1 has a number.

| Phase | Work | Done |
|-------|------|------|
| **1 — Vertical slice** | WebGL context + resize/pixel-upscale. Ortho iso camera following a dummy player. White plane + vein shader + locked-palette greys. One billboard from the packed atlas (unicorn idle). Soft blob shadow. One expanding gradient nova. One pixel-explosion burst (key or timer). Screen-axis move. **No HUD, no swarm, no shop.** Record the zip. | |
| **2 — Palette + wave** | Atlas pack (leg-cut, aliases). `uUnlocked` + portal-triggered wave on ground **and** sprites. Confirm a locked-red unicorn and a post-wave recolor without rebake. | |
| **3 — HUD decision** | Port packed font + V1 HUD/overlays **or** take fallback #1 (system fonts) if phase 1–2 already ate the headroom. | |
| **4 — Gameplay port** | Player, swarm, combat, portals, pickups, overlays, save, audio. Presentation goes through the new renderer; rules stay V1. | |
| **5 — Tune + ship** | Iso framing, nova gradient, shadows, wave feel, V1 combat TBDs, golf. | |

Phase 1 success looks like: a pixelated isometric white floor with grey
veins, a crisp unicorn that stays planted on the plane, a blob under it, a
gradient disc that grows and dies, and a burst of pixel quads — and a zip
number we trust.

If phase 1 is already over ~4–5 KB advzip **before** gameplay, stop and
spend the engine fallback ladder before porting V1 systems.
