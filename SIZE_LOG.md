# Size log

Limit: **13,312 B**. Zip is the scoreboard (`npm run build` → advzip).

## 2026-08-30 — V2 phase 4 (gameplay port)

**advzip: 13,825 B (103.85% of 13 KB). Over by 513 B.**

Delta vs phase 3: **+6,976 B**. Full run: screen-axis player, swarm, horn + nova +
bolts, 500px portal ring, magnet pickups, shop, level-up cards, title drain,
death/win, save, audio. Presentation is WebGL billboards + plane discs; HUD
stays 2D.

Playable, but over the cap. Phase 5 is golf (and iso/nova/shadow feel).

---

## 2026-08-30 — V2 phase 3 (HUD decision)

**advzip: 6,849 B (51.45% of 13 KB). Headroom 6,463 B.**

Delta vs drop-walk: **+1,785 B**. Packed 3×5 font, 2D overlay canvas, title + pause
menus, run HUD (timer, level, XP, color squares, scrap, under-player HP).
No shop, cards, title drain, or scrap icon yet.

**Decision: keep the packed font.** System-font fallback is not needed at this size.

---

## 2026-08-30 — drop walk frames

**advzip: 5,064 B (38.04% of 13 KB). Headroom 8,248 B.**

Delta vs phase 2: **−326 B**. Leg-cut atlas blit and walk-frame swap are gone;
movement is the 1px bob + shadow scale only. Alias snap + sheet upload remain.

---

## 2026-08-30 — V2 phase 2 (atlas + wave)

**advzip: 5,390 B (40.49% of 13 KB). Headroom 7,922 B.**

Delta vs phase 1: **+799 B**. Atlas packer (leg-cut, alias snap), shader color wave,
dummy portal origins, walk frames. Still no HUD / swarm / shop / audio.

---

## 2026-08-30 — V2 vertical slice

**advzip: 4,591 B (34.49% of 13 KB). Headroom 8,721 B.**

Phase 1 engine only: WebGL1 iso camera, vein+palette ground shader, unicorn billboard,
soft blob, gradient nova, pixel explosions. No HUD, swarm, shop, or audio.
14 modules. Below the spec's ~4–5 KB "stop and cut" line.

V1 gameplay-complete reference (12,006 B) is below; do not treat it as the V2 baseline.

---

## 2026-08-28 — V1 zip (archive)

**advzip: 12,006 B (90.19% of 13 KB). Headroom 1,306 B.**

Pre-trim working zip was **12,406 B** (93.19%). This pass dropped **400 B** by deleting unique no-ops that the infinite white map never used:

| Change | Why it shipped for free |
|--------|-------------------------|
| Player tile-edge snap | `getTileSolid` always returns null |
| Enemy/bolt wall tests | `getTile` is always white; no `TILE_WALL` |
| Colored + wall tile bakes | Only the white stamp is drawn; veins carry color |
| Empty `generateMap()` call | Live map is infinite white |
| `isSequenceActive` stub | Always false, no callers |
| SFX play counters | Dev-only `window.musicState` leftover |
| Font glyphs `K` and `.` | Unused in any baked string |

Left in source (tree-shaken or Director's Cut): `PORTAL_CELLS`, `hubRadiusTiles`, `colorWave` / `WAVE_SPEED`, empty `generateMap` / `getTileSolid`. Restore player snap + `hitsWall` / `wallBox` from git when walls return.

Not touched (need live sign-off or Track 2): damage numbers, Start SPD shop row, remaining cutscene motion / instant wave, shop string cuts.

---

## Track 1 bulk golf (2026-08-20)

No UI / gameplay / visual changes. Reverted any cluster that grew the zip.

| Stage | advzip | Delta |
|------:|-------:|------:|
| Baseline (`main`) | 12596 | — |
| Cluster A: dead unique (`pixelScale`, unused glyphs `J.?\'-`, unused `generatePipes` boot/seed, `colorWave.maxR`, sprite consts, `lang`) | 12504 | **-92** |
| Cluster D packed (pickups helper, shop tuples, cam object, openEnd, map `#fff`) | 12530 | +26 — **reverted** |
| Spawn packing (`makeEnemy`) + map grey hex strings + save `??` | 12487 | **-17** |
| Pickup `add()` helper | 12522 | +35 — **reverted** |
| `openEnd`, `totalStat` cap, drop charset | 12467 | **-20** |
| Drop `toUpperCase`; unify nova heal/boost caster | 12465 | **-2** |
| Boss death near-miss; share STR/WIS rank mul | 12455 | **-10** |
| Merge `hornPwr`/`novaPwr` → `pwr(id)` | 12439 | **-16** |

**Then: 12,439 B (93.44% of 13 KB). Saved 157 B. Headroom 873 B.**

Not done from that pass (need live sign-off or Track 2): pipe dir tables, player snap, cutscene wrap, damage numbers, shop row cuts, instant wave. Player snap is now gone as a no-op (2026-08-28); the rest still apply.
