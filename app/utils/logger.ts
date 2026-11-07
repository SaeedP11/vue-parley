/** `localStorage["vue-parley:debug"] = "1"` turns debug logs on in a host that didn't set `debug`. */
export const readDebugFlag = () => {
  try {
    return localStorage.getItem("vue-parley:debug") === "1";
  } catch {
    return false;
  }
};

/** Errors and warnings always print; `debug` prints only when enabled. */
export function createLogger(scope: string, enabled: boolean | (() => boolean) = readDebugFlag) {
  const tag = `[vue-parley:${scope}]`;
  const on = typeof enabled === "function" ? enabled : () => enabled;
  return {
    enabled: on,
    debug: (...args: unknown[]) => {
      if (on()) console.log(tag, ...args);
    },
    warn: (...args: unknown[]) => console.warn(tag, ...args),
    error: (...args: unknown[]) => console.error(tag, ...args),
  };
}
