import { test } from "node:test";
import assert from "node:assert/strict";

import { COLS, ROWS } from "../src/render.js";
import { FlashGuard, GUARD_FLASHES_PER_SECOND, worstFlashRate } from "../src/safety.js";
import {
  FINALE_SECONDS,
  LIVING_FIELD_SCENES,
  attentionFrame,
  auroraFrame,
  dreamFrame,
  finaleFrame,
  forecastFrame,
  memoryFrame,
  radarFrame,
  seismicFrame,
  soundingFrame,
  startleFrame,
} from "../src/living-field-scenes.js";
import { MASCOTS } from "../src/sprites.js";
import { centeredMascotFrame } from "../src/mascot-preview.js";

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

test("every living-field frame generator returns a well-formed 17x9 RGB grid", () => {
  for (let t = 0; t <= 20_000; t += 400) {
    assertValidGrid(auroraFrame(t));
    assertValidGrid(seismicFrame(t));
    assertValidGrid(radarFrame(t));
    assertValidGrid(soundingFrame(t));
    assertValidGrid(attentionFrame(t));
    assertValidGrid(startleFrame(t));
    assertValidGrid(memoryFrame(t));
    assertValidGrid(forecastFrame(t));
  }
  for (let t = 0; t <= 22_000; t += 400) {
    assertValidGrid(dreamFrame(t)); // dream's replay cycle is 22s, sample across a full cycle
  }
  for (const color of [
    [210, 160, 20], // duck king gold
    [163, 31, 52], // mit
    [120, 0, 200], // harvard
    [204, 0, 0], // bu
    [255, 255, 255], // neu
  ]) {
    for (let t = 0; t <= FINALE_SECONDS * 1000; t += 200) {
      assertValidGrid(finaleFrame(t, { color, lane: 0.2 }));
    }
  }
});

test("finale runs exactly the ~11s the living_field README promises", () => {
  assert.ok(Math.abs(FINALE_SECONDS - 11) < 1e-9);
});

test("the living-field scene registry matches its frame generators", () => {
  assert.deepEqual(Object.keys(LIVING_FIELD_SCENES).sort(), [
    "attention",
    "aurora",
    "dream",
    "finale",
    "forecast",
    "memory",
    "radar",
    "scroll-bu",
    "scroll-harvard",
    "scroll-mit",
    "scroll-neu",
    "seismic",
    "sounding",
    "startle",
  ]);
  for (const [id, scene] of Object.entries(LIVING_FIELD_SCENES)) {
    assert.equal(typeof scene.label, "string");
    assert.ok(scene.seconds > 0, `${id} needs a positive preview duration`);
    assertValidGrid(scene.frame(0));
    assertValidGrid(scene.frame(scene.seconds * 500)); // mid-way sample
  }
});

test("living-field scenes stay inside the same flash budget as the rest of the show", () => {
  const FPS = 15;
  for (const [id, scene] of Object.entries(LIVING_FIELD_SCENES)) {
    const guard = new FlashGuard();
    const frames = [];
    const total = Math.round(scene.seconds * FPS);
    for (let i = 0; i < total; i++) {
      const now = (i * 1000) / FPS;
      frames.push(guard.filter(scene.frame((i * 1000) / FPS), now));
    }
    const rate = worstFlashRate(frames, FPS);
    assert.ok(rate.rate <= GUARD_FLASHES_PER_SECOND, `${id} flashes ${rate.rate}/s at ${rate.where} even after the guard`);
  }
});

test("centeredMascotFrame draws every mascot as a well-formed, non-empty 17x9 grid", () => {
  for (const id of Object.keys(MASCOTS)) {
    const grid = centeredMascotFrame(id);
    assertValidGrid(grid);
    const lit = grid.flat().filter((px) => px[0] > 12 || px[1] > 16 || px[2] > 26); // brighter than OFF
    assert.ok(lit.length > 10, `${id}'s preview frame looks empty`);
  }
  assert.throws(() => centeredMascotFrame("not-a-mascot"), /unknown mascot/);
});

test("centeredMascotFrame(id, 5) draws the small debug art for every mascot", () => {
  for (const id of Object.keys(MASCOTS)) {
    const grid = centeredMascotFrame(id, 5);
    assertValidGrid(grid);
    const lit = grid.flat().filter((px) => px[0] > 12 || px[1] > 16 || px[2] > 26);
    assert.ok(lit.length > 5, `${id}'s 5x5 preview frame looks empty`);
    // smaller sprite, so fewer lit pixels than the 9x9 preview of the same mascot
    assert.ok(lit.length < centeredMascotFrame(id).flat().filter((px) => px[0] > 12 || px[1] > 16 || px[2] > 26).length);
  }
});
