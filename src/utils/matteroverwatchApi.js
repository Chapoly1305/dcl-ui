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

  // When on localhost (port-forwarded access), use relative paths so API calls
  // go through the same origin (nginx proxies /api/* to central:8080). Deriving
  // localhost:8080 from :8082 breaks single-port forwarding setups.
  if (origin && (origin.includes("localhost") || origin.includes("127.0.0.1"))) {
    return {
      requestBase: "",
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
