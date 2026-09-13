// A short message scrolling across the top of the tower, ported from
// `tamagochi-characters-python/living_field/text.py`'s `Ticker` class (right-to-left
// crawl, a fade-in/hold/fade-out band, letters soften at both edges as they enter and
// leave) onto this repo's (t, opts) -> 17x9 grid convention. Built to test "show each
// school's name scrolling past the top of the building during its introduction" —
// these are wired up as debug-preview scenes below, not yet part of the real intro.
import { COLS, OFF, ROWS } from "./render.js";
import { blank, mix } from "./sprites.js";

const CHAR_W = 4;
const CHAR_H = 7;
const SECONDS_PER_CHAR = 1.25;
const BAND_TOP = 3; // near the roof, clear of anything else on the facade
const FADE_S = 1.1;

// The 4x7 condensed face from text.py, verbatim — every letter needed for MIT, BU,
// HARVARD and NORTHEASTERN, plus "V" (missing from the source font; hand-drawn to
// match its style: two strokes converging only in the bottom two rows, the same way
// "Y" converges above its stem).
const FONT = {
  A: ["0110", "1001", "1001", "1111", "1001", "1001", "1001"],
  B: ["1110", "1001", "1110", "1001", "1001", "1001", "1110"],
  C: ["0111", "1000", "1000", "1000", "1000", "1000", "0111"],
  D: ["1110", "1001", "1001", "1001", "1001", "1001", "1110"],
  E: ["1111", "1000", "1110", "1000", "1000", "1000", "1111"],
  F: ["1111", "1000", "1110", "1000", "1000", "1000", "1000"],
  G: ["0111", "1000", "1000", "1011", "1001", "1001", "0111"],
  H: ["1001", "1001", "1111", "1001", "1001", "1001", "1001"],
  I: ["1111", "0110", "0110", "0110", "0110", "0110", "1111"],
  L: ["1000", "1000", "1000", "1000", "1000", "1000", "1111"],
  M: ["1001", "1111", "1111", "1001", "1001", "1001", "1001"],
  N: ["1001", "1101", "1011", "1001", "1001", "1001", "1001"],
  O: ["0110", "1001", "1001", "1001", "1001", "1001", "0110"],
  P: ["1110", "1001", "1001", "1110", "1000", "1000", "1000"],
  R: ["1110", "1001", "1001", "1110", "1010", "1001", "1001"],
  S: ["0111", "1000", "0110", "0001", "0001", "1001", "0110"],
  T: ["1111", "0110", "0110", "0110", "0110", "0110", "0110"],
  U: ["1001", "1001", "1001", "1001", "1001", "1001", "0110"],
  V: ["1001", "1001", "1001", "1001", "1001", "0110", "0110"],
  W: ["1001", "1001", "1001", "1001", "1011", "1101", "1001"],
  Y: ["1001", "1001", "0110", "0110", "0110", "0110", "0110"],
  " ": ["0000", "0000", "0000", "0000", "0000", "0000", "0000"],
};
const glyph = (ch) => FONT[ch.toUpperCase()] ?? FONT[" "];

/** One full pass, fade in + travel + fade out, in ms. 0 for an empty message. */
export function tickerDuration(message) {
  const chars = [...(message ?? "").trim()];
  if (!chars.length) return 0;
  const travelS = (chars.length + COLS / (CHAR_W + 1)) * SECONDS_PER_CHAR;
  return (travelS + 2 * FADE_S) * 1000;
}

/** `message` scrolling right-to-left across a band near the roof. `t` in ms, 0-based
 * at the start of the fade-in. Returns a dark/empty 17x9 grid outside [0, duration]. */
export function tickerFrame(t, { message, color = [230, 230, 230] } = {}) {
  const grid = blank(ROWS, COLS, OFF);
  const chars = [...(message ?? "").trim()];
  if (!chars.length) return grid;

  const total = tickerDuration(message);
  if (t < 0 || t > total) return grid;

  const fadeMs = FADE_S * 1000;
  let alpha = t < fadeMs ? t / fadeMs : t > total - fadeMs ? Math.max(0, (total - t) / fadeMs) : 1;
  alpha = alpha * alpha * (3 - 2 * alpha); // smoothstep — no hard edges to the band
  if (alpha <= 0.01) return grid;

  const step = CHAR_W + 1; // one blank column between letters
  const travelled = ((t - fadeMs) / 1000 / SECONDS_PER_CHAR) * step;
  const intensity = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

  chars.forEach((ch, i) => {
    const left = COLS + i * step - travelled; // each letter enters from the right
    if (left > COLS || left + CHAR_W < 0) return;
    const g = glyph(ch);
    for (let r = 0; r < CHAR_H; r++) {
      const y = BAND_TOP + r;
      if (y < 0 || y >= ROWS) continue;
      const row = g[r];
      for (let c = 0; c < CHAR_W; c++) {
        if (row[c] !== "1") continue;
        const xi = Math.round(left + c);
        if (xi < 0 || xi >= COLS) continue;
        // soften the two outer columns so a letter arrives/leaves rather than popping in whole
        const edge = Math.min(1, Math.min(xi + 1, COLS - xi) / 2);
        intensity[y][xi] = Math.max(intensity[y][xi], edge);
      }
    }
  });

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const k = intensity[r][c] * alpha;
      if (k > 0) grid[r][c] = mix(OFF, color, k);
    }
  }
  return grid;
}
