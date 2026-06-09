# Mobile App Feasibility — Host Cleaner Marketplace

**Status:** feasibility plan only (no build). Last updated: 2026-06-08.

How to turn the existing **Next.js 15 / React 19** web app (DRF backend) into a mobile app. Two viable paths — **PWA** (cheap, installable) and **Capacitor** (native store apps, ~100% code reuse). A full React Native/Expo rewrite is **not recommended** now (it reuses only the DRF API, not the React components; high effort for a two-sided marketplace).

---

## Current state (what already exists)

- `frontend/app/manifest.ts` — a Web App Manifest with `display: standalone`, name/description, colors. **Incomplete:** no `icons[]`, so install prompts won't fire properly.
- `frontend/app/layout.tsx` — `viewport.themeColor = "#ff385c"`.
- **Theme-color mismatch:** manifest `theme_color: "#0f766e"` (teal) vs viewport `#ff385c` (brand coral) — pick one.
- **No service worker**, no `next-pwa`/Serwist, no Capacitor/React-Native dependencies.
- Auth is **session cookies + CSRF** via `frontend/lib/api` `apiFetch`; `next.config.mjs` uses **rewrites** to proxy `/api` → Django.

---

## Option 1 — PWA (installable web app)

**Effort:** ~1–2 days · **Risk:** low · **Outcome:** installable to home screen, offline shell, no app store.

### Steps
1. **Icons:** add `192x192`, `512x512`, and a `maskable` icon; reference them in `app/manifest.ts` `icons[]`. Add an `apple-touch-icon` (iOS Safari ignores the manifest for install).
2. **Fix colors:** align `theme_color` / `background_color` in the manifest with the brand tokens and the viewport `themeColor`.
3. **iOS meta:** add `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title` (via `metadata`/`<head>`).
4. **Service worker:** add **[Serwist](https://serwist.pages.dev/)** (the maintained successor to `next-pwa`, App-Router-friendly) for installability + an offline app shell; foundation for web push later.
5. **Test:** Android Chrome + iOS Safari "Add to Home Screen"; confirm standalone launch, splash, and that auth/session still works in standalone.

### Pros / Cons
- **Pros:** cheapest; instant install; OTA updates by default; also improves the web product.
- **Cons:** no App Store/Play listing; iOS PWAs are limited (no real push on older iOS, storage caps); not a "store app."

---

## Option 2 — Capacitor (native iOS/Android shells)

**Effort:** ~1–2 weeks initial + ongoing maintenance · **Risk:** medium · **Outcome:** real App Store / Play apps wrapping the existing React app (~100% code reuse), with native push/camera/biometrics via plugins.

### High-level steps
1. Add Capacitor (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`).
2. Choose a **load strategy** (see gotcha #2): static-export bundle **or** `server.url` → hosted site.
3. `npx cap add ios` / `npx cap add android`; sync the web build into the native projects.
4. Add native plugins as needed (Push Notifications, Camera, etc.).
5. Build / sign / submit (App Store Connect + Google Play Console).

### The three decisions that drive risk (resolve these first)

1. **Auth model — biggest item.**
   The app uses **session cookies + CSRF**. A Capacitor WebView runs on `capacitor://localhost` (or `https://localhost`), so requests to the Django domain are **cross-origin**. Making cookie auth work needs `SESSION_COOKIE_SAMESITE=None` + `Secure`, `CORS_ALLOW_CREDENTIALS=True`, an explicit `CORS_ALLOWED_ORIGINS`, and matching `CSRF_TRUSTED_ORIGINS` — fragile on mobile WebViews. **Recommended: add a token/JWT auth path for mobile** (DRF Token or `djangorestframework-simplejwt`) and have `apiFetch` attach a bearer token on native. This is a backend spike and a prerequisite for Capacitor.

2. **Next.js build strategy.**
   `next.config.mjs` relies on **rewrites** to proxy `/api` → Django. Two choices:
   - **Static export** (`output: 'export'`): cannot do rewrites, so `apiFetch` must call the **absolute backend URL** (ties back to #1, CORS). Best "real app bundle" feel; some App-Router features are unavailable.
   - **Remote URL** (Capacitor `server.url` = the live hosted site): a thin native shell over the live site; minimal code change, but needs connectivity and is closer to a chrome-less browser.

3. **iOS builds require macOS — the dev machine is Windows.**
   **Android** builds on Windows (Android Studio). **iOS** needs a Mac or a **cloud-Mac CI** (e.g. Codemagic, Ionic Appflow). Plan: **Android first**, iOS via cloud Mac.

### Pros / Cons
- **Pros:** App Store/Play presence; native push/camera/biometrics; reuses the entire React codebase; web devs stay productive.
- **Cons:** the auth refactor (cookies → tokens); build/signing pipeline; the Windows→iOS constraint; WebView (not "pure native") performance ceiling.

---

## Recommendation & sequencing

1. **Now — PWA.** Low cost, immediate installable app, also benefits the web. (Option 1.)
2. **Next — Capacitor**, when store presence is wanted. Treat **mobile auth (session → token)** as a prerequisite spike, build **Android first** (Windows-friendly), and line up a **cloud Mac** for iOS.
3. **Skip** React Native/Expo unless a future need for deep-native performance justifies a separate app over the DRF API.

### Effort summary

| Path | Effort | Risk | App store | Code reuse | Main blocker |
|---|---|---|---|---|---|
| PWA | ~1–2 days | Low | No | 100% | none (just icons + SW) |
| Capacitor | ~1–2 weeks + | Medium | Yes | ~100% | mobile auth (cookies→token) + iOS-on-Windows |
| React Native/Expo | Weeks–months | High | Yes | API only | full UI rewrite |

### References
- Capacitor vs React Native vs Expo (2026): https://www.pkgpulse.com/guides/react-native-vs-expo-vs-capacitor-cross-platform-mobile-2026
- Next.js + Capacitor: https://capgo.app/blog/building-a-native-mobile-app-with-nextjs-and-capacitor/
- Convert web app to mobile: https://nextnative.dev/blog/convert-web-app-to-mobile-app
- Serwist (PWA / service worker for Next App Router): https://serwist.pages.dev/
