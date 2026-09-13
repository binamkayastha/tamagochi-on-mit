import { test } from "node:test";
import assert from "node:assert/strict";

import { COLS, LANE_COLS, OFF, RACE_BOTTOM, RACE_TOP, ROWS, buildFrame } from "../src/render.js";
import { DEFAULT_MAX_BRIGHTNESS, FlashGuard, GUARD_FLASHES_PER_SECOND, MAX_FLASHES_PER_SECOND, capBrightness, worstFlashRate } from "../src/safety.js";
import {
  ANIMATED_STATUSES,
  DEFAULT_SCENE_CONFIG,
  INTRO_BEATS,
  countdownFrame,
  frameFor,
  introFrame,
  introducingAt,
  raceStartFrame,
  reignFrame,
  validateSceneConfig,
} from "../src/scenes.js";
import { showSequence } from "../scripts/sequence.js";
import { WIN_CELEBRATION_MS, winCelebrationFrame } from "../src/win-celebration.js";
import { SCHOOLS } from "../src/mascots.js";

const FPS = 15;
const INTRO_MS = DEFAULT_SCENE_CONFIG.introSeconds * 1000;

// The king is 9 rows tall and its ducklings walk under it, so the two overlap; these are the
// king's own rows, and the band where only an escort can still be once the king has left.
const KING_ROWS = [5, 8]; // KING_TOP .. DUCKLING_TOP - 1
const TRAIL_ROWS = [8, 14]; // DUCKLING_TOP - 1 .. DUCKLING_TOP + 5, bob included

const litColumns = (t, [from, to], champion = null) => {
  const grid = introFrame(t, { champion });
  const cols = new Set();
  for (let r = from; r < to; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] !== OFF) cols.add(c);
  return cols;
};

function assertValidGrid(grid) {
  assert.equal(grid.length, ROWS);
  for (const row of grid) {
    assert.equal(row.length, COLS);
    for (const px of row) {
      assert.equal(px.length, 3);
      for (const v of px) assert.ok(Number.isInteger(v) && v >= 0 && v <= 255, `bad channel ${v}`);
    }
  }
}

test("every scene frame is 17x9 RGB", () => {
  for (const champion of [null, "mit", "harvard", "bu", "neu"]) {
    for (let t = 0; t <= 12_000; t += 250) {
      assertValidGrid(reignFrame(t, { champion }));
      assertValidGrid(introFrame(t, { champion }));
      assertValidGrid(countdownFrame(t % 3000));
    }
  }
});

test("scene hand-offs don't jump", () => {
  const same = (a, b) => assert.deepEqual(a, b);
  same(introFrame(INTRO_MS), countdownFrame(0)); // intro end = countdown before its first digit fades in
});

test("the race takes over the stage the countdown leaves", () => {
  // The race fills the lanes rather than climbing them, so the challengers standing on the
  // riverbank are replaced by empty lanes the moment it starts: the countdown's last frame is
  // no longer pixel-identical to the race's first. What must not change is the stage around it.
  const last = countdownFrame(3000);
  const first = raceStartFrame();
  assert.deepEqual(last[0], first[0]); // the gold finish line
  assert.deepEqual(last[ROWS - 1], first[ROWS - 1]); // the Charles
  for (let r = 1; r < ROWS - 1; r++) assert.deepEqual(first[r][4], OFF); // the gap between lanes
});

test("intro beats scale with the configured length", () => {
  // 40% into a 10 s and a 20 s intro show the same beat (the crown at the top). The river ripple
  // runs in real time on purpose, so the river row is left out.
  const beats = (grid) => grid.slice(0, ROWS - 1);
  assert.deepEqual(beats(introFrame(4000, { introSeconds: 10 })), beats(introFrame(8000, { introSeconds: 20 })));
});

test("countdown shows 3, 2, 1 and nothing for longer countdowns' early seconds", () => {
  const lit = (grid) => grid.slice(4, 9).flatMap((row) => row.slice(3, 6)).filter((px) => px[0] > 60).length;
  assert.ok(lit(countdownFrame(500, { countdownSeconds: 3 })) > 0);
  assert.equal(lit(countdownFrame(500, { countdownSeconds: 6 })), 0); // "6" isn't drawn
  assert.ok(lit(countdownFrame(3500, { countdownSeconds: 6 })) > 0);
});

test("frameFor follows the status", () => {
  const base = { champion: null, config: { introSeconds: 10, countdownSeconds: 3 }, phaseStartedAt: 0, winner: null };
  assert.deepEqual(frameFor({ ...base, status: "intro" }, 10_000), countdownFrame(3000));
  const progressCols = { mit: 0, harvard: 0, bu: 0, neu: 0 };
  assert.deepEqual(frameFor({ ...base, status: "running", progressCols }, 0), raceStartFrame());
});

test("lanes fill from the river up to the finish line", () => {
  const frame = buildFrame({ progressCols: { mit: 8, harvard: 4, bu: 0, neu: 2 }, status: "running", winner: null });
  const lit = (col) => frame.map((row, r) => (row[col] === OFF ? null : r)).filter((r) => r !== null);
  const bright = (col, row) => Math.max(...frame[row][col]);

  // MIT is full: every floor between the finish line and the river is lit
  assert.deepEqual(lit(LANE_COLS[0]).slice(0, 3), [0, 1, 2]);
  // BU has nothing yet, so its lane sits at the unlit tint rather than going dark
  assert.notDeepEqual(frame[RACE_BOTTOM][LANE_COLS[2]], OFF);
  assert.ok(bright(LANE_COLS[2], RACE_BOTTOM) < bright(LANE_COLS[0], RACE_BOTTOM));
  // Harvard is half way: lit at the bottom, unlit at the top
  assert.ok(bright(LANE_COLS[1], RACE_BOTTOM) > bright(LANE_COLS[1], RACE_TOP));
  assert.equal(frame[8][4], OFF); // the gap column between Harvard and BU stays dark
});

test("every challenger is introduced, in lane order, before the countdown", () => {
  const seen = [];
  for (let t = 0; t <= INTRO_MS; t += 100) {
    const school = introducingAt(t);
    if (school && seen.at(-1) !== school) seen.push(school);
  }
  assert.deepEqual(seen, ["mit", "harvard", "bu", "neu"]);
  assert.equal(introducingAt(5000), null); // still the king's abdication
  assert.equal(introducingAt(INTRO_MS - 200), null); // everyone is on the riverbank
  // mid-introduction the mascot is shown big over a strip of its school colour
  const midMit = introFrame(INTRO_BEATS.introductions + 1500);
  assert.notDeepEqual(midMit[14][4], OFF);
  assert.ok(midMit.slice(5, 14).flat().filter((px) => px !== OFF).length > 30);
});

test("the Duck King's ducklings follow it off the tower", () => {
  assert.equal(litColumns(6600, TRAIL_ROWS).size > 0, true); // under the king, before it moves
  assert.equal(litColumns(9500, KING_ROWS).size, 0); // the king has already walked off, so
  assert.ok(litColumns(9600, TRAIL_ROWS).size >= 4); // what is still crossing is its escort
  // and they clear the building before the first challenger is introduced
  assert.equal(litColumns(INTRO_BEATS.introductions, TRAIL_ROWS).size, 0);
});

test("only the Duck King is escorted", () => {
  // Late in the waddle: a lone king (10 windows to cover) has left, while the Duck King's last
  // duckling (34 windows for the procession) is still crossing. Derived from the beats so it
  // keeps holding if the walk is retimed or the ducklings are spaced differently.
  const late = INTRO_BEATS.meltEnd + 0.93 * (INTRO_BEATS.waddleEnd - INTRO_BEATS.meltEnd);
  for (const champion of SCHOOLS) {
    assert.equal(litColumns(late, TRAIL_ROWS, champion).size, 0, `${champion} should have no ducklings`);
  }
  assert.ok(litColumns(late, TRAIL_ROWS).size > 0); // the Duck King still has its escort
});

test("config validation", () => {
  assert.deepEqual(validateSceneConfig({ introSeconds: "30" }), { ...DEFAULT_SCENE_CONFIG, introSeconds: 30 });
  assert.throws(() => validateSceneConfig({ introSeconds: 13 }), RangeError); // too short to read
  assert.throws(() => validateSceneConfig({ countdownSeconds: 11 }), RangeError);
  assert.throws(() => validateSceneConfig({ countdownSeconds: "soon" }), RangeError);
  assert.deepEqual(validateSceneConfig({ brightness: "0.6" }), { ...DEFAULT_SCENE_CONFIG, brightness: 0.6 });
  assert.throws(() => validateSceneConfig({ brightness: 0.1 }), RangeError); // below the floor
  assert.throws(() => validateSceneConfig({ brightness: 1.5 }), RangeError);
});

test("the guard stops a 10 Hz strobe", () => {
  const strobe = Array.from({ length: 60 }, (_, i) =>
    Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => (Math.floor(i / 1.5) % 2 ? [255, 255, 255] : [0, 0, 0]))),
  );
  assert.ok(worstFlashRate(strobe, 30).rate > MAX_FLASHES_PER_SECOND);
  const guard = new FlashGuard();
  const safe = strobe.map((grid, i) => guard.filter(grid, (i * 1000) / 30));
  assert.ok(worstFlashRate(safe, 30).rate <= GUARD_FLASHES_PER_SECOND);
});

test("frameFor plays the win celebration for as long as \"finished\" persists, never settling", () => {
  const progressCols = Object.fromEntries(SCHOOLS.map((s) => [s, 8]));
  const base = { champion: null, config: DEFAULT_SCENE_CONFIG, phaseStartedAt: 0, winner: "mit", progressCols };
  // always matches winCelebrationFrame directly — mid-reveal, and long after (the looping phase)
  for (const t of [5000, WIN_CELEBRATION_MS + 1, WIN_CELEBRATION_MS * 5]) {
    assert.deepEqual(frameFor({ ...base, status: "finished" }, t), winCelebrationFrame(t, { winner: "mit", progressCols }));
  }
});

test("\"finished\" is an animated status, same as idle/intro/countdown", () => {
  assert.ok(ANIMATED_STATUSES.includes("finished"));
});

test("the whole show, including a full climb, is flash-safe", () => {
  for (const champion of [null, "mit", "harvard", "bu", "neu"]) {
    const raw = showSequence({ champion, fps: FPS, raceSeconds: 20 });
    const rawRate = worstFlashRate(raw, FPS);
    assert.ok(rawRate.rate <= MAX_FLASHES_PER_SECOND, `raw scenes flash ${rawRate.rate}/s at ${rawRate.where}`);

    const guard = new FlashGuard();
    const shown = raw.map((grid, i) => guard.filter(grid, (i * 1000) / FPS));
    const rate = worstFlashRate(shown, FPS);
    assert.ok(rate.rate <= GUARD_FLASHES_PER_SECOND, `guarded scenes flash ${rate.rate}/s at ${rate.where}`);
  }
});

test("capBrightness never lets a channel through above the cap, and 1.0 is a no-op", () => {
  const bright = [[[255, 255, 255], [255, 0, 0]], [[0, 255, 0], [128, 128, 128]]];
  const capped = capBrightness(bright, 0.5);
  for (const row of capped) for (const px of row) for (const v of px) assert.ok(v <= 128, `channel ${v} exceeds 50% cap`);
  assert.deepEqual(capBrightness(bright, 1), bright);
});

test("the default max brightness is a real cap, not a pass-through", () => {
  assert.ok(DEFAULT_MAX_BRIGHTNESS < 1);
  assert.equal(DEFAULT_SCENE_CONFIG.brightness, DEFAULT_MAX_BRIGHTNESS);
});
