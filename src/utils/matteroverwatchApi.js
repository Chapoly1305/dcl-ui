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
