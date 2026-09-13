// Curated ports of behaviours from the `living_field` Python prototype
// (branch `living-field`, tamagochi-characters-python/living_field/) onto this repo's
// plain-JS, 0-255-int, 17x9 pure `(t, opts) -> grid` convention — same shape as scenes.js.
//
// PORTED
//   finale     the winner's fireworks (race.py `finale()`) — an ~11s, four-movement
//              sequence explicitly called out by living_field's README as "worth
//              stealing regardless of the rest" and a good fit for a race winner.
//   aurora     vertical curtains of light (patterns.py `aurora()` + ramps.py's AURORA ramp)
//   seismic    a wave travelling up through the tower (patterns.py `seismic()` + SEISMIC ramp)
//   radar      the weather-radar dome on the roof, sweeping (patterns.py `radar()` + RADAR ramp)
//   sounding   a vertical atmospheric profile drifting upward (patterns.py `sounding()` +
//              SOUNDING ramp) — pure function of time, like the three above.
//   attention  "it has noticed you" (patterns.py `attention()` + ATTENTION ramp) — genuinely
//              pure when previewed at `_focus`'s real default `(0.92, 0.5)` (row, col — near
//              the ground, centred) and `ctx.intensity`'s real default `0.6`; no synthetic
//              ctx needed, just the function's own defaults.
//   startle    "it flinched" (patterns.py `startle()` + STARTLE ramp) — also uses `_focus`'s
//              default, but freezing `age` at its own default (`0.0`) forever would just show
//              the initial flash motionless, a poor preview of a flash-then-recoil-then-watch
//              effect. So the preview instead synthesizes `age = t` (treating the whole preview
//              as one startle beginning at t=0) and centres the focus at the facade's middle
//              `[0.5, 0.5]` (a contact point, rather than `_focus`'s *idle*-gaze default) — this
//              is a deliberate synthetic ctx choice, not the function's own default behaviour.
//   memory     "everyone who touched it tonight" (patterns.py `memory()` + MEMORY ramp) — the
//              empty-touches fallback is just a faint idle pulse, so the preview instead builds
//              a small fixed `SAMPLE_TOUCHES` array (16 touches spread across a ~3-hour evening,
//              clustered near the ground since that's the only place people can reach, one small
//              cluster of 3 close-together touches to show "a few people gathered here") and a
//              fixed `EVENING_NOW` ("now" pinned at the end of that evening, independent of the
//              preview's own animation clock) so marks of varying age/size are visible together
//              for the whole preview while the record still visibly breathes.
//   dream      "it is replaying the evening" (patterns.py `dream()` + DREAM ramp) — reuses the
//              same `SAMPLE_TOUCHES`. Unlike memory, `dream()`'s replay position is driven
//              directly by its own `t` argument (a 22s cycle sweeps `[t0, t1]` of the touches),
//              so the preview's animation clock *is* the meaningful value here — no extra ctx
//              needed beyond the synthetic touches. `seconds: 22` covers exactly one full sweep.
//   forecast   "the building tells you the weather" (patterns.py `forecast()` + FORECAST ramp)
//              — checked, and the network fetch genuinely lives in `weather.py`/`run.py`, not in
//              `forecast()` itself: the function is pure given `ctx.forecast` (a roof-first list
//              of `[rain, cloud]` pairs). So it's portable the same way memory/dream are, using a
//              fixed synthetic `SAMPLE_FORECAST_ROWS` depicting a front arriving (heavy rain/cloud
//              16h out fading to clear "now"), which shows the effect the README calls the whole
//              point of the scene: a bright band arriving at the roof and descending to the street.
//   scroll-*   each school's name scrolling across a band near the roof (text.py's `Ticker`,
//              ported in ticker.js — this file just registers one preview per school). A
//              test of "show the university name scrolling past the top during its
//              introduction" — these are debug previews only, not wired into the real intro yet.
//
// These are picked because each is either a pure function of a clock, or made pure for this
// preview with a small, fixed, deterministic synthetic ctx (documented per-scene above and at
// each function below) — never a live sensor/network dependency — and each is visually distinct
// in *shape* (not just palette) and cheap per-pixel.
//
// DELIBERATELY NOT PORTED
//   - race.py's Race/Crew classes: living_field's own README says to throw the rest of
//     race.py away in favor of this repo's race-state.js/render.js, which already exist
//     and are better (real state, real mascots, a front end).
//   - tree.py: unlike every pattern above, a tree's *shape* is not a formula — it is the
//     output of a stochastic simulation (`_Tip` objects random-walking and branching, pruned
//     over time, advanced by a seeded `random.Random`). There is no static expression to
//     transcribe the way there is for a field function; faithfully porting "what a tree looks
//     like on the building" means porting the growth simulation itself (including matching
//     Python's RNG behaviour bit-for-bit to stay deterministic), which is a materially
//     different and much larger undertaking than every port above, not a small addition. A
//     hand-authored fake tree shape would not match the Python source's actual algorithm, so
//     it's left out rather than faked.
//   - reef: has no function in patterns.py at all (`PATTERNS` never gets a `"reef"` entry from
//     this file) — it lives entirely in `worlds.py`'s REEF world as a reaction-diffusion
//     simulation (`reaction.py`) that carries its own state across frames. There is no pure
//     per-frame formula here to port.
//
// SIMPLIFICATION NOTE
// The Python originals render on a 4x supersampled grid purely for antialiasing, then
// average down to 17x9, and compose through worlds.py's substrate/texture/breathing/
// ripple-boost system with gamma-correct colour ramps (ramps.py: un-squash sRGB, mix in
// linear light, squash back). This file computes directly at the real 17x9 resolution —
// scenes.js doesn't supersample either, so this matches the rest of the repo — and blends
// ramp colours with plain linear RGB interpolation via sprites.js's `mix()`, the same way
// scenes.js blends colours everywhere else. The shapes and motion match the originals;
// the exact tonal curve does not, and that trade felt right for a debug preview rather
// than a pixel-exact port.
import { COLS, ROWS, softenColor } from "./render.js";
import { blank, mix } from "./sprites.js";
import { SCHOOLS, SCHOOL_INFO } from "./mascots.js";
import { tickerDuration, tickerFrame } from "./ticker.js";

const TAU = Math.PI * 2;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const clampByte = (v) => Math.max(0, Math.min(255, Math.round(v)));

/** stops: [[pos 0..1, [r,g,b] 0..255], ...] sorted by pos. Plain (non-gamma) RGB lerp. */
function sampleRamp(stops, pos) {
  const p = clamp01(pos);
  for (let i = 1; i < stops.length; i++) {
    const [p0, c0] = stops[i - 1];
    const [p1, c1] = stops[i];
    if (p <= p1 || i === stops.length - 1) {
      const t = p1 > p0 ? (p - p0) / (p1 - p0) : 0;
      return mix(c0, c1, clamp01(t));
    }
  }
  return stops[stops.length - 1][1];
}

// -- colour ramps, transcribed from living_field/ramps.py -------------------------------
const AURORA_RAMP = [
  [0.0, [4, 16, 26]],
  [0.26, [8, 78, 56]],
  [0.55, [48, 214, 118]],
  [0.8, [150, 250, 178]],
  [1.0, [214, 104, 235]],
];
const SEISMIC_RAMP = [
  [0.0, [14, 6, 12]],
  [0.3, [96, 18, 32]],
  [0.6, [214, 74, 28]],
  [0.82, [246, 158, 44]],
  [1.0, [255, 232, 170]],
];
const RADAR_RAMP = [
  [0.0, [2, 14, 22]],
  [0.22, [14, 108, 74]],
  [0.45, [54, 186, 96]],
  [0.64, [206, 220, 62]],
  [0.82, [238, 146, 42]],
  [1.0, [228, 58, 66]],
];
const SOUNDING_RAMP = [
  [0.0, [8, 12, 40]],
  [0.3, [18, 62, 132]],
  [0.62, [72, 172, 226]],
  [0.85, [168, 226, 250]],
  [1.0, [236, 246, 255]],
];
const ATTENTION_RAMP = [
  [0.0, [10, 8, 26]],
  [0.28, [86, 40, 30]],
  [0.58, [214, 124, 40]],
  [0.82, [252, 200, 116]],
  [1.0, [255, 246, 226]],
];
const STARTLE_RAMP = [
  [0.0, [4, 6, 18]],
  [0.3, [18, 58, 132]],
  [0.6, [86, 170, 250]],
  [0.85, [196, 232, 255]],
  [1.0, [255, 255, 255]],
];
const MEMORY_RAMP = [
  [0.0, [8, 6, 30]],
  [0.24, [54, 22, 92]],
  [0.48, [152, 48, 118]],
  [0.7, [238, 118, 82]],
  [0.88, [252, 196, 120]],
  [1.0, [255, 244, 214]],
];
const DREAM_RAMP = [
  [0.0, [12, 10, 34]],
  [0.3, [62, 46, 112]],
  [0.58, [146, 96, 158]],
  [0.8, [226, 156, 150]],
  [1.0, [250, 222, 198]],
];
const FORECAST_RAMP = [
  [0.0, [5, 10, 26]],
  [0.3, [44, 56, 84]],
  [0.55, [96, 126, 158]],
  [0.76, [86, 196, 226]],
  [1.0, [222, 250, 255]],
];

// -- ambient patterns, transcribed from living_field/patterns.py ------------------------
// Each fills the whole 17x9 facade from `t` (ms) alone; `y`/`x` below are 0..1, y=0 at the
// roof (row 0) same as this repo's own grids.

/** AURORA — vertical curtains of light that fold and drift sideways as they descend. */
export function auroraFrame(t) {
  const tS = t / 1000;
  const grid = blank(ROWS, COLS, [0, 0, 0]);
  for (let r = 0; r < ROWS; r++) {
    const y = (r + 0.5) / ROWS;
    const lean = 0.16 * Math.sin(TAU * (y * 0.9 + tS * 0.055)) + 0.07 * Math.sin(TAU * (y * 2.1 - tS * 0.031));
    for (let c = 0; c < COLS; c++) {
      const x = (c + 0.5) / COLS;
      let v = Math.sin(TAU * ((x + lean) * 2.1 + tS * 0.021));
      v = Math.sign(v) * Math.abs(v) ** 0.65; // sharpen into distinct sheets
      v *= 1.15 - 0.85 * y; // hangs from the top
      grid[r][c] = sampleRamp(AURORA_RAMP, (v + 1) / 2);
    }
  }
  return grid;
}

/** SEISMIC — long calm, then a hard bright front climbing the tower, then a ragged tail. */
export function seismicFrame(t) {
  const tS = t / 1000;
  const period = 17;
  const phase = (((tS % period) + period) % period) / period;
  const front = 1.12 - phase * 1.55; // travels ground -> roof
  const grid = blank(ROWS, COLS, [0, 0, 0]);
  for (let r = 0; r < ROWS; r++) {
    const y = (r + 0.5) / ROWS;
    const d = y - front;
    const pWave = Math.exp(-(d * d) / (2 * 0.03 ** 2));
    const sWave = 0.75 * Math.exp(-((d - 0.155) ** 2) / (2 * 0.085 ** 2));
    const codaEnv = 0.3 * Math.exp(-Math.max(d - 0.28, 0) / 0.35);
    const coda = codaEnv * Math.sin(TAU * (y * 9.0 - tS * 1.1));
    const quiet = 0.06 * Math.sin(TAU * (y * 2.0 + tS * 0.08));
    let v = pWave + sWave + coda + quiet;
    v = v * 1.5 - 0.28;
    const color = sampleRamp(SEISMIC_RAMP, (v + 1) / 2);
    for (let c = 0; c < COLS; c++) grid[r][c] = color; // seismic is uniform across columns
  }
  return grid;
}

/** RADAR — the weather-radar dome on the roof, sweeping a sector scan back and forth. */
export function radarFrame(t) {
  const tS = t / 1000;
  const period = 9;
  const swing = Math.sin(TAU * (tS / period));
  const ang = swing * 1.1; // about +/- 63 degrees
  const goingRight = Math.cos(TAU * (tS / period)) > 0;
  const grid = blank(ROWS, COLS, [0, 0, 0]);
  for (let r = 0; r < ROWS; r++) {
    const y = (r + 0.5) / ROWS;
    const dy = y + 0.03; // origin sits on the roof
    for (let c = 0; c < COLS; c++) {
      const x = (c + 0.5) / COLS;
      const dx = x - 0.5;
      const a = Math.atan2(dx, dy);
      const da = a - ang;
      const beam = Math.exp(-(da * da) / (2 * 0.13 ** 2));
      const behind = goingRight ? da : -da;
      const trail = 0.55 * Math.exp(-Math.max(behind, 0) / 0.42); // the echo lingers behind the beam
      const dist = Math.sqrt(dx * dx + dy * dy);
      let v = (beam + trail) * (0.4 + 0.8 * dist);
      v = v * 1.7 - 0.38;
      grid[r][c] = sampleRamp(RADAR_RAMP, (v + 1) / 2);
    }
  }
  return grid;
}

/** SOUNDING — the building as a vertical slice of sky: horizontal bands drifting upward. */
export function soundingFrame(t) {
  const tS = t / 1000;
  const grid = blank(ROWS, COLS, [0, 0, 0]);
  for (let r = 0; r < ROWS; r++) {
    const y = (r + 0.5) / ROWS;
    let v = Math.sin(TAU * (y * 3.1 - tS * 0.03));
    v += 0.5 * Math.sin(TAU * (y * 7.3 + tS * 0.019));
    v += 0.22 * Math.sin(TAU * (y * 13.0 - tS * 0.045));
    v *= 0.45 + 0.85 * y; // layers get thinner/fainter with height
    v /= 1.7;
    const color = sampleRamp(SOUNDING_RAMP, (v + 1) / 2);
    for (let c = 0; c < COLS; c++) grid[r][c] = color; // sounding is uniform across columns
  }
  return grid;
}

// -- the four behaviours that need to know about people, transcribed from patterns.py ---
// Real ctx (a tracked gaze point / recent touches) isn't available to a debug-preview
// button, so each of these is made pure either by using the function's own real defaults
// (attention) or a small, fixed, deterministic synthetic ctx (startle/memory/dream) — see
// the top-of-file PORTED notes for exactly what and why.

/** [timestamp_s, row 0..1, col 0..1, weight] — a fixed, deterministic "evening" of touches,
 * spread across ~3 hours (0..10800s) and clustered near the ground (rows people can reach),
 * with one small cluster (rows 8200-8450s) showing a few people gathered in the same spot. */
const SAMPLE_TOUCHES = [
  [120, 0.9, 0.18, 1.0],
  [340, 0.86, 0.62, 0.8],
  [610, 0.92, 0.4, 1.2],
  [980, 0.88, 0.85, 0.9],
  [1500, 0.94, 0.1, 1.0],
  [2100, 0.8, 0.55, 1.4],
  [2800, 0.9, 0.3, 0.7],
  [3600, 0.86, 0.75, 1.1],
  [4500, 0.92, 0.48, 1.3],
  [5600, 0.88, 0.2, 0.9],
  [6800, 0.84, 0.9, 1.0],
  [8200, 0.9, 0.62, 1.5],
  [8300, 0.88, 0.58, 1.2],
  [8450, 0.92, 0.65, 1.0],
  [9800, 0.86, 0.35, 0.8],
  [10700, 0.9, 0.5, 1.6],
];
/** memory's synthetic "now": the end of the sample evening, independent of the preview's
 * own animation clock, so the record's marks stay put while the field still breathes. */
const EVENING_NOW = 10800;

/**
 * ATTENTION — light gathers towards where the building is looking and the field breathes.
 * Pure at `_focus`'s real default `(0.92, 0.5)` and `ctx.intensity`'s real default `0.6`.
 */
export function attentionFrame(t) {
  const tS = t / 1000;
  const [fr0, fc0] = [0.92, 0.5]; // _focus(ctx) default when ctx is falsy
  const intensity = 0.55 + 0.45 * 0.6; // ctx.get("intensity", 0.6) default
  const fr = fr0 + 0.055 * Math.sin(TAU * tS * 0.23) + 0.02 * Math.sin(TAU * tS * 0.51);
  const fc = fc0 + 0.085 * Math.sin(TAU * tS * 0.17 + 1.1) + 0.03 * Math.sin(TAU * tS * 0.43);
  const breathe = 1.0 + 0.22 * Math.sin(TAU * tS * 0.42);
  const grid = blank(ROWS, COLS, [0, 0, 0]);
  for (let r = 0; r < ROWS; r++) {
    const y = (r + 0.5) / ROWS;
    for (let c = 0; c < COLS; c++) {
      const x = (c + 0.5) / COLS;
      const dr = y - fr;
      const dc = x - fc;
      const near = Math.exp(-(dr * dr / (2 * 0.3 ** 2) + dc * dc / (2 * 0.26 ** 2)));
      const pupil = Math.exp(-(dr * dr / (2 * 0.1 ** 2) + dc * dc / (2 * 0.11 ** 2)));
      let v = (0.85 * near + 0.75 * pupil) * breathe * intensity;
      v = v * 1.02 - 0.3;
      grid[r][c] = sampleRamp(ATTENTION_RAMP, (v + 1) / 2);
    }
  }
  return grid;
}

/**
 * STARTLE — a flash at the point of contact, a dark ring recoiling outward, then a held
 * watchful glow. Preview synthesizes `age = t` (one startle beginning at t=0) with the focus
 * at the facade's centre, since freezing `age` at its idle default would just show the flash
 * motionless — see the top-of-file PORTED note.
 */
export function startleFrame(t) {
  const tS = t / 1000;
  const age = tS;
  const fr = 0.5 + 0.08 * Math.sin(TAU * 0.31 * tS);
  const fc = 0.5 + 0.08 * Math.sin(TAU * 0.23 * tS + 1.0);
  const radius = age * 0.85;
  const settle = 1.0 - Math.exp(-age / 2.2);
  const grid = blank(ROWS, COLS, [0, 0, 0]);
  for (let r = 0; r < ROWS; r++) {
    const y = (r + 0.5) / ROWS;
    for (let c = 0; c < COLS; c++) {
      const x = (c + 0.5) / COLS;
      const dr = y - fr;
      const dc = x - fc;
      const dist = Math.hypot(dr, dc);
      const hit = Math.exp(-age / 0.22) * Math.exp(-(dist * dist) / (2 * 0.12 ** 2));
      const ring = Math.exp(-((dist - radius) ** 2) / (2 * (0.06 + 0.05 * age) ** 2)) * Math.exp(-age / 0.9);
      const pulledBack = -0.55 * Math.exp(-age / 1.3) * clamp01(1.0 - dist / Math.max(radius, 1e-3));
      const watch = Math.exp(-(dist * dist) / (2.0 * 0.34 ** 2)) * (0.3 + 0.26 * Math.sin(TAU * 1.1 * tS));
      const alert = 0.16 + 0.9 * watch;
      let v = (1.35 * hit + 1.05 * ring + pulledBack) * (1.0 - settle) + alert * settle;
      v = Math.max(-1.2, Math.min(1.2, v)) - 0.1;
      grid[r][c] = sampleRamp(STARTLE_RAMP, (v + 1) / 2);
    }
  }
  return grid;
}

/**
 * MEMORY — every touch leaves a mark, older ones spread wider and dim, newer ones sharp.
 * Preview uses `SAMPLE_TOUCHES` and a fixed `EVENING_NOW` so the record is visible whole.
 */
export function memoryFrame(t) {
  const tS = t / 1000;
  const now = EVENING_NOW;
  const v = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  for (const [tt, tr, tc, w] of SAMPLE_TOUCHES) {
    const age = Math.max(0.0, now - tt);
    const radius = 0.07 + 0.012 * Math.sqrt(age);
    const strength = w * (0.25 + 0.75 * Math.exp(-age / 420.0));
    for (let r = 0; r < ROWS; r++) {
      const y = (r + 0.5) / ROWS;
      for (let c = 0; c < COLS; c++) {
        const x = (c + 0.5) / COLS;
        const dr = y - tr;
        const dc = x - tc;
        v[r][c] += strength * Math.exp(-(dr * dr + dc * dc) / (2 * radius * radius));
      }
    }
  }
  const grid = blank(ROWS, COLS, [0, 0, 0]);
  for (let r = 0; r < ROWS; r++) {
    const y = (r + 0.5) / ROWS;
    for (let c = 0; c < COLS; c++) {
      const x = (c + 0.5) / COLS;
      let val = v[r][c];
      val *= 1.0 + 0.34 * Math.sin(TAU * (0.95 * tS + y * 1.1 + x * 0.6)) + 0.16 * Math.sin(TAU * (0.55 * tS - y * 0.8));
      val = Math.log1p(10.0 * val) / Math.log1p(10.0 * 22.0);
      val = Math.max(-1.0, Math.min(1.02, val * 0.86));
      grid[r][c] = sampleRamp(MEMORY_RAMP, (val + 1) / 2);
    }
  }
  return grid;
}

/**
 * DREAM — nobody's near, so the building replays the evening at speed: each touch flares
 * again in order. Preview reuses `SAMPLE_TOUCHES`; the replay position is driven directly by
 * `t` itself (a 22s cycle sweeps start to finish), so no extra synthetic ctx is needed here.
 */
export function dreamFrame(t) {
  const tS = t / 1000;
  const touches = SAMPLE_TOUCHES;
  const t0 = touches[0][0];
  const t1 = touches[touches.length - 1][0];
  const span = Math.max(t1 - t0, 1.0);
  const cycle = 22.0;
  const head = ((tS % cycle) / cycle) * span + t0;
  const v = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  for (const [tt, tr, tc, w] of touches) {
    const d = head - tt;
    if (d < -0.4 * span || d > 0.3 * span) continue;
    const amp = Math.exp(-Math.abs(d) / (0.035 * span)) + 0.3 * Math.exp(-Math.max(d, 0) / (0.16 * span));
    for (let r = 0; r < ROWS; r++) {
      const y = (r + 0.5) / ROWS;
      for (let c = 0; c < COLS; c++) {
        const x = (c + 0.5) / COLS;
        const dr = y - tr;
        const dc = x - tc;
        v[r][c] += w * amp * Math.exp(-(dr * dr + dc * dc) / (2 * 0.075 ** 2));
      }
    }
  }
  const pos = (head - t0) / span;
  const grid = blank(ROWS, COLS, [0, 0, 0]);
  for (let r = 0; r < ROWS; r++) {
    const y = (r + 0.5) / ROWS;
    const band = 0.3 * Math.exp(-((y - pos) ** 2) / (2 * 0.1 ** 2));
    for (let c = 0; c < COLS; c++) {
      let val = v[r][c] + band;
      val = Math.tanh(val * 1.1);
      val = val * 1.28 - 0.3;
      grid[r][c] = sampleRamp(DREAM_RAMP, (val + 1) / 2);
    }
  }
  return grid;
}

/** A fixed 16-hour synthetic forecast, roof-first (index 0 = 16h out, last = "now"): a front
 * of heavy rain/cloud arriving, clearing by the time it reaches the street. [rain, cloud]. */
const SAMPLE_FORECAST_ROWS = [
  [0.85, 0.9],
  [0.7, 0.9],
  [0.55, 0.85],
  [0.4, 0.8],
  [0.25, 0.7],
  [0.15, 0.6],
  [0.08, 0.5],
  [0.04, 0.4],
  [0.0, 0.35],
  [0.0, 0.25],
  [0.0, 0.15],
  [0.0, 0.1],
  [0.0, 0.05],
  [0.0, 0.0],
  [0.0, 0.0],
  [0.0, 0.0],
];

/**
 * FORECAST — every row is an hour ahead; the roof is 16h out, the ground is now. A bright
 * band of rain arriving at the top descends the tower toward the street over the hours.
 * Genuinely pure given forecast data — the live NWS fetch lives in weather.py/run.py, not in
 * this function — so the preview supplies `SAMPLE_FORECAST_ROWS` in place of `ctx.forecast`.
 */
export function forecastFrame(t) {
  const tS = t / 1000;
  const rows = SAMPLE_FORECAST_ROWS;
  const HIDDEN_ROWS = 2; // rows behind the real tree line, per patterns.py
  const visible = ROWS - HIDDEN_ROWS;
  const col = new Array(ROWS).fill(0);
  for (let i = 0; i < visible; i++) {
    const src = Math.round((i * (rows.length - 1)) / Math.max(visible - 1, 1));
    const [rain, cloud] = rows[Math.min(src, rows.length - 1)];
    col[i] = Math.min(1.0, 0.3 * cloud + 1.05 * rain);
  }
  for (let i = visible; i < ROWS; i++) col[i] = col[visible - 1];

  const grid = blank(ROWS, COLS, [0, 0, 0]);
  for (let r = 0; r < ROWS; r++) {
    const y = (r + 0.5) / ROWS;
    const drift = 0.16 * Math.sin(TAU * (0.035 * tS + y * 0.8));
    for (let c = 0; c < COLS; c++) {
      const x = (c + 0.5) / COLS;
      let v = col[r] * (1.0 + drift) + 0.05 * Math.sin(TAU * (0.06 * tS + x * 0.9 + y * 1.4));
      v = v * 1.75 - 0.55;
      grid[r][c] = sampleRamp(FORECAST_RAMP, (v + 1) / 2);
    }
  }
  return grid;
}

// -- finale, transcribed from living_field/race.py's finale() ---------------------------
// Eleven seconds, four movements: LAUNCH (rocket climbs the winner's lane), BURST (three
// shells open across the facade), FALL (embers drift down, the roof holds a glow), NAME
// (settles to a soft breathing glow — the tower would say who won here; that's left to the
// caller/UI, same as the Python original left the name to run.py).
const LAUNCH_S = 1.6;
const BURST_S = 2.9;
const FALL_S = 3.5;
const NAME_S = 3.0;
export const FINALE_SECONDS = LAUNCH_S + BURST_S + FALL_S + NAME_S; // 11.0

const WARM_TINT = [0.45, 0.35, 0.18];
const warmOf = (col01) => col01.map((v, i) => clamp01(v * 0.55 + WARM_TINT[i]));

/**
 * FINALE — the winner's fireworks. `t` is ms since the crew crossed the line.
 * `color`: winner's RGB (0-255). `lane`: 0..1 across the facade, where the rocket launches
 * from (defaults to the Duck King's gold, centred, when there's no specific winner).
 */
export function finaleFrame(t, { color = [210, 160, 20], lane = 0.5 } = {}) {
  const age = Math.max(0, t / 1000);
  const col = color.map((v) => v / 255);
  const warm = warmOf(col);
  const acc = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => [0, 0, 0]));
  const add = (r, c, factor, rgb) => {
    if (factor <= 0) return;
    const px = acc[r][c];
    px[0] += factor * rgb[0];
    px[1] += factor * rgb[1];
    px[2] += factor * rgb[2];
  };
  const toGrid = () => acc.map((row) => row.map(([r, g, b]) => [clampByte(r * 255), clampByte(g * 255), clampByte(b * 255)]));

  if (age < LAUNCH_S) {
    // A rocket leaving the winner's lane, fast in space (which is fine — windows just can't
    // blink), trailing behind it.
    const p = age / LAUNCH_S;
    const y0 = 1.0 - p * 0.86;
    for (let r = 0; r < ROWS; r++) {
      const y = (r + 0.5) / ROWS;
      const dy = y - y0;
      for (let c = 0; c < COLS; c++) {
        const x = (c + 0.5) / COLS;
        const dx = Math.abs(x - lane);
        const head = Math.exp(-(dy * dy) / (2 * 0.03 ** 2)) * Math.exp(-(dx * dx) / (2 * 0.055 ** 2));
        const trail = Math.exp(-Math.max(dy, 0) / 0.3) * Math.exp(-(dx * dx) / (2 * 0.045 ** 2)) * 0.5;
        add(r, c, (head * 1.7 + trail) * (0.4 + 0.6 * p), col);
      }
    }
    return toGrid();
  }

  let a = age - LAUNCH_S;
  if (a < BURST_S) {
    // Three shells, staggered, each swelling open rather than popping.
    const p = a / BURST_S;
    const shells = [
      [0.5, 0.16, 0.0, 1.0],
      [0.26, 0.3, 0.55, 0.72],
      [0.76, 0.26, 0.95, 0.78],
    ];
    for (let r = 0; r < ROWS; r++) {
      const y = (r + 0.5) / ROWS;
      for (let c = 0; c < COLS; c++) {
        const x = (c + 0.5) / COLS;
        shells.forEach(([cx, cy, delay, size], k) => {
          const local = a - delay;
          if (local <= 0) return;
          const q = Math.min(1.0, local / (BURST_S - delay));
          const rad = 0.06 + size * 0.75 * q ** 0.55;
          const d = Math.hypot(x - cx, y - cy);
          const shell = Math.exp(-((d - rad) ** 2) / (2 * (0.055 + 0.1 * q) ** 2));
          const core = Math.exp(-(d * d) / (2 * (0.1 + 0.16 * q) ** 2)) * (1.0 - q);
          const fade = (1.0 - q) ** 0.7;
          add(r, c, (shell * 1.25 + core * 1.1) * fade, k === 0 ? col : warm);
        });
        add(r, c, 0.16 * (1.0 - p), col); // the whole facade carries the colour while it's open
      }
    }
    return toGrid();
  }

  a -= BURST_S;
  if (a < FALL_S) {
    // Embers drifting down; the roof holds a glow.
    const p = a / FALL_S;
    for (let r = 0; r < ROWS; r++) {
      const y = (r + 0.5) / ROWS;
      for (let c = 0; c < COLS; c++) {
        const x = (c + 0.5) / COLS;
        let fall = 0;
        for (let i = 0; i < 9; i++) {
          const sx = (i * 0.113 + 0.07) % 1.0;
          const sy = 0.16 + 0.8 * p ** 1.35 + 0.1 * Math.sin(i * 2.1);
          const dx = x - sx;
          const dy = y - sy;
          fall = Math.max(fall, Math.exp(-(dx * dx) / (2 * 0.035 ** 2) - (dy * dy) / (2 * 0.045 ** 2)));
        }
        const drift = fall * (1.0 - p) * 1.15;
        const roof = Math.exp(-(y * y) / (2 * 0.3 ** 2)) * 0.42 * (1.0 - p * 0.7);
        add(r, c, drift, warm);
        add(r, c, roof, col);
      }
    }
    return toGrid();
  }

  // Settling into a soft, held, breathing glow.
  a -= FALL_S;
  const p = Math.min(1.0, a / NAME_S);
  const glow = 0.3 * (1.0 - p * 0.55) * (0.85 + 0.15 * Math.sin(TAU * 0.5 * age));
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) add(r, c, glow, col);
  return toGrid();
}

/** Admin debug registry: one entry per previewable living-field scene. */
export const LIVING_FIELD_SCENES = {
  finale: { label: "Finale (fireworks)", seconds: FINALE_SECONDS, frame: finaleFrame },
  aurora: { label: "Aurora", seconds: 8, frame: (t) => auroraFrame(t) },
  seismic: { label: "Seismic", seconds: 17, frame: (t) => seismicFrame(t) },
  radar: { label: "Radar", seconds: 9, frame: (t) => radarFrame(t) },
  sounding: { label: "Sounding", seconds: 12, frame: (t) => soundingFrame(t) },
  attention: { label: "Attention", seconds: 8, frame: (t) => attentionFrame(t) },
  startle: { label: "Startle", seconds: 8, frame: (t) => startleFrame(t) },
  memory: { label: "Memory", seconds: 10, frame: (t) => memoryFrame(t) },
  dream: { label: "Dream", seconds: 22, frame: (t) => dreamFrame(t) },
  forecast: { label: "Forecast", seconds: 12, frame: (t) => forecastFrame(t) },
  ...Object.fromEntries(
    SCHOOLS.map((school) => {
      const { name, color } = SCHOOL_INFO[school];
      const message = name.toUpperCase();
      const softened = softenColor(color);
      return [
        `scroll-${school}`,
        {
          label: `Scroll: ${name}`,
          seconds: tickerDuration(message) / 1000,
          frame: (t) => tickerFrame(t, { message, color: softened }),
        },
      ];
    }),
  ),
};
