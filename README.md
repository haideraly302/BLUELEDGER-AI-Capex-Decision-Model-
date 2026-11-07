# BlueLedger AI

A capex decision tool for farm machinery purchases, built for Hack the Harvest.
Walks a farm manager through a purchase (price, import duty, shipping, workforce,
training, running costs), auto-fills current Australian government rates
(import duty, GST, RBA cash rate, term-deposit rate, Fair Work Award wage) via
a live web-search-enabled Claude call, then computes NPV, IRR, payback and a
plain-English AI recommendation, including a comparison against just leaving
the money in the bank.

## 1. Get the code

```bash
git clone https://github.com/<your-github-username>/blueledger-app.git
cd blueledger-app
```

## 2. Requirements

- [Node.js](https://nodejs.org) version 18 or later (check with `node -v`)
- An Anthropic API key from <https://console.anthropic.com/settings/keys>

## 3. Setup (one time)

Open this folder in VS Code, then in the integrated terminal:

```bash
npm install
cp .env.example .env
```

Open the new `.env` file and paste your API key:

```
ANTHROPIC_API_KEY=sk-ant-...your-key...
```

> `.env` is listed in `.gitignore` and is never committed to this repo —
> each person who runs the project needs to create their own from
> `.env.example` and add their own key. Never commit a real key.

## 4. Run it

```bash
npm run dev
```

This starts **two things at once** (via `concurrently`):

- the local API proxy on `http://localhost:3001` (keeps your API key on the
  server, never in the browser)
- the Vite dev server on `http://localhost:5173`

Open **http://localhost:5173** in your browser. That's it — every time you
want to run the app, it's just `npm run dev`.

Without a working API key, the auto-fill and recommendation areas use clearly
labelled demo responses, so the whole prototype remains presentable. Add a
valid key when you want live research and tailored Claude responses.

## 5. How it's wired together

```
Browser (React app)  →  /api/claude  →  server/index.js  →  api.anthropic.com
     src/App.jsx           (Vite proxy)     (Express)         (your API key)
```

The browser never talks to Anthropic directly or sees your API key — it calls
`/api/claude` on the same origin, Vite proxies that to the Express server on
port 3001, and the server attaches your key from `.env` before forwarding the
request. This is required because the Anthropic API doesn't accept direct
browser calls with a bare API key, and it also keeps your key out of the
client-side JavaScript bundle.

## 6. Project structure

```
blueledger-app/
├─ server/index.js       ← Express proxy to the Anthropic API
├─ src/
│  ├─ App.jsx            ← the whole app (wizard, charts, calculations)
│  ├─ main.jsx           ← React entry point
│  └─ index.css          ← Tailwind
├─ index.html
├─ vite.config.js        ← dev-server proxy config
├─ tailwind.config.js
├─ postcss.config.js
├─ .env.example          ← copy to .env and add your key
├─ .gitignore
└─ package.json
```

`node_modules/` and `dist/` are not part of the repo — `node_modules/` is
recreated by `npm install` and `dist/` by `npm run build`.

## 7. Building for production

```bash
npm run build     # outputs static files to dist/
npm run preview   # serve the production build locally on :4173
```

The Express server (`npm run server`) still needs to run separately if you
want `/api/claude` to work against the production build.

## 8. Troubleshooting

- **"AI Investment Read" or auto-fill never finishes / shows an error** —
  check the terminal running `npm run dev`. If you see
  `⚠️ No ANTHROPIC_API_KEY found`, your `.env` file is missing or the key
  wasn't pasted in.
- **Port already in use** — something else is using 5173 or 3001. Stop it, or
  change `PORT` in `.env` and the proxy target in `vite.config.js` to match.
- **Blank page** — make sure `npm install` finished without errors, then
  restart `npm run dev`.

## 9. Notes

- Government-sourced figures (import duty, GST, RBA rates, Award wages) are
  fetched live by Claude via web search and are AI-researched estimates for
  demonstration purposes — verify against ABF, ATO, RBA and Fair Work directly
  before committing real capital.
- This is a prototype, not financial, tax, customs or legal advice.
