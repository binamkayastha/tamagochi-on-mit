export { RaceState } from "./race-state.js";
import { validateSceneConfig } from "./scenes.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-Admin-Key",
};

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...(init.headers ?? {}) },
  });
}

function requireAdmin(request, env) {
  if (!env.ADMIN_KEY) return json({ error: "ADMIN_KEY not configured" }, { status: 500 });
  const key = request.headers.get("X-Admin-Key");
  if (key !== env.ADMIN_KEY) return json({ error: "unauthorized" }, { status: 401 });
  return null;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

    const url = new URL(request.url);
    const race = env.RACE.getByName("main");

    try {
      if (url.pathname === "/api/state" && request.method === "GET") {
        const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
        return json(await race.getState(ip));
      }

      if (url.pathname === "/api/cheer" && request.method === "POST") {
        const { school } = await request.json().catch(() => ({}));
        const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
        const result = await race.cheer(school, ip);
        return json(result, { status: result.ok ? 200 : 429 });
      }

      if (url.pathname === "/api/admin/start" && request.method === "POST") {
        const denied = requireAdmin(request, env);
        if (denied) return denied;
        return json(await race.start());
      }

      if (url.pathname === "/api/admin/stop" && request.method === "POST") {
        const denied = requireAdmin(request, env);
        if (denied) return denied;
        return json(await race.stop());
      }

      if (url.pathname === "/api/admin/reset" && request.method === "POST") {
        const denied = requireAdmin(request, env);
        if (denied) return denied;
        return json(await race.reset());
      }

      if (url.pathname === "/api/admin/config" && request.method === "POST") {
        const denied = requireAdmin(request, env);
        if (denied) return denied;
        const body = await request.json().catch(() => ({}));
        try {
          validateSceneConfig(body); // reject bad input with a 400 before touching state
        } catch (err) {
          return json({ error: err.message }, { status: 400 });
        }
        return json(await race.setConfig(body));
      }

      if (url.pathname === "/api/admin/rotate-instance" && request.method === "POST") {
        const denied = requireAdmin(request, env);
        if (denied) return denied;
        return json(await race.rotateInstance());
      }

      // Debug: push a single mascot's idle sprite, centred, straight to the building —
      // a quick way for the host to eyeball colours/shape before the event.
      if (url.pathname === "/api/admin/preview/mascot" && request.method === "POST") {
        const denied = requireAdmin(request, env);
        if (denied) return denied;
        const { id, size } = await request.json().catch(() => ({}));
        return json(await race.previewMascot(id, size === 5 ? 5 : 9));
      }

      // Debug: push a short sequence of frames for one ported living-field scene
      // ("finale" | "aurora" | "seismic" | "radar"). See src/living-field-scenes.js.
      if (url.pathname === "/api/admin/preview/scene" && request.method === "POST") {
        const denied = requireAdmin(request, env);
        if (denied) return denied;
        const { scene } = await request.json().catch(() => ({}));
        return json(await race.previewScene(scene));
      }

      return json({ error: "not found" }, { status: 404 });
    } catch (err) {
      return json({ error: String(err?.message ?? err) }, { status: 500 });
    }
  },
};
