const DEBUG_KEY = "__APP_DEBUG__";

function getGlobalDebugState() {
  if (typeof window === "undefined") return null;
  if (!window[DEBUG_KEY]) {
    window[DEBUG_KEY] = {
      enabled: true,
      events: []
    };
  }
  return window[DEBUG_KEY];
}

function summarizeValue(value, maxLength = 220) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return `[array:${value.length}] ${JSON.stringify(value.slice(0, 2)).slice(0, maxLength)}`;
  }
  if (typeof value === "object") {
    const preview = Object.keys(value).slice(0, 8).reduce((memo, key) => {
      memo[key] = value[key];
      return memo;
    }, {});
    return JSON.stringify(preview).slice(0, maxLength);
  }
  return String(value).slice(0, maxLength);
}

export function isRuntimeDebugEnabled() {
  const state = getGlobalDebugState();
  return Boolean(state?.enabled);
}

export function setRuntimeDebugEnabled(enabled = true) {
  const state = getGlobalDebugState();
  if (!state) return;
  state.enabled = Boolean(enabled);
  return state.enabled;
}

export function getRuntimeDebugEvents() {
  const state = getGlobalDebugState();
  return Array.isArray(state?.events) ? state.events : [];
}

export function clearRuntimeDebugEvents() {
  const state = getGlobalDebugState();
  if (!state) return;
  state.events = [];
}

export function traceRuntimeEvent(type, payload = {}) {
  const state = getGlobalDebugState();
  if (!state || !state.enabled) return;

  const event = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    timestamp: new Date().toISOString()
  };

  state.events = [event, ...(state.events || [])].slice(0, 100);
  console.info(`[app-debug] ${type}`, payload);
}

export function traceRouteChange(pathname, context = {}) {
  traceRuntimeEvent("route-change", {
    pathname,
    ...context
  });
}

export function traceRepositoryCall(methodName, args = [], meta = {}) {
  traceRuntimeEvent("repo-call", {
    methodName,
    args: args.map((arg) => summarizeValue(arg)),
    ...meta
  });
}

export function traceRepositoryResult(methodName, result, meta = {}) {
  traceRuntimeEvent("repo-result", {
    methodName,
    result: summarizeValue(result),
    ...meta
  });
}

export function traceRepositoryError(methodName, error, meta = {}) {
  traceRuntimeEvent("repo-error", {
    methodName,
    error: {
      message: error?.message,
      code: error?.code,
      details: error?.details
    },
    ...meta
  });
}
