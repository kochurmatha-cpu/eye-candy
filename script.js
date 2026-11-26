/* =========================================================================
   WM Theme Viewer — script
   ========================================================================= */

/* -------------------- tiny helpers -------------------- */
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const el = (tag, props={}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k,v] of Object.entries(props||{})){
    if (k === 'class') n.className = v;
    else if (k === 'style' && v && typeof v === 'object') Object.assign(n.style, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v);
  }
  for (const kid of kids){
    if (kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
};
let _tt;
const toast = (msg) => {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(_tt); _tt = setTimeout(()=>t.classList.remove('show'), 2400);
};

/* -------------------- color conversion (ARGB int → CSS) -------------------- */
function intToCss(n, fallback='transparent'){
  if (n == null || n === '') return fallback;
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  const u = v >>> 0;
  const a = ((u >>> 24) & 0xff) / 255;
  const r = (u >>> 16) & 0xff;
  const g = (u >>> 8) & 0xff;
  const b = u & 0xff;
  if (a === 0) return 'transparent';
  if (a === 1) return `rgb(${r} ${g} ${b})`;
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

/* -------------------- filename cleanup -------------------- */
function cleanFilename(name){
  let base = String(name||'theme')
    .replace(/\.wmtheme\.json$/i,'')
    .replace(/\.json$/i,'');
  base = base.replace(/kyng/gi,'').replace(/clink/gi,'');
  base = base.replace(/[\s_\-.]{2,}/g,' ').trim();
  base = base.replace(/^[\s_\-]+|[\s_\-]+$/g,'');
  if (!base) base = 'theme';
  return base + '.wmtheme.json';
}
const baseName = p => { const s = String(p).split(/[\\/]/); return s[s.length-1] || 'theme.wmtheme.json'; };

/* -------------------- font loading -------------------- */
const loadedFonts = new Set();
function loadThemeFont(fontId){
  if (!fontId || typeof fontId !== 'string') return;
  const m = fontId.match(/^google:(.+)$/i);
  if (!m) return;
  const fam = m[1].trim();
  if (!fam || loadedFonts.has(fam)) return;
  loadedFonts.add(fam);
  const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam).replace(/%20/g,'+')}:wght@400;600;700&display=swap`;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = href; link.crossOrigin = 'anonymous';
  document.head.append(link);
}

/* -------------------- theme model -------------------- */
function buildTheme(raw, sourceFilename){
  const t = raw || {};
  const frost = t.frost || {};
  const kOverride = t.keyOverrides || {};
  const pick = (group, key) => {
    const g = kOverride[group];
    if (g && g[key] !== null && g[key] !== undefined) return g[key];
    return t[key];
  };

  const shapeToRadius = (shape) => {
    switch ((shape||'').toUpperCase()){
      case 'PILL': return 999;
      case 'ROUNDED': return 10;
      case 'SQUARE': return 3;
      case 'CIRCLE': return 999;
      default: return null;
    }
  };
  const baseRadius = t.keyCornerRadiusDp != null ? Math.max(2, Math.min(28, t.keyCornerRadiusDp)) : null;
  const keyRadiusPx = baseRadius ?? shapeToRadius(t.keyShape) ?? 8;
  const enterRadiusPx = shapeToRadius(kOverride.ENTER?.shape) ?? keyRadiusPx;

  const warnings = [];
  if (t.keyMaterial) warnings.push('keyMaterial shader');
  if (t.keySkin && typeof t.keySkin === 'string' && !/^data:/i.test(t.keySkin)) warnings.push('keySkin texture');
  if (t.frost && (t.frost.refraction || t.frost.dispersion)) warnings.push('frost refraction/dispersion');
  if (t.decals && Array.isArray(t.decals) && t.decals.length) warnings.push('decals');

  return {
    raw,
    id: t.id || ('local_' + Math.random().toString(36).slice(2,10)),
    name: (t.name || sourceFilename || 'Untitled theme').trim(),
    dark: !!t.dark,
    sourceFilename: sourceFilename || 'theme.wmtheme.json',

    boardBg: intToCss(t.boardBackground, '#000'),
    keyBg: intToCss(pick('LETTERS','background'), '#222'),
    keyText: intToCss(pick('LETTERS','text'), '#fff'),
    modBg: intToCss(t.modifierKeyBackground, intToCss(t.keyBackground, '#333')),
    modText: intToCss(t.modifierKeyText, intToCss(t.keyText, '#fff')),
    enterBg: intToCss(kOverride.ENTER?.background ?? t.enterKeyBackground, intToCss(t.accent, '#0033ff')),
    enterText: intToCss(kOverride.ENTER?.text ?? t.enterKeyText, '#fff'),
    pressedBg: intToCss(t.pressedKeyBackground, intToCss(t.accent, '#3355ff')),
    accent: intToCss(t.accent, '#3b5bff'),
    chipBg: intToCss(t.chipBackground, 'rgba(255,255,255,.06)'),
    chipText: intToCss(t.chipText, '#fff'),
    suggestBg: intToCss(t.suggestionPillBackground, 'rgba(255,255,255,.06)'),
    suggestText: intToCss(pick('LETTERS','text') ?? t.suggestionText, '#fff'),
    popupBg: intToCss(t.popupBackground, '#222'),
    popupText: intToCss(t.popupText, '#fff'),
    toolbarBg: intToCss(t.toolbarBackground, 'transparent'),
    toolbarIcon: intToCss(t.toolbarIcon, '#fff'),
    toolCircleBg: intToCss(t.toolCircleBackground, 'rgba(255,255,255,.06)'),
    divider: intToCss(t.dividerColor, 'rgba(255,255,255,.08)'),
    keyBorder: intToCss(t.keyBorderColor, 'transparent'),
    keyBorderW: t.keyBorderWidthDp || 0,
    keyShape: (t.keyShape || 'ROUNDED').toUpperCase(),
    keyRadiusPx,
    enterRadiusPx,

    fontId: t.fontId || null,
    fontScale: t.fontScale || 1,
    boldLabels: !!t.boldKeyLabels,
    hintFontScale: t.hintFontScale || 1,

    boardEffect: t.boardEffect || null,
    keyLighting: t.keyLighting || null,
    touchBloom: t.touchBloom || null,
    frost: frost.enabled ? frost : null,
    keyEffect: t.keyEffect || null,
    keyEffectColor: intToCss(t.keyEffectColor, null),
    keyEffectParam: t.keyEffectParam || null,
    keyEffectImages: Array.isArray(t.keyEffectImages) ? t.keyEffectImages : [],
    backgroundImage: t.backgroundImageBase64 || t.backgroundImage || null,
    backgroundImageOpacity: t.backgroundImageOpacity ?? 1,
    backgroundImageBlur: t.backgroundImageBlur ?? 0,
    soundStyle: t.soundStyle || null,
    soundCustomId: t.soundCustomId || null,
    animation: t.animation || 'NONE',
    keyOverrides: kOverride,
    warnings
  };
}

/* -------------------- IndexedDB -------------------- */
const DB_NAME='wm-theme-viewer', STORE='themes', DB_VER=1;
let _dbp = null;
function db(){
  if (_dbp) return _dbp;
  _dbp = new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath:'id' });
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return _dbp;
}
async function dbAll(){
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE,'readonly').objectStore(STORE).getAll();
    tx.onsuccess = () => res(tx.result || []);
    tx.onerror = () => rej(tx.error);
  });
}
async function dbPut(theme){
  const d = await db();
  const rec = { id: theme.id, raw: theme.raw, sourceFilename: theme.sourceFilename, addedAt: Date.now() };
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE,'readwrite').objectStore(STORE).put(rec);
    tx.onsuccess = () => res(); tx.onerror = () => rej(tx.error);
  });
}
async function dbClear(){
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE,'readwrite').objectStore(STORE).clear();
    tx.onsuccess = () => res(); tx.onerror = () => rej(tx.error);
  });
}

/* -------------------- state -------------------- */
const state = { themes: [], query: '' };

/* -------------------- ingestion -------------------- */
const MAX_FILES = 50;
const MAX_BYTES = 10 * 1024 * 1024;

async function ingestFiles(fileList){
  const files = [...fileList].filter(Boolean);
  if (!files.length) return;

  const totalBytes = files.reduce((s,f)=>s+(f.size||0), 0);
  if (files.length > MAX_FILES) toast(`Only the first ${MAX_FILES} files will be processed.`);
  if (totalBytes > MAX_BYTES) toast('Batch exceeds 10 MB — this may take a moment.');

  const limited = files.slice(0, MAX_FILES);
  let added = 0, skipped = 0;

  for (const f of limited){
    const name = f.name || '';
    try{
      if (/\.zip$/i.test(name) || f.type === 'application/zip'){
        const buf = await f.arrayBuffer();
        const entries = await unzipEntries(buf);
        for (const e of entries){
          if (/\.(wmtheme\.)?json$/i.test(e.name)){
            try{
              const raw = JSON.parse(await e.text());
              if (await addTheme(raw, baseName(e.name))) added++; else skipped++;
            }catch(_){ skipped++; }
          }
        }
      } else if (/\.json$/i.test(name)){
        const raw = JSON.parse(await f.text());
        if (await addTheme(raw, name)) added++; else skipped++;
      } else {
        skipped++;
      }
    }catch(err){
      console.warn('Failed on', name, err);
      skipped++;
    }
  }

  await refreshFromDb();
  toast(`Added ${added} theme${added===1?'':'s'}${skipped?`, skipped ${skipped}`:''}.`);
}

async function addTheme(raw, sourceFilename){
  if (!raw || typeof raw !== 'object') return false;
  const theme = buildTheme(raw, sourceFilename);
  if (state.themes.some(t => t.id === theme.id)) return false;
  state.themes.push(theme);
  loadThemeFont(theme.fontId);
  await dbPut(theme);
  return true;
}

async function refreshFromDb(){
  const rows = await dbAll();
  const seen = new Set();
  state.themes = [];
  for (const r of rows){
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const theme = buildTheme(r.raw, r.sourceFilename);
    state.themes.push(theme);
    loadThemeFont(theme.fontId);
  }
  render();
}

/* -------------------- unzip (native DecompressionStream) -------------------- */
async function unzipEntries(arrayBuffer){
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  const len = bytes.length;
  let eocd = -1;
  for (let i = len - 22; i >= Math.max(0, len - 65558); i--){
    if (view.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid zip');
  const cdCount = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);

  const entries = [];
  let p = cdOffset;
  const dec = new TextDecoder('utf-8');
  for (let i = 0; i < cdCount; i++){
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const compression = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localHeaderOffset = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    const lnameLen = view.getUint16(localHeaderOffset + 26, true);
    const lextraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + lnameLen + lextraLen;
    const compData = bytes.subarray(dataStart, dataStart + compSize);

    entries.push({
      name,
      async bytes(){
        if (compression === 0) return compData.slice();
        if (compression === 8){
          if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot decompress deflate-raw. Try Chrome/Edge.');
          const ds = new DecompressionStream('deflate-raw');
          const stream = new Blob([compData]).stream().pipeThrough(ds);
          return new Uint8Array(await new Response(stream).arrayBuffer());
        }
        throw new Error('Unsupported zip compression ' + compression);
      },
      async text(){ return new TextDecoder('utf-8').decode(await this.bytes()); }
    });
  }
  return entries;
}

/* -------------------- dataTransfer folder walking -------------------- */
async function collectFromDataTransfer(dt){
  if (!dt) return [];
  const items = dt.items ? [...dt.items] : [];
  if (!items.length) return [...dt.files];
  const out = [];
  const walkers = [];
  for (const item of items){
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
    if (entry) walkers.push(walkEntry(entry, out));
    else {
      const f = item.getAsFile && item.getAsFile();
      if (f) out.push(f);
    }
  }
  await Promise.all(walkers);
  return out;
}
function walkEntry(entry, out){
  return new Promise(resolve => {
    if (entry.isFile){
      entry.file(f => { out.push(f); resolve(); }, () => resolve());
    } else if (entry.isDirectory){
      const reader = entry.createReader();
      const all = [];
      const read = () => reader.readEntries(async entries => {
        if (!entries.length){
          await Promise.all(all.map(e => walkEntry(e, out)));
          resolve(); return;
        }
        all.push(...entries);
        read();
      }, () => resolve());
      read();
    } else resolve();
  });
}

/* -------------------- keyboard markup -------------------- */
const ROWS = [
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l'],
  ['SHIFT','z','x','c','v','b','n','m','DEL'],
  ['SYM','LANG','SPACE','.', 'ENTER']
];

function buildKeyboard(theme, opts={}){
  const big = opts.size === 'big';
  const stage = el('div', { class:'kbd-stage' + (big ? ' relative' : '') });
  if (!big) stage.classList.add('has-bg');
  stage.style.fontFamily = fontFamilyFor(theme);

  // background
  if (theme.boardBg) stage.style.background = theme.boardBg;

  // background image
  if (theme.backgroundImage){
    const bg = el('div', { class:'bg-img' });
    bg.style.backgroundImage = `url(${JSON.stringify(theme.backgroundImage).slice(1,-1)})`;
    bg.style.backgroundSize = 'cover';
    bg.style.backgroundPosition = 'center';
    bg.style.opacity = String(theme.backgroundImageOpacity);
    if (theme.backgroundImageBlur) bg.style.filter = `blur(${theme.backgroundImageBlur}px)`;
    stage.append(bg);
  }

  // board effect (animated gradient behind)
  const be = theme.boardEffect;
  if (be && Array.isArray(be.colors) && be.colors.length){
    const fx = el('div', { class:'boardfx' });
    const c1 = intToCss(be.colors[0], 'transparent');
    const c2 = intToCss(be.colors[1] ?? be.colors[0], 'transparent');
    fx.style.background = `linear-gradient(120deg, ${c1}, ${c2}, ${c1})`;
    fx.style.backgroundSize = '300% 300%';
    const speed = Math.max(0.1, Number(be.speed) || 0.5);
    fx.style.animation = `meldShift ${(12 / speed).toFixed(1)}s ease-in-out infinite`;
    fx.style.opacity = String(Math.max(0.15, Math.min(1, Number(be.intensity) || 0.6)));
    stage.append(fx);
  }

  // frost
  if (theme.frost){
    const f = theme.frost;
    stage.style.setProperty('--frost-blur', (Number(f.backdropBlur) || 0) + 'px');
    stage.style.setProperty('--frost-sat', String(Number(f.saturation) || 1));
    stage.style.setProperty('--frost-bright', String(1 + (Number(f.brightness) || 0)));
  }

  // fx layer for ripple/bloom/particles
  const fx = el('div', { class:'fx-layer' });
  stage.append(fx);
  stage._fx = fx;

  // toolbar
  const toolbar = el('div', { class:'kb-toolbar' });
  ['GIF','☺','⚙','⌨','✨'].forEach(txt => {
    const chip = el('div', { class:'tchip' }, txt);
    chip.style.background = theme.toolCircleBg;
    chip.style.color = theme.toolbarIcon;
    if (theme.frost) chip.classList.add('frosty');
    toolbar.append(chip);
  });
  stage.append(toolbar);

  // suggestion row
  const sugg = el('div', { class:'kb-suggest' });
  ['The','quick','brown','fox'].forEach(word => {
    const sg = el('div', { class:'sg' }, word);
    sg.style.background = theme.suggestBg;
    sg.style.color = theme.suggestText;
    sugg.append(sg);
  });
  stage.append(sugg);

  // keys
  const rows = el('div', { class:'kb-rows' });
  for (const row of ROWS){
    const r = el('div', { class:'kb-row' });
    for (const k of row){
      const isWide = k === 'SPACE';
      const keyEl = el('div', { class:'kb-key' + (isWide ? ' wide' : '') });
      const label = el('span', { class:'label' }, keyLabel(k));
      keyEl.append(label);
      styleKey(theme, keyEl, k);
      if (!big){
        // in mini cards, pressing isn't interactive
      } else {
        keyEl.style.cursor = 'pointer';
        const pressHandler = () => pressKey(theme, keyEl, stage);
        keyEl.addEventListener('pointerdown', pressHandler);
      }
      r.append(keyEl);
    }
    rows.append(r);
  }
  stage.append(rows);

  return stage;
}

function keyLabel(k){
  switch(k){
    case 'SHIFT': return '⇧';
    case 'DEL': return '⌫';
    case 'SYM': return '?123';
    case 'LANG': return '🌐';
    case 'SPACE': return 'space';
    case 'ENTER': return 'return';
    default: return k;
  }
}

function styleKey(theme, node, k){
  let bg, fg, radius;
  if (k === 'ENTER'){ bg = theme.enterBg; fg = theme.enterText; radius = theme.enterRadiusPx; }
  else if (['SHIFT','DEL','SYM','LANG'].includes(k)){ bg = theme.modBg; fg = theme.modText; radius = theme.keyRadiusPx; }
  else if (k === 'SPACE'){ bg = theme.keyBg; fg = theme.keyText; radius = theme.keyRadiusPx; }
  else { bg = theme.keyBg; fg = theme.keyText; radius = theme.keyRadiusPx; }

  node.style.background = bg;
  node.style.color = fg;
  node.style.borderRadius = (radius === 999 ? '999px' : radius + 'px');
  if (theme.keyBorderW && theme.keyBorder !== 'transparent'){
    node.style.border = `${theme.keyBorderW}px solid ${theme.keyBorder}`;
  }
  if (theme.boldLabels) node.style.fontWeight = '700';
  if (theme.frost) node.classList.add('frosty');
  node.dataset.pressedBg = theme.pressedBg;
  node.dataset.accent = theme.accent;
}

function fontFamilyFor(theme){
  if (theme.fontId){
    const m = theme.fontId.match(/^google:(.+)$/i);
    if (m) return `"${m[1].trim()}", system-ui, sans-serif`;
  }
  return 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
}

/* -------------------- key press effects -------------------- */
function pressKey(theme, keyEl, stage){
  // press state
  const origBg = keyEl.style.background;
  keyEl.style.background = keyEl.dataset.pressedBg || origBg;
  keyEl.classList.add('pressed');
  setTimeout(()=>{
    keyEl.classList.remove('pressed');
    keyEl.style.background = origBg;
  }, 110);

  const rect = stage.getBoundingClientRect();
  const krect = keyEl.getBoundingClientRect();
  const cx = krect.left - rect.left + krect.width/2;
  const cy = krect.top - rect.top + krect.height/2;
  const layer = stage._fx;

  // keyLighting
  const kl = theme.keyLighting;
  if (kl && layer){
    const intensity = Number(kl.intensity) || 0.6;
    const sizeDp = Number(kl.sizeDp) || 18;
    const color = kl.color ? intToCss(kl.color) : theme.accent;
    if ((kl.pattern||'').toUpperCase() === 'RIPPLE' || !kl.pattern){
      const r = document.createElement('div');
      r.className = 'ripple';
      const d = Math.max(60, sizeDp * 3);
      r.style.width = r.style.height = d + 'px';
      r.style.left = cx + 'px'; r.style.top = cy + 'px';
      r.style.background = `radial-gradient(circle, ${color} 0%, transparent 65%)`;
      r.style.opacity = String(Math.min(1, intensity));
      layer.append(r);
      setTimeout(()=>r.remove(), 800);
    }
  }

  // touchBloom
  const tb = theme.touchBloom;
  if (tb && layer){
    const b = document.createElement('div');
    b.className = 'bloom';
    const d = Math.max(80, Number(tb.radiusDp) * 2 || 160);
    b.style.width = b.style.height = d + 'px';
    b.style.left = cx + 'px'; b.style.top = cy + 'px';
    const c = tb.color ? intToCss(tb.color) : theme.accent;
    b.style.background = `radial-gradient(circle, ${c} 0%, transparent 70%)`;
    b.style.opacity = String(Math.min(1, Number(tb.light) || 0.6));
    layer.append(b);
    setTimeout(()=>b.remove(), 700);
  }

  // keyEffect particles
  if (theme.keyEffect && theme.keyEffect !== 'NONE' && layer){
    const p = theme.keyEffectParam || {};
    const count = Math.min(24, Math.max(4, Number(p.count) || 8));
    const dur = Math.min(1400, Math.max(300, Number(p.duration) || 650));
    const speed = Number(p.speed) || 1;
    const gravity = Number(p.gravity) || 1;
    const color = theme.keyEffectColor || theme.accent;
    for (let i = 0; i < count; i++){
      const particle = document.createElement('div');
      particle.className = 'particle';
      const size = 3 + Math.random() * 4;
      particle.style.width = particle.style.height = size + 'px';
      particle.style.left = cx + 'px'; particle.style.top = cy + 'px';
      particle.style.background = color;
      const angle = (Math.PI * 2 * i / count) + Math.random() * 0.4;
      const dist = (30 + Math.random() * 50) * speed;
      particle.style.setProperty('--dx', (Math.cos(angle) * dist) + 'px');
      particle.style.setProperty('--dy', (Math.sin(angle) * dist + 30 * gravity) + 'px');
      particle.style.setProperty('--dur', dur + 'ms');
      layer.append(particle);
      setTimeout(()=>particle.remove(), dur + 100);
    }
  }
}

/* -------------------- rendering -------------------- */
function render(){
  const app = $('#app'); if (!app) return;
  app.innerHTML = '';
  const countPill = $('#countPill');
  if (countPill) countPill.textContent = `${state.themes.length} theme${state.themes.length===1?'':'s'}`;

  const hash = location.hash || '';
  const m = hash.match(/^#\/theme\/(.+)$/);
  if (m){
    const id = decodeURIComponent(m[1]);
    const theme = state.themes.find(t => t.id === id);
    if (theme){ renderView(theme); return; }
    app.append(el('div', { class:'empty' },
      'Theme not found. ', el('a', { href:'#', onclick:()=>{location.hash='';} }, 'Back to all themes.')));
    return;
  }
  renderGrid(app);
}

function renderGrid(app){
  const drop = el('div', { id:'drop' },
    el('h3', {}, 'Drop .wmtheme.json or .zip files here'),
    el('p', {}, `Up to ${MAX_FILES} files / 10 MB per batch. Zips are scanned for .wmtheme.json files.`),
    el('div', { class:'row' },
      el('button', { class:'btn primary', onclick:()=>$('#fileInput').click() }, 'Choose files'),
      el('button', { class:'btn', onclick:()=>$('#dirInput').click() }, 'Choose folder')
    )
  );
  drop.addEventListener('dragover', e=>{ e.preventDefault(); drop.classList.add('hot'); });
  drop.addEventListener('dragleave', ()=>drop.classList.remove('hot'));
  drop.addEventListener('drop', async e=>{
    e.preventDefault(); drop.classList.remove('hot');
    const files = await collectFromDataTransfer(e.dataTransfer);
    ingestFiles(files);
  });
  app.append(drop);

  const meta = el('div', { class:'meta' },
    el('span', {}, [ 'Showing ', el('b',{},String(state.themes.length)), ' theme' + (state.themes.length===1?'':'s') ])
  );
  const filter = el('div', { class:'filter' });
  const input = el('input', { type:'search', placeholder:'Filter by name…', value: state.query });
  input.addEventListener('input', () => {
    state.query = input.value;
    renderGrid($('#app'));
  });
  filter.append(input);
  meta.append(filter);
  app.append(meta);

  if (!state.themes.length){
    app.append(el('div', { class:'empty' }, 'No themes yet. Add some to get started.'));
    return;
  }

  const q = state.query.trim().toLowerCase();
  const list = q ? state.themes.filter(t => t.name.toLowerCase().includes(q)) : state.themes;
  if (!list.length){
    app.append(el('div', { class:'empty' }, `No themes match “${state.query}”.`));
    return;
  }

  const grid = el('div', { class:'grid' });
  for (const t of list) grid.append(renderCard(t));
  app.append(grid);
}

function renderCard(theme){
  const card = el('div', { class:'card' });
  const thumb = el('div', { class:'thumb' });
  const inner = el('div', { class:'thumb-inner' });
  inner.append(buildKeyboard(theme, { size:'mini' }));
  thumb.append(inner);
  if (theme.warnings.length){
    thumb.append(el('div', { class:'warn-badge',
      title: 'Approximate preview: ' + theme.warnings.join(', ') }, 'approx'));
  }
  const info = el('div', { class:'info' },
    el('div', { class:'chip' }, theme.dark ? 'dark' : 'light'),
    el('div', { class:'name', title: theme.name }, theme.name),
    el('div', { class:'actions' },
      el('button', { class:'btn sm', onclick:()=>{ location.hash = '#/theme/' + encodeURIComponent(theme.id); } }, 'View'),
      el('button', { class:'btn sm primary', onclick:()=>downloadTheme(theme) }, 'Download')
    )
  );
  card.append(thumb, info);
  return card;
}

/* -------------------- view page -------------------- */
function renderView(theme){
  const app = $('#app');
  const wrap = el('div', { class:'view-wrap' });

  wrap.append(el('div', { class:'crumbs' },
    el('a', { href:'#', onclick:(e)=>{e.preventDefault(); location.hash='';} }, '← All themes')
  ));

  const head = el('div', { class:'view-head' },
    el('h1', {}, theme.name),
    el('div', { class:'actions' },
      el('button', { class:'btn sm', onclick:()=>downloadTheme(theme) }, 'Download .wmtheme.json')
    )
  );
  wrap.append(head);

  if (theme.warnings.length){
    wrap.append(el('div', { class:'warn-banner' },
      el('b', {}, 'Approximate preview. '),
      'This theme uses features that cannot be fully reproduced in the browser: ',
      theme.warnings.map(w => el('code', {}, w)).reduce((a,b)=>[a, ', ', b]),
      '. Open in the WM keyboard app to see the exact result.'
    ));
  }

  const body = el('div', { class:'view-body' });

  // left: big keyboard + typing area
  const left = el('div');
  const panelBig = el('div', { class:'panel' });
  panelBig.append(el('div', { class:'ph' },
    el('span', {}, 'Preview'),
    el('span', { class:'mono', style:{fontSize:'11px',color:'#71717a'} }, theme.dark ? 'dark' : 'light')
  ));
  const bigStage = buildKeyboard(theme, { size:'big' });
  bigStage.classList.add('big-stage');
  const pb = el('div', { style:{padding:'0'} });
  pb.append(bigStage);
  panelBig.append(pb);
  left.append(panelBig);

  const typePanel = el('div', { class:'panel', style:{marginTop:'14px'} });
  typePanel.append(el('div', { class:'ph' }, el('span', {}, 'Type to test')));
  const typeBody = el('div', { class:'pb' });
  const ta = el('textarea', { class:'typing-area', placeholder:'Type here… keys above will glow when you click them.' });
  typeBody.append(ta);
  typePanel.append(typeBody);
  left.append(typePanel);

  // right: info
  const right = el('div', { class:'panel' });
  right.append(el('div', { class:'ph' }, el('span', {}, 'Theme info')));
  const infoBody = el('div', { class:'pb' });
  const kv = el('div', { class:'kv' },
    el('b',{},'Name'), el('span',{}, theme.name),
    el('b',{},'ID'), el('code',{}, theme.id),
    el('b',{},'Source'), el('code',{}, theme.sourceFilename),
    el('b',{},'Mode'), el('span',{}, theme.dark ? 'Dark' : 'Light'),
    el('b',{},'Font'), el('span',{}, theme.fontId || '—'),
    el('b',{},'Key shape'), el('span',{}, theme.keyShape),
    el('b',{},'Accent'), el('span',{}, theme.accent),
    el('b',{},'Sound'), el('span',{}, theme.soundStyle || '—'),
    el('b',{},'Animation'), el('span',{}, theme.animation)
  );
  infoBody.append(kv);
  right.append(infoBody);

  body.append(left, right);
  wrap.append(body);
  app.append(wrap);

  // auto-focus typing area
  setTimeout(()=>{ try{ ta.focus(); }catch(_){} }, 50);
}

/* -------------------- download -------------------- */
function downloadTheme(theme){
  const blob = new Blob([JSON.stringify(theme.raw, null, 0)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = cleanFilename(theme.sourceFilename || theme.name);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 2000);
}

/* -------------------- wiring -------------------- */
function boot(){
  $('#fileInput').addEventListener('change', async e => {
    const files = [...e.target.files]; e.target.value = '';
    ingestFiles(files);
  });
  $('#dirInput').addEventListener('change', async e => {
    const files = [...e.target.files]; e.target.value = '';
    ingestFiles(files);
  });
  $('#btnAdd').addEventListener('click', ()=>$('#fileInput').click());
  $('#btnClear').addEventListener('click', async () => {
    if (!state.themes.length) return;
    if (!confirm('Remove all themes from this browser?')) return;
    await dbClear();
    state.themes = [];
    render();
    toast('Cleared.');
  });
  $('#brandLink').addEventListener('click', e => {
    e.preventDefault(); location.hash = '';
  });
  window.addEventListener('hashchange', render);
  refreshFromDb();
}

document.addEventListener('DOMContentLoaded', boot);
if (document.readyState !== 'loading') boot();