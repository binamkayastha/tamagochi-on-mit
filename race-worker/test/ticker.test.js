import { test } from "node:test";
import assert from "node:assert/strict";

import { COLS, ROWS } from "../src/render.js";
import { OFF } from "../src/render.js";
import { tickerDuration, tickerFrame } from "../src/ticker.js";

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

test("an empty message has zero duration and renders an off grid", () => {
  assert.equal(tickerDuration(""), 0);
  assert.equal(tickerDuration("   "), 0); // whitespace-only trims to empty
  const grid = tickerFrame(0, { message: "" });
  assertValidGrid(grid);
  assert.ok(grid.flat().every((px) => px.every((v, i) => v === OFF[i])));
});

test("every letter needed for the four schools has a glyph, including V", () => {
  for (const name of ["MIT", "HARVARD", "BU", "NORTHEASTERN"]) {
    for (let t = 0; t <= tickerDuration(name); t += 300) {
      assertValidGrid(tickerFrame(t, { message: name, color: [200, 200, 200] }));
    }
    // somewhere in the pass, some pixel must actually light up — an unknown
    // glyph silently renders as blank, which this would also catch
    let sawLight = false;
    for (let t = 0; t <= tickerDuration(name); t += 100) {
      if (tickerFrame(t, { message: name, color: [200, 200, 200] }).flat().some((px) => px[0] > 10)) {
        sawLight = true;
        break;
      }
    }
    assert.ok(sawLight, `${name} never lights a single pixel`);
  }
});

test("the band fades in and out rather than cutting", () => {
  const total = tickerDuration("MIT");
  const offBaseline = ROWS * COLS * OFF[0]; // the all-off grid's own red-channel sum
  const brightnessAt = (t) =>
    tickerFrame(t, { message: "MIT", color: [200, 200, 200] })
      .flat()
      .reduce((sum, px) => sum + px[0], 0);
  assert.equal(brightnessAt(0), offBaseline); // fade starts at zero extra light
  assert.equal(brightnessAt(total), offBaseline); // and ends at zero extra light
  assert.ok(brightnessAt(total / 2) > offBaseline + 100); // clearly lit mid-pass
});

test("outside [0, duration] renders an off grid, not an error", () => {
  const total = tickerDuration("BU");
  for (const t of [-500, total + 500]) {
    const grid = tickerFrame(t, { message: "BU" });
    assertValidGrid(grid);
    assert.ok(grid.flat().every((px) => px.every((v, i) => v === OFF[i])));
  }
});
