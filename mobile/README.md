# SecurePay — Mobile app

A React Native (Expo) wallet client for the SecurePay backend. Register / log in,
open a wallet, top it up, send peer-to-peer transfers, and browse your activity —
all talking to the same API gateway the backend exposes on port 8000.

The stack is intentionally lean and "all-Expo" so it runs in **Expo Go** on a
real phone with no native build step:

| Concern | Choice | Why |
|---------|--------|-----|
| Routing | **Expo Router** (file-based) | Screens are just files under `src/app`; route groups give us an auth stack and an app tab bar for free. |
| Server state | **@tanstack/react-query** | Caching, loading/error state, refetch-on-focus, and one-line invalidation after a deposit/transfer keep the balance + activity in sync. |
| Auth storage | **expo-secure-store** | The JWT is a credential, so it lives in the OS keychain — not AsyncStorage. |
| Styling | **StyleSheet + design tokens** | No CSS framework. `src/theme/tokens.ts` is the single source of truth for colour/spacing/type, which is what makes the UI feel consistent. |
| Type/icons/gradient | Inter fonts · `@expo/vector-icons` · `expo-linear-gradient` | The premium look: a gradient balance card, soft shadows, and one typeface throughout. |

## Run it

1. **Start the backend first** (from the repo root):
   ```bash
   docker compose up --build
   ```
2. **Start the app** (from this `mobile/` folder):
   ```bash
   npm install        # first time only
   npx expo start
   ```
3. Scan the QR code with **Expo Go** on your phone (iOS Camera / the Expo Go app
   on Android). The phone and your Mac must be on the **same Wi-Fi**.

### The networking gotcha (important)

A native app is **not** a browser: `localhost` on the phone means the *phone*,
not your Mac. So the app reaches the backend at your Mac's **LAN IP**, e.g.
`http://192.168.1.36:8000`.

You don't normally have to set this by hand — `src/lib/config.ts` reads the host
Expo already connected to (the Metro bundler runs on your Mac's LAN IP) and just
swaps in the backend port `8000`. If that detection ever fails, edit the
`FALLBACK_HOST` constant in that file to your current IP (`ipconfig getifaddr en0`).

Because it's not a browser, **CORS doesn't apply** — the request goes straight to
the gateway.

## How it's organised

```
mobile/src/
├── app/                     # Expo Router screens (file = route)
│   ├── _layout.tsx          # providers (React Query, Auth), fonts, splash gate
│   ├── index.tsx            # redirects to (app) or (auth) based on the token
│   ├── (auth)/              # login / register  (shown when logged out)
│   └── (app)/               # tab bar: Home · Send · Activity (requires a token)
│       ├── index.tsx        # balance card, quick actions, recent activity
│       ├── send.tsx         # P2P transfer + success screen
│       └── activity.tsx     # full statement, pull-to-refresh
├── lib/
│   ├── config.ts            # API base URL (auto-derived LAN IP)
│   ├── api.ts               # typed fetch client + JWT bearer + ApiError
│   ├── auth.tsx             # AuthProvider/useAuth, token in secure-store
│   ├── queries.ts           # React Query hooks (wallet, statement, mutations)
│   └── format.ts            # money/date formatting (no Intl, engine-agnostic)
├── theme/
│   └── tokens.ts            # colours, spacing, radius, type, shadows
└── components/              # Button, TextField, Card, BalanceCard, …
```

The screens never call `fetch` directly — they go through the React Query hooks in
`lib/queries.ts`, which call the typed endpoints in `lib/api.ts`. After a deposit
or transfer those hooks invalidate the `wallet` and `statement` queries so the
balance and activity list update on their own.
