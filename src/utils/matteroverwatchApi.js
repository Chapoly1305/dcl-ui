function trimTrailingSlash(value) {
  return String(value || "").replace(/\/$/, "");
}

function currentOrigin() {
  if (typeof window === "undefined" || !window.location) {
    return "";
  }
  return trimTrailingSlash(window.location.origin || "");
}

export function resolveMatteroverwatchApiBase() {
  const configured = trimTrailingSlash(import.meta.env.VITE_APP_MATTEROVERWATCH_API_BASE || "");
  const origin = currentOrigin();

  // Dev mode: use Vite proxy
  if (import.meta.env.DEV && origin) {
    return {
      requestBase: `${origin}/mwapi`,
      displayBase: configured || `${origin}/mwapi`,
      configuredBase: configured
    };
  }

  // Use the UI origin when it is served behind the nginx /api/* proxy. An
  // explicit origin (instead of an empty relative base) also lets callers
  // distinguish this valid same-origin mode from a genuinely missing base.
  // Localhost always prefers the proxy because deriving :8080 from :8082
  // breaks single-port forwarding setups.
  const isLocalOrigin = origin.includes("localhost") || origin.includes("127.0.0.1");
  if (origin && (isLocalOrigin || !configured)) {
    return {
      requestBase: origin,
      displayBase: origin,
      configuredBase: configured
    };
  }

  return {
    requestBase: configured,
    displayBase: configured,
    configuredBase: configured
  };
}

// A rejection the operator cannot read is barely better than a silent default.
//
// The three enqueue handlers used to throw `Analyze enqueue failed (422)` and
// drop the body, which is where the backend puts the offending ids and the
// nearest valid match ("unknown section id 'secrts'; did you mean 'secrets'?").
// The whole point of the boundary answering 422 instead of quietly dropping
// unknown ids is that someone finds out what was wrong, so the body has to
// reach the screen.
export async function describeApiFailure(response, fallback) {
  const prefix = fallback || `Request failed (${response.status})`;
  let payload = null;
  try {
    payload = await response.json();
  } catch (_e) {
    return prefix;
  }
  const detail = payload && (payload.detail !== undefined ? payload.detail : payload);
  if (!detail) return prefix;
  if (typeof detail === "string") return `${prefix}: ${detail}`;
  // FastAPI validation errors arrive as a list of {loc, msg, ...}.
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => (item && (item.msg || item.detail || item.message)) || "")
      .filter(Boolean);
    return parts.length ? `${prefix}: ${parts.join("; ")}` : prefix;
  }
  if (typeof detail === "object") {
    const message = detail.message || detail.error || detail.msg;
    const offending = Array.isArray(detail.offending) ? detail.offending.join(", ") : "";
    if (message && offending) return `${prefix}: ${message} (${offending})`;
    if (message) return `${prefix}: ${message}`;
    try {
      return `${prefix}: ${JSON.stringify(detail)}`;
    } catch (_e) {
      return prefix;
    }
  }
  return prefix;
}
