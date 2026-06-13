/**
 * Where the app talks to the backend.
 *
 * The catch with a *native* app (unlike a web app) is that "localhost" means
 * the phone itself, not your Mac. So in development the phone has to reach the
 * API gateway over the LAN at your Mac's IP, e.g. http://192.168.1.36:8000.
 *
 * Rather than hard-code that IP, we reuse the host Expo already gave us: when
 * you run `expo start`, the phone connects to the Metro bundler at your Mac's
 * LAN address (e.g. "192.168.1.36:8081"). We grab that host and just swap in
 * the backend port (8000). That way the URL follows you across networks without
 * editing code. If for some reason we can't read it, we fall back to the IP
 * captured at build time.
 */
import Constants from 'expo-constants';

const BACKEND_PORT = 8000;

// This Mac's LAN IP at the time of writing (`ipconfig getifaddr en0`).
// Only used if we can't derive the dev host automatically.
const FALLBACK_HOST = '192.168.1.36';

function deriveDevHost(): string {
  const hostUri =
    // Modern Expo (SDK 49+) exposes the Metro host here…
    Constants.expoConfig?.hostUri ??
    // …older field, kept as a belt-and-braces fallback.
    (Constants as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig
      ?.debuggerHost ??
    '';

  const host = hostUri.split(':')[0];
  return host || FALLBACK_HOST;
}

export const API_BASE_URL = `http://${deriveDevHost()}:${BACKEND_PORT}`;
