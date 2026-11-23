import { normalize } from "../web/state.js";

const privateHeaders = {
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer"
};

function json(value, status = 200) {
  return Response.json(value, {status, headers: privateHeaders});
}

async function readState(db, user) {
  const row = await db.prepare(
    "SELECT revision, payload, updated_at FROM tracker_state WHERE user_id = ?"
  ).bind(user).first();
  return row ? {
    revision: row.revision, state: normalize(JSON.parse(row.payload)), updatedAt: row.updated_at
  } : {revision: 0, state: seededState(), updatedAt: null};
}

async function api(request, env, url) {
  const user = request.headers.get("oai-authenticated-user-id");
  if (!user) return json({error: "Sign in with ChatGPT to access your tracker."}, 401);
  if (!env.DB) return json({error: "Cloud storage is unavailable. Try again shortly."}, 503);
  if (request.method === "GET") return json(await readState(env.DB, user));
  if (request.method !== "PUT") return json({error: "Method not allowed."}, 405);
  if (request.headers.get("origin") !== url.origin || !request.headers.get("content-type")?.startsWith("application/json")) {
    return json({error: "Invalid save request."}, 403);
  }
  const body = await request.text();
  if (body.length > 2000000) return json({error: "The tracker data is too large."}, 413);
  let submission;
  try {
    submission = JSON.parse(body);
  } catch {
    return json({error: "Invalid JSON."}, 400);
  }
  if (!submission || !Number.isSafeInteger(submission.revision) || submission.revision < 0 ||
      !submission.state || typeof submission.state !== "object" || Array.isArray(submission.state)) {
    return json({error: "Invalid tracker data."}, 400);
  }
  const {revision} = submission;
  const state = normalize(submission.state);
  const payload = JSON.stringify(state);
  const updatedAt = new Date().toISOString();
  const result = revision === 0 ? await env.DB.prepare(
    "INSERT INTO tracker_state (user_id, revision, payload, updated_at) VALUES (?, 1, ?, ?) ON CONFLICT(user_id) DO NOTHING RETURNING revision"
  ).bind(user, payload, updatedAt).first() : await env.DB.prepare(
    "UPDATE tracker_state SET revision = revision + 1, payload = ?, updated_at = ? WHERE user_id = ? AND revision = ? RETURNING revision"
  ).bind(payload, updatedAt, user, revision).first();
  if (!result) return json({error: "A newer version exists. Reload the cloud copy or export this draft first."}, 409);
  return json({revision: result.revision, state, updatedAt});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/state") {
      try {
        return await api(request, env, url);
      } catch (error) {
        console.error("Tracker storage:", error.message);
        return json({error: "Cloud storage could not complete the request."}, 503);
      }
    }
    const asset = assets[url.pathname];
    if (asset && (request.method === "GET" || request.method === "HEAD")) {
      const [type, body] = asset;
      return new Response(request.method === "GET" ? body : null, {
        headers: {
          ...privateHeaders,
          "content-type": type + "; charset=utf-8",
          "content-security-policy": "default-src 'self'; img-src 'self' data:; base-uri 'none'; object-src 'none'; form-action 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'"
        }
      });
    }
    return new Response("Not found", {status: 404, headers: privateHeaders});
  }
};

