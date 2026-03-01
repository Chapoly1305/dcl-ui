function trimTrailingSlash(value) {
  return String(value || '').replace(/\/$/, '');
}

function currentOrigin() {
  if (typeof window === 'undefined' || !window.location) {
    return '';
  }
  return trimTrailingSlash(window.location.origin || '');
}

export function resolveMatteroverwatchApiBase() {
  const configured = trimTrailingSlash(import.meta.env.VITE_APP_MATTEROVERWATCH_API_BASE || '');
  const origin = currentOrigin();

  // In dev mode, use same-origin Vite proxy to avoid localhost/127.0.0.1 cross-origin failures.
  if (import.meta.env.DEV && origin) {
    return {
      requestBase: `${origin}/mwapi`,
      displayBase: configured || `${origin}/mwapi`,
      configuredBase: configured
    };
  }

  return {
    requestBase: configured,
    displayBase: configured,
    configuredBase: configured
  };
}
