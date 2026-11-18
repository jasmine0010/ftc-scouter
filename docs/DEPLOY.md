# Put the scouter online so every scout shares one dataset

The app is hosted free on **GitHub Pages**. Saves are shared through a small free **Cloudflare Worker** (`worker/`), which keeps the team's dataset in a Cloudflare Durable Object. Every phone still saves to its own storage first, so scouting keeps working with no signal. Phones sync after each save and every 30 seconds.

```
 phones ──HTTPS──▶ GitHub Pages  (the app: pages, scripts, field image)
   │
   └──HTTPS──▶ Cloudflare Worker /api/sync  (merges everyone's saves)
                    └─ Durable Object storage (the team dataset)
```

You need: a GitHub account, a free Cloudflare account, and this project on your computer with `npm ci` already run. Allow about 20 minutes.

---

## 1. Put the code on GitHub

1. On github.com, create a **new repository** named `ftc-scouter`. Make it **Public** (free GitHub Pages needs a public repository). Leave it **empty**: no README, licence or `.gitignore`.
2. Make sure your work is committed, then push it. Replace `YOUR-GITHUB-USERNAME`:

```bash
git remote add origin https://github.com/YOUR-GITHUB-USERNAME/ftc-scouter.git
```

```bash
git push -u origin master
```

Only code is pushed. Scouting data never goes into the repository: `.data/` is ignored, and the live data lives in Cloudflare.

## 2. Create the sync service on Cloudflare

1. Sign up at <https://dash.cloudflare.com/sign-up>. The free plan is enough.
2. In `wrangler.toml`, replace `YOUR-GITHUB-USERNAME` in `ALLOWED_ORIGINS` with your GitHub username, e.g. `https://jdoe.github.io`. This is the only site allowed to sync.
3. In the project folder, log in. A browser window opens; approve it.

```bash
npx wrangler login
```

4. Build the app and deploy the Worker. The first time, Cloudflare asks you to choose a `workers.dev` subdomain.

```bash
npm run build
```

```bash
npx wrangler deploy
```

It prints the Worker's address, like `https://curiosity-scout-sync.YOUR-SUBDOMAIN.workers.dev`. **Copy it.**

5. Set the **team code**: a passcode scouts type each time they open the site. Pick something not easy to guess, and share it only with your scouts.

```bash
npx wrangler secret put TEAM_CODE
```

6. *(Optional)* To keep "Import from FTC Events API" working, add your FIRST API credentials as secrets too:

```bash
npx wrangler secret put FTC_API_USERNAME
```

```bash
npx wrangler secret put FTC_API_TOKEN
```

**Check it:** open `https://curiosity-scout-sync.YOUR-SUBDOMAIN.workers.dev/api/sync` in a browser. You should see `{"error":"POST required"}`. That means it's running.

## 3. Turn on GitHub Pages

1. In the repository on GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables tab → New repository variable**:
   - Name: `SYNC_API_BASE`
   - Value: the Worker address from step 2.4, with **no** trailing slash and **no** `/api`, e.g. `https://curiosity-scout-sync.YOUR-SUBDOMAIN.workers.dev`
3. **Actions tab → Deploy to GitHub Pages → Run workflow**. Later pushes to `master` deploy automatically. The workflow runs the tests first and only publishes if they pass.
4. After about a minute the app is live at `https://YOUR-GITHUB-USERNAME.github.io/ftc-scouter/`.

**Check it:** open `https://YOUR-GITHUB-USERNAME.github.io/ftc-scouter/config.json`. It should show your Worker address.

## 4. Set up each scout's phone

1. Open `https://YOUR-GITHUB-USERNAME.github.io/ftc-scouter/` and add it to the home screen (Share → Add to Home Screen on iPhone; ⋮ → Add to Home screen on Android). Opening it once while online also caches it for offline use.
2. Every time the site is opened or reloaded, a popup asks for the **team code**. It is never saved on the device.
3. The dot next to ⚙ shows the sync state; **Synced** means the phone is sharing with everyone.

Every phone must use **this exact address**. The browser keeps saved data separately per address, so `localhost`, `127.0.0.1` and the Pages address each have their own data.

## 5. Bring over data you already have

Data on your laptop at `http://127.0.0.1:…` belongs to that address and won't appear on the Pages site by itself:

1. On the old address: **Event data → Export all JSON**.
2. On the Pages site (team code entered): **Event data → Merge another scout's file**, and choose that file. It merges, then syncs to everyone.

## Day to day

| What changed | What to do |
|---|---|
| App code (`src/`, `public/`) | Push to `master`; Pages redeploys automatically. Phones pick it up after a reload or two. |
| Worker or merge logic (`worker/`, `src/storage.ts`, `src/data-cleanup.ts`) | `npm run build`, then `npx wrangler deploy` |
| New team code | `npx wrangler secret put TEAM_CODE`, then give scouts the new code |
| Backup | Event data → **Export all JSON**, e.g. after each event day |

## Troubleshooting

| Sync dot says | Meaning / fix |
|---|---|
| **Wrong team code** | The code was cancelled or mistyped. Reload the app; the popup asks again. Codes are case-sensitive. Saves stay on the device and sync once the right code is entered. |
| **Local · sync pending** | No connection to the Worker. Check signal; check that `config.json` shows the right address; open the Worker's `/api/sync` to confirm it's running. Retries every 30 seconds. |
| Sync fails only on the Pages site, and the browser console mentions CORS | `ALLOWED_ORIGINS` in `wrangler.toml` doesn't match `https://YOUR-GITHUB-USERNAME.github.io` exactly. Fix it and `npx wrangler deploy`. |

## Limits and cost

- Cloudflare's free plan allows 100,000 requests a day. Ten phones syncing every 30 seconds for an 8-hour event day is about 10,000.
- Each phone sends its whole dataset when it syncs, robot photos included. Weak venue internet may make syncs slow, but saves stay on the phone until they get through.
- If two scouts edit the **same** record, the later edit wins. Keep phone clocks set automatically.
- There are no individual logins: anyone with the team code can read and change the team's data.

## Local server still works

`npm start` still serves the app and its own `/api/sync` from this computer, with no Cloudflare involved. Set a `TEAM_CODE` environment variable before `npm start` to require the same passcode there.
