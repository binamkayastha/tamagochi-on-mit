// The story around the race, as pure (time, state) -> 17x9 frame functions.
//
//   idle       reign      the King of the Charles (the Duck King until someone wins) idles, crowned
//   intro      abdicate   see INTRO_BEATS below: the king gives up the crown and waddles away,
//                         then each challenger is introduced and takes its lane
//   countdown  3, 2, 1    soft digits while the challengers wait on the riverbank
//   running / finished    the race itself (render.js)
//
// The last frame of each scene is the first frame of the next, so hand-offs don't jump.
import { SCHOOLS, SCHOOL_INFO } from "./mascots.js";
import {
  BANNER,
  COLS,
  LANE_COLS,
  OFF,
  RIVER_ROW,
  ROWS,
  START_TOP,
  buildFrame,
  drawRiverRow,
  softenColor,
} from "./render.js";
import { CROWN, DIGITS, GOLD, MASCOTS, MASCOT_FOR_SCHOOL, blank, blit, drawLaneMascot, mix } from "./sprites.js";
import { winCelebrationFrame } from "./win-celebration.js";
import { DEFAULT_MAX_BRIGHTNESS } from "./safety.js";

export const DEFAULT_SCENE_CONFIG = { introSeconds: 28, countdownSeconds: 3, brightness: DEFAULT_MAX_BRIGHTNESS };
// Shorter than ~14 s and the beats (especially the four introductions) blur together.
// brightness: fraction of full channel value every pushed frame is capped to (see
// safety.js's capBrightness) — 0.4 is dim-but-legible from across the Charles, 1 is no cap.
export const SCENE_CONFIG_LIMITS = { introSeconds: [14, 45], countdownSeconds: [0, 10], brightness: [0.4, 1] };
const SCENE_CONFIG_UNITS = { introSeconds: "seconds", countdownSeconds: "seconds", brightness: "(a 0..1 fraction)" };
// "finished" loops the win celebration forever (see win-celebration.js), the same as "idle"
// loops the reign forever — both only stop when a host calls start()/reset().
export const ANIMATED_STATUSES = ["idle", "intro", "countdown", "finished"];

// Beat boundaries in ms for a 26.5 s intro; they stretch or shrink with the configured length.
export const INTRO_BEATS = {
  holdEnd: 1500, //          0-1.5   the king, crowned, stands still
  bowEnd: 2500, //         1.5-2.5   bows: closes its eyes and dips one floor
  riseEnd: 4500, //        2.5-4.5   the crown lifts off, floor by floor, to the top of the tower
  shineEnd: 5500, //       4.5-5.5   the crown waits at the top
  meltEnd: 6500, //        5.5-6.5   the crown spreads into the gold finish line
  waddleEnd: 15500, //    6.5-15.5   the king waddles off the side of the tower, a window at a
  //                                 time, its ducklings crossing in single file after it
  introductions: 15500, // 15.5-27.5 each challenger in turn (INTRODUCTION ms each): rises big from
  //                                 the river over its school colour, cheers, blinks, takes its lane
  end: 28000,
};
const INTRODUCTION = {
  length: 3000,
  riseEnd: 900, //    rises from the river to the middle of the tower
  cheerStart: 1100, // mouth open
  cheerEnd: 1600,
  blinkStart: 1900,
  blinkEnd: 2050,
  holdEnd: 2200, //   then sinks back down (until sinkEnd) while its mini climbs onto the riverbank
  sinkEnd: 2500,
  miniStart: 2000,
};

const KING_TOP = 5; // 9x9 king on rows 5-13, crown on rows 3-4
const CROWN_REST_TOP = KING_TOP - 2;
const PEDESTAL_ROW = KING_TOP + 9; // just under a centred 9x9 mascot

// The Duck King leaves with its ducklings behind it, Make Way for Ducklings style. Only the duck
// gets them: a school mascot that won its way onto the throne abdicates alone, and walks the same
// beat more slowly because it has less ground to cover.
const DUCKLINGS = 3;
const DUCKLING_GAP = 8; // the 5x5 duckling plus three windows of daylight, so they read as separate
const DUCKLING_TOP = KING_TOP + 4; // their feet on the king's ground line
const waddleReach = (escorted) => COLS + 1 + (escorted ? DUCKLING_GAP * DUCKLINGS : 0);
const RIPPLE = [30, 80, 140];
const DIGIT_COLOR = [150, 150, 150];
const DIGIT_TOP = 4; // rows 4-8, centred above the challengers

const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, x)));
const progressBetween = (t, start, end) => Math.max(0, Math.min(1, (t - start) / (end - start)));

export function validateSceneConfig(input = {}, base = DEFAULT_SCENE_CONFIG) {
  const out = { ...base };
  for (const [key, [min, max]] of Object.entries(SCENE_CONFIG_LIMITS)) {
    if (input[key] === undefined) continue;
    const value = Number(input[key]);
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new RangeError(`${key} must be between ${min} and ${max} ${SCENE_CONFIG_UNITS[key] ?? ""}`.trim());
    }
    out[key] = value;
  }
  return out;
}

const kingMascot = (champion) => MASCOTS[MASCOT_FOR_SCHOOL[champion] ?? "duck"];

/** Intro beat times in ms, scaled to the configured intro length. */
function beatsFor(introSeconds) {
  const k = (introSeconds * 1000) / INTRO_BEATS.end;
  const beats = Object.fromEntries(Object.entries(INTRO_BEATS).map(([name, ms]) => [name, ms * k]));
  const intro = Object.fromEntries(Object.entries(INTRODUCTION).map(([name, ms]) => [name, ms * k]));
  return { ...beats, intro };
}

/** Which school is being introduced `t` ms into the intro (null outside the introductions). */
export function introducingAt(t, { introSeconds = DEFAULT_SCENE_CONFIG.introSeconds } = {}) {
  const b = beatsFor(introSeconds);
  const i = Math.floor((t - b.introductions) / b.intro.length);
  return i >= 0 && i < SCHOOLS.length ? SCHOOLS[i] : null;
}

function drawRiver(grid, t, { ripple = true } = {}) {
  drawRiverRow(grid);
  if (ripple) grid[RIVER_ROW][Math.floor(t / 700) % COLS] = RIPPLE;
}

function drawCrown(grid, top, alpha = 1) {
  blit(grid, CROWN.sprite, top, (COLS - 5) / 2, CROWN.colors, alpha);
}

function drawBanner(grid, color = BANNER) {
  for (let c = 0; c < COLS; c++) grid[0][c] = color;
}

/** A challenger's mini on the riverbank; `rise` 0..1 (0 = still under the water). */
function drawChallenger(grid, i, rise = 1) {
  const k = ease(rise);
  if (k <= 0) return;
  drawLaneMascot(grid, SCHOOLS[i], LANE_COLS[i], Math.round(RIVER_ROW + 1 - k * (RIVER_ROW + 1 - START_TOP)));
}

export function reignFrame(t, { champion = null } = {}) {
  const grid = blank(ROWS, COLS, OFF);
  const king = kingMascot(champion);
  const bob = t % 2000 < 1000 ? 0 : 1; // slow breathing
  const pose = t % 4000 > 3850 ? "blink" : "idle";
  blit(grid, king.poses[pose], KING_TOP - bob, 0, king.colors);
  drawCrown(grid, CROWN_REST_TOP - bob);
  drawRiver(grid, t);
  return grid;
}

/** The king's escort: little ducks crossing after it, each bobbing out of step with the last. */
function drawDucklings(grid, left) {
  const duck = MASCOTS.duck;
  for (let i = 0; i < DUCKLINGS; i++) {
    const bob = (left + i) % 2; // a one-window bob, so they waddle rather than slide
    blit(grid, duck.sprite5, DUCKLING_TOP - bob, left - DUCKLING_GAP * (i + 1), duck.colors);
  }
}

/** The king bows, gives up the crown (it becomes the finish line) and waddles off the tower. */
function drawAbdication(grid, t, b, king) {
  if (t < b.waddleEnd) {
    const escorted = king === MASCOTS.duck;
    const bow = Math.round(ease(progressBetween(t, b.holdEnd, b.bowEnd)));
    // Whole-window steps at a steady pace; faster steps or hops read as flicker at this scale.
    const walking = t >= b.meltEnd;
    const left = walking ? Math.floor(progressBetween(t, b.meltEnd, b.waddleEnd) * waddleReach(escorted)) : 0;
    const pose = t < b.holdEnd || walking ? "idle" : "sleep"; // eyes closed while bowing
    blit(grid, king.poses[pose], KING_TOP + (walking ? 0 : bow), left, king.colors);
    if (walking && escorted) drawDucklings(grid, left);
  }

  const crownTop = Math.round(CROWN_REST_TOP * (1 - ease(progressBetween(t, b.bowEnd, b.riseEnd))));
  const melt = ease(progressBetween(t, b.shineEnd, b.meltEnd));
  if (melt < 1) drawCrown(grid, crownTop, 1 - melt);
  if (melt > 0) {
    const reach = 2 + 2.5 * melt; // from the crown's width to the whole row
    for (let c = 0; c < COLS; c++) {
      if (Math.abs(c - (COLS - 1) / 2) <= reach) grid[0][c] = mix(GOLD, BANNER, melt);
    }
  }
}

/** Each challenger rises big over its school colour, cheers, blinks, then takes its lane. */
function drawIntroductions(grid, t, b) {
  const { intro } = b;
  SCHOOLS.forEach((school, i) => {
    const local = t - b.introductions - i * intro.length;
    if (local < 0 || local >= intro.length) return; // not yet, or already on the riverbank

    const mascot = MASCOTS[MASCOT_FOR_SCHOOL[school]];
    const up = ease(progressBetween(local, 0, intro.riseEnd));
    const down = ease(progressBetween(local, intro.holdEnd, intro.sinkEnd));
    const top = Math.round(RIVER_ROW + 1 - up * (RIVER_ROW + 1 - KING_TOP) + down * (RIVER_ROW + 1 - KING_TOP));
    const pedestal = mix(OFF, softenColor(SCHOOL_INFO[school].color), 0.45 * up * (1 - down));
    for (let c = 0; c < COLS; c++) grid[PEDESTAL_ROW][c] = pedestal;

    const cheering = local >= intro.cheerStart && local < intro.cheerEnd;
    const blinking = local >= intro.blinkStart && local < intro.blinkEnd;
    const pose = cheering ? "eat" : blinking ? "blink" : "idle";
    if (top <= RIVER_ROW) blit(grid, mascot.poses[pose], top, 0, mascot.colors);
    drawChallenger(grid, i, progressBetween(local, intro.miniStart, intro.length));
  });
}

export function introFrame(t, { champion = null, introSeconds = DEFAULT_SCENE_CONFIG.introSeconds } = {}) {
  const b = beatsFor(introSeconds);
  const grid = blank(ROWS, COLS, OFF);
  drawAbdication(grid, t, b, kingMascot(champion));
  drawIntroductions(grid, t, b);
  drawRiver(grid, t, { ripple: t < b.introductions });
  // minis already on the riverbank stay in front of the river row
  SCHOOLS.forEach((_, i) => {
    if (t - b.introductions - i * b.intro.length >= b.intro.length) drawChallenger(grid, i);
  });
  return grid;
}

export function countdownFrame(t, { countdownSeconds = DEFAULT_SCENE_CONFIG.countdownSeconds } = {}) {
  const grid = blank(ROWS, COLS, OFF);
  drawBanner(grid);
  drawRiver(grid, t, { ripple: false });
  SCHOOLS.forEach((_, i) => drawChallenger(grid, i));

  const remaining = countdownSeconds * 1000 - t;
  const digit = Math.ceil(remaining / 1000);
  if (DIGITS[digit]) {
    const u = 1000 - (remaining - (digit - 1) * 1000); // 0..1000 within this digit's second
    const alpha = Math.max(0, Math.min(1, u / 250, (1000 - u) / 250));
    blit(grid, DIGITS[digit], DIGIT_TOP, (COLS - 3) / 2, { "#": DIGIT_COLOR }, alpha);
  }
  return grid;
}

/** The first frame of the race, for the hand-off check. */
export function raceStartFrame() {
  return buildFrame({ progressCols: Object.fromEntries(SCHOOLS.map((s) => [s, 0])), status: "running", winner: null });
}

/** Whatever the building should show for `state` at `now` (ms since epoch). */
export function frameFor(state, now) {
  const t = Math.max(0, now - (state.phaseStartedAt ?? now));
  const config = state.config ?? DEFAULT_SCENE_CONFIG;
  switch (state.status) {
    case "idle":
      return reignFrame(now, state); // absolute time so the bob doesn't restart on every reload
    case "intro":
      return introFrame(t, { ...config, champion: state.champion });
    case "countdown":
      return countdownFrame(t, config);
    case "finished":
      return winCelebrationFrame(t, { winner: state.winner, progressCols: state.progressCols });
    default: // "running"
      return buildFrame(state, t);
  }
}
