function trimTrailingSlash(value) {
  return String(value || "").replace(/\/$/, "");
}

function currentOrigin() {
  if (typeof window === "undefined" || !window.location) {
    return "";
  }
  return trimTrailingSlash(window.location.origin || "");
}

function deriveApiBase(origin) {
  // When accessed via port-forward (localhost), derive API port from UI port + offset.
  // UI is on 8082, API is on 8080 on the same host.
  try {
    const url = new URL(origin);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      if (url.port === "8082") {
        return `${url.protocol}//${url.hostname}:8080`;
      }
    }
    return origin;
  } catch {
    return origin;
  }
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

  // When on localhost (port-forwarded access), derive API URL from current origin
  // so API calls go through the tunnel instead of trying to reach the hardcoded IP.
  if (origin && (origin.includes("localhost") || origin.includes("127.0.0.1"))) {
    const apiBase = deriveApiBase(origin);
    return {
      requestBase: apiBase,
      displayBase: apiBase,
      configuredBase: configured
    };
  }

  return {
    requestBase: configured,
    displayBase: configured,
    configuredBase: configured
  };
}
