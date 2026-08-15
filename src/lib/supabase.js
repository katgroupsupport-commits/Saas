import { Preferences } from "@capacitor/preferences";
import { createClient } from "@supabase/supabase-js";

const runtimeEnv = typeof import.meta !== "undefined" && import.meta.env
  ? import.meta.env
  : (typeof process !== "undefined" ? process.env : {});
const supabaseUrl = runtimeEnv.VITE_SUPABASE_URL;
const supabaseAnonKey = runtimeEnv.VITE_SUPABASE_ANON_KEY;

// Diagnostic: print runtime env availability to browser console
try {
  // Keep logs minimal and safe: don't print the full anon key
  // but indicate presence and the URL used to build the client.
  // This runs in the browser environment where `import.meta.env` is available.
  // If you don't see these logs, the module isn't being evaluated.
  // eslint-disable-next-line no-console
  console.log("[supabase] VITE_SUPABASE_URL:", supabaseUrl, "anonKeyPresent:", Boolean(supabaseAnonKey));
} catch (err) {
  // eslint-disable-next-line no-console
  console.warn("[supabase] failed to log env diagnostics", err);
}

function isNativeApp() {
  if (typeof window === "undefined") return false;
  const capacitor = window.Capacitor;
  return Boolean(capacitor?.isNativePlatform?.() || (capacitor?.platform && capacitor.platform !== "web"));
}

const authStorage = {
  async getItem(key) {
    if (!isNativeApp()) {
      return window.localStorage.getItem(key);
    }
    const { value } = await Preferences.get({ key });
    return value ?? null;
  },
  async setItem(key, value) {
    if (!isNativeApp()) {
      window.localStorage.setItem(key, value);
      return;
    }
    await Preferences.set({ key, value });
  },
  async removeItem(key) {
    if (!isNativeApp()) {
      window.localStorage.removeItem(key);
      return;
    }
    await Preferences.remove({ key });
  }
};

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          storage: authStorage
        }
      })
    : null;

export const isSupabaseConfigured = Boolean(supabase);
