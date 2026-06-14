/**
 * Where the app talks to the backend (the API gateway on port 8000).
 *
 * A native app's "localhost" is the phone, not your Mac, so in development the
 * phone must reach the gateway at your Mac's LAN IP, e.g. http://192.168.1.36:8000.
 *
 * How we pick the URL, in order:
 *   1. EXPO_PUBLIC_API_URL — an explicit override (set this when the backend is
 *      itself tunnelled, e.g. http://abc123.loca.lt). Always wins.
 *   2. The Expo/Metro host, IF it's a private LAN IP (normal `expo start`): we
 *      reuse that IP and swap in port 8000, so it follows you across networks.
 *   3. FALLBACK_HOST — the Mac's LAN IP. Used when the Metro host isn't a LAN IP,
 *      which is exactly the case in TUNNEL mode (the host is then an Expo tunnel
 *      domain like *.exp.direct that does NOT expose the backend). The phone can
 *      still reach the LAN IP for the small API calls even if the big JS bundle
 *      had to come over the tunnel.
 */
import Constants from 'expo-constants';

const BACKEND_PORT = 8000;

// This Mac's LAN IP (`ipconfig getifaddr en0`).
const FALLBACK_HOST = '192.168.1.36';

function isPrivateLanIp(host: string): boolean {
  // 10.x, 172.16–31.x, 192.168.x — the private ranges a home/office LAN uses.
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
}

function resolveBaseUrl(): string {
  // 1. Explicit override (e.g. a tunnelled backend URL).
  const override = process.env.EXPO_PUBLIC_API_URL;
  if (override) return override.replace(/\/$/, '');

  // 2 & 3. Derive from the Expo host, but only trust it if it's a LAN IP.
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig
      ?.debuggerHost ??
    '';
  const host = hostUri.split(':')[0];

  if (host && isPrivateLanIp(host)) {
    return `http://${host}:${BACKEND_PORT}`;
  }
  // Tunnel mode (or unknown host): the tunnel domain doesn't serve the backend,
  // so use the LAN IP directly.
  return `http://${FALLBACK_HOST}:${BACKEND_PORT}`;
}

export const API_BASE_URL = resolveBaseUrl();
