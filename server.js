/**
 * KAAAND Magazine — Server v3
 * Security hardened. All sections functional.
 * Pure Node.js — zero dependencies.
 */
'use strict';

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const url    = require('url');
const crypto = require('crypto');

const PORT   = process.env.PORT || 3000;
const ROOT   = __dirname;
const DATA   = path.join(ROOT, 'data');
const PUB    = path.join(ROOT, 'public');
const ASSETS = path.join(PUB,  'assets');
const ENV    = process.env.NODE_ENV || 'development';
const IS_PROD = ENV === 'production';

// ── ENSURE DIRS ────────────────────────────────────────────
[DATA, ASSETS,
  path.join(ASSETS,'images'), path.join(ASSETS,'fonts'),
  path.join(ASSETS,'tokens'), path.join(ASSETS,'templates'),
].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ── ADMIN KEY ──────────────────────────────────────────────
const ADMIN_KEY = process.env.ADMIN_KEY || crypto.randomBytes(24).toString('hex');
if (!process.env.ADMIN_KEY) {
  // Only print partial key — full key must be set via env var in production
  console.log(`\n  🔑 Admin key (first 8 chars): ${ADMIN_KEY.slice(0,8)}...`);
  console.log(`  Set ADMIN_KEY env var on Railway to make permanent.\n`);
}

// ── MIME TYPES ─────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg':  'image/jpeg', '.jpeg': 'image/jpeg',
  '.png':  'image/png',  '.gif':  'image/gif',
  '.webp': 'image/webp', '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',  '.woff2': 'font/woff2',
  '.ttf':  'font/ttf',   '.otf':   'font/otf',
  '.pdf':  'application/pdf',
  '.csv':  'text/csv; charset=utf-8',
  '.mp3':  'audio/mpeg', '.mp4':   'video/mp4',
};

// ── SECURITY HEADERS ───────────────────────────────────────
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "frame-src https://open.spotify.com https://www.youtube.com",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

function setSecurityHeaders(res, isHTML = false) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  if (isHTML) res.setHeader('Content-Security-Policy', CSP);
  if (IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  // Never reveal server details
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');
}

// ── RATE LIMITER ───────────────────────────────────────────
const RL = new Map();
function limit(key, windowMs, max) {
  const now = Date.now();
  const e   = RL.get(key) || { c: 0, r: now + windowMs };
  if (now > e.r) { e.c = 0; e.r = now + windowMs; }
  e.c++;
  RL.set(key, e);
  return e.c <= max;
}
// Cleanup every 5 min
setInterval(() => { const n = Date.now(); for (const [k,v] of RL.entries()) if (n > v.r) RL.delete(k); }, 300_000);

// ── HELPERS ────────────────────────────────────────────────
const rdj = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const wrj = (f, d) => {
  const dir = path.dirname(f);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // Atomic write via temp file
  const tmp = f + '.tmp.' + Date.now();
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
  fs.renameSync(tmp, f);
};

// Strong sanitisation — strip ALL HTML/script content, not just angle brackets
function san(s, max = 500) {
  if (s == null) return '';
  return String(s)
    .replace(/<[^>]*>/g, '')           // strip HTML tags
    .replace(/javascript:/gi, '')      // strip JS URIs
    .replace(/on\w+\s*=/gi, '')        // strip event handlers
    .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '') // strip control chars
    .trim()
    .slice(0, max);
}

const isEmail = e => /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(String(e || '').trim());

function jsn(res, d, status = 200) {
  const body = JSON.stringify(d);
  res.writeHead(status, {
    'Content-Type':   'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control':  'no-store, no-cache',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}
const badReq  = (res, msg)       => jsn(res, { error: msg }, 400);
const unauth  = (res)            => jsn(res, { error: 'Unauthorized' }, 401);
const notFound= (res, msg='Not found') => jsn(res, { error: msg }, 404);
const tooMany = (res)            => jsn(res, { error: 'Too many requests. Try again later.' }, 429);
const srvErr  = (res, msg='Server error') => jsn(res, { error: msg }, 500);

// ── AUTH ───────────────────────────────────────────────────
function requireAdmin(req, res) {
  const auth = (req.headers['authorization'] || req.headers['x-admin-key'] || '')
    .replace(/^bearer\s+/i, '').trim();
  // Constant-time comparison to prevent timing attacks
  if (!auth || !ADMIN_KEY) { unauth(res); return false; }
  const a = Buffer.from(auth.padEnd(64).slice(0, 64));
  const b = Buffer.from(ADMIN_KEY.padEnd(64).slice(0, 64));
  if (!crypto.timingSafeEqual(a, b)) { unauth(res); return false; }
  return true;
}

// ── BODY PARSERS ───────────────────────────────────────────
function parseJSON(req, maxSize = 50_000) {
  return new Promise((ok, fail) => {
    let body = '', size = 0;
    req.setTimeout(10_000, () => { req.destroy(); fail(new Error('Timeout')); });
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxSize) { req.destroy(); fail(new Error(`Body too large (max ${maxSize / 1000}KB)`)); return; }
      body += chunk.toString('utf8');
    });
    req.on('end', () => {
      try { ok(JSON.parse(body)); }
      catch { fail(new Error('Invalid JSON')); }
    });
    req.on('error', fail);
  });
}

function parseForm(req, maxSize = 50_000) {
  return new Promise((ok, fail) => {
    let body = '', size = 0;
    req.setTimeout(10_000, () => { req.destroy(); fail(new Error('Timeout')); });
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxSize) { req.destroy(); fail(new Error('Body too large')); return; }
      body += chunk.toString('utf8');
    });
    req.on('end', () => {
      try {
        const ct = req.headers['content-type'] || '';
        if (ct.includes('application/json')) ok(JSON.parse(body));
        else if (ct.includes('urlencoded')) {
          const p = new URLSearchParams(body), o = {};
          for (const [k, v] of p) o[k] = v;
          ok(o);
        } else ok({});
      } catch { fail(new Error('Bad body')); }
    });
    req.on('error', fail);
  });
}

function parseBinary(req, maxSize = 25 * 1024 * 1024) {
  return new Promise((ok, fail) => {
    const chunks = [];
    let total = 0;
    req.setTimeout(30_000, () => { req.destroy(); fail(new Error('Upload timeout')); });
    req.on('data', chunk => {
      total += chunk.length;
      if (total > maxSize) { req.destroy(); fail(new Error(`File too large (max ${maxSize / 1024 / 1024}MB)`)); return; }
      chunks.push(chunk);
    });
    req.on('end',  () => ok(Buffer.concat(chunks)));
    req.on('error', fail);
  });
}

// ── MULTIPART PARSER ───────────────────────────────────────
function parseMultipart(buf, boundary) {
  const sep   = Buffer.from('\r\n--' + boundary);
  const first = Buffer.from('--' + boundary + '\r\n');
  const last  = Buffer.from('--' + boundary + '--');
  const parts = [];
  let pos = buf.indexOf(first);
  if (pos === -1) return parts;
  pos += first.length;
  while (pos < buf.length) {
    if (buf.slice(pos, pos + last.length).equals(last)) break;
    const hEnd = buf.indexOf('\r\n\r\n', pos);
    if (hEnd === -1) break;
    const headers  = buf.slice(pos, hEnd).toString('utf8');
    pos = hEnd + 4;
    const nextSep  = buf.indexOf(sep, pos);
    const dataEnd  = nextSep === -1 ? buf.length : nextSep;
    const data     = buf.slice(pos, dataEnd);
    const nameM    = headers.match(/[Nn]ame="([^"]+)"/);
    const fileM    = headers.match(/[Ff]ilename="([^"]+)"/);
    const ctM      = headers.match(/[Cc]ontent-[Tt]ype:\s*(\S+)/);
    parts.push({
      name:        nameM ? nameM[1] : null,
      filename:    fileM ? fileM[1] : null,
      contentType: ctM   ? ctM[1].trim() : 'application/octet-stream',
      data,
    });
    if (nextSep === -1) break;
    pos = nextSep + sep.length + 2;
  }
  return parts;
}

// ── STATIC FILE SERVER ─────────────────────────────────────
function serveFile(res, filePath, reqEtag) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return;
    const ext    = path.extname(filePath).toLowerCase();
    const mime   = MIME[ext] || 'application/octet-stream';
    const etag   = `"${crypto.createHash('md5').update(stat.mtime.toISOString() + stat.size).digest('hex').slice(0,12)}"`;
    const maxAge = ext === '.html' ? 0 : (ext === '.jpg' || ext === '.png' || ext === '.webp') ? 604800 : 86400;

    if (reqEtag === etag) {
      res.writeHead(304, { ETag: etag });
      return res.end();
    }

    setSecurityHeaders(res, ext === '.html');
    res.writeHead(200, {
      'Content-Type':  mime,
      'Content-Length': stat.size,
      'ETag':          etag,
      'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-cache',
    });
    fs.createReadStream(filePath).on('error', () => res.end()).pipe(res);
  });
}

// ── ROUTER ─────────────────────────────────────────────────
const routes = [];
const route  = (method, pattern, handler) =>
  routes.push({ method, pattern: new RegExp('^' + pattern + '$'), handler });

// ═══════════════════════════════════════════════════════════
//  CONTENT API
// ═══════════════════════════════════════════════════════════

route('GET', '/api/articles', (req, res, _, q) => {
  const c = rdj(path.join(DATA, 'content.json'));
  if (!c) return jsn(res, { error: 'Content unavailable' }, 503);
  let arts = c.articles.map(a => ({
    id: a.id, slug: a.slug, title: a.title, subtitle: a.subtitle,
    category: a.category, author: a.author, date: a.date,
    readTime: a.readTime, featured: a.featured, image: a.image,
    tags: a.tags, lead: a.lead,
  }));
  if (q.category && q.category !== 'all')
    arts = arts.filter(a => a.category.toLowerCase() === q.category.toLowerCase());
  if (q.limit) arts = arts.slice(0, Math.min(parseInt(q.limit) || 10, 50));
  jsn(res, { articles: arts, total: arts.length });
});

route('GET', '/api/articles/([\\w-]{1,80})', (req, res, p) => {
  const c = rdj(path.join(DATA, 'content.json'));
  if (!c) return jsn(res, { error: 'Unavailable' }, 503);
  const a = c.articles.find(x => x.slug === p[0]);
  if (!a) return notFound(res, 'Article not found');
  jsn(res, a);
});

route('GET', '/api/brands', (req, res) => {
  const c = rdj(path.join(DATA, 'content.json'));
  if (!c) return jsn(res, { error: 'Unavailable' }, 503);
  jsn(res, { brands: c.brands, total: c.brands.length });
});

route('GET', '/api/brands/([\\w-]{1,60})', (req, res, p) => {
  const c = rdj(path.join(DATA, 'content.json'));
  if (!c) return jsn(res, { error: 'Unavailable' }, 503);
  const b = c.brands.find(x => x.id === p[0]);
  if (!b) return notFound(res, 'Brand not found');
  jsn(res, b);
});

route('GET', '/api/tracks', (req, res) => {
  const c = rdj(path.join(DATA, 'content.json'));
  if (!c) return jsn(res, { error: 'Unavailable' }, 503);
  jsn(res, { tracks: c.tracks, total: c.tracks.length });
});

route('GET', '/api/stats', (req, res) => {
  const c  = rdj(path.join(DATA, 'content.json'))    || {};
  const s  = rdj(path.join(DATA, 'submissions.json')) || [];
  const n  = rdj(path.join(DATA, 'newsletter.json'))  || [];
  const an = rdj(path.join(DATA, 'analytics.json'))   || [];
  const o  = rdj(path.join(DATA, 'orders.json'))      || [];
  const am = rdj(path.join(DATA, 'assets.json'))       || {};
  jsn(res, {
    articles:    (c.articles || []).length,
    brands:      (c.brands   || []).length,
    tracks:      (c.tracks   || []).length,
    submissions: s.length,
    subscribers: n.length,
    pageviews:   an.filter(x => x.type === 'pageview').length,
    events:      an.filter(x => x.type === 'event').length,
    orders:      o.length,
    assets:      (am.images || []).length + (am.fonts || []).length + (am.templates || []).length,
    uptime:      Math.floor(process.uptime()),
  });
});

// ── SUBMIT ─────────────────────────────────────────────────
route('POST', '/api/submit', async (req, res, _, __, ip) => {
  if (!limit(ip + ':submit', 3_600_000, 5)) return tooMany(res);
  let b;
  try { b = await parseForm(req); }
  catch (e) { return badReq(res, e.message); }

  const name    = san(b.name, 100);
  const email   = san(b.email, 200).toLowerCase();
  const type    = san(b.type, 100);
  const message = san(b.message, 2000);

  if (!name || !email || !type || !message) return badReq(res, 'All fields are required.');
  if (!isEmail(email)) return badReq(res, 'Invalid email address.');
  if (name.length < 2)    return badReq(res, 'Name too short.');
  if (message.length < 10) return badReq(res, 'Message too short (min 10 chars).');

  const VALID_TYPES = ['Fashion Editorial','Written Essay','Photography','Brand Profile','Music / Rave Culture','Illustration','Other'];
  if (!VALID_TYPES.includes(type)) return badReq(res, 'Invalid submission type.');

  const fp   = path.join(DATA, 'submissions.json');
  const list = rdj(fp) || [];
  list.push({
    id: crypto.randomUUID(), name, email, type, message,
    timestamp: new Date().toISOString(), source: 'website',
  });
  wrj(fp, list);
  console.log(`📬 ${name} — ${type}`);
  jsn(res, { success: true, message: "Submission received. We'll be in touch." });
});

// ── NEWSLETTER ─────────────────────────────────────────────
route('POST', '/api/newsletter', async (req, res, _, __, ip) => {
  if (!limit(ip + ':newsletter', 3_600_000, 10)) return tooMany(res);
  let b;
  try { b = await parseForm(req); }
  catch (e) { return badReq(res, e.message); }

  const email  = san(b.email, 200).toLowerCase();
  const source = san(b.source || 'website', 50);
  if (!email || !isEmail(email)) return badReq(res, 'Valid email required.');

  const fp   = path.join(DATA, 'newsletter.json');
  const list = rdj(fp) || [];
  if (list.some(e => e.email === email)) return jsn(res, { error: 'Already subscribed.' }, 409);

  list.push({ id: crypto.randomUUID(), email, source, timestamp: new Date().toISOString() });
  wrj(fp, list);
  console.log(`📧 newsletter signup [${source}]`);
  jsn(res, { success: true, message: "You're on the list." });
});

// ── ANALYTICS ──────────────────────────────────────────────
route('POST', '/api/track', async (req, res, _, __, ip) => {
  if (!limit(ip + ':track', 60_000, 60)) return jsn(res, { ok: true }); // silent drop, not error
  let b;
  try { b = await parseForm(req, 5_000); }
  catch { return jsn(res, { ok: true }); }

  const type     = san(b.type || 'pageview', 20);
  const pagePath = san(b.path || '/', 300);
  const referrer = san(b.referrer || '', 300);
  const evt      = san(b.event || '', 100);

  // Anonymise IP immediately — never store raw IP
  const anonIp = crypto.createHash('sha256').update(ip + 'kaaand-salt').digest('hex').slice(0, 12);

  const fp   = path.join(DATA, 'analytics.json');
  const list = rdj(fp) || [];
  list.push({ id: crypto.randomUUID(), type, path: pagePath, referrer, event: evt || undefined, ip: anonIp, timestamp: new Date().toISOString() });

  // Rolling 30-day window, max 50K records
  const cutoff  = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const trimmed = list.filter(x => new Date(x.timestamp).getTime() > cutoff).slice(-50_000);
  wrj(fp, trimmed);
  jsn(res, { ok: true });
});

route('GET', '/api/analytics', (req, res, _, q) => {
  if (!requireAdmin(req, res)) return;
  const list   = rdj(path.join(DATA, 'analytics.json')) || [];
  const days   = Math.min(parseInt(q.days || 7), 90);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const recent = list.filter(x => new Date(x.timestamp).getTime() > cutoff);

  const byDay = {};
  recent.forEach(x => {
    const d = x.timestamp.slice(0, 10);
    byDay[d] = byDay[d] || { date: d, pageviews: 0, events: 0 };
    if (x.type === 'pageview') byDay[d].pageviews++;
    else byDay[d].events++;
  });

  const pathCount = {}, refCount = {};
  recent.filter(x => x.type === 'pageview').forEach(x => { pathCount[x.path] = (pathCount[x.path] || 0) + 1; });
  recent.filter(x => x.referrer).forEach(x => {
    try { const r = new URL('https://' + x.referrer).hostname; refCount[r] = (refCount[r] || 0) + 1; }
    catch { refCount[x.referrer] = (refCount[x.referrer] || 0) + 1; }
  });

  jsn(res, {
    total:     recent.length,
    pageviews: recent.filter(x => x.type === 'pageview').length,
    events:    recent.filter(x => x.type === 'event').length,
    days:      Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
    topPaths:  Object.entries(pathCount).sort((a,b) => b[1]-a[1]).slice(0,10).map(([p,c]) => ({ path: p, views: c })),
    topRefs:   Object.entries(refCount).sort((a,b) => b[1]-a[1]).slice(0,10).map(([r,c]) => ({ referrer: r, count: c })),
    period:    `${days}d`,
  });
});

// ── ORDERS ─────────────────────────────────────────────────
route('POST', '/api/orders', async (req, res, _, __, ip) => {
  if (!limit(ip + ':orders', 3_600_000, 10)) return tooMany(res);
  let b;
  try { b = await parseForm(req); }
  catch (e) { return badReq(res, e.message); }

  const email = san(b.email, 200).toLowerCase();
  const name  = san(b.name  || '', 100);
  const item  = san(b.item  || '', 100);
  if (!email || !isEmail(email)) return badReq(res, 'Valid email required.');

  const fp   = path.join(DATA, 'orders.json');
  const list = rdj(fp) || [];
  const rec  = { id: crypto.randomUUID(), email, name, item, status: 'pending_launch', timestamp: new Date().toISOString() };
  list.push(rec);
  wrj(fp, list);

  // Auto-subscribe to newsletter
  const nfp  = path.join(DATA, 'newsletter.json');
  const nl   = rdj(nfp) || [];
  if (!nl.some(e => e.email === email)) {
    nl.push({ id: crypto.randomUUID(), email, source: 'shop', timestamp: new Date().toISOString() });
    wrj(nfp, nl);
  }

  console.log(`🛍️  Order: ${item || 'unknown'}`);
  jsn(res, { success: true, message: "We'll notify you when the shop opens.", orderId: rec.id });
});

route('GET', '/api/orders', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const list = rdj(path.join(DATA, 'orders.json')) || [];
  jsn(res, { orders: list, total: list.length });
});

// ── ASSETS (Antigravity) ───────────────────────────────────
const ALLOWED_ASSET_EXTS = new Set([
  '.jpg','.jpeg','.png','.gif','.webp','.svg',
  '.woff','.woff2','.ttf','.otf',
  '.json','.pdf','.html','.css',
]);

route('GET', '/api/assets', (req, res, _, q) => {
  const m = rdj(path.join(DATA, 'assets.json')) || { images:[], fonts:[], tokens:{}, templates:[] };
  if (q.category && ['images','fonts','tokens','templates'].includes(q.category)) {
    return jsn(res, { assets: m[q.category] || [], category: q.category });
  }
  jsn(res, { ...m, total: (m.images||[]).length + (m.fonts||[]).length + (m.templates||[]).length });
});

route('GET', '/api/assets/tokens', (req, res) => {
  const m = rdj(path.join(DATA, 'assets.json')) || {};
  jsn(res, m.tokens || {});
});

route('POST', '/api/assets/upload', async (req, res, _, __, ip) => {
  if (!requireAdmin(req, res)) return;
  if (!limit(ip + ':upload', 60_000, 20)) return tooMany(res);

  const ct       = req.headers['content-type'] || '';
  const boundaryM = ct.match(/boundary=([^\s;]+)/);
  if (!boundaryM) return badReq(res, 'Expected multipart/form-data with boundary');
  const boundary = boundaryM[1].trim().replace(/^"|"$/g, '');

  let buf;
  try { buf = await parseBinary(req); }
  catch (e) { return badReq(res, e.message); }

  const parts    = parseMultipart(buf, boundary);
  const manifest = rdj(path.join(DATA, 'assets.json')) || { images:[], fonts:[], tokens:{}, templates:[] };
  const uploaded = [];

  for (const part of parts) {
    if (!part.filename || !part.data.length) continue;

    // Strict filename sanitisation
    const fname = path.basename(part.filename)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 120);
    const ext = path.extname(fname).toLowerCase();

    // Whitelist extension
    if (!ALLOWED_ASSET_EXTS.has(ext)) {
      console.log(`Skipped disallowed extension: ${ext}`);
      continue;
    }

    // Prevent path traversal via filename
    if (fname.includes('..') || fname.startsWith('.')) continue;

    let category = 'templates';
    if (['.jpg','.jpeg','.png','.gif','.webp','.svg'].includes(ext)) category = 'images';
    else if (['.woff','.woff2','.ttf','.otf'].includes(ext))         category = 'fonts';
    else if (ext === '.json')                                         category = 'tokens';

    if (category === 'tokens') {
      try {
        const tokens = JSON.parse(part.data.toString('utf8'));
        // Only allow plain string/number values in tokens
        const safe = {};
        for (const [k, v] of Object.entries(tokens)) {
          if (typeof v === 'string' || typeof v === 'number') {
            safe[san(k, 50)] = san(String(v), 100);
          }
        }
        manifest.tokens = { ...manifest.tokens, ...safe };
        fs.writeFileSync(path.join(ASSETS, 'tokens', fname), JSON.stringify(safe, null, 2));
        uploaded.push({ filename: fname, category: 'tokens', size: part.data.length });
      } catch (e) { console.error('Token parse error:', e.message); }
      continue;
    }

    const dest = path.join(ASSETS, category, fname);
    fs.writeFileSync(dest, part.data);

    const record = {
      filename: fname,
      url: `/assets/${category}/${fname}`,
      size: part.data.length,
      contentType: part.contentType,
      uploadedAt: new Date().toISOString(),
    };
    const arr = manifest[category] || [];
    const idx = arr.findIndex(x => x.filename === fname);
    if (idx >= 0) arr[idx] = record; else arr.push(record);
    manifest[category] = arr;
    uploaded.push({ filename: fname, category, url: record.url, size: part.data.length });
  }

  wrj(path.join(DATA, 'assets.json'), manifest);
  console.log(`🎨 Asset upload: ${uploaded.length} files`);
  jsn(res, { success: true, uploaded, total: uploaded.length });
});

route('DELETE', '/api/assets/([a-z]+)/([\\w._-]{1,120})', async (req, res, p) => {
  if (!requireAdmin(req, res)) return;
  const [, category, filename] = p;
  if (!['images','fonts','tokens','templates'].includes(category)) return badReq(res, 'Invalid category');
  if (filename.includes('..') || filename.startsWith('.')) return badReq(res, 'Invalid filename');

  const fp = path.join(ASSETS, category, filename);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);

  const m = rdj(path.join(DATA, 'assets.json')) || { images:[], fonts:[], tokens:{}, templates:[] };
  m[category] = (m[category] || []).filter(x => x.filename !== filename);
  wrj(path.join(DATA, 'assets.json'), m);
  jsn(res, { success: true, deleted: filename });
});

// ── STITCH EXPORT ──────────────────────────────────────────
route('GET', '/api/stitch/export', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const subs = rdj(path.join(DATA, 'submissions.json')) || [];
  const nl   = rdj(path.join(DATA, 'newsletter.json'))  || [];
  const ords = rdj(path.join(DATA, 'orders.json'))      || [];
  const an   = rdj(path.join(DATA, 'analytics.json'))   || [];

  const mk = (stream, props) => ({ type:'SCHEMA', stream, key_properties:['id'], schema:{ properties:props } });
  const mr = (stream, rec)   => ({ type:'RECORD', stream, record:rec, time_extracted: new Date().toISOString() });

  const lines = [
    mk('submissions',  { id:{type:'string'}, name:{type:'string'}, email:{type:'string'}, type:{type:'string'}, message:{type:'string'}, timestamp:{type:'string'} }),
    ...subs.map(r => mr('submissions', r)),
    mk('newsletter',   { id:{type:'string'}, email:{type:'string'}, source:{type:'string'}, timestamp:{type:'string'} }),
    ...nl.map(r => mr('newsletter', r)),
    mk('orders',       { id:{type:'string'}, email:{type:'string'}, name:{type:'string'}, item:{type:'string'}, status:{type:'string'}, timestamp:{type:'string'} }),
    ...ords.map(r => mr('orders', r)),
    mk('analytics',    { id:{type:'string'}, type:{type:'string'}, path:{type:'string'}, referrer:{type:'string'}, timestamp:{type:'string'} }),
    ...an.slice(-5000).map(r => mr('analytics', r)),
  ];

  const body = lines.map(l => JSON.stringify(l)).join('\n');
  res.writeHead(200, { 'Content-Type':'application/x-ndjson; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control':'no-store' });
  res.end(body);
});

route('GET', '/api/stitch/export\\.csv', (req, res, _, q) => {
  if (!requireAdmin(req, res)) return;
  const col     = q.collection || 'submissions';
  const ALLOWED = ['submissions','newsletter','orders'];
  if (!ALLOWED.includes(col)) return badReq(res, 'Invalid collection');

  const list = rdj(path.join(DATA, col + '.json')) || [];
  if (!list.length) { res.writeHead(200,{'Content-Type':'text/csv'}); return res.end('id\n'); }

  const keys = Object.keys(list[0]);
  const rows = list.map(r => keys.map(k => `"${String(r[k]||'').replace(/"/g,'""')}"`).join(','));
  const csv  = [keys.join(','), ...rows].join('\n');

  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${col}.csv"`,
    'Content-Length': Buffer.byteLength(csv),
  });
  res.end(csv);
});

route('POST', '/api/webhooks/stitch', async (req, res) => {
  const secret = process.env.STITCH_SECRET;
  let payload;
  if (secret) {
    const buf = await parseBinary(req, 1_000_000);
    const sig = req.headers['x-stitch-signature'] || '';
    const exp = 'sha256=' + crypto.createHmac('sha256', secret).update(buf).digest('hex');
    const sigBuf = Buffer.from(sig.padEnd(100).slice(0,100));
    const expBuf = Buffer.from(exp.padEnd(100).slice(0,100));
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return jsn(res, { error: 'Invalid signature' }, 403);
    try { payload = JSON.parse(buf.toString()); } catch { return badReq(res, 'Invalid JSON'); }
  } else {
    try { payload = await parseForm(req, 1_000_000); } catch (e) { return badReq(res, e.message); }
  }
  const fp   = path.join(DATA, 'stitch_webhooks.json');
  const list = (rdj(fp) || []).slice(-999); // keep last 1000
  list.push({ ...payload, receivedAt: new Date().toISOString() });
  wrj(fp, list);
  console.log('🔗 Stitch webhook received');
  jsn(res, { ok: true });
});

// ── ADMIN ──────────────────────────────────────────────────
route('GET', '/api/admin/dashboard', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const subs  = rdj(path.join(DATA, 'submissions.json'))  || [];
  const nl    = rdj(path.join(DATA, 'newsletter.json'))   || [];
  const ords  = rdj(path.join(DATA, 'orders.json'))       || [];
  const an    = rdj(path.join(DATA, 'analytics.json'))    || [];
  const am    = rdj(path.join(DATA, 'assets.json'))        || {};
  const wh    = rdj(path.join(DATA, 'stitch_webhooks.json')) || [];

  const day  = 86_400_000;
  const now  = Date.now();
  const w7   = t => new Date(t).getTime() > now - 7  * day;
  const w30  = t => new Date(t).getTime() > now - 30 * day;

  jsn(res, {
    overview: {
      subscribers: nl.length, newSubs7d: nl.filter(x => w7(x.timestamp)).length,
      submissions: subs.length, newSubs30d: subs.filter(x => w30(x.timestamp)).length,
      orders: ords.length, pendingOrders: ords.filter(x => x.status === 'pending_launch').length,
      pageviews7d: an.filter(x => x.type === 'pageview' && w7(x.timestamp)).length,
      assets: (am.images||[]).length + (am.fonts||[]).length + (am.templates||[]).length,
      stitchWebhooks: wh.length,
    },
    recentSubmissions:  subs.slice(-10).reverse(),
    recentOrders:       ords.slice(-10).reverse(),
    recentSubscribers:  nl.slice(-10).reverse(),
    assetSummary: {
      images:    (am.images    || []).length,
      fonts:     (am.fonts     || []).length,
      templates: (am.templates || []).length,
      hasTokens: Object.keys(am.tokens || {}).length > 0,
    },
    stitchConfig: {
      exportUrl:   '/api/stitch/export',
      csvUrl:      '/api/stitch/export.csv?collection=',
      webhookUrl:  '/api/webhooks/stitch',
      lastWebhook: wh.length ? wh[wh.length - 1].receivedAt : null,
    },
  });
});

route('DELETE', '/api/admin/clear/([a-z_]{1,40})', async (req, res, p) => {
  if (!requireAdmin(req, res)) return;
  const CLEARABLE = ['analytics', 'stitch_webhooks'];
  if (!CLEARABLE.includes(p[0])) return badReq(res, 'Cannot clear this collection.');
  wrj(path.join(DATA, p[0] + '.json'), []);
  jsn(res, { success: true, cleared: p[0] });
});

// ═══════════════════════════════════════════════════════════

route('GET','/robots\\.txt',(req,res)=>{
  const b='User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/admin/\nSitemap: https://www.kaaand.xyz/sitemap.xml';
  res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'public,max-age=86400'});res.end(b);
});

route('GET','/sitemap\\.xml',(req,res)=>{
  const c=rdj(path.join(DATA,'content.json'))||{};
  const arts=(c.articles||[]);
  const today=new Date().toISOString().split('T')[0];
  const base='https://www.kaaand.xyz';
  const urls=[
    `<url><loc>${base}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
    `<url><loc>${base}/#editorial</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>`,
    `<url><loc>${base}/#brands-section</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`,
    `<url><loc>${base}/#music-section</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`,
    `<url><loc>${base}/#newsletter-section</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`,
    `<url><loc>${base}/#submit-section</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`,
    ...arts.map(a=>`<url><loc>${base}/?article=${a.slug}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.85</priority></url>`)
  ].join('\n  ');
  const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  ${urls}\n</urlset>`;
  res.writeHead(200,{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public,max-age=3600'});res.end(xml);
});

route('GET','/sitemap',(req,res)=>{
  const fp=path.join(PUB,'sitemap.html');
  if(fs.existsSync(fp))return serveFile(res,fp,req.headers['if-none-match']);
  res.writeHead(302,{Location:'/sitemap.xml'});res.end();
});

//  MAIN REQUEST HANDLER
// ═══════════════════════════════════════════════════════════
const server = http.createServer(async (req, res) => {
  const ip       = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const parsed   = url.parse(req.url, true);
  const method   = req.method.toUpperCase();

  // Decode and normalise pathname — neutralise all traversal attempts
  let pathname;
  try {
    pathname = decodeURIComponent(parsed.pathname || '/');
  } catch {
    pathname = parsed.pathname || '/';
  }
  // Collapse multiple slashes, strip null bytes, collapse dot segments
  pathname = pathname
    .replace(/\0/g, '')
    .replace(/\/+/g, '/')
    .replace(/\\/g, '/')
    .replace(/\/\.\.\//g, '/')
    .replace(/\/\.\./g, '')
    .replace(/\/\.\//g, '/')
    .replace(/\/\.$/, '/')
    || '/';

  // Set baseline security headers on every response
  setSecurityHeaders(res);

  // CORS + preflight for API routes
  if (pathname.startsWith('/api')) {
    res.setHeader('Access-Control-Allow-Origin', IS_PROD ? `https://${req.headers.host}` : '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Key');
    res.setHeader('Access-Control-Max-Age', '86400');
    if (method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    // Global API rate limit
    if (!limit(ip + ':api', 900_000, 400)) return tooMany(res);
  }

  // Route matching
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = pathname.match(r.pattern);
    if (m) {
      try {
        await r.handler(req, res, m.slice(1), parsed.query, ip);
      } catch (e) {
        console.error('Route error:', e.message);
        if (!res.headersSent) srvErr(res, 'An error occurred');
      }
      return;
    }
  }

  // 404 for unknown API routes (don't fall through to SPA)
  if (pathname.startsWith('/api')) {
    return jsn(res, { error: `No route: ${method} ${pathname}` }, 404);
  }

  // Admin panel — served directly
  if (pathname === '/admin' || pathname === '/admin/') {
    const ap = path.join(PUB, 'admin.html');
    if (fs.existsSync(ap)) return serveFile(res, ap, null);
    return jsn(res, { error: 'Admin panel not found' }, 404);
  }

  // Static files — must stay within PUB directory
  const relative = pathname.startsWith('/') ? pathname.slice(1) : pathname;
  const filePath = path.resolve(PUB, relative);

  // Strict containment check — resolved path must start with PUB
  if (!filePath.startsWith(PUB + path.sep) && filePath !== PUB) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403 Forbidden');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return serveFile(res, filePath, req.headers['if-none-match']);
  }

  // SPA fallback for all non-file routes
  const indexPath = path.join(PUB, 'index.html');
  if (fs.existsSync(indexPath)) return serveFile(res, indexPath, null);

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
});

// Request timeout — kill hung connections
server.on('connection', socket => {
  socket.setTimeout(30_000);
  socket.on('timeout', () => socket.destroy());
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') { console.error(`Port ${PORT} in use`); process.exit(1); }
  console.error('Server error:', e);
});
process.on('uncaughtException',  e => console.error('Uncaught:', e.message));
process.on('unhandledRejection', e => console.error('Unhandled:', e));
process.on('SIGTERM', () => { console.log('Shutting down...'); server.close(() => process.exit(0)); });
process.on('SIGINT',  () => { console.log('Shutting down...'); server.close(() => process.exit(0)); });

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  KAAAND → http://localhost:${PORT}`);
  console.log(`  Admin  → http://localhost:${PORT}/admin\n`);
});

module.exports = server;
