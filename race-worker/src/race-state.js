import { DurableObject } from "cloudflare:workers";
import { LANE_COLS } from "./render.js";
import { SCHOOLS, SCHOOL_INFO, isSchool } from "./mascots.js";
import { centeredMascotFrame } from "./mascot-preview.js";
import { packFrame, FINISH_COLUMNS } from "./render.js";
import { ANIMATED_STATUSES, DEFAULT_SCENE_CONFIG, frameFor, introducingAt, validateSceneConfig } from "./scenes.js";
import { FlashGuard, capBrightness } from "./safety.js";
import { GOLD, MASCOTS } from "./sprites.js";
import { LIVING_FIELD_SCENES } from "./living-field-scenes.js";

const CHEERS_PER_COLUMN = 12; // crowd-tunable: lower = faster race
const ALARM_INTERVAL_MS = 400; // how often a running race repaints the building
const CHEER_COOLDOWN_MS = 150; // per (ip, school) — blocks scripts, not enthusiastic tapping
const SIM_BASE = "https://sundai.willsarg.com";

// Crowd-presence: "someone is here" and "the crowd's energy right now", from data the
// server already has (who's polling, who just cheered) — no new client capability needed.
// Both live only in memory (this.recentViewers / this.recentCheerEvents), never persisted:
// losing them on an eviction just means the numbers reset, which is fine for a cosmetic
// crowd-feel signal, not the source of truth the way cheer counts are.
const VIEWER_WINDOW_MS = 20_000; // counts as "here" if a poll/cheer landed in the last 20s
const HYPE_WINDOW_S = 5; // cheers/second, averaged over the trailing 5s
const RECENT_CHEER_KEEP_MS = 8_000; // how long a cheer stays in the pulse feed
const RECENT_CHEER_MAX = 200; // hard cap regardless of window, in case of a real flood

// Scenes (reign / intro / countdown) need smoother motion than the race's 400 ms repaint.
// One alarm invocation streams a short batch of frames, then re-arms; a batch stays under
// the Workers free-plan limit of 50 subrequests per invocation.
const SCENE_FPS = 15;
const REIGN_FPS = 8;
const BATCH_MS = 2800;

// Admin debug previews (mascot cards, living-field scenes) stream at the same rate as the
// scenes above and go through the same FlashGuard instance and push path as everything
// else. They require the race to be idle (not intro/countdown/running/finished) rather than
// being a best-effort overlay on a live race: at 15fps a preview would otherwise fight the
// alarm loop's own frame pushes for the whole facade for several seconds, which is worse
// than just refusing — a host previewing mascots/scenes is doing it before the event starts,
// not mid-race. While a preview streams, the idle reign's own alarm loop is paused (its
// alarm cleared) and resumed immediately after, so the two don't interleave frames either.
const PREVIEW_FPS = 15;
const MASCOT_PREVIEW_SECONDS = 2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const DEFAULT_STATE = () => ({
  status: "idle", // idle (reign) | intro | countdown | running | finished
  cheers: Object.fromEntries(SCHOOLS.map((s) => [s, 0])),
  startedAt: null,
  finishedAt: null,
  winner: null,
  phaseStartedAt: Date.now(),
  phaseEndsAt: null,
  champion: null, // school wearing the crown; null = the Duck King
  config: { ...DEFAULT_SCENE_CONFIG },
  instance: null, // sim instance name; set via env default or admin rotateInstance()
});

export class RaceState extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    this.lastCheerAt = new Map();
    this.guard = new FlashGuard();
    this.previewGeneration = 0; // >0 while a debug preview streams; alarm() yields to it
    this.recentViewers = new Map(); // ip -> last-seen ms; crowd-presence, see VIEWER_WINDOW_MS
    this.recentCheerEvents = []; // [{school, t}], newest last; crowd-presence, see RECENT_CHEER_*
    this.state_ = null;
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get("state");
      this.state_ = { ...DEFAULT_STATE(), ...stored };
      // config is a nested object, so the spread above carries an OLD persisted config
      // wholesale rather than merging it — a config key added later (like `brightness`)
      // would silently be missing from any state persisted before that field existed.
      this.state_.config = { ...DEFAULT_SCENE_CONFIG, ...stored?.config };
      if (!this.state_.instance && env.SIM_INSTANCE) this.state_.instance = env.SIM_INSTANCE;
      // keep the reign / intro / win celebration animating after a restart or deploy
      if (ANIMATED_STATUSES.includes(this.state_.status) && !(await ctx.storage.getAlarm())) {
        await ctx.storage.setAlarm(Date.now());
      }
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
      phaseStartedAt: this.state_.phaseStartedAt,
      phaseEndsAt: this.state_.phaseEndsAt,
      serverTime: Date.now(),
      champion: this.state_.champion,
      // school being introduced right now during the intro, so the site can name it
      introducing:
        this.state_.status === "intro" ? introducingAt(Date.now() - this.state_.phaseStartedAt, this.state_.config) : null,
      config: this.state_.config,
      hasInstance: Boolean(this.state_.instance),
      viewerCount: this.recentViewers.size,
      hype: this.hypeNow(),
      // recent cheers, oldest first, as {school, t}; t is server epoch ms (compare against
      // this response's own serverTime, same clock-drift pattern as phaseEndsAt) so a client
      // can pulse for whichever ones it hasn't shown yet without needing a websocket.
      recentCheers: this.recentCheerEvents.map(({ school, t }) => ({ school, t })),
    };
  }

  /** Prune stale entries and record `ip` as currently present, if given. */
  touchViewer(ip, now = Date.now()) {
    if (ip) this.recentViewers.set(ip, now);
    for (const [k, t] of this.recentViewers) {
      if (now - t > VIEWER_WINDOW_MS) this.recentViewers.delete(k);
    }
  }

  /** Cheers per second, trailing HYPE_WINDOW_S — the crowd's energy right now. */
  hypeNow(now = Date.now()) {
    const windowMs = HYPE_WINDOW_S * 1000;
    const n = this.recentCheerEvents.reduce((count, e) => count + (now - e.t <= windowMs ? 1 : 0), 0);
    return Math.round((n / HYPE_WINDOW_S) * 10) / 10;
  }

  recordCheerEvent(school, now) {
    this.recentCheerEvents.push({ school, t: now });
    while (this.recentCheerEvents.length > RECENT_CHEER_MAX) this.recentCheerEvents.shift();
    while (this.recentCheerEvents.length && now - this.recentCheerEvents[0].t > RECENT_CHEER_KEEP_MS) {
      this.recentCheerEvents.shift();
    }
  }

  enterPhase(status, now, seconds = null) {
    this.state_.status = status;
    this.state_.phaseStartedAt = now;
    this.state_.phaseEndsAt = seconds === null ? null : now + seconds * 1000;
  }

  /** Move intro -> countdown -> running once their time is up. */
  async advance(now) {
    const { status, phaseEndsAt, config } = this.state_;
    if (!phaseEndsAt || now < phaseEndsAt) return;
    if (status === "intro" && config.countdownSeconds > 0) {
      this.enterPhase("countdown", phaseEndsAt, config.countdownSeconds);
    } else if (status === "intro" || status === "countdown") {
      this.enterPhase("running", phaseEndsAt);
      this.state_.startedAt = phaseEndsAt;
    } else {
      return;
    }
    await this.persist();
    await this.advance(now); // a long stall may skip a whole phase
  }

  // -- public RPCs (called from the Worker's fetch router) -------------------

  async getState(ip) {
    await this.advance(Date.now());
    this.touchViewer(ip);
    return this.publicState();
  }

  async cheer(school, ip) {
    if (!isSchool(school)) throw new Error("unknown school");
    await this.advance(Date.now());
    this.touchViewer(ip); // a cheer is also "someone's here", even between polls
    if (this.state_.status !== "running") return { ok: false, reason: "not running", state: this.publicState() };

    const key = `${ip}|${school}`;
    const now = Date.now();
    const last = this.lastCheerAt.get(key) ?? 0;
    if (now - last < CHEER_COOLDOWN_MS) {
      return { ok: false, reason: "cooldown", state: this.publicState() };
    }
    this.lastCheerAt.set(key, now);

    this.state_.cheers[school] += 1;
    this.recordCheerEvent(school, now);
    await this.checkWin();
    await this.persist();
    return { ok: true, state: this.publicState() };
  }

  async checkWin() {
    if (this.state_.status !== "running") return;
    const progress = this.progressCols();
    const winner = SCHOOLS.find((s) => progress[s] >= FINISH_COLUMNS);
    if (winner) {
      const now = Date.now();
      this.enterPhase("finished", now);
      this.state_.winner = winner;
      this.state_.champion = winner; // reigns until the next race's intro
      this.state_.finishedAt = now;
      await this.pushFrame(now); // the celebration's first frame, immediately
      await this.ctx.storage.setAlarm(now); // alarm() streams it, looping forever until the next start()
    }
  }

  /** Host pressed Start: the reigning king abdicates (intro), countdown, then the race. */
  async start() {
    const now = Date.now();
    const { instance, champion, config } = this.state_;
    this.state_ = { ...DEFAULT_STATE(), instance, champion, config };
    this.enterPhase("intro", now, config.introSeconds);
    await this.persist();
    await this.ctx.storage.setAlarm(now); // paint immediately, alarm() reschedules
    return this.publicState();
  }

  /** Back to the reign: pauses a race in progress, or ends the winner announcement. */
  async stop() {
    if (this.state_.status !== "idle") this.enterPhase("idle", Date.now());
    await this.persist();
    await this.ctx.storage.setAlarm(Date.now());
    return this.publicState();
  }

  /** Full wipe: no race, and the Duck King gets the crown back. Host timing config is kept. */
  async reset() {
    this.state_ = { ...DEFAULT_STATE(), instance: this.state_.instance, config: this.state_.config };
    await this.persist();
    await this.ctx.storage.setAlarm(Date.now());
    return this.publicState();
  }

  async setConfig(input) {
    this.state_.config = validateSceneConfig(input, this.state_.config);
    await this.persist();
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

  /** Push one already-rendered grid through the flash guard and out to the sim. */
  async pushRawFrame(grid, now = Date.now()) {
    if (!this.state_.instance) return;
    // Brightness cap is applied to the TARGET before the flash guard sees it, so the guard's
    // slew-toward-target logic can never converge past the cap — the one choke point every
    // frame (race, reign, intro/countdown, every debug preview, the win celebration) passes
    // through, so this one line covers all of them.
    const capped = capBrightness(grid, this.state_.config?.brightness);
    const body = packFrame(this.guard.filter(capped, now));
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

  async pushFrame(now = Date.now()) {
    if (!this.state_.instance) return;
    const state = { ...this.state_, progressCols: this.progressCols() };
    await this.pushRawFrame(frameFor(state, now), now);
  }

  /** Stream `frameAt(t)` (t in ms from 0) for `seconds` at `fps`, each frame through the guard.
   * Owns the whole preview lifecycle: pauses the idle reign's own alarm loop so the two never
   * interleave, and — the part that matters when a second preview starts before the first one
   * finishes — claims a generation token so THIS run yields instantly if a newer preview takes
   * over, instead of both streaming frames at once and fighting for the same facade.
   *
   * `deleteAlarm()` alone only cancels a FUTURE alarm — it doesn't stop an `alarm()`
   * invocation that's already mid-batch (it sleeps between frames, and DO RPCs can run
   * concurrently with that sleep), so a preview starting mid-batch used to race against the
   * still-running reign loop. `this.previewGeneration` fixes both that AND two previews
   * racing each other: alarm() only runs while it's 0 (no preview active), and each
   * streamPreview() call takes the next generation number and checks every iteration that
   * it's still the current one — a newer call bumps the counter, so the older loop notices
   * and stops on its very next frame instead of continuing to push. Only whichever call is
   * still current when its own loop ends gets to reset the counter and re-arm the reign. */
  async streamPreview(frameAt, seconds, fps = PREVIEW_FPS) {
    const myGeneration = ++this.previewGeneration;
    await this.ctx.storage.deleteAlarm();
    try {
      const total = Math.max(1, Math.round(seconds * fps));
      for (let i = 0; i < total; i++) {
        if (this.previewGeneration !== myGeneration) return; // superseded — let the new one finish
        const stepStart = Date.now();
        await this.pushRawFrame(frameAt((i * 1000) / fps), stepStart);
        const elapsed = Date.now() - stepStart;
        await sleep(Math.max(0, 1000 / fps - elapsed));
      }
    } finally {
      if (this.previewGeneration === myGeneration) {
        this.previewGeneration = 0;
        if (this.state_.status === "idle") await this.ctx.storage.setAlarm(Date.now());
      }
    }
  }

  /** Admin-only: push one mascot's idle sprite, centred, straight to the building.
   * `size` is 9 (the default, full sprite) or 5 (the small debug art in sprites.js). */
  async previewMascot(id, size = 9) {
    if (!MASCOTS[id]) throw new Error(`unknown mascot: ${id}`);
    if (this.state_.status !== "idle") return { ok: false, reason: "race must be idle to preview" };
    if (!this.state_.instance) return { ok: false, reason: "no sim instance configured" };
    const grid = centeredMascotFrame(id, size);
    await this.streamPreview(() => grid, MASCOT_PREVIEW_SECONDS);
    return { ok: true };
  }

  /** Admin-only: push a short sequence of frames for one ported living-field scene. */
  async previewScene(id) {
    const scene = LIVING_FIELD_SCENES[id];
    if (!scene) throw new Error(`unknown scene: ${id}`);
    if (this.state_.status !== "idle") return { ok: false, reason: "race must be idle to preview" };
    if (!this.state_.instance) return { ok: false, reason: "no sim instance configured" };
    const opts = id === "finale" ? this.finaleOpts() : {};
    await this.streamPreview((t) => scene.frame(t, opts), scene.seconds);
    return { ok: true, seconds: scene.seconds };
  }

  /** The last (or reigning) champion's colour/lane, for the finale preview's rocket. */
  finaleOpts() {
    const school = this.state_.champion;
    if (!school) return { color: GOLD, lane: 0.5 }; // the Duck King: gold, centred
    return { color: SCHOOL_INFO[school].color, lane: (LANE_COLS[SCHOOLS.indexOf(school)] + 1) / 9 };
  }

  async alarm() {
    if (!this.state_.instance) return;
    const batchStart = Date.now();
    while (this.previewGeneration === 0 && ANIMATED_STATUSES.includes(this.state_.status) && Date.now() - batchStart < BATCH_MS) {
      const now = Date.now();
      await this.advance(now);
      if (!ANIMATED_STATUSES.includes(this.state_.status)) break;
      await this.pushFrame(now);
      const fps = this.state_.status === "idle" ? REIGN_FPS : SCENE_FPS;
      await sleep(Math.max(0, 1000 / fps - (Date.now() - now)));
    }

    if (this.previewGeneration !== 0) {
      return; // a preview took over; it re-arms the alarm itself when it's done
    } else if (ANIMATED_STATUSES.includes(this.state_.status)) {
      await this.ctx.storage.setAlarm(Date.now());
    } else if (this.state_.status === "running") {
      await this.pushFrame();
      await this.checkWin();
      if (this.state_.status === "running") {
        await this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
      }
    }
  }
}
