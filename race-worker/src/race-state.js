import { DurableObject } from "cloudflare:workers";
import { SCHOOLS, isSchool } from "./mascots.js";
import { buildFrame, packFrame, FINISH_COLUMNS } from "./render.js";

const CHEERS_PER_COLUMN = 12; // crowd-tunable: lower = faster race
const ALARM_INTERVAL_MS = 400; // how often a running race repaints the building
const CHEER_COOLDOWN_MS = 150; // per (ip, school) — blocks scripts, not enthusiastic tapping
const SIM_BASE = "https://sundai.willsarg.com";

const DEFAULT_STATE = () => ({
  status: "idle", // idle | running | finished
  cheers: Object.fromEntries(SCHOOLS.map((s) => [s, 0])),
  startedAt: null,
  finishedAt: null,
  winner: null,
  instance: null, // sim instance name; set via env default or admin rotateInstance()
});

export class RaceState extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    this.lastCheerAt = new Map();
    this.state_ = null;
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get("state");
      this.state_ = stored ?? DEFAULT_STATE();
      if (!this.state_.instance && env.SIM_INSTANCE) this.state_.instance = env.SIM_INSTANCE;
    });
  }

  async persist() {
    await this.ctx.storage.put("state", this.state_);
  }

  progressCols() {
    const out = {};
    for (const school of SCHOOLS) {
      out[school] = Math.min(FINISH_COLUMNS, this.state_.cheers[school] / CHEERS_PER_COLUMN);
    }
    return out;
  }

  publicState() {
    return {
      status: this.state_.status,
      cheers: this.state_.cheers,
      progressCols: this.progressCols(),
      startedAt: this.state_.startedAt,
      finishedAt: this.state_.finishedAt,
      winner: this.state_.winner,
      hasInstance: Boolean(this.state_.instance),
    };
  }

  // -- public RPCs (called from the Worker's fetch router) -------------------

  async getState() {
    return this.publicState();
  }

  async cheer(school, ip) {
    if (!isSchool(school)) throw new Error("unknown school");
    if (this.state_.status !== "running") return { ok: false, reason: "not running", state: this.publicState() };

    const key = `${ip}|${school}`;
    const now = Date.now();
    const last = this.lastCheerAt.get(key) ?? 0;
    if (now - last < CHEER_COOLDOWN_MS) {
      return { ok: false, reason: "cooldown", state: this.publicState() };
    }
    this.lastCheerAt.set(key, now);

    this.state_.cheers[school] += 1;
    await this.checkWin();
    await this.persist();
    return { ok: true, state: this.publicState() };
  }

  async checkWin() {
    if (this.state_.status !== "running") return;
    const progress = this.progressCols();
    const winner = SCHOOLS.find((s) => progress[s] >= FINISH_COLUMNS);
    if (winner) {
      this.state_.status = "finished";
      this.state_.winner = winner;
      this.state_.finishedAt = Date.now();
      await this.ctx.storage.deleteAlarm();
      await this.pushFrame();
    }
  }

  async start() {
    this.state_ = { ...DEFAULT_STATE(), instance: this.state_.instance, status: "running", startedAt: Date.now() };
    await this.persist();
    await this.ctx.storage.setAlarm(Date.now()); // paint immediately, alarm() reschedules
    return this.publicState();
  }

  async stop() {
    if (this.state_.status === "running") this.state_.status = "idle";
    await this.ctx.storage.deleteAlarm();
    await this.persist();
    await this.pushFrame();
    return this.publicState();
  }

  async reset() {
    this.state_ = { ...DEFAULT_STATE(), instance: this.state_.instance };
    await this.ctx.storage.deleteAlarm();
    await this.persist();
    await this.pushFrame();
    return this.publicState();
  }

  /** Mint a fresh sim instance with the event password and adopt it. Admin-only, used if
   * the current instance ever gets reset/expired. The password never leaves the Worker. */
  async rotateInstance() {
    if (!this.env.SIM_PASSWORD) throw new Error("SIM_PASSWORD not configured");
    const resp = await fetch(`${SIM_BASE}/api/instances`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "race-worker/1" },
      body: JSON.stringify({ password: this.env.SIM_PASSWORD }),
    });
    if (!resp.ok) throw new Error(`instance mint failed: HTTP ${resp.status}`);
    const data = await resp.json();
    this.state_.instance = data.name;
    await this.persist();
    return { name: data.name, view_url: data.view_url };
  }

  async pushFrame() {
    if (!this.state_.instance) return;
    const grid = buildFrame({
      progressCols: this.progressCols(),
      status: this.state_.status,
      winner: this.state_.winner,
    });
    const body = packFrame(grid);
    try {
      await fetch(`${SIM_BASE}/api/i/${this.state_.instance}/frame`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "User-Agent": "race-worker/1" },
        body,
      });
    } catch {
      // best-effort — a dropped frame just means the display is a beat behind, never fatal
    }
  }

  async alarm() {
    if (this.state_.status !== "running") return;
    await this.pushFrame();
    await this.checkWin();
    if (this.state_.status === "running") {
      await this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
    }
  }
}
