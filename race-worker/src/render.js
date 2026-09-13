// State -> Green Building sim frame. Kept deliberately simple (solid lane bars, no sprite
// art or motion) so it's easy for whoever builds the fancier transitions to swap this out
// without touching the race logic in race-state.js.
import { SCHOOLS, SCHOOL_INFO } from "./mascots.js";

export const COLS = 9;
export const ROWS = 17;
export const FINISH_COLUMNS = COLS - 1; // progress 0..8, 8 = finished

// row layout: finish banner, then 4 three-row lanes separated by one dark row each
const LANE_HEIGHT = 3;
const LANE_STARTS = SCHOOLS.map((_, i) => 1 + i * (LANE_HEIGHT + 1)); // [1, 5, 9, 13]

const OFF = [12, 16, 26]; // faint building-blue, never true black so lanes read as "on the grid"

// Real windows blow out on near-white/near-yellow; scale those down. Mirrors the same
// heuristic used in tamagochi-characters-python/character_picker.py.
function softenColor([r, g, b]) {
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

/** progressCols: { schoolId: number 0..FINISH_COLUMNS (may be fractional) } */
export function buildFrame({ progressCols, status, winner }) {
  const grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => OFF));

  SCHOOLS.forEach((school, i) => {
    const color = softenColor(SCHOOL_INFO[school].color);
    const top = LANE_STARTS[i];
    const progress = Math.max(0, Math.min(FINISH_COLUMNS, progressCols[school] ?? 0));
    const filled = Math.floor(progress);
    const frac = progress - filled;

    for (let r = top; r < top + LANE_HEIGHT; r++) {
      for (let c = 0; c < COLS; c++) {
        if (c < filled) grid[r][c] = color;
        else if (c === filled && frac > 0.15) grid[r][c] = scale(color, 0.35 + frac * 0.65);
      }
    }
  });

  // finish banner: dim always-on marker, brighter + winner-colored once someone's won
  const finishColor =
    status === "finished" && winner ? softenColor(SCHOOL_INFO[winner].color) : [70, 60, 30];
  for (let c = 0; c < COLS; c++) grid[0][c] = finishColor;

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
