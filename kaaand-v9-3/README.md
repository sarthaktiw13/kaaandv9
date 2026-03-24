# KAAAND Magazine — Full-Stack Website

India's underground culture magazine. Built with Node.js/Express backend + vanilla HTML/CSS/JS frontend.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express.js |
| Frontend | Vanilla HTML/CSS/JS (no framework) |
| Rate Limiting | express-rate-limit |
| Security | Helmet.js |
| Data | JSON flat-file (swap for MongoDB/PostgreSQL in production) |
| Deployment | Vercel / Railway / Render |

---

## Setup

```bash
# Install dependencies
npm install

# Copy env file
cp .env.example .env

# Start development server
npm run dev

# Start production server
npm start
```

Server runs at → http://localhost:3000

---

## API Endpoints

| Method | Route | Description |
|---|---|---|
| GET | /api/articles | All articles |
| GET | /api/articles/:slug | Single article |
| GET | /api/brands | All brands |
| GET | /api/brands/:id | Single brand |
| GET | /api/tracks | Music tracks |
| GET | /api/stats | Site stats |
| POST | /api/submit | Submission form |
| POST | /api/newsletter | Newsletter signup |

---

## Deploy to Vercel

1. Push this folder to a GitHub repo
2. Go to vercel.com → Import Project
3. Set Environment Variables: `PORT`, `NODE_ENV=production`
4. Deploy

## Deploy to Railway

```bash
railway login
railway init
railway up
```

## Deploy to Render

1. Connect GitHub repo
2. Build Command: `npm install`
3. Start Command: `node server.js`
4. Add environment variables

---

## Content

Edit `data/content.json` to update articles, brands, and tracks.
Submissions are saved to `data/submissions.json`.
Newsletter signups saved to `data/newsletter.json`.

---

## Replace placeholder images

Drop your photos into `public/images/`:
- `dj-bw.jpg` — Cover hero
- `rave-red.jpg` — Editorial break
- `rave-purple.jpg` — Music break
- `desi-dj.jpg` — Music hero
- `kangan.jpg` — Brands break + article card
- `moscow-rave.jpg` — Manifesto

---

KAAAND — kaaand.xyz — Issue 00 — 2026
