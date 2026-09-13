export { RaceState } from "./race-state.js";

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
        return json(await race.getState());
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

      if (url.pathname === "/api/admin/rotate-instance" && request.method === "POST") {
        const denied = requireAdmin(request, env);
        if (denied) return denied;
        return json(await race.rotateInstance());
      }

      return json({ error: "not found" }, { status: 404 });
    } catch (err) {
      return json({ error: String(err?.message ?? err) }, { status: 500 });
    }
  },
};
