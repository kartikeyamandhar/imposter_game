# Suss

A free, browser-based multiplayer party word game. One secret word, one (or
more) hidden **imposter**. Everyone gives one-word clues out loud, then votes to
find the imposter. No app, no download, no accounts — just a URL and a 4-letter
room code.

There's also an **offline pass-and-play** mode: one phone, passed around, each
player privately taps to see their role. Works with no internet at all.

## Privacy by design

- **No database, no persistence.** Room state (names, roles, votes, scores)
  lives only in the multiplayer server's memory for the life of a game and is
  discarded when the room empties. Nothing is written to disk or logged.
- **No accounts, no cookies, no tracking, no analytics, no ads.**
- The only thing stored on your device is a sound on/off preference
  (`localStorage`). The per-tab reconnect id lives in `sessionStorage` and dies
  with the tab.
- The secret word and role assignments are **never broadcast** — each player is
  told only their own role privately. See [security notes](#security-notes).

## Stack

- **Frontend:** vanilla HTML/CSS/JS, single page, no build step. Deploys as
  static files to **Cloudflare Pages** (`public/`).
- **Backend:** [Partykit](https://partykit.io) — each room is a Durable Object
  state machine. In-memory only.

```
public/        → static client (deploy to Cloudflare Pages)
  index.html   ·  app.js  ·  styles.css  ·  words.js
  terms.html   ·  privacy.html  ·  manifest.json  ·  sw.js
  _headers     ·  _redirects  ·  icon-*.png
src/           → Partykit server
  server.ts    ·  words.ts
```

## Run locally

```bash
npm install
npm run dev          # Partykit dev server at http://127.0.0.1:1999
```

Open several browser tabs at `http://127.0.0.1:1999`, create a room in one,
join with the code from the others, and play. Offline mode works from the
"Play Offline" link with the network disabled.

## Deploy

The client (static) and the multiplayer server (Partykit) deploy separately.

**1. Deploy the Partykit server:**

```bash
npm run deploy       # npx partykit deploy
```

Note the host it prints, e.g. `suss.yourname.partykit.dev`.

**2. Point the client at it.** In [`public/app.js`](public/app.js) set:

```js
const PROD_PARTYKIT_HOST = "suss.yourname.partykit.dev";
```

(Locally the client auto-uses `127.0.0.1:1999`.) If you use a custom Partykit
host, also widen the `connect-src` in [`public/_headers`](public/_headers).

**3. Deploy the client to Cloudflare Pages.** Point a Pages project at this repo
with **build output directory = `public`** and no build command (it's static).
The `_headers` (security headers / CSP) and `_redirects` (SPA fallback) ship
automatically.

After deploy, update the `og:url` in `index.html` to your real domain.

## How to play

1. Host creates a room and shares the 4-letter code (or the link).
2. Everyone joins on their own phone and the host sets the rules.
3. **Reveal:** each player privately sees their word — or `IMPOSTER`.
   - *Classic:* the imposter gets no word and must blend in.
   - *Decoy Word:* the imposter gets a different but related word and doesn't
     even know they're the imposter.
4. **Clues:** in turn, everyone says one word aloud.
5. **Discuss**, then **vote**. Most votes is out. An eliminated imposter gets a
   15-second "last stand" to guess the real word.
6. Scores tally across rounds.

## Security notes

- The word and role map are server-only; clients receive just their own
  `your_role`. The word is revealed to all only in the post-round `result`.
- All client input is untrusted: messages are validated, display names are
  sanitized and length-capped, vote targets are checked, host-only actions are
  enforced server-side.
- User-supplied text is rendered with `textContent` only (no `innerHTML`) — no
  HTML/script injection via names.
- Security headers (CSP, `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`) ship via `public/_headers`.

## Tweaking the word bank

Words live in two synced files: [`src/words.ts`](src/words.ts) (server) and
[`public/words.js`](public/words.js) (offline client). Edit both. Words are
grouped into related clusters so Decoy mode can pick a plausible decoy.

## License

MIT.
