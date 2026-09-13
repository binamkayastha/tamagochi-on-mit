// State -> Green Building sim frame for the race itself (running / finished). The scenes
// before the race live in scenes.js; this file only draws the climb.
//
// Layout: the mascots start on the riverbank at the bottom of the tower and climb their
// lanes toward the gold finish line on the top floor.
//
//   row 0      finish line (gold; the winner's colour once someone wins)
//   rows 1-15  four 2-wide lanes: MIT cols 0-1 | Harvard 2-3 | gap 4 | BU 5-6 | NEU 7-8
//              each mascot is 3 floors tall and leaves a dim trail in its school colour
//   row 16     the Charles
import { SCHOOLS, SCHOOL_INFO } from "./mascots.js";
import { drawLaneMascot } from "./sprites.js";

export const COLS = 9;
export const ROWS = 17;
export const FINISH_COLUMNS = 8; // progress units 0..8 (8 = finished); name kept for the API
export const BANNER = [150, 110, 20]; // the finish line the crown melted into
export const RIVER = [0, 35, 80];
export const RIVER_ROW = ROWS - 1;

export const LANE_COLS = [0, 2, 5, 7]; // left column of each school's lane, in SCHOOLS order
export const MASCOT_HEIGHT = 3;
export const START_TOP = RIVER_ROW - MASCOT_HEIGHT; // mascot on rows 13-15, feet on the riverbank
export const FINISH_TOP = 1; // mascot on rows 1-3, head at the finish line
const TRAIL = 0.3; // trail brightness relative to the school colour

export const OFF = [12, 16, 26]; // faint building-blue, never true black so lanes read as "on the grid"

// Real windows blow out on near-white/near-yellow; scale those down. Mirrors the same
// heuristic used in tamagochi-characters-python/character_picker.py.
export function softenColor([r, g, b]) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const whitish = mx > 230 && mx - mn < 70;
  const yellowish = r > 200 && g > 170 && b < 140 && r - g < 50;
  if (whitish || yellowish) {
    const f = 0.7;
    return [Math.round(r * f), Math.round(g * f), Math.round(b * f)];
  }
  return [r, g, b];
}

function scale([r, g, b], f) {
  return [Math.round(r * f), Math.round(g * f), Math.round(b * f)];
}

/** Top row of a mascot that has climbed `progress` (0..FINISH_COLUMNS). */
export function climbTop(progress) {
  const k = Math.max(0, Math.min(FINISH_COLUMNS, progress)) / FINISH_COLUMNS;
  return Math.round(START_TOP - k * (START_TOP - FINISH_TOP));
}

export function drawRiverRow(grid, color = RIVER) {
  for (let c = 0; c < COLS; c++) grid[RIVER_ROW][c] = color;
}

export const RACE_TOP = 1; // the lanes fill rows 1-15, between the finish line and the river
export const RACE_BOTTOM = RIVER_ROW - 1;
const FLOORS = RACE_BOTTOM - RACE_TOP + 1;
const WHITE = [205, 205, 205]; // full 255 white blooms into a blob on the lit facade

const mixTo = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));

/** The race: each school's two windows fill with its colour, floor by floor, the surface of the
 * fill catching the light. Ported from the Python prototype's Renderer._race (branch `ananya`).
 *
 * `t` (ms) only drives the shimmer on the lit part of each lane; every other pixel is a pure
 * function of the state, so a frame at progress 0 is identical whenever it is drawn.
 *
 * progressCols: { schoolId: number 0..FINISH_COLUMNS (may be fractional) }
 */
export function buildFrame({ progressCols, status, winner }, t = 0) {
  const grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => OFF));

  SCHOOLS.forEach((school, i) => {
    const color = softenColor(SCHOOL_INFO[school].color);
    const left = LANE_COLS[i];
    const height = (Math.max(0, Math.min(FINISH_COLUMNS, progressCols[school] ?? 0)) / FINISH_COLUMNS) * FLOORS;
    for (let floor = 0; floor < FLOORS; floor++) {
      const level = height - floor; // >1 submerged, 0-1 the crest, <=0 still empty
      for (const col of [left, left + 1]) {
        let px;
        if (level <= 0) {
          px = mixTo(OFF, color, 0.18); // unlit lane, still reads as a lane
        } else {
          const shimmer = 0.8 + 0.16 * Math.sin((t / 1000) * 2.4 - floor * 0.55 + col);
          px = scale(color, shimmer * Math.min(1, level));
          if (level <= 1) px = mixTo(px, WHITE, 0.3 * level); // the surface catches the light
        }
        grid[RACE_BOTTOM - floor][col] = px;
      }
    }
  });

  // finish line: gold, or the winner's colour once someone's won
  const finishColor = status === "finished" && winner ? softenColor(SCHOOL_INFO[winner].color) : BANNER;
  for (let c = 0; c < COLS; c++) grid[0][c] = finishColor;
  drawRiverRow(grid);

  return grid;
}

/** Row-major RGB bytes, 459 total (17 * 9 * 3) — the sim's raw frame POST body. */
export function packFrame(grid) {
  const buf = new Uint8Array(ROWS * COLS * 3);
  let i = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const [red, green, blue] = grid[r][c];
      buf[i++] = red;
      buf[i++] = green;
      buf[i++] = blue;
    }
  }
  return buf;
}
