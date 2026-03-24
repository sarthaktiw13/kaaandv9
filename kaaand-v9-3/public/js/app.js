'use strict';

// ── STATE ─────────────────────────────────────────────────
const state = { articles:[], brands:[], tracks:[], currentFilter:'all' };

// ── API ───────────────────────────────────────────────────
const api = {
  base:'/api',
  async get(path) {
    const r = await fetch(this.base + path);
    if (!r.ok) throw new Error('API ' + r.status);
    return r.json();
  },
  async post(path, data) {
    const r = await fetch(this.base + path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    return r.json();
  }
};

// ── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initCursor();
  initNav();
  initLoader();
  await loadAll();
  initCover();
  initScrollReveal();
  initMobileNav();
  initKeyboard();
  initThreeCover();
  initThreeVinyl();
  initThreeMusicEQ();
  initThreeShop();
  initThreeEditorial();
  initThreeBrands();
  initThreeManifesto();
  initThreeSubmit();
});

// ── LOADER ────────────────────────────────────────────────
function initLoader() {
  setTimeout(() => {
    document.getElementById('loader').classList.add('out');
    setTimeout(() => { const l=document.getElementById('loader'); if(l)l.remove(); }, 700);
  }, 1900);
}

// ── LOAD DATA ─────────────────────────────────────────────
async function loadAll() {
  try {
    const [arts, brnds, trks, stats] = await Promise.all([
      api.get('/articles'), api.get('/brands'), api.get('/tracks'), api.get('/stats')
    ]);
    state.articles = arts.articles;
    state.brands   = brnds.brands;
    state.tracks   = trks.tracks;
    renderArticles();
    renderBrands();
    renderTracks();
    updateStats(stats);
  } catch(e) {
    console.error('Load error:', e);
    toast('Failed to load content.');
  }
}

// ── CURSOR ────────────────────────────────────────────────
function initCursor() {
  const cur = document.getElementById('cursor');
  if (!cur || window.matchMedia('(pointer:coarse)').matches) return;
  let mx=-100, my=-100, cx=-100, cy=-100;
  document.addEventListener('mousemove', e => { mx=e.clientX; my=e.clientY; });
  const loop = () => {
    cx += (mx-cx)*0.11; cy += (my-cy)*0.11;
    cur.style.left = cx+'px'; cur.style.top = cy+'px';
    requestAnimationFrame(loop);
  };
  loop();
  document.addEventListener('mouseover', e => {
    cur.classList.toggle('big', !!e.target.closest('a,button,.article-card,.brand-card,.track-row'));
  });
}

// ── NAV ───────────────────────────────────────────────────
function initNav() {
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => { nav.classList.toggle('solid', window.scrollY > 60); }, {passive:true});
  const btn = document.querySelector('.nav-menu-btn');
  const drawer = document.getElementById('mobile-drawer');
  if (btn && drawer) {
    btn.addEventListener('click', () => {
      const open = drawer.classList.toggle('open');
      const spans = btn.querySelectorAll('span');
      if (open) {
        spans[0].style.transform = 'rotate(45deg) translate(5px,5px)';
        spans[1].style.opacity = '0';
        spans[2].style.transform = 'rotate(-45deg) translate(5px,-5px)';
      } else {
        spans.forEach(s => { s.style.transform=''; s.style.opacity=''; });
      }
    });
    document.addEventListener('click', e => {
      if (!drawer.contains(e.target) && !btn.contains(e.target)) {
        drawer.classList.remove('open');
        btn.querySelectorAll('span').forEach(s => { s.style.transform=''; s.style.opacity=''; });
      }
    });
  }
}
window.goTo = function(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 90;
  window.scrollTo({top, behavior:'smooth'});
};

// ── COVER ─────────────────────────────────────────────────
function initCover() {
  setTimeout(() => document.getElementById('cover').classList.add('loaded'), 100);
}

// ── STATS ─────────────────────────────────────────────────
function updateStats(stats) {
  const map = {'stat-articles':stats.articles,'stat-brands':stats.brands,'stat-tracks':stats.tracks,'stat-issue':'00'};
  Object.entries(map).forEach(([id,val]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (typeof val === 'number') {
      let c=0; const step=Math.ceil(val/20);
      const iv = setInterval(() => { c=Math.min(c+step,val); el.textContent=c; if(c>=val)clearInterval(iv); }, 55);
    } else { el.textContent = val; }
  });
  // subscriber count in newsletter
  if (stats.subscribers !== undefined) {
    const el = document.getElementById('nl-count');
    if (el) el.textContent = stats.subscribers || '0';
  }
}

// ── ARTICLES ─────────────────────────────────────────────
function renderArticles(filter='all') {
  const grid = document.getElementById('article-grid');
  if (!grid) return;
  let arts = state.articles;
  if (filter !== 'all') arts = arts.filter(a => a.category.toLowerCase() === filter.toLowerCase());
  const el = document.getElementById('art-count');
  if (el) el.textContent = arts.length + ' article' + (arts.length!==1?'s':'');
  if (!arts.length) { grid.innerHTML='<div class="no-results">Nothing in this category yet.</div>'; return; }
  grid.innerHTML = arts.map((a,i) => {
    const feat = a.featured && filter==='all' && i===0;
    return `<div class="article-card reveal ${feat?'featured':''}" onclick="openArticle('${a.slug}')">
      <div class="card-photo"><img src="${a.image}" alt="${a.title}" loading="${i<3?'eager':'lazy'}"><div class="card-photo-overlay"></div></div>
      <div class="card-body">
        <div class="card-cat">${a.category}</div>
        <div class="card-title">${a.title}</div>
        <div class="card-rule"></div>
        <div class="card-excerpt">${a.lead}</div>
        <div class="card-meta"><span>${a.author}</span><span>${a.readTime}</span></div>
      </div>
    </div>`;
  }).join('');
  grid.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));
}

window.filterArticles = function(btn, cat) {
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  state.currentFilter = cat;
  renderArticles(cat);
};

// ── READER ───────────────────────────────────────────────
window.openArticle = async function(slug) {
  const reader = document.getElementById('reader');
  const wrap   = document.getElementById('article-list-wrap');
  if (!reader) return;
  reader.classList.add('visible');
  document.getElementById('reader-content').innerHTML = '<div style="padding:48px"><div class="skeleton" style="height:14px;width:60%;margin-bottom:14px;"></div><div class="skeleton" style="height:14px;width:80%;margin-bottom:14px;"></div><div class="skeleton" style="height:14px;width:50%;"></div></div>';
  reader.scrollIntoView({behavior:'smooth', block:'start'});
  try {
    const a = await api.get('/articles/'+slug);
    const hero = document.getElementById('reader-hero');
    hero.style.backgroundImage = `url(${a.image})`;
    hero.style.backgroundSize = 'cover';
    hero.style.backgroundPosition = 'center';
    document.getElementById('r-kicker').textContent  = a.category;
    document.getElementById('r-title').textContent   = a.title;
    document.getElementById('r-byline').innerHTML    = [a.author,a.date,a.readTime].map(b=>`<span>${b}</span>`).join('');
    document.getElementById('r-tags').innerHTML      = a.tags.map(t=>`<span class="sidebar-tag">${t}</span>`).join('');
    let html = `<div class="reader-lead">${a.lead}</div>`;
    a.body.forEach((b,i) => {
      if (b.type==='p')          html += `<p${i===0?' class="drop"':''}>${b.text}</p>`;
      else if (b.type==='h3')    html += `<h3>${b.text}</h3>`;
      else if (b.type==='pullquote') html += `<div class="reader-pullquote">${b.text}</div>`;
    });
    html += `<div class="reader-tags">${a.tags.map(t=>`<span class="reader-tag">${t}</span>`).join('')}</div>`;
    document.getElementById('reader-content').innerHTML = html;
    const rel = state.articles.filter(x=>x.slug!==slug).slice(0,3);
    document.getElementById('reader-related').innerHTML = rel.map(x=>`
      <div class="article-card" onclick="openArticle('${x.slug}')">
        <div class="card-photo" style="aspect-ratio:4/3"><img src="${x.image}" alt="${x.title}" loading="lazy"><div class="card-photo-overlay"></div></div>
        <div class="card-body"><div class="card-cat">${x.category}</div><div class="card-title" style="font-size:20px">${x.title}</div><div class="card-meta" style="margin-top:10px"><span>${x.author}</span></div></div>
      </div>`).join('');
    reader.scrollIntoView({behavior:'smooth', block:'start'});
  } catch(e) {
    document.getElementById('reader-content').innerHTML = '<p style="padding:48px;color:var(--dim)">Failed to load article.</p>';
    toast('Could not load article.');
  }
};

window.closeReader = function() {
  document.getElementById('reader').classList.remove('visible');
  document.getElementById('editorial').scrollIntoView({behavior:'smooth', block:'start'});
};

// ── BRANDS ───────────────────────────────────────────────
function renderBrands() {
  const grid = document.getElementById('brands-grid');
  if (!grid || !state.brands.length) return;
  grid.innerHTML = state.brands.map((b,i) => `
    <div class="brand-card reveal reveal-delay-${(i%3)+1}" onclick="openBrand('${b.id}')">
      <div class="brand-logo">${b.abbr}</div>
      <div class="brand-city">${b.city}</div>
      <div class="brand-name">${b.name}</div>
      <div class="brand-desc">${b.desc}</div>
    </div>`).join('');
  grid.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));
}

window.openBrand = async function(id) {
  document.getElementById('brand-overlay').classList.add('open');
  try {
    const b = await api.get('/brands/'+id);
    document.getElementById('bpanel-tag').textContent = 'Exhibit B — '+b.city;
    document.getElementById('brand-detail').innerHTML = `
      <div class="bp-city">${b.city}</div><div class="bp-name">${b.name}</div>
      <div class="bp-desc">${b.desc}</div><div class="bp-story">${b.story}</div>
      <div class="bp-meta">${[{l:'Founded',v:b.founded},{l:'Category',v:b.category},{l:'Price Range',v:b.price},{l:'Stockists',v:b.stockists}]
        .map(m=>`<div class="bp-cell"><div class="bp-label">${m.l}</div><div class="bp-val">${m.v}</div></div>`).join('')}</div>`;
  } catch(e) { document.getElementById('brand-detail').innerHTML='<p style="color:var(--dim)">Could not load.</p>'; }
};
window.closeBrand = function() { document.getElementById('brand-overlay').classList.remove('open'); };

// ── TRACKS ───────────────────────────────────────────────
function renderTracks() {
  const list = document.getElementById('track-list');
  if (!list || !state.tracks.length) return;
  list.innerHTML = state.tracks.map((t,i) => `
    <div class="track-row ${i===0?'playing':''}" id="tr${t.id}" onclick="playTrack(${t.id},'${t.spotify}')">
      <div class="tr-num">${String(t.id).padStart(2,'0')}</div>
      <div class="tr-info"><div class="tr-name">${t.title}</div><div class="tr-artist">${t.artist}</div><div class="tr-bar"></div></div>
      <div class="tr-genre">${t.genre}</div>
    </div>`).join('') +
    `<div class="music-player"><iframe id="spotify-player" src="${state.tracks[0].spotify}" height="80" allowfullscreen allow="autoplay;clipboard-write;encrypted-media;fullscreen;picture-in-picture" loading="lazy" frameborder="0"></iframe></div>`;
}
window.playTrack = function(id, url) {
  document.querySelectorAll('.track-row').forEach(r=>r.classList.remove('playing'));
  const row = document.getElementById('tr'+id);
  if (row) row.classList.add('playing');
  const p = document.getElementById('spotify-player');
  if (p) p.src = url;
};

// ── NEWSLETTER ───────────────────────────────────────────
window.submitNL = async function() {
  const input = document.getElementById('nl-email');
  const btn   = document.getElementById('nl-btn');
  const msg   = document.getElementById('nl-msg');
  const email = (input.value||'').trim();
  if (!email) { msg.textContent='Enter your email.'; msg.className='nl-msg err'; return; }
  const btnText = btn.querySelector('.nl-btn-text');
  btn.disabled=true;
  if (btnText) btnText.textContent='Adding...'; else btn.textContent='Adding...';
  msg.textContent=''; msg.className='nl-msg';
  try {
    const res = await api.post('/newsletter', {email});
    if (res.success) {
      input.value='';
      msg.textContent='✓ You\'re on the list.';
      msg.className='nl-msg ok';
      toast('Welcome to KAAAND.');
      const cEl = document.getElementById('nl-count');
      if (cEl && cEl.textContent !== '—') cEl.textContent = parseInt(cEl.textContent||0)+1;
    } else {
      msg.textContent='✗ '+(res.error||'Try again.');
      msg.className='nl-msg err';
    }
  } catch(e) { msg.textContent='✗ Network error — try again.'; msg.className='nl-msg err'; }
  btn.disabled=false;
  if (btnText) btnText.textContent='Subscribe to KAAAND'; else btn.textContent='Subscribe to KAAAND';
};

// Enter key on newsletter input
document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('nl-email');
  if (inp) inp.addEventListener('keydown', e => { if(e.key==='Enter') window.submitNL(); });
});

// ── SUBMIT FORM ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('submit-form');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    const msg = document.getElementById('form-msg');
    btn.disabled=true; btn.textContent='Sending...';
    msg.className='form-msg'; msg.textContent='';
    try {
      const res = await api.post('/submit', {
        name:form.name.value.trim(), email:form.email.value.trim(),
        type:form.type.value, message:form.message.value.trim()
      });
      if (res.success) {
        msg.textContent='✓ '+res.message; msg.className='form-msg success';
        form.reset();
        toast('Submission received.');
        btn.disabled=false; btn.textContent='Send It, We\'re Listening →'; // FIX: was never resetting
      } else {
        msg.textContent='✗ '+(res.error||'Something went wrong.'); msg.className='form-msg error';
        btn.disabled=false; btn.textContent='Send It, We\'re Listening →';
      }
    } catch(e) {
      msg.textContent='✗ Network error — try again.'; msg.className='form-msg error';
      btn.disabled=false; btn.textContent='Send It, We\'re Listening →';
    }
  });
});

// ── SCROLL REVEAL ─────────────────────────────────────────
const revealObs = new IntersectionObserver(entries => {
  entries.forEach(e => { if(e.isIntersecting){e.target.classList.add('visible');revealObs.unobserve(e.target);} });
}, {threshold:0.1, rootMargin:'0px 0px -40px 0px'});
function initScrollReveal() {
  document.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));
}

// ── MOBILE NAV ACTIVE STATE ───────────────────────────────
function initMobileNav() {
  const sections = ['cover','editorial','brands-section','music-section','newsletter-section','submit-section'];
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting && e.intersectionRatio > 0.4) {
        const raw = e.target.id.replace('-section','');
        document.querySelectorAll('.mn-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.section===raw || b.dataset.section===e.target.id);
        });
      }
    });
  }, {threshold:0.4});
  sections.forEach(id => { const el=document.getElementById(id); if(el)obs.observe(el); });
}

// ── KEYBOARD ─────────────────────────────────────────────
function initKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.key==='Escape') { closeBrand(); closeReader(); }
  });
}

// ── TOAST ─────────────────────────────────────────────────
function toast(msg, duration=3000) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg; el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'), duration);
}

// ══════════════════════════════════════════════════════════
//  THREE.JS — COVER PARTICLE FIELD
// ══════════════════════════════════════════════════════════
function initThreeCover() {
  if (typeof THREE === 'undefined') return;
  const canvas = document.getElementById('cover-canvas');
  if (!canvas) return;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  camera.position.z = 5;

  // Particle geometry — 3 layers at different depths
  const COUNT = window.matchMedia('(max-width:700px)').matches ? 800 : 1800;
  const positions = new Float32Array(COUNT * 3);
  const sizes     = new Float32Array(COUNT);
  const colors    = new Float32Array(COUNT * 3);

  for (let i = 0; i < COUNT; i++) {
    // Spread in a wide 3D space
    positions[i*3]   = (Math.random()-0.5)*18;
    positions[i*3+1] = (Math.random()-0.5)*12;
    positions[i*3+2] = (Math.random()-0.5)*10 - 2;
    sizes[i] = Math.random() * 2.5 + 0.5;

    // Mostly dim white, occasional red accent
    if (Math.random() < 0.06) {
      colors[i*3]   = 0.55; // red particles
      colors[i*3+1] = 0.18;
      colors[i*3+2] = 0.12;
    } else {
      const b = Math.random() * 0.18 + 0.04;
      colors[i*3]=b; colors[i*3+1]=b*0.9; colors[i*3+2]=b*0.8;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size',     new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.PointsMaterial({
    size:0.04, vertexColors:true, transparent:true,
    opacity:0.7, sizeAttenuation:true, blending:THREE.AdditiveBlending,
    depthWrite:false,
  });

  const particles = new THREE.Points(geo, mat);
  scene.add(particles);

  // Mouse parallax
  let mx=0, my=0, tmx=0, tmy=0;
  document.addEventListener('mousemove', e => {
    mx = (e.clientX/window.innerWidth  - 0.5) * 0.6;
    my = (e.clientY/window.innerHeight - 0.5) * 0.4;
  });

  const resize = () => {
    const cover = document.getElementById('cover');
    if (!cover) return;
    const w = cover.clientWidth, h = cover.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w/h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  let frame = 0;
  const animate = () => {
    if (!document.getElementById('cover-canvas')) return;
    requestAnimationFrame(animate);
    frame++;
    tmx += (mx-tmx)*0.04;
    tmy += (my-tmy)*0.04;
    particles.rotation.y = frame*0.0003 + tmx*0.3;
    particles.rotation.x = frame*0.0001 - tmy*0.2;

    // Subtle drift — shift each particle's y position
    const pos = geo.attributes.position.array;
    for (let i=0; i<COUNT; i++) {
      pos[i*3+1] += Math.sin(frame*0.008 + i*0.5)*0.0005;
    }
    geo.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
  };
  animate();
}

// ══════════════════════════════════════════════════════════
//  THREE.JS — NEWSLETTER 3D VINYL RECORD
// ══════════════════════════════════════════════════════════
function initThreeVinyl() {
  if (typeof THREE === 'undefined') return;
  const canvas = document.getElementById('vinyl-canvas');
  if (!canvas) return;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 1.5, 6);
  camera.lookAt(0, 0, 0);

  // ── LIGHTING ──
  const ambient = new THREE.AmbientLight(0xffffff, 0.15);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xe8ddd0, 1.8);
  key.position.set(3, 5, 4);
  key.castShadow = true;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x8b2e1e, 0.6);
  fill.position.set(-4, 2, 2);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0x4a1a0e, 0.4);
  rim.position.set(0, -3, -3);
  scene.add(rim);

  // ── VINYL RECORD ──
  // Outer groove area — dark black disc
  const vinylGeo = new THREE.CylinderGeometry(2.2, 2.2, 0.06, 128, 1, false);
  // Create dark iridescent vinyl material using canvas texture
  const vinylCanvas = document.createElement('canvas');
  vinylCanvas.width = 512; vinylCanvas.height = 512;
  const vCtx = vinylCanvas.getContext('2d');

  // Base black
  vCtx.fillStyle = '#050403';
  vCtx.fillRect(0,0,512,512);

  // Groove rings — concentric circles
  for (let r = 30; r < 256; r += 2.5) {
    const alpha = 0.04 + Math.random()*0.04;
    vCtx.beginPath();
    vCtx.arc(256,256,r,0,Math.PI*2);
    vCtx.strokeStyle = `rgba(232,221,208,${alpha.toFixed(3)})`;
    vCtx.lineWidth = 0.6;
    vCtx.stroke();
  }

  // Subtle iridescent sheen sweep
  const grad = vCtx.createConicalGradient ? null : null;
  for (let a=0; a<360; a+=2) {
    const rad = a*Math.PI/180;
    const hue = (a * 1.2 + 180) % 360;
    vCtx.beginPath();
    vCtx.moveTo(256,256);
    vCtx.arc(256,256,256,rad,rad+0.04);
    vCtx.lineTo(256,256);
    vCtx.fillStyle = `hsla(${hue},15%,${20+Math.sin(a*0.1)*8}%,0.04)`;
    vCtx.fill();
  }

  const vinylTex = new THREE.CanvasTexture(vinylCanvas);
  const vinylMat = new THREE.MeshStandardMaterial({
    map: vinylTex, metalness:0.7, roughness:0.25,
    envMapIntensity:1,
  });

  const vinylMesh = new THREE.Mesh(vinylGeo, vinylMat);
  vinylMesh.castShadow = true;
  scene.add(vinylMesh);

  // ── LABEL (centre circle) ──
  const labelGeo = new THREE.CylinderGeometry(0.78, 0.78, 0.065, 64, 1, false);
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 256; labelCanvas.height = 256;
  const lCtx = labelCanvas.getContext('2d');

  // Red label background
  lCtx.fillStyle = '#8b2e1e';
  lCtx.fillRect(0,0,256,256);

  // Subtle radial texture
  for (let i=0; i<40; i++) {
    const r = Math.random()*128;
    const a = Math.random()*Math.PI*2;
    lCtx.beginPath();
    lCtx.arc(128+Math.cos(a)*r, 128+Math.sin(a)*r, Math.random()*12+3, 0, Math.PI*2);
    lCtx.fillStyle = `rgba(0,0,0,${(Math.random()*0.08).toFixed(3)})`;
    lCtx.fill();
  }

  // KAAAND text
  lCtx.fillStyle = '#e8ddd0';
  lCtx.font = 'bold 28px sans-serif';
  lCtx.letterSpacing = '6px';
  lCtx.textAlign = 'center';
  lCtx.textBaseline = 'middle';
  lCtx.fillText('KAAAND', 128, 110);

  lCtx.font = '13px sans-serif';
  lCtx.letterSpacing = '3px';
  lCtx.fillStyle = 'rgba(232,221,208,0.6)';
  lCtx.fillText('ISSUE 00', 128, 140);
  lCtx.fillText('2026', 128, 160);

  // Center hole ring
  lCtx.beginPath();
  lCtx.arc(128,128,8,0,Math.PI*2);
  lCtx.fillStyle = '#050403';
  lCtx.fill();
  lCtx.beginPath();
  lCtx.arc(128,128,10,0,Math.PI*2);
  lCtx.strokeStyle = 'rgba(232,221,208,0.2)';
  lCtx.lineWidth=1.5; lCtx.stroke();

  const labelTex = new THREE.CanvasTexture(labelCanvas);
  const labelMat = new THREE.MeshStandardMaterial({ map:labelTex, metalness:0.1, roughness:0.6 });
  const labelMesh = new THREE.Mesh(labelGeo, labelMat);
  labelMesh.position.y = 0.002;
  scene.add(labelMesh);

  // ── CENTER HOLE ──
  const holeMat = new THREE.MeshBasicMaterial({ color:0x050403 });
  const holeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 16), holeMat);
  scene.add(holeMesh);

  // ── FLOATING PARTICLES around the vinyl ──
  const PCNT = 300;
  const pPos = new Float32Array(PCNT*3);
  const pCol = new Float32Array(PCNT*3);
  for (let i=0; i<PCNT; i++) {
    const angle = Math.random()*Math.PI*2;
    const dist  = 2.5 + Math.random()*3.5;
    pPos[i*3]   = Math.cos(angle)*dist;
    pPos[i*3+1] = (Math.random()-0.5)*3;
    pPos[i*3+2] = Math.sin(angle)*dist * 0.4;
    const red = Math.random() < 0.2;
    const b = Math.random()*0.15+0.04;
    pCol[i*3]   = red ? 0.55 : b;
    pCol[i*3+1] = red ? 0.18 : b*0.9;
    pCol[i*3+2] = red ? 0.12 : b*0.8;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos,3));
  pGeo.setAttribute('color',    new THREE.BufferAttribute(pCol,3));
  const pMat = new THREE.PointsMaterial({ size:0.06, vertexColors:true, transparent:true, opacity:0.6, sizeAttenuation:true, blending:THREE.AdditiveBlending, depthWrite:false });
  const pPoints = new THREE.Points(pGeo, pMat);
  scene.add(pPoints);

  // ── MOUSE HOVER TILT ──
  let targetTiltX=0, targetTiltY=0.3, currentTiltX=0, currentTiltY=0;
  let isHovering = false;
  const section = document.getElementById('newsletter-section');
  if (section) {
    section.addEventListener('mousemove', e => {
      const rect = section.getBoundingClientRect();
      const nx = (e.clientX-rect.left)/rect.width  - 0.5;
      const ny = (e.clientY-rect.top) /rect.height - 0.5;
      targetTiltX = ny * 0.5;
      targetTiltY = nx * 0.8 + 0.3;
      isHovering = true;
    });
    section.addEventListener('mouseleave', () => { isHovering=false; targetTiltX=0; targetTiltY=0.3; });
  }

  // ── RESIZE ──
  const resize = () => {
    const sec = document.getElementById('newsletter-section');
    if (!sec) return;
    const w=sec.clientWidth, h=Math.max(sec.clientHeight, 600);
    renderer.setSize(w,h,false);
    camera.aspect = w/h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  // ── ANIMATE ──
  let frame=0;
  const animate = () => {
    if (!document.getElementById('vinyl-canvas')) return;
    requestAnimationFrame(animate);
    frame++;

    // Spinning record
    vinylMesh.rotation.y = frame * 0.012;
    labelMesh.rotation.y = frame * 0.012;
    holeMesh.rotation.y  = frame * 0.012;

    // Tilt
    currentTiltX += (targetTiltX-currentTiltX)*0.05;
    currentTiltY += (targetTiltY-currentTiltY)*0.05;
    vinylMesh.rotation.x = currentTiltX - 0.3;
    labelMesh.rotation.x = currentTiltX - 0.3;
    holeMesh.rotation.x  = currentTiltX - 0.3;
    vinylMesh.rotation.z = currentTiltY * 0.1;

    // Gentle float
    const floatY = Math.sin(frame*0.018)*0.12;
    vinylMesh.position.y = floatY;
    labelMesh.position.y = floatY + 0.002;
    holeMesh.position.y  = floatY;

    // Particles orbit slowly
    pPoints.rotation.y = frame * 0.004;
    pPoints.position.y = floatY * 0.3;

    renderer.render(scene, camera);
  };
  animate();
}

// ── SHOP NOTIFY ───────────────────────────────────────────
window.submitShopNotify = async function() {
  const input = document.getElementById('shop-email');
  const msg   = document.getElementById('shop-msg');
  const btn   = document.querySelector('.shop-notify-btn');
  const email = (input.value||'').trim();
  if (!email) { msg.textContent='Enter your email.'; msg.className='shop-notify-msg err'; return; }
  btn.disabled=true; btn.textContent='Adding...';
  msg.textContent=''; msg.className='shop-notify-msg';
  try {
    const res = await api.post('/newsletter', {email});
    if (res.success) {
      input.value=''; msg.textContent='✓ We\'ll notify you on drop day.'; msg.className='shop-notify-msg ok';
      toast('You\'re on the drop list.');
    } else {
      msg.textContent='✗ '+(res.error||'Try again.'); msg.className='shop-notify-msg err';
    }
  } catch(e) { msg.textContent='✗ Network error.'; msg.className='shop-notify-msg err'; }
  btn.disabled=false; btn.textContent='Notify Me →';
};
document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('shop-email');
  if (inp) inp.addEventListener('keydown', e => { if(e.key==='Enter') window.submitShopNotify(); });
});

// ══════════════════════════════════════════════════════════
//  THREE.JS — MUSIC EQ BARS
// ══════════════════════════════════════════════════════════
function initThreeMusicEQ() {
  if (typeof THREE === 'undefined') return;
  const canvas = document.getElementById('music-eq-canvas');
  if (!canvas) return;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 2, 14);
  camera.lookAt(0, 0, 0);

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));
  const key = new THREE.DirectionalLight(0x8b2e1e, 2.5);
  key.position.set(0, 8, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xe8ddd0, 0.4);
  fill.position.set(-6, 2, 6); scene.add(fill);

  // EQ bar columns
  const COLS = 48;
  const bars = [];
  const BAR_W = 0.22;
  const SPACING = 0.32;
  const TOTAL = COLS * SPACING;

  // Two materials — dim and accent
  const matDim = new THREE.MeshStandardMaterial({ color:0x1c1410, metalness:0.6, roughness:0.4 });
  const matRed = new THREE.MeshStandardMaterial({ color:0x8b2e1e, metalness:0.5, roughness:0.3 });
  const matMid = new THREE.MeshStandardMaterial({ color:0x2a1f1a, metalness:0.6, roughness:0.4 });

  for (let i = 0; i < COLS; i++) {
    const h = 0.3;
    const geo = new THREE.BoxGeometry(BAR_W, h, BAR_W);
    // Pick material based on position
    const isAccent = i % 8 === 0;
    const mat = isAccent ? matRed.clone() : (i % 3 === 0 ? matMid.clone() : matDim.clone());
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.x = -TOTAL/2 + i * SPACING;
    mesh.position.y = 0;
    scene.add(mesh);
    bars.push({ mesh, phase: Math.random()*Math.PI*2, freq: 0.4+Math.random()*1.2, base:0.15+Math.random()*0.3 });
  }

  const resize = () => {
    const hero = document.querySelector('.music-hero');
    if (!hero) return;
    const w=hero.clientWidth, h=hero.clientHeight||400;
    renderer.setSize(w,h,false);
    camera.aspect = w/h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  let frame = 0;
  let running = false;
  // Only animate when section is visible
  const obs = new IntersectionObserver(entries => {
    running = entries[0].isIntersecting;
  }, {threshold:0.1});
  const section = document.getElementById('music-section');
  if (section) obs.observe(section);

  const animate = () => {
    requestAnimationFrame(animate);
    if (!running) return;
    frame++;
    bars.forEach((b,i) => {
      // Multi-frequency oscillation for organic feel
      const t = frame * 0.018;
      const h = b.base
        + Math.sin(t * b.freq + b.phase) * 0.6
        + Math.sin(t * b.freq * 2.3 + b.phase * 1.7) * 0.25
        + Math.abs(Math.sin(t * 0.3 + i*0.15)) * 0.4;
      const clamped = Math.max(0.06, h);
      b.mesh.scale.y = clamped;
      b.mesh.position.y = clamped * 0.5 - 0.5;
    });
    renderer.render(scene, camera);
  };
  animate();
}

// ══════════════════════════════════════════════════════════
//  THREE.JS — SHOP 3D MERCH BOX
// ══════════════════════════════════════════════════════════
function initThreeShop() {
  if (typeof THREE === 'undefined') return;
  const canvas = document.getElementById('shop-canvas');
  if (!canvas) return;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0.5, 8);
  camera.lookAt(0, 0, 0);

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.12));
  const key = new THREE.DirectionalLight(0xe8ddd0, 2.0);
  key.position.set(3, 6, 5); key.castShadow=true; scene.add(key);
  const red = new THREE.DirectionalLight(0x8b2e1e, 1.2);
  red.position.set(-4, 1, 3); scene.add(red);
  const back = new THREE.DirectionalLight(0x3a1a0e, 0.5);
  back.position.set(0, -2, -5); scene.add(back);

  // ── MAIN BOX — magazine/package shape ──
  const boxW=2.2, boxH=2.8, boxD=0.4;

  // Create canvas textures for each face
  function makeTexture(drawFn, size=512) {
    const c = document.createElement('canvas');
    c.width=size; c.height=size;
    drawFn(c.getContext('2d'), size);
    return new THREE.CanvasTexture(c);
  }

  // FRONT face — KAAAND cover
  const frontTex = makeTexture((ctx, s) => {
    ctx.fillStyle = '#0e0a09';
    ctx.fillRect(0,0,s,s);
    // Red top bar
    ctx.fillStyle = '#8b2e1e';
    ctx.fillRect(0, 0, s, 32);
    // Label text in bar
    ctx.fillStyle = '#0e0a09';
    ctx.font = 'bold 13px sans-serif';
    ctx.letterSpacing='4px';
    ctx.fillText('ISSUE 00 — 2026', 16, 22);
    // Main title
    ctx.fillStyle = '#e8ddd0';
    ctx.font = 'bold 82px sans-serif';
    ctx.fillText('KAA', 28, 160);
    ctx.fillStyle = '#8b2e1e';
    ctx.fillText('AN', 28, 260);
    ctx.fillStyle = '#e8ddd0';
    ctx.fillText('D', 28, 360);
    // Border
    ctx.strokeStyle = 'rgba(232,221,208,0.15)';
    ctx.lineWidth=3;
    ctx.strokeRect(6,6,s-12,s-12);
    // Redacted bars
    ctx.fillStyle = 'rgba(139,46,30,0.4)';
    ctx.fillRect(28, 400, 180, 8);
    ctx.fillStyle = 'rgba(42,31,26,0.8)';
    ctx.fillRect(28, 418, 110, 8);
    ctx.fillStyle = 'rgba(139,46,30,0.4)';
    ctx.fillRect(28, 436, 240, 8);
    // Bottom
    ctx.fillStyle = 'rgba(232,221,208,0.2)';
    ctx.font = '11px sans-serif';
    ctx.fillText('kaaand.xyz', 28, s-20);
  });

  // BACK face
  const backTex = makeTexture((ctx, s) => {
    ctx.fillStyle = '#0b0806';
    ctx.fillRect(0,0,s,s);
    ctx.strokeStyle = 'rgba(232,221,208,0.08)';
    ctx.lineWidth=2; ctx.strokeRect(8,8,s-16,s-16);
    ctx.fillStyle = 'rgba(139,46,30,0.6)';
    ctx.fillRect(0,0,s,28);
    ctx.fillStyle = '#0b0806';
    ctx.font='bold 11px sans-serif'; ctx.letterSpacing='4px';
    ctx.fillText('KAAAND MAGAZINE', 16, 19);
    ctx.fillStyle='rgba(232,221,208,0.5)';
    ctx.font='15px sans-serif'; ctx.letterSpacing='0px';
    ctx.fillText('India\'s underground culture magazine.', 20, 70);
    ctx.fillText('Fashion. Rave. Homegrown brands.', 20, 95);
    ctx.fillText('Music. Identity. The floor.', 20, 120);
    ctx.fillStyle='rgba(139,46,30,0.5)';
    ctx.font='bold 11px sans-serif'; ctx.letterSpacing='3px';
    ctx.fillText('kaaand.xyz', 20, s-24);
  });

  // SPINE face
  const spineTex = makeTexture((ctx, s) => {
    ctx.fillStyle = '#8b2e1e';
    ctx.fillRect(0,0,s,s);
    ctx.save();
    ctx.translate(s/2, s/2);
    ctx.rotate(-Math.PI/2);
    ctx.fillStyle='#0e0a09';
    ctx.font='bold 52px sans-serif';
    ctx.textAlign='center';
    ctx.fillText('KAAAND', 0, 18);
    ctx.restore();
  }, 128);

  // Build materials array [+x, -x, +y, -y, +z (front), -z (back)]
  const mats = [
    new THREE.MeshStandardMaterial({ map:spineTex, metalness:0.2, roughness:0.7 }),  // right
    new THREE.MeshStandardMaterial({ map:spineTex, metalness:0.2, roughness:0.7 }),  // left
    new THREE.MeshStandardMaterial({ color:0x1c1410, metalness:0.3, roughness:0.6 }), // top
    new THREE.MeshStandardMaterial({ color:0x1c1410, metalness:0.3, roughness:0.6 }), // bottom
    new THREE.MeshStandardMaterial({ map:frontTex, metalness:0.1, roughness:0.5 }),  // front
    new THREE.MeshStandardMaterial({ map:backTex,  metalness:0.1, roughness:0.5 }),  // back
  ];

  const boxGeo  = new THREE.BoxGeometry(boxW, boxH, boxD);
  const boxMesh = new THREE.Mesh(boxGeo, mats);
  boxMesh.castShadow = true;
  scene.add(boxMesh);

  // ── FLOATING PARTICLE FIELD ──
  const PCNT = 500;
  const pPos = new Float32Array(PCNT*3);
  const pCol = new Float32Array(PCNT*3);
  for (let i=0; i<PCNT; i++) {
    pPos[i*3]   = (Math.random()-0.5)*18;
    pPos[i*3+1] = (Math.random()-0.5)*14;
    pPos[i*3+2] = (Math.random()-0.5)*10 - 1;
    const red = Math.random() < 0.12;
    const b = Math.random()*0.12+0.03;
    pCol[i*3]=red?0.55:b; pCol[i*3+1]=red?0.18:b*0.9; pCol[i*3+2]=red?0.12:b*0.8;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos,3));
  pGeo.setAttribute('color',    new THREE.BufferAttribute(pCol,3));
  const pPoints = new THREE.Points(pGeo, new THREE.PointsMaterial({ size:0.05, vertexColors:true, transparent:true, opacity:0.55, sizeAttenuation:true, blending:THREE.AdditiveBlending, depthWrite:false }));
  scene.add(pPoints);

  // ── MOUSE TILT ──
  let tx=0.3, ty=-0.4, cx2=0, cy2=0;
  const sec = document.getElementById('shop-section');
  if (sec) {
    sec.addEventListener('mousemove', e => {
      const r=sec.getBoundingClientRect();
      tx = ((e.clientY-r.top)/r.height - 0.5) * 0.8;
      ty = ((e.clientX-r.left)/r.width  - 0.5) * 1.2 - 0.3;
    });
    sec.addEventListener('mouseleave', ()=>{ tx=0.3; ty=-0.4; });
  }

  const resize = () => {
    const s = document.getElementById('shop-section');
    if (!s) return;
    const w=s.clientWidth, h=Math.max(s.clientHeight,600);
    renderer.setSize(w,h,false);
    camera.aspect=w/h; camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  let frame=0, running=false;
  const obs = new IntersectionObserver(e=>{running=e[0].isIntersecting;},{threshold:0.1});
  if (sec) obs.observe(sec);

  const animate = () => {
    requestAnimationFrame(animate);
    if (!running && frame > 60) return;
    frame++;
    cx2 += (tx-cx2)*0.04; cy2 += (ty-cy2)*0.04;

    // Slow auto-rotate + float
    boxMesh.rotation.y = frame*0.008 + cy2;
    boxMesh.rotation.x = cx2;
    boxMesh.position.y = Math.sin(frame*0.016)*0.18;
    boxMesh.position.x = Math.sin(frame*0.009)*0.12;

    pPoints.rotation.y = frame*0.003;
    renderer.render(scene, camera);
  };
  animate();
}

// ══════════════════════════════════════════════════════════
//  THREE.JS — EDITORIAL: floating 3D letter fragments
// ══════════════════════════════════════════════════════════
function initThreeEditorial() {
  if (typeof THREE === 'undefined') return;
  const canvas = document.getElementById('editorial-canvas');
  if (!canvas) return;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
  renderer.setClearColor(0x000000, 0);

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  camera.position.set(0, 0, 12);

  scene.add(new THREE.AmbientLight(0xffffff, 0.3));
  const key = new THREE.DirectionalLight(0x8b2e1e, 2);
  key.position.set(5, 8, 5); scene.add(key);
  const fill = new THREE.DirectionalLight(0xe8ddd0, 0.4);
  fill.position.set(-5, -3, 3); scene.add(fill);

  // Create thin flat slabs that look like redacted bars floating in 3D
  const objects = [];
  const matRed  = new THREE.MeshStandardMaterial({ color:0x8b2e1e, metalness:0.3, roughness:0.6 });
  const matDim  = new THREE.MeshStandardMaterial({ color:0x2a1f1a, metalness:0.5, roughness:0.4 });
  const matPaper= new THREE.MeshStandardMaterial({ color:0x1c1410, metalness:0.6, roughness:0.3 });

  const widths  = [3.5, 2.2, 4.8, 1.6, 3.0, 2.8, 1.4, 4.2, 2.6, 1.8, 3.3, 2.0];
  const mats    = [matRed, matDim, matPaper, matDim, matRed, matPaper, matRed, matDim, matPaper, matRed, matDim, matPaper];

  for (let i = 0; i < 12; i++) {
    const geo  = new THREE.BoxGeometry(widths[i], 0.14, 0.06);
    const mesh = new THREE.Mesh(geo, mats[i]);
    mesh.position.set(
      (Math.random()-0.5)*14,
      (Math.random()-0.5)*16,
      (Math.random()-0.5)*6 - 2
    );
    mesh.rotation.z = (Math.random()-0.5)*0.3;
    scene.add(mesh);
    objects.push({
      mesh,
      vx: (Math.random()-0.5)*0.004,
      vy: (Math.random()-0.5)*0.006,
      vz: (Math.random()-0.5)*0.002,
      rz: (Math.random()-0.5)*0.002,
    });
  }

  // Particle field
  const PCNT = 400;
  const pPos = new Float32Array(PCNT*3);
  const pCol = new Float32Array(PCNT*3);
  for (let i=0; i<PCNT; i++) {
    pPos[i*3]   = (Math.random()-0.5)*22;
    pPos[i*3+1] = (Math.random()-0.5)*20;
    pPos[i*3+2] = (Math.random()-0.5)*8 - 2;
    const red = Math.random() < 0.15;
    const b = Math.random()*0.1+0.02;
    pCol[i*3]=red?0.55:b; pCol[i*3+1]=red?0.18:b; pCol[i*3+2]=red?0.12:b;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos,3));
  pGeo.setAttribute('color',    new THREE.BufferAttribute(pCol,3));
  scene.add(new THREE.Points(pGeo, new THREE.PointsMaterial({
    size:0.04, vertexColors:true, transparent:true, opacity:0.5,
    sizeAttenuation:true, blending:THREE.AdditiveBlending, depthWrite:false
  })));

  const resize = () => {
    const sec = document.getElementById('editorial');
    if (!sec) return;
    const w=sec.clientWidth, h=Math.max(sec.clientHeight,600);
    renderer.setSize(w,h,false);
    camera.aspect=w/h; camera.updateProjectionMatrix();
  };
  resize(); window.addEventListener('resize', resize);

  let frame=0, running=false;
  new IntersectionObserver(e=>{running=e[0].isIntersecting;},{threshold:0.05}).observe(
    document.getElementById('editorial') || canvas
  );

  const animate = () => {
    requestAnimationFrame(animate);
    if (!running) return;
    frame++;
    objects.forEach(o => {
      o.mesh.position.x += o.vx;
      o.mesh.position.y += o.vy;
      o.mesh.rotation.z += o.rz;
      // Bounce within bounds
      if (Math.abs(o.mesh.position.x) > 9) o.vx *= -1;
      if (Math.abs(o.mesh.position.y) > 10) o.vy *= -1;
    });
    renderer.render(scene, camera);
  };
  animate();
}

// ══════════════════════════════════════════════════════════
//  THREE.JS — BRANDS: orbiting geometric fragments
// ══════════════════════════════════════════════════════════
function initThreeBrands() {
  if (typeof THREE === 'undefined') return;
  const canvas = document.getElementById('brands-canvas');
  if (!canvas) return;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
  renderer.setClearColor(0x000000, 0);

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
  camera.position.set(0, 0, 14);

  scene.add(new THREE.AmbientLight(0xffffff, 0.15));
  const l1 = new THREE.DirectionalLight(0x8b2e1e, 1.8);
  l1.position.set(-6, 8, 4); scene.add(l1);
  const l2 = new THREE.DirectionalLight(0xe8ddd0, 0.5);
  l2.position.set(6, -4, 6); scene.add(l2);

  // 8 brand cubes — one per brand — floating and orbiting
  const geos = [
    new THREE.BoxGeometry(0.9,0.9,0.9),
    new THREE.TetrahedronGeometry(0.6,0),
    new THREE.BoxGeometry(1.2,0.3,0.3),
    new THREE.TetrahedronGeometry(0.5,1),
    new THREE.BoxGeometry(0.6,1.2,0.6),
    new THREE.BoxGeometry(0.4,0.4,1.4),
    new THREE.TetrahedronGeometry(0.7,0),
    new THREE.BoxGeometry(0.8,0.8,0.2),
  ];
  const colors = [0x8b2e1e,0x2a1f1a,0x5a4f47,0x1c1410,0x8b2e1e,0x3a2a24,0x2a1f1a,0x8b2e1e];

  const objects = geos.map((geo, i) => {
    const mat  = new THREE.MeshStandardMaterial({
      color: colors[i], metalness:0.4+i*0.05, roughness:0.5,
      wireframe: i%3===0
    });
    const mesh = new THREE.Mesh(geo, mat);
    const angle = (i/8)*Math.PI*2;
    const radius = 4 + (i%3)*1.5;
    mesh.position.set(Math.cos(angle)*radius, Math.sin(angle)*radius*0.6, (Math.random()-0.5)*4);
    scene.add(mesh);
    return { mesh, angle, radius, speed: 0.002+Math.random()*0.003, rotX: Math.random()*0.01, rotY: Math.random()*0.012, rotZ: Math.random()*0.008 };
  });

  const resize = () => {
    const sec = document.getElementById('brands-section');
    if (!sec) return;
    const w=sec.clientWidth, h=Math.max(sec.clientHeight,600);
    renderer.setSize(w,h,false);
    camera.aspect=w/h; camera.updateProjectionMatrix();
  };
  resize(); window.addEventListener('resize', resize);

  let running=false;
  new IntersectionObserver(e=>{running=e[0].isIntersecting;},{threshold:0.05}).observe(
    document.getElementById('brands-section') || canvas
  );

  const animate = () => {
    requestAnimationFrame(animate);
    if (!running) return;
    objects.forEach(o => {
      o.angle += o.speed;
      o.mesh.position.x = Math.cos(o.angle) * o.radius;
      o.mesh.position.y = Math.sin(o.angle) * o.radius * 0.6;
      o.mesh.rotation.x += o.rotX;
      o.mesh.rotation.y += o.rotY;
      o.mesh.rotation.z += o.rotZ;
    });
    renderer.render(scene, camera);
  };
  animate();
}

// ══════════════════════════════════════════════════════════
//  THREE.JS — MANIFESTO: slow drifting 3D redacted slabs
// ══════════════════════════════════════════════════════════
function initThreeManifesto() {
  if (typeof THREE === 'undefined') return;
  const canvas = document.getElementById('manifesto-canvas');
  if (!canvas) return;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
  renderer.setClearColor(0x000000, 0);

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(0, 0, 10);

  scene.add(new THREE.AmbientLight(0xffffff, 0.1));
  const l1 = new THREE.DirectionalLight(0x8b2e1e, 1.5);
  l1.position.set(0, 10, 5); scene.add(l1);
  const l2 = new THREE.DirectionalLight(0x1c1410, 1.0);
  l2.position.set(-8, -5, 2); scene.add(l2);

  const objects = [];
  // Large flat planes like classified document pages drifting
  const pageData = [
    { w:3.5, h:4.8, x:-5, y:2, z:-3, rx:0.1, ry:-0.2 },
    { w:3.0, h:4.2, x:4,  y:-1, z:-2, rx:-0.15, ry:0.25 },
    { w:2.5, h:3.5, x:0,  y:3.5, z:-4, rx:0.05, ry:0.1 },
    { w:4.0, h:5.5, x:-2, y:-4, z:-5, rx:-0.08, ry:-0.12 },
    { w:2.0, h:3.0, x:5.5,y:4,  z:-2, rx:0.12, ry:-0.18 },
  ];

  pageData.forEach((d, i) => {
    const mat = new THREE.MeshStandardMaterial({
      color: i%2===0 ? 0x0f0c0a : 0x1c1410,
      metalness:0.1, roughness:0.9,
      transparent:true, opacity:0.55+i*0.06,
    });
    // Page mesh
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(d.w, d.h, 0.04), mat);
    mesh.position.set(d.x, d.y, d.z);
    mesh.rotation.x = d.rx; mesh.rotation.y = d.ry;
    scene.add(mesh);

    // Red horizontal bars on the page (redacted lines)
    const numBars = 3 + Math.floor(Math.random()*3);
    for (let b=0; b<numBars; b++) {
      const bw = d.w * (0.5+Math.random()*0.45);
      const barMat = new THREE.MeshStandardMaterial({ color:0x8b2e1e, metalness:0.2, roughness:0.7 });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.12, 0.06), barMat);
      bar.position.set((Math.random()-0.5)*(d.w-bw), -d.h/2 + 0.6 + b*(d.h/(numBars+1)), 0.04);
      mesh.add(bar);
    }

    objects.push({ mesh, vy: (Math.random()-0.5)*0.003, rz: (Math.random()-0.5)*0.001 });
  });

  // Sparse particles
  const PCNT = 200;
  const pPos = new Float32Array(PCNT*3);
  for (let i=0; i<PCNT; i++) {
    pPos[i*3]=  (Math.random()-0.5)*20;
    pPos[i*3+1]=(Math.random()-0.5)*18;
    pPos[i*3+2]=(Math.random()-0.5)*8;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos,3));
  scene.add(new THREE.Points(pGeo, new THREE.PointsMaterial({
    size:0.035, color:0x8b2e1e, transparent:true, opacity:0.3,
    blending:THREE.AdditiveBlending, depthWrite:false
  })));

  const resize = () => {
    const sec = document.getElementById('manifesto-section');
    if (!sec) return;
    const w=sec.clientWidth, h=Math.max(sec.clientHeight,600);
    renderer.setSize(w,h,false);
    camera.aspect=w/h; camera.updateProjectionMatrix();
  };
  resize(); window.addEventListener('resize', resize);

  let frame=0, running=false;
  new IntersectionObserver(e=>{running=e[0].isIntersecting;},{threshold:0.05}).observe(
    document.getElementById('manifesto-section') || canvas
  );

  const animate = () => {
    requestAnimationFrame(animate);
    if (!running) return;
    frame++;
    objects.forEach(o => {
      o.mesh.position.y += o.vy;
      o.mesh.rotation.z += o.rz;
      o.mesh.rotation.y = Math.sin(frame*0.006) * 0.15;
      // Wrap vertically
      if (o.mesh.position.y > 12)  o.mesh.position.y = -12;
      if (o.mesh.position.y < -12) o.mesh.position.y =  12;
    });
    renderer.render(scene, camera);
  };
  animate();
}

// ══════════════════════════════════════════════════════════
//  THREE.JS — SUBMIT: scanning beam + floating fragments
// ══════════════════════════════════════════════════════════
function initThreeSubmit() {
  if (typeof THREE === 'undefined') return;
  const canvas = document.getElementById('submit-canvas');
  if (!canvas) return;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
  renderer.setClearColor(0x000000, 0);

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
  camera.position.set(0, 0, 12);

  scene.add(new THREE.AmbientLight(0xffffff, 0.2));
  const l1 = new THREE.DirectionalLight(0x8b2e1e, 2);
  l1.position.set(3, 8, 4); scene.add(l1);
  const l2 = new THREE.DirectionalLight(0xe8ddd0, 0.3);
  l2.position.set(-5, -3, 5); scene.add(l2);

  // Scanning beam plane
  const beamGeo = new THREE.PlaneGeometry(20, 0.06);
  const beamMat = new THREE.MeshBasicMaterial({
    color:0x8b2e1e, transparent:true, opacity:0.35,
    blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.z = -1;
  scene.add(beam);

  // Floating envelope / submission shapes
  const shapes = [];
  for (let i=0; i<8; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: i%2===0 ? 0x1c1410 : 0x2a1f1a,
      metalness:0.4, roughness:0.7, transparent:true, opacity:0.7
    });
    // Flat rectangles like letters/envelopes
    const w = 1.8 + Math.random()*1.2;
    const h = 1.2 + Math.random()*0.8;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), mat);
    mesh.position.set(
      (Math.random()-0.5)*14,
      (Math.random()-0.5)*14,
      (Math.random()-0.5)*4 - 2
    );
    mesh.rotation.z = (Math.random()-0.5)*0.4;
    scene.add(mesh);
    shapes.push({
      mesh,
      vy: -0.01 - Math.random()*0.015, // slowly falling
      rz: (Math.random()-0.5)*0.003,
      startY: mesh.position.y,
    });
  }

  // Sparse grid of dots — like a form being filled
  const DOTS = 300;
  const dPos = new Float32Array(DOTS*3);
  const dCol = new Float32Array(DOTS*3);
  for (let i=0; i<DOTS; i++) {
    const col = Math.floor(Math.random()*16);
    const row = Math.floor(Math.random()*20);
    dPos[i*3]   = -10 + col*1.3;
    dPos[i*3+1] = -13 + row*1.3;
    dPos[i*3+2] = (Math.random()-0.5)*2 - 3;
    const lit = Math.random() > 0.7;
    dCol[i*3]=lit?0.55:0.1; dCol[i*3+1]=lit?0.18:0.08; dCol[i*3+2]=lit?0.12:0.06;
  }
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPos,3));
  dGeo.setAttribute('color',    new THREE.BufferAttribute(dCol,3));
  scene.add(new THREE.Points(dGeo, new THREE.PointsMaterial({
    size:0.06, vertexColors:true, transparent:true, opacity:0.4,
    blending:THREE.AdditiveBlending, depthWrite:false
  })));

  const resize = () => {
    const sec = document.getElementById('submit-section');
    if (!sec) return;
    const w=sec.clientWidth, h=Math.max(sec.clientHeight,600);
    renderer.setSize(w,h,false);
    camera.aspect=w/h; camera.updateProjectionMatrix();
  };
  resize(); window.addEventListener('resize', resize);

  let frame=0, running=false;
  new IntersectionObserver(e=>{running=e[0].isIntersecting;},{threshold:0.05}).observe(
    document.getElementById('submit-section') || canvas
  );

  const animate = () => {
    requestAnimationFrame(animate);
    if (!running) return;
    frame++;

    // Scanning beam sweeps top to bottom
    const t = (Math.sin(frame * 0.018) + 1) * 0.5; // 0 to 1
    beam.position.y = 10 - t * 22;
    beamMat.opacity = 0.2 + Math.sin(frame*0.04)*0.15;

    // Envelopes drift down and wrap
    shapes.forEach(s => {
      s.mesh.position.y += s.vy;
      s.mesh.rotation.z += s.rz;
      if (s.mesh.position.y < -12) s.mesh.position.y = 12;
    });

    renderer.render(scene, camera);
  };
  animate();
}
