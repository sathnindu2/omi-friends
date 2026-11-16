# 🃏 OMI FRIENDS

Play traditional Sri Lankan **Omi (ඕමි)** online with three friends: private rooms, real-time play, English and Sinhala, and it installs on your phone. It's free, with no sign-up and no gambling.

- **Frontend:** React + TypeScript + Vite + Tailwind CSS (mobile-first PWA)
- **Backend:** Node.js + Express + Socket.IO + TypeScript (the server decides everything)
- **One URL** serves both the website and the real-time game.

---

## Contents

1. [What's inside](#1-whats-inside)
2. [Run it on your computer](#2-run-it-on-your-computer)
3. [Test with four browser windows](#3-test-with-four-browser-windows-manual-multiplayer-test)
4. [Put it on the internet (Render or Railway)](#4-put-it-on-the-internet)
5. [Play on Android and iPhone](#5-play-on-android-and-iphone)
6. [Automated tests](#6-automated-tests)
7. [Game rules implemented](#7-game-rules-implemented)
8. [How it works (for developers)](#8-how-it-works-for-developers)
9. [Settings (environment variables)](#9-settings-environment-variables)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. What's inside

```
omi-friends/
├── package.json            ← one install for everything
├── .env.example            ← optional settings (copy to .env)
├── render.yaml             ← one-click Render deployment
├── shared/                 ← code used by BOTH server and website
│   ├── types.ts            ← typed Socket.IO event contract + game types
│   └── rules.ts            ← deck, follow-suit, trick winner, scoring
├── server/src/
│   ├── index.ts            ← Express + Socket.IO server (also serves the website)
│   ├── config.ts           ← reads environment variables
│   ├── game/engine.ts      ← authoritative hand engine (dealing, trumps, tricks)
│   ├── rooms/RoomManager.ts← rooms, seats, sessions, reconnection, scoring, matches
│   ├── sockets/registerHandlers.ts ← validates every message, rate limits, acks
│   ├── security/security.ts← nickname cleaning, room codes, tokens, rate limiter
│   └── tests/              ← automated tests
└── client/
    ├── index.html, vite.config.ts
    ├── public/             ← PWA manifest, service worker, offline page, icons
    └── src/
        ├── pages/          ← Home, Create, Join, Room (lobby + table), How to Play, Settings
        ├── components/     ← cards, lobby, game table, modals, UI parts
        ├── context/        ← settings + live game connection
        ├── hooks/, lib/    ← socket, sound effects, router, storage
        ├── translations/   ← en.ts, si.ts (add more languages here)
        └── styles/         ← Tailwind + card/table/animation styles
```

---

## 2. Run it on your computer

### Step 1: Install Node.js
Download the **LTS** version (22 or newer is recommended; 20.19+ works) from <https://nodejs.org> and install it.
Check that it worked. Open a terminal (Windows: *PowerShell*, Mac: *Terminal*) and type:

```bash
node -v
npm -v
```

Both should print a version number.

### Step 2: Get the project
Unzip the `omi-friends` folder somewhere easy, e.g. your Desktop. In the terminal, go into it:

```bash
cd Desktop/omi-friends
```

### Step 3: Install the dependencies (one time)

```bash
npm install
```

This downloads React, Socket.IO and the rest into `node_modules/`. It takes a minute or two.

### Step 4: Environment variables (optional)
Everything works with the defaults. To change something:

```bash
# Mac / Linux
cp .env.example .env
# Windows PowerShell
copy .env.example .env
```

Then edit `.env` (see [section 9](#9-settings-environment-variables)).

### Step 5 and 6: Start the game server and the website

```bash
npm run dev
```

This starts **both** at once:
- the game server on <http://localhost:3001>
- the website (with instant reload while you edit) on <http://localhost:5173>

(You can also start them separately in two terminals with `npm run dev:server` and `npm run dev:client`.)

### Step 7: Open the website
Go to **<http://localhost:5173>**.

> 📱 **Phones on the same Wi-Fi:** the terminal shows a "Network" address such as `http://192.168.1.20:5173`. Open that address on your phone.

### Production mode on your computer (optional)

```bash
npm run build     # builds the website into client/dist
npm start         # one server on http://localhost:3001 serves website + game
```

---

## 3. Test with four browser windows (manual multiplayer test)

Each player needs their **own browser session**, because the reconnect token is stored per browser. Use any mix of:
- a normal window, an **incognito/private** window, a **different browser** (Chrome, Firefox, Edge, Safari), or a phone.

| # | Do this | You should see |
|---|---------|----------------|
| 1 | Window 1: **Create Private Room**, nickname "P1" | Lobby with a 6-character code, P1 in seat *Player 1* marked Host |
| 2 | Click **Copy Invite Link** | "Copied!" |
| 3 | Window 2: paste the link → enter "P2" → **Join Room** | Both windows show P2 in *Player 2* (Team B) |
| 4 | Window 3 and Window 4: join with the code on **Join Room** | 4/4 players; Team A = P1+P3, Team B = P2+P4 |
| 5 | Window 5 (extra): try to join | "This room is full (4 players)." |
| 6 | Everyone clicks **I'm Ready**; P1 clicks **Start Game** | Start is only enabled when all 4 are ready |
| 7 | Look at every window | Each player sees **only their own 4 cards**; others show card backs |
| 8 | Player on the dealer's (D) right picks trumps | Others see "Waiting for … to choose trumps"; then a big trump announcement; everyone now has 8 cards |
| 9 | Trump chooser leads; others follow | Only legal cards are highlighted; tapping an illegal one explains why. Tap once to select, tap again to play |
| 10 | Finish a trick | Winner's card glows, "… wins the trick", cards fly to the winner, the winner leads next |
| 11 | Play 8 tricks | Hand-result screen: tricks, tokens (1 / 2 / 3), draw bonus; next hand starts automatically with the next dealer |
| 12 | Mid-game, **close window 3** | Others see "disconnected" and "Game paused". Nobody can play |
| 13 | Re-open the site in window 3's browser (same browser!) and click "Return to your game" | P3 is back in the **same seat with the same cards**; the game continues on the same turn |
| 14 | Open the same game in a second tab of P3's browser | The older tab is told "You opened this game on another tab or device." |
| 15 | Keep playing to the target (choose 5 tokens in the lobby for a quick test) | Victory screen with winners, score, hands, Kapothis; **Rematch** needs all 4 votes and starts a fresh match without rejoining |
| 16 | Switch to **සිංහල** on the home page or in the in-game menu ☰ | All texts change language |

---

## 4. Put it on the internet

Omi needs a server that keeps **WebSocket connections open**. Static-only hosts (GitHub Pages, Netlify static, Vercel static) **cannot run the game server**. Use **Render** or **Railway**: both run the Node server, which also serves the website, so there's **one link** to share.

### 4a. Put the code on GitHub (needed by both)
1. Create a free account at <https://github.com>.
2. Create a **new repository** (e.g. `omi-friends`) and upload the project files.
   Do **not** upload `node_modules` or `.env`; `.gitignore` already skips them.
   Using the terminal:
   ```bash
   git init
   git add .
   git commit -m "OMI FRIENDS"
   git branch -M main
   git remote add origin https://github.com/YOUR-NAME/omi-friends.git
   git push -u origin main
   ```

### 4b. Option A: Render (recommended for beginners)
1. Create an account at <https://render.com> (you can log in with GitHub).
2. **New → Blueprint** → choose your repository. Render reads `render.yaml` and fills in everything. Click **Apply**.
   *Or by hand:* **New → Web Service** → your repo, then:
   - Runtime: **Node**
   - Build command: `npm install --include=dev && npm run build`
   - Start command: `npm start`
   - Environment variables: `NODE_ENV=production`, `TRUST_PROXY=1`
   - Health check path: `/healthz`
3. Wait for "Live". Your link looks like `https://omi-friends-xxxx.onrender.com`.

**Free plan limits (Render):** the free service *sleeps after about 15 minutes with no visitors*. The first visit after that takes up to about a minute to wake up. Rooms are kept in memory, so **a sleep or redeploy ends any games in progress**. Free instance hours are limited per month. For regular game nights, a small paid instance keeps it awake. Check Render's pricing page for current details.

### 4c. Option B: Railway
1. Create an account at <https://railway.com> (log in with GitHub).
2. **New Project → Deploy from GitHub repo** → pick your repo.
3. In the service **Settings**:
   - Build command: `npm run build`
   - Start command: `npm start`
   - Variables: `NODE_ENV=production`, `TRUST_PROXY=1`
4. **Settings → Networking → Generate Domain** to get your public `https://….up.railway.app` link.

**Railway pricing:** new accounts get limited trial credit; after that, you need a paid plan (usage-based, a few dollars a month for a small app like this). It does not sleep. Check Railway's pricing page for current details.

### 4d. Production WebSocket URL (usually nothing to do)
The website connects to the **same address it was loaded from**, so on Render/Railway it just works over **HTTPS + secure WebSockets (wss://)**.
Only if you host the website and the game server at *different* addresses:
- set `VITE_SERVER_URL=https://your-game-server.example.com` **before** `npm run build`, and
- set `CLIENT_ORIGIN=https://your-website.example.com` on the server.

### 4e. Check HTTPS and WSS
1. Open your link: the address bar shows a 🔒 padlock (HTTPS).
2. Open `https://YOUR-LINK/healthz`. You should see `{"ok":true,...}`.
3. Desktop Chrome: press F12 → **Network** → filter **WS** → create a room. You should see a `socket.io/?EIO=4&transport=websocket` connection with status **101**, using `wss://`.
4. Refresh a nested page such as `https://YOUR-LINK/how-to-play`. It must load, not show "Not Found".

### 4f. Share it
Send your link on WhatsApp, or create a room and use **Share on WhatsApp**, which sends the room's invite link.

---

## 5. Play on Android and iPhone

- **Android (Chrome):** open the link → on the home page tap **📲 Install app** (or browser menu ⋮ → *Install app / Add to Home screen*).
- **iPhone (Safari):** open the link → **Share** button → **Add to Home Screen**.
- The app opens full-screen with the OMI FRIENDS icon. Without internet it shows a friendly offline page. **Multiplayer always needs an internet connection.**
- Portrait works fine; turning the phone sideways gives a bigger table.

---

## 6. Automated tests

```bash
npm test
```

This runs **49 tests** (Node's built-in test runner via `tsx`), covering all 25 required cases and more:

| Required case | Test |
|---|---|
| 1 deck = 32 unique cards | `engine.test.ts` "1. a deck contains…" |
| 2 four cards before trumps | "2. every player receives four cards…" |
| 3 correct trump chooser | "3. the player to the dealer's right…" |
| 4–5 four more cards → eight each | "4 & 5. four more cards each…" |
| 6 counter-clockwise turns | "6. turns proceed counter-clockwise…" |
| 7 no playing out of turn | "7. a player cannot play out of turn" |
| 8 must follow suit | "8. a player must follow suit…" |
| 9 void player may play any card | "9. a void player may play any suit…" |
| 10 highest of led suit wins | "10. highest card of the led suit…" |
| 11 highest trump wins | "11. highest trump wins…" (rule examples 1–3) |
| 12 winner leads next | "12. the trick winner leads…" |
| 13 eight tricks per hand | "13. exactly eight tricks…" (25 random hands) |
| 14–16 scoring 1 / 2 / 3 | "14.", "15.", "16." |
| 17–18 draw bonus (single & multiple) | "17.", "18." |
| 19 match ends at target | `rooms.test.ts` "20 … 19. match ends at the target" (full matches to 5 and 10) |
| 20 dealer rotation | same test |
| 21 full room rejected | "21. joining a full room is rejected" |
| 22 reconnection restores seat | "22. reconnection restores the same seat…" |
| 23 no hidden-card leaks | "23. no player ever receives…" (scans every message of a full match) |
| 24 duplicate plays are harmless | "24. duplicate card-play messages…" |
| 25 disconnect mid-trick | "25. a disconnect during a trick…" |

`sockets.test.ts` also checks input validation, acknowledgements and rate limiting.

`npm run typecheck` runs the TypeScript compiler over server and client.

---

## 7. Game rules implemented

- **4 players, 2 teams:** Team A = Player 1 + 3, Team B = Player 2 + 4; partners sit opposite.
- **32 cards:** A K Q J 10 9 8 7 in ♠ ♥ ♦ ♣ (A highest). Shuffled on the server with Node's cryptographic random numbers (Fisher–Yates).
- **Dealing (counter-clockwise):** 4 cards each → the player on the **dealer's right** chooses trumps (any suit) → 4 more each.
- **Play:** the trump chooser leads; you must follow the led suit if you can; otherwise you may play anything.
- **Trick winner:** highest trump, otherwise the highest card of the led suit. The winner leads the next trick. 8 tricks per hand.
- **Scoring (tokens, never card points):**
  | Result | Tokens |
  |---|---|
  | Trump team wins 5–7 tricks | 1 |
  | Other team wins 5–7 tricks | 2 |
  | Kapothi: one team wins all 8 | 3 |
  | 4–4 draw | 0; +1 bonus token to the next hand that has a winner (draws stack) |
- **Dealer** moves one seat to the right after every hand (it also continues rotating into a rematch).
- **Match:** first team to **10** tokens (or **5** for a quick match) wins.
- **Optional "Announced Kapothi" rule** (off by default, host turns it on in the lobby): a team that wins the first 6 tricks may announce before trick 7. If they win all 8, they get 3 tokens (+ bonus). If they fail, the opponents get 4 (+ bonus). With this rule on, an *unannounced* 8–0 counts as a normal win.

---

## 8. How it works (for developers)

- **The server is the only authority.** Clients send intentions (`play_card {cardId}`); the server checks room, seat, turn, phase, card ownership and follow-suit, then updates the state. Clients never send scores, trick results or deals.
- **Privacy:** after every change, each player receives a personal snapshot (`room_updated`) with public table info plus **only their own hand** and their legal card ids. Other hands exist only in server memory. A test scans every message of a full match to prove nothing leaks.
- **Event contract:** see `shared/types.ts` (`ClientToServerEvents` / `ServerToClientEvents`). Every client request gets an acknowledgement `{ ok: true, data } | { ok: false, error: { code, message } }`. Extra notification events (`card_played`, `trick_completed`, `trump_selected`, `hand_completed`, `match_completed`, …) drive the animations and sounds.
- **No race conditions:** Node runs each message to completion on a single thread; turn checks make a repeated `play_card` harmless; buttons are locked while waiting for the server's answer.
- **Sessions:** creating or joining a room gives the browser a random 256-bit session token (only its SHA-256 hash is kept on the server). On reconnect, the token reclaims the same seat. A newer connection replaces the old one, so a player can't be connected twice.
- **Disconnects:** the seat and hand are kept; the game pauses. After `RECONNECT_TIMEOUT_MS`, the remaining players may all agree to end the game and return to the lobby. In the lobby, a disconnected player's seat is freed after `LOBBY_RECONNECT_TIMEOUT_MS`. The host role moves to another player if the host leaves or stays disconnected.
- **Cleanup:** rooms nobody is connected to are deleted after `ROOM_IDLE_TIMEOUT_MS`; joining them afterwards shows "Room expired".
- **Security:** nickname sanitising (16 chars max), 6-character codes from an unambiguous alphabet with collision checks, `zod` validation of every message, per-IP limits on create/join, per-socket message flood limit, origin check for WebSocket connections, small message size limit, no secrets in client code.
- **Scaling later:** `RoomManager` talks to the network only through a tiny `Transport` interface and keeps all state in plain objects, so it can later be moved to Redis or a database.

---

## 9. Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 3001 | Server port (Render/Railway set this) |
| `NODE_ENV` | development | Use `production` when deployed |
| `CLIENT_ORIGIN` | empty | Extra allowed website origins (only for split hosting) |
| `TRUST_PROXY` | off | Set `1` on Render/Railway so rate limits see real IPs |
| `RECONNECT_TIMEOUT_MS` | 180000 | In-game wait before others may abandon |
| `LOBBY_RECONNECT_TIMEOUT_MS` | 120000 | Lobby seat kept for a disconnected player |
| `HOST_TRANSFER_MS` | 15000 | Host role moves after the host is gone this long |
| `ROOM_IDLE_TIMEOUT_MS` | 1800000 | Delete rooms with nobody connected |
| `ROOM_MAX_AGE_MS` | 86400000 | Hard room lifetime |
| `TRICK_REVIEW_MS` | 1600 | How long a finished trick stays visible |
| `HAND_RESULT_MS` | 9000 | Hand-result screen before the next deal |
| `VITE_SERVER_URL` | empty | Client only: game server URL if different from the website |

Personal preferences (language, sound, animations, card back, table colour) are saved in each player's browser. Game rules (target, Kapothi rule) are room settings chosen by the host and enforced by the server.

---

## 10. Troubleshooting

- **"Connecting to the game server…" forever (local):** run `npm run dev` (not only `dev:client`); check the server terminal shows port 3001.
- **Port in use:** change `PORT` in `.env`, and the proxy target in `client/vite.config.ts`.
- **Phone can't open `localhost`:** use the computer's Network address (e.g. `http://192.168.1.20:5173`), on the same Wi-Fi.
- **Render first load is slow:** the free plan was asleep; wait about a minute.
- **Games ended suddenly after a deploy:** rooms live in server memory; redeploys and restarts clear them.
- **Two players in the same browser:** use an incognito window or a different browser. One browser keeps one seat per room.
- **Install button missing on iPhone:** use Safari → Share → Add to Home Screen.

Enjoy your Omi nights! 🇱🇰 🃏
