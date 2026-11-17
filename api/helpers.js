const { createHash, randomBytes } = require("node:crypto");

const sessionCookieName = "forma_session";
const sessionDurationSeconds = 30 * 24 * 60 * 60;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readCookie(request, name) {
  const cookieHeader = request.get("cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) return valueParts.join("=");
  }
  return "";
}

function createSessionTools(database, applicationUrl) {
  const secure = new URL(applicationUrl).protocol === "https:";
  const cookieAttributes = `Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;

  async function getCurrentUser(request) {
    if (request.user) return request.user;
    const token = readCookie(request, sessionCookieName);
    if (!/^[a-f0-9]{64}$/.test(token)) return null;

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const result = await database.query(
      `SELECT users.id, users.email, users.name, users.is_admin
       FROM user_sessions
       JOIN users ON users.id = user_sessions.user_id
       WHERE user_sessions.token_hash = $1 AND user_sessions.expires_at > now()`,
      [tokenHash],
    );
    if (result.rowCount === 0) return null;

    const row = result.rows[0];
    request.user = {
      id: row.id,
      email: row.email,
      name: row.name,
      isAdmin: row.is_admin,
    };
    return request.user;
  }

  async function requireAuth(request, response, next) {
    try {
      const user = await getCurrentUser(request);
      if (!user) {
        response.status(401).json({ error: "Sign in to continue." });
        return;
      }
      request.user = user;
      next();
    } catch (error) {
      next(error);
    }
  }

  function requireAdmin(request, response, next) {
    requireAuth(request, response, (error) => {
      if (error) {
        next(error);
        return;
      }
      if (!request.user?.isAdmin) {
        response.status(403).json({ error: "Administrator access is required." });
        return;
      }
      next();
    });
  }

  async function issueSession(userId, response) {
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await database.query(
      `INSERT INTO user_sessions (token_hash, user_id, expires_at)
       VALUES ($1, $2, now() + ($3 * interval '1 second'))`,
      [tokenHash, userId, sessionDurationSeconds],
    );
    response.set(
      "Set-Cookie",
      `${sessionCookieName}=${token}; ${cookieAttributes}; Max-Age=${sessionDurationSeconds}`,
    );
  }

  async function clearSession(request, response) {
    const token = readCookie(request, sessionCookieName);
    if (/^[a-f0-9]{64}$/.test(token)) {
      const tokenHash = createHash("sha256").update(token).digest("hex");
      await database.query("DELETE FROM user_sessions WHERE token_hash = $1", [tokenHash]);
    }
    response.set("Set-Cookie", `${sessionCookieName}=; ${cookieAttributes}; Max-Age=0`);
  }

  return { getCurrentUser, requireAuth, requireAdmin, issueSession, clearSession };
}

function requireInteger(value, { name, minimum, maximum, optional = false }) {
  if ((value === undefined || value === "") && optional) return null;
  if (typeof value !== "string" && typeof value !== "number") {
    throw new HttpError(400, `${name} must be a whole number.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new HttpError(400, `${name} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function normalizeEmail(value) {
  if (typeof value !== "string") throw new HttpError(400, "Enter a valid email address.");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "Enter a valid email address.");
  }
  return email;
}

function safeImageUrl(value) {
  if (typeof value !== "string" || value.length > 500) return false;
  if (/^\/(?:assets|img)\/[a-zA-Z0-9._/-]+$/.test(value) && !value.includes("..")) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function databaseRateLimit(database, { namespace, limit, windowMilliseconds }) {
  return async (request, response, next) => {
    try {
      const bucket = `${namespace}:${request.ip || "unknown"}`.slice(0, 250);
      const result = await database.query(
        `INSERT INTO api_rate_limits (bucket, window_started_at, request_count)
         VALUES ($1, now(), 1)
         ON CONFLICT (bucket) DO UPDATE SET
           request_count = CASE
             WHEN api_rate_limits.window_started_at <= now() - ($2 * interval '1 millisecond') THEN 1
             ELSE api_rate_limits.request_count + 1
           END,
           window_started_at = CASE
             WHEN api_rate_limits.window_started_at <= now() - ($2 * interval '1 millisecond') THEN now()
             ELSE api_rate_limits.window_started_at
           END
         RETURNING request_count, window_started_at`,
        [bucket, windowMilliseconds],
      );
      const rate = result.rows[0];
      if (rate.request_count > limit) {
        const retryAfter = Math.max(
          1,
          Math.ceil(
            (new Date(rate.window_started_at).getTime() + windowMilliseconds - Date.now()) / 1000,
          ),
        );
        response.set("Retry-After", String(retryAfter));
        response.status(429).json({ error: "Too many requests. Please try again shortly." });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  HttpError,
  createSessionTools,
  databaseRateLimit,
  normalizeEmail,
  requireInteger,
  safeImageUrl,
};
