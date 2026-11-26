/* =========================================================================
   WM Theme Viewer — script.js (v3: pagination + lazy + debounced filter)
   ========================================================================= */

const $ = (s, r=document) => r.querySelector(s);
const el = (tag, props={}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k,v] of Object.entries(props||{})){
    if (k === 'class') n.className = v;
    else if (k === 'style' && v && typeof v === 'object') Object.assign(n.style, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v);
  }
  const append = (kid) => {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(append); return; }
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  };
  kids.forEach(append);
  return n;
};
let _tt;
const toast = (msg) => {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(_tt); _tt = setTimeout(()=>t.classList.remove('show'), 2400);
};

/* ---------- color ---------- */
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
function intToRgba(n){
  if (n == null) return null;
  const u = Number(n) >>> 0;
  return { a: ((u >>> 24) & 0xff) / 255, r: (u >>> 16) & 0xff, g: (u >>> 8) & 0xff, b: u & 0xff };
}
const clamp01 = v => Math.max(0, Math.min(1, v));
const to255 = v => Math.round(clamp01(v) * 255);
function rgbToCss({r,g,b,a}){ return `rgba(${to255(r/255)},${to255(g/255)},${to255(b/255)},${(a??1).toFixed(3)})`; }
function applyColorOp(rgba, op, arg){
  if (!rgba) return { r:128, g:128, b:128, a:1 };
  const { r, g, b, a } = rgba;
  const x = Number(arg) || 0;
  if (op === 'alpha') return { r, g, b, a: clamp01(x) };
  if (op === 'darken') return { r: r*(1-x), g: g*(1-x), b: b*(1-x), a };
  if (op === 'lighten') return { r: r + (255-r)*x, g: g + (255-g)*x, b: b + (255-b)*x, a };
  return { r, g, b, a };
}

/* ---------- filename ---------- */
function cleanFilename(name){
  let base = String(name||'theme').replace(/\.wmtheme\.json$/i,'').replace(/\.json$/i,'');
  base = base.replace(/kyng/gi,'').replace(/clink/gi,'');
  base = base.replace(/[\s_\-.]{2,}/g,' ').trim();
  base = base.replace(/^[\s_\-]+|[\s_\-]+$/g,'');
  if (!base) base = 'theme';
  return base + '.wmtheme.json';
}
const baseName = p => { const s = String(p).split(/[\\/]/); return s[s.length-1] || 'theme.wmtheme.json'; };

/* ---------- fonts ---------- */
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

/* ---------- color resolution ---------- */
const GROUP_GLOBALS = {
  LETTERS: { background:'keyBackground', text:'keyText', border:'keyBorderColor' },
  SHIFT:   { background:'modifierKeyBackground', text:'modifierKeyText', border:'keyBorderColor' },
  DELETE:  { background:'modifierKeyBackground', text:'modifierKeyText', border:'keyBorderColor' },
  SYMBOLS: { background:'modifierKeyBackground', text:'modifierKeyText', border:'keyBorderColor' },
  EMOJI:   { background:'modifierKeyBackground', text:'modifierKeyText', border:'keyBorderColor' },
  ENTER:   { background:'enterKeyBackground', text:'enterKeyText', border:'keyBorderColor' },
  SPACE:   { background:'keyBackground', text:'keyText', border:'keyBorderColor' }
};
function pickColor(raw, group, prop){
  const ov = (raw.keyOverrides || {})[group] || {};
  if (ov[prop] != null) return ov[prop];
  const g = GROUP_GLOBALS[group] || {};
  const gfield = g[prop];
  if (gfield && raw[gfield] != null) return raw[gfield];
  if (prop === 'text' && raw.keyText != null) return raw.keyText;
  if (prop === 'background' && raw.keyBackground != null) return raw.keyBackground;
  return null;
}

/* ---------- theme ---------- */
function groupForSlotName(k){
  switch(k){
    case 'ENTER': return 'ENTER';
    case 'SHIFT': return 'SHIFT';
    case 'DEL': return 'DELETE';
    case 'SYM': return 'SYMBOLS';
    case 'LANG': return 'EMOJI';
    case 'SPACE': return 'SPACE';
    default: return 'LETTERS';
  }
}
function slotForGroup(group){
  switch(group){
    case 'ENTER': return 'enter';
    case 'SHIFT': case 'DELETE': case 'SYMBOLS': case 'EMOJI': return 'special';
    case 'SPACE': return 'space';
    default: return 'letter';
  }
}

/* memoize buildTheme */
const _themeMemo = new Map();
function buildThemeMemo(raw, sourceFilename, variantIndex=0){
  const key = (raw.id || sourceFilename || 'x') + '|' + variantIndex;
  if (_themeMemo.has(key)) return _themeMemo.get(key);
  const t = buildTheme(raw, sourceFilename, variantIndex);
  _themeMemo.set(key, t);
  return t;
}

function buildTheme(raw, sourceFilename, variantIndex=0){
  const variants = Array.isArray(raw.variants) ? raw.variants : [];
  const varObj = variantIndex > 0 && variants[variantIndex-1] ? variants[variantIndex-1] : null;
  const t = varObj ? { ...raw, ...varObj } : raw;
  const frost = t.frost || {};

  const variantDots = [{ label: raw.name || 'Base', color: raw.accent, index: 0 }]
    .concat(variants.map((v,i) => ({ label: v.name || `Variant ${i+1}`, color: v.accent ?? raw.accent, index: i+1 })));

  const theme = {
    raw, id: raw.id || ('local_' + Math.random().toString(36).slice(2,10)),
    name: (t.name || sourceFilename || 'Untitled theme').trim(),
    variantIndex, variantCount: 1 + variants.length, variantDots,
    sourceFilename: sourceFilename || 'theme.wmtheme.json',
    dark: !!t.dark,
    boardBg: intToCss(t.boardBackground, '#000'),
    accent: intToCss(t.accent, '#3b5bff'),
    pressedBg: intToCss(t.pressedKeyBackground, intToCss(t.accent, '#3355ff')),
    chipBg: intToCss(t.chipBackground, 'rgba(255,255,255,.06)'),
    chipText: intToCss(t.chipText, '#fff'),
    suggestBg: intToCss(t.suggestionPillBackground, 'rgba(255,255,255,.06)'),
    suggestText: intToCss(t.suggestionText, null),
    toolbarIcon: intToCss(t.toolbarIcon, '#fff'),
    toolCircleBg: intToCss(t.toolCircleBackground, 'rgba(255,255,255,.06)'),
    keyShape: (t.keyShape || 'ROUNDED').toUpperCase(),
    keyRadiusPx: t.keyCornerRadiusDp != null ? Math.max(2, Math.min(28, t.keyCornerRadiusDp)) : 8,
    boldLabels: !!t.boldKeyLabels,
    fontId: t.fontId || null,
    boardEffect: t.boardEffect || null,
    keyLighting: t.keyLighting || null,
    touchBloom: t.touchBloom || null,
    frost: frost.enabled ? frost : null,
    keyEffect: t.keyEffect || null,
    keyEffectColor: intToCss(t.keyEffectColor, null),
    keyEffectParam: t.keyEffectParam || null,
    backgroundImage: t.backgroundImageBase64 || t.backgroundImage || null,
    backgroundImageOpacity: t.backgroundImageOpacity ?? 1,
    backgroundImageBlur: t.backgroundImageBlur ?? 0,
    keySkin: t.keySkin || null,
    keyMaterial: t.keyMaterial || null,
    soundStyle: t.soundStyle || null,
    animation: t.animation || 'NONE',
    _raw: t,
    warnings: (() => {
      const w = [];
      if (t.keyMaterial) w.push('keyMaterial shader');
      if (t.frost && (t.frost.refraction || t.frost.dispersion)) w.push('frost refraction/dispersion');
      return w;
    })()
  };

  theme.colors = {};
  for (const group of Object.keys(GROUP_GLOBALS)){
    theme.colors[group] = {
      bg: intToCss(pickColor(t, group, 'background'), '#222'),
      fg: intToCss(pickColor(t, group, 'text'), '#fff'),
      border: intToCss(pickColor(t, group, 'border'), 'transparent')
    };
  }
  theme.keyBorderW = t.keyBorderWidthDp || 0;
  return theme;
}

/* ---------- IndexedDB ---------- */
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

/* ---------- state ---------- */
const state = {
  themes: [],
  query: '',
  selectedVariant: {},
  page: 1,
  perPage: Number(localStorage.getItem('wmtv.perPage')) || 12
};

/* ---------- ingest ---------- */
const MAX_FILES = 50, MAX_BYTES = 10*1024*1024;
async function ingestFiles(fileList){
  const files = [...fileList].filter(Boolean);
  if (!files.length) return;
  if (files.length > MAX_FILES) toast(`Only the first ${MAX_FILES} files will be processed.`);
  const totalBytes = files.reduce((s,f)=>s+(f.size||0), 0);
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
      } else skipped++;
    }catch(err){ console.warn('Failed on', name, err); skipped++; }
  }
  await refreshFromDb();
  toast(`Added ${added} theme${added===1?'':'s'}${skipped?`, skipped ${skipped}`:''}.`);
}
async function addTheme(raw, sourceFilename){
  if (!raw || typeof raw !== 'object') return false;
  const theme = buildTheme(raw, sourceFilename, 0);
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
    const theme = buildTheme(r.raw, r.sourceFilename, 0);
    state.themes.push(theme);
    loadThemeFont(theme.fontId);
  }
  sortThemes();
  render();
}
function sortThemes(){
  state.themes.sort((a,b)=> a.name.localeCompare(b.name, undefined, { sensitivity:'base', numeric:true }));
}

/* ---------- unzip ---------- */
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
          if (typeof DecompressionStream === 'undefined') throw new Error('Browser lacks deflate-raw support.');
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

/* ---------- drag-drop folder walk ---------- */
async function collectFromDataTransfer(dt){
  if (!dt) return [];
  const items = dt.items ? [...dt.items] : [];
  if (!items.length) return [...dt.files];
  const out = [], walkers = [];
  for (const item of items){
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
    if (entry) walkers.push(walkEntry(entry, out));
    else { const f = item.getAsFile && item.getAsFile(); if (f) out.push(f); }
  }
  await Promise.all(walkers);
  return out;
}
function walkEntry(entry, out){
  return new Promise(resolve => {
    if (entry.isFile){ entry.file(f => { out.push(f); resolve(); }, () => resolve()); }
    else if (entry.isDirectory){
      const reader = entry.createReader();
      const all = [];
      const read = () => reader.readEntries(async entries => {
        if (!entries.length){ await Promise.all(all.map(e => walkEntry(e, out))); resolve(); return; }
        all.push(...entries); read();
      }, () => resolve());
      read();
    } else resolve();
  });
}

/* ---------- keySkin SVG ---------- */
let _svgUid = 0;
const SVG_NS = 'http://www.w3.org/2000/svg';

function resolveSkinColor(rawTheme, slotName, tokenStr, groupColors){
  if (!tokenStr || typeof tokenStr !== 'string') return {r:0,g:0,b:0,a:0};
  const parts = tokenStr.split(':');
  const token = parts[0];
  const op = parts[1] || null;
  const arg = parts[2] || null;

  const faceInt    = groupColors?.backgroundInt ?? rawTheme.keyBackground ?? null;
  const labelInt   = groupColors?.textInt       ?? rawTheme.keyText       ?? null;
  const shadowInt  = rawTheme.keyShadowColor ?? null;
  const previewInt = rawTheme.popupBackground ?? rawTheme.keyBackground ?? null;
  const boardInt   = rawTheme.boardBackground ?? null;

  let baseInt;
  switch(token){
    case 'face': baseInt = faceInt; break;
    case 'label': baseInt = labelInt; break;
    case 'shadow': baseInt = shadowInt; break;
    case 'previewFill': baseInt = previewInt; break;
    case 'board': baseInt = boardInt; break;
    default: baseInt = faceInt; break;
  }
  const rgba = intToRgba(baseInt) || { r:128, g:128, b:128, a:1 };
  if (!op) return rgba;
  return applyColorOp(rgba, op, parseFloat(arg) || 0);
}

function buildSkinSvg(rawTheme, slot, groupColors, opts={}){
  if (!slot || !Array.isArray(slot.layers)) return null;
  const trim = !!opts.trim;
  const size = slot.size || [100, 112];
  const w = size[0], h = size[1];
  const uid = 's' + (++_svgUid);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'skin-svg');
  svg.setAttribute('xmlns', SVG_NS);

  const defs = document.createElementNS(SVG_NS, 'defs');
  svg.append(defs);

  slot.layers.forEach((layer, i) => {
    if (!layer || !layer.d) return;
    if (trim && layer.opacity != null && Number(layer.opacity) < 0.1) return;

    let fillAttr = 'transparent';
    const fill = layer.fill;
    if (fill && typeof fill === 'object'){
      if (fill.color){
        const c = resolveSkinColor(rawTheme, slot, fill.color, groupColors);
        fillAttr = rgbToCss(c);
      } else if (Array.isArray(fill.linear) && Array.isArray(fill.stops)){
        const [x1,y1,x2,y2] = fill.linear;
        const gradId = `${uid}_g${i}`;
        const lg = document.createElementNS(SVG_NS, 'linearGradient');
        lg.setAttribute('id', gradId);
        lg.setAttribute('gradientUnits', 'userSpaceOnUse');
        lg.setAttribute('x1', x1); lg.setAttribute('y1', y1);
        lg.setAttribute('x2', x2); lg.setAttribute('y2', y2);
        for (const st of fill.stops){
          const c = resolveSkinColor(rawTheme, slot, st.color, groupColors);
          const stop = document.createElementNS(SVG_NS, 'stop');
          stop.setAttribute('offset', String(st.at));
          stop.setAttribute('stop-color', rgbToCss(c));
          lg.append(stop);
        }
        defs.append(lg);
        fillAttr = `url(#${gradId})`;
      }
    }
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', layer.d);
    p.setAttribute('fill', fillAttr);
    if (layer.opacity != null) p.setAttribute('opacity', String(layer.opacity));
    svg.append(p);
  });

  const labelShift = slot.labelShift || [0, 0];
  return { svg, w, h, labelShift };
}

/* ---------- keyboard ---------- */
const ROWS = [
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l'],
  ['SHIFT','z','x','c','v','b','n','m','DEL'],
  ['SYM','LANG','SPACE','.','ENTER']
];
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
function fontFamilyFor(theme){
  if (theme.fontId){
    const m = theme.fontId.match(/^google:(.+)$/i);
    if (m) return `"${m[1].trim()}", system-ui, sans-serif`;
  }
  return 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
}

function buildKeyboard(theme, opts={}){
  const big = opts.size === 'big';
  const trim = !big;
  const stage = el('div', { class:'kbd-stage' + (big ? ' relative' : '') });
  if (!big) stage.classList.add('has-bg');
  stage.style.fontFamily = fontFamilyFor(theme);
  if (theme.boardBg) stage.style.background = theme.boardBg;

  if (theme.backgroundImage){
    const bg = el('div', { class:'bg-img' });
    const url = theme.backgroundImage.startsWith('data:') ? theme.backgroundImage : `url("${theme.backgroundImage}")`;
    bg.style.backgroundImage = url.startsWith('url(') ? url : `url(${JSON.stringify(url).slice(1,-1)})`;
    bg.style.backgroundSize = 'cover';
    bg.style.backgroundPosition = 'center';
    bg.style.opacity = String(theme.backgroundImageOpacity);
    if (theme.backgroundImageBlur) bg.style.filter = `blur(${theme.backgroundImageBlur}px)`;
    stage.append(bg);
  }

  const be = theme.boardEffect;
  if (be && Array.isArray(be.colors) && be.colors.length){
    const fx = el('div', { class:'boardfx' });
    const c1 = intToCss(be.colors[0], 'transparent');
    const c2 = intToCss(be.colors[1] ?? be.colors[0], 'transparent');
    fx.style.background = `linear-gradient(120deg, ${c1}, ${c2}, ${c1})`;
    fx.style.backgroundSize = '300% 300%';
    const speed = Math.max(0.1, Number(be.speed) || 0.5);
    fx.style.animation = `meldShift ${(12/speed).toFixed(1)}s ease-in-out infinite`;
    fx.style.opacity = String(Math.max(0.15, Math.min(1, Number(be.intensity) || 0.6)));
    stage.append(fx);
  }

  if (theme.keySkin?.slots?.board && big){
    const boardArt = buildSkinSvg(theme._raw, theme.keySkin.slots.board, { backgroundInt: theme._raw.boardBackground }, { trim });
    if (boardArt){
      const wrap = el('div', { class:'skin-board' });
      wrap.append(boardArt.svg);
      stage.append(wrap);
    }
  }

  if (theme.frost){
    const f = theme.frost;
    stage.style.setProperty('--frost-blur', (Number(f.backdropBlur) || 0) + 'px');
    stage.style.setProperty('--frost-sat', String(Number(f.saturation) || 1));
    stage.style.setProperty('--frost-bright', String(1 + (Number(f.brightness) || 0)));
  }

  const fx = el('div', { class:'fx-layer' });
  stage.append(fx);
  stage._fx = fx;

  const toolbar = el('div', { class:'kb-toolbar' });
  ['GIF','☺','⚙','⌨','✨'].forEach(txt => {
    const chip = el('div', { class:'tchip' }, txt);
    chip.style.background = theme.toolCircleBg;
    chip.style.color = theme.toolbarIcon;
    if (theme.frost) chip.classList.add('frosty');
    toolbar.append(chip);
  });
  stage.append(toolbar);

  const sugg = el('div', { class:'kb-suggest' });
  ['The','quick','brown','fox'].forEach(word => {
    const sg = el('div', { class:'sg' }, word);
    sg.style.background = theme.suggestBg;
    if (theme.suggestText) sg.style.color = theme.suggestText;
    sugg.append(sg);
  });
  stage.append(sugg);

  const rows = el('div', { class:'kb-rows' });
  for (const row of ROWS){
    const r = el('div', { class:'kb-row' });
    for (const k of row) r.append(buildKey(theme, k, { big, stage, trim }));
    rows.append(r);
  }
  stage.append(rows);
  return stage;
}

function buildKey(theme, k, { big, stage, trim }){
  const isSpace = k === 'SPACE';
  const group = groupForSlotName(k);
  const cols = theme.colors[group];

  const keyEl = el('div', { class:'kb-key' + (isSpace ? ' wide' : '') });
  const label = el('span', { class:'label' }, keyLabel(k));
  keyEl.append(label);

  let slotName = slotForGroup(group);
  let slot = theme.keySkin?.slots?.[slotName] || null;

  if (slot){
    const groupColors = {
      backgroundInt: pickColor(theme._raw, group, 'background'),
      textInt:       pickColor(theme._raw, group, 'text')
    };
    const art = buildSkinSvg(theme._raw, slot, groupColors, { trim });
    if (art){
      keyEl.classList.add('has-skin');
      keyEl.insertBefore(art.svg, label);

      const [lx, ly] = art.labelShift;
      const BASE_Y = art.h * 0.5;
      const labelY = BASE_Y + (Number(ly) || 0);
      const labelX = art.w * 0.5 + (Number(lx) || 0);
      label.style.position = 'absolute';
      label.style.left = `${(labelX / art.w) * 100}%`;
      label.style.top  = `${(labelY / art.h) * 100}%`;
      label.style.transform = 'translate(-50%,-50%)';
      label.style.color = cols.fg;
      label.style.zIndex = '3';
      if (theme.boldLabels) label.style.fontWeight = '700';
    }
  } else {
    keyEl.style.background = cols.bg;
    keyEl.style.color = cols.fg;
    keyEl.style.borderRadius = (theme.keyShape === 'PILL' ? '999px' : theme.keyRadiusPx + 'px');
    if (theme.keyBorderW && cols.border !== 'transparent'){
      keyEl.style.border = `${theme.keyBorderW}px solid ${cols.border}`;
    }
    if (theme.boldLabels) keyEl.style.fontWeight = '700';
  }

  if (theme.frost) keyEl.classList.add('frosty');
  if (big){
    keyEl.style.cursor = 'pointer';
    keyEl.addEventListener('pointerdown', () => pressKey(theme, keyEl, stage, slot));
  }
  return keyEl;
}

/* ---------- press effects ---------- */
function pressKey(theme, keyEl, stage, slot){
  const origBg = keyEl.style.background;
  if (!slot){
    keyEl.style.background = theme.pressedBg;
    keyEl.classList.add('pressed');
    setTimeout(() => { keyEl.classList.remove('pressed'); keyEl.style.background = origBg; }, 110);
  } else {
    keyEl.classList.add('pressed-skin');
    setTimeout(() => keyEl.classList.remove('pressed-skin'), 140);
  }

  const rect = stage.getBoundingClientRect();
  const krect = keyEl.getBoundingClientRect();
  const cx = krect.left - rect.left + krect.width/2;
  const cy = krect.top - rect.top + krect.height/2;
  const layer = stage._fx;

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

/* ---------- lazy observer ---------- */
const _lazyObserver = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const e of entries){
    if (!e.isIntersecting) continue;
    const card = e.target;
    _lazyObserver.unobserve(card);
    const baseId = card.dataset.themeId;
    const vIdx = Number(card.dataset.variantIndex) || 0;
    const base = state.themes.find(t => t.id === baseId);
    if (!base) continue;
    const theme = buildThemeMemo(base.raw, base.sourceFilename, vIdx);
    const thumb = card.querySelector('.thumb');
    if (!thumb) continue;
    thumb.innerHTML = '';
    thumb.append(buildKeyboard(theme, { size:'mini' }));
  }
}, { rootMargin: '200px' }) : null;

function buildPlaceholder(base, theme){
  const card = el('div', { class:'card placeholder' });
  card.dataset.themeId = base.id;
  card.dataset.variantIndex = String(theme.variantIndex);
  const thumb = el('div', { class:'thumb' });
  thumb.style.background = theme.boardBg;
  const swatches = el('div', { class:'ph-swatches' });
  [ theme.colors.LETTERS.bg, theme.colors.LETTERS.fg, theme.colors.ENTER.bg ].forEach(c => {
    const sw = el('div', { class:'ph-sw' });
    sw.style.background = c;
    swatches.append(sw);
  });
  thumb.append(
    el('div', { class:'ph-name' }, theme.name),
    swatches
  );
  card.append(thumb);
  return card;
}

/* ---------- render ---------- */
function render(){
  const app = $('#app'); if (!app) return;
  app.innerHTML = '';
  const countPill = $('#countPill');
  if (countPill) countPill.textContent = `${state.themes.length} theme${state.themes.length===1?'':'s'}`;

  const m = (location.hash || '').match(/^#\/theme\/(.+)$/);
  if (m){
    const id = decodeURIComponent(m[1]);
    const base = state.themes.find(t => t.id === id);
    if (!base){
      app.append(el('div', { class:'empty' },
        'Theme not found. ',
        el('a', { href:'#', onclick:(e)=>{e.preventDefault(); location.hash='';} }, 'Back to all themes.')));
      return;
    }
    const vIdx = state.selectedVariant[base.id] || 0;
    const theme = buildThemeMemo(base.raw, base.sourceFilename, vIdx);
    renderView(theme);
    return;
  }
  renderGrid(app);
}

/* ---------- grid render ---------- */
function renderGrid(app){
  // dropzone
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

  // filter bar (hoisted)
  const countEl = el('b', {}, String(state.themes.length));
  const filterbar = el('div', { class:'filterbar' },
    el('span', { class:'count' }, 'Showing ', countEl, ' theme' + (state.themes.length===1?'':'s')),
    el('span', { class:'spacer' })
  );
  const input = el('input', { type:'search', placeholder:'Filter by name…', value: state.query });
  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.query = input.value;
      state.page = 1;
      applyFilter();
    }, 150);
  });
  filterbar.append(input);
  app.append(filterbar);

  if (!state.themes.length){
    app.append(el('div', { class:'empty' }, 'No themes yet. Add some to get started.'));
    return;
  }

  // grid
  const grid = el('div', { class:'grid' });
  grid.id = 'grid';
  app.append(grid);

  // pagination container
  const pageEl = el('div');
  pageEl.id = 'pagination';
  app.append(pageEl);

  // fill once
  fillGrid(grid);
  renderPagination(pageEl);
  applyFilter();
}

function fillGrid(grid){
  grid.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const base of state.themes){
    const vIdx = state.selectedVariant[base.id] || 0;
    const theme = buildThemeMemo(base.raw, base.sourceFilename, vIdx);
    frag.append(renderCard(base, theme, vIdx));
  }
  grid.append(frag);
}

function renderCard(base, theme, vIdx){
  const card = el('div', { class:'card' });
  card.dataset.themeId = base.id;
  card.dataset.variantIndex = String(vIdx);
  card.dataset.name = theme.name.toLowerCase();

  const thumb = el('div', { class:'thumb' });
  // placeholder content (will be replaced when intersecting)
  const ph = buildPlaceholder(base, theme).querySelector('.thumb');
  thumb.append(ph);
  card.append(thumb);

  if (theme.warnings.length){
    thumb.append(el('div', { class:'warn-badge',
      title: 'Approximate preview: ' + theme.warnings.join(', ') }, 'approx'));
  }

  const nameRow = el('div', { class:'name-row' });
  nameRow.append(el('div', { class:'name', title: theme.name }, theme.name));
  if (base.variantCount > 1){
    const dots = el('div', { class:'variant-dots' });
    base.variantDots.forEach(d => {
      const dot = el('button', {
        class: 'vdot' + (d.index === vIdx ? ' active' : ''),
        title: d.label, 'aria-label': d.label,
        onclick: (e) => {
          e.stopPropagation();
          state.selectedVariant[base.id] = d.index;
          render();
        }
      });
      dot.style.background = intToCss(d.color, '#888');
      dots.append(dot);
    });
    nameRow.append(dots);
  }

  const info = el('div', { class:'info' },
    el('div', { class:'chip' }, (theme.dark ? 'dark' : 'light') + (base.variantCount > 1 ? ` · ${vIdx === 0 ? 'base' : 'variant ' + vIdx}` : '')),
    nameRow,
    el('div', { class:'actions' },
      el('button', { class:'btn sm', onclick:()=>{ location.hash = '#/theme/' + encodeURIComponent(base.id); } }, 'View'),
      el('button', { class:'btn sm primary', onclick:()=>downloadTheme(base) }, 'Download')
    )
  );
  card.append(info);

  if (_lazyObserver) _lazyObserver.observe(card);
  else {
    // fallback: build immediately
    const t = theme;
    thumb.innerHTML = '';
    thumb.append(buildKeyboard(t, { size:'mini' }));
  }
  return card;
}

/* ---------- filter + pagination ---------- */
function applyFilter(){
  const grid = document.getElementById('grid');
  if (!grid) return;
  const q = state.query.trim().toLowerCase();
  const cards = [...grid.children];
  let matchCount = 0;
  const matched = [];
  for (const c of cards){
    const name = c.dataset.name || '';
    const ok = !q || name.includes(q);
    c.classList.toggle('filtered-out', !ok);
    if (ok) matched.push(c);
  }

  const total = matched.length;
  const perPage = state.perPage;
  const totalPages = perPage === Infinity ? 1 : Math.max(1, Math.ceil(total / perPage));
  if (state.page > totalPages) state.page = totalPages;

  matched.forEach((c, i) => {
    const inPage = perPage === Infinity || (i >= (state.page-1)*perPage && i < state.page*perPage);
    c.style.display = inPage ? '' : 'none';
  });

  const pag = document.getElementById('pagination');
  if (pag) renderPagination(pag);

  // update count in filter bar (matched count)
  const countB = document.querySelector('.filterbar .count b');
  if (countB) countB.textContent = String(total);
}

function renderPagination(container){
  container.innerHTML = '';
  const q = state.query.trim().toLowerCase();
  const total = state.themes.filter(t => !q || t.name.toLowerCase().includes(q)).length;
  const perPage = state.perPage;
  const totalPages = perPage === Infinity ? 1 : Math.max(1, Math.ceil(total / perPage));

  const bar = el('div', { class:'pagination' });

  if (totalPages > 1){
    const pages = el('div', { class:'pages' });
    const prev = el('button', { onclick: () => { if (state.page > 1){ state.page--; applyFilter(); window.scrollTo({top:0,behavior:'smooth'}); } } });
    prev.textContent = '‹ Prev';
    prev.disabled = state.page === 1;
    pages.append(prev);

    const showNums = buildPageNumbers(state.page, totalPages);
    for (const n of showNums){
      if (n === '…'){
        pages.append(el('span', { class:'ellip' }, '…'));
      } else {
        const b = el('button', { class: n === state.page ? 'active' : '',
          onclick: () => { state.page = n; applyFilter(); window.scrollTo({top:0,behavior:'smooth'}); } }, String(n));
        pages.append(b);
      }
    }
    const next = el('button', { onclick: () => { if (state.page < totalPages){ state.page++; applyFilter(); window.scrollTo({top:0,behavior:'smooth'}); } } });
    next.textContent = 'Next ›';
    next.disabled = state.page === totalPages;
    pages.append(next);
    bar.append(pages);
  }

  // per-page selector
  const pp = el('div', { class:'perpage' });
  pp.append(el('span', {}, 'Per page:'));
  const sel = el('select', {});
  [12, 24, 48, 'All'].forEach(v => {
    const opt = el('option', { value: String(v) }, String(v));
    if (String(state.perPage) === String(v) ||
        (v === 'All' && state.perPage === Infinity)) opt.selected = true;
    sel.append(opt);
  });
  sel.addEventListener('change', () => {
    const v = sel.value;
    state.perPage = v === 'All' ? Infinity : Number(v);
    state.page = 1;
    localStorage.setItem('wmtv.perPage', String(state.perPage));
    applyFilter();
  });
  pp.append(sel);
  bar.append(pp);

  container.append(bar);
}

function buildPageNumbers(current, total){
  const out = [];
  if (total <= 7){ for (let i=1;i<=total;i++) out.push(i); return out; }
  out.push(1);
  if (current > 3) out.push('…');
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i=start;i<=end;i++) out.push(i);
  if (current < total - 2) out.push('…');
  out.push(total);
  return out;
}

/* ---------- view render ---------- */
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
      'These features cannot be fully reproduced in the browser: ',
      theme.warnings.map(w => el('code', {}, w)).reduce((a,b)=>[a, ', ', b]),
      '. Open in the WM keyboard app to see the exact result.'
    ));
  }

  const body = el('div', { class:'view-body' });
  const left = el('div');
  const panelBig = el('div', { class:'panel' });
  panelBig.append(el('div', { class:'ph' },
    el('span', {}, 'Preview'),
    el('span', { class:'mono', style:{fontSize:'11px',color:'#71717a'} },
      (theme.dark ? 'dark' : 'light') + (theme.variantIndex > 0 ? ` · variant ${theme.variantIndex}` : ''))
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
  const ta = el('textarea', { class:'typing-area', placeholder:'Type here… click keys above to see press effects.' });
  typeBody.append(ta);
  typePanel.append(typeBody);
  left.append(typePanel);

  const right = el('div', { class:'panel' });
  right.append(el('div', { class:'ph' }, el('span', {}, 'Theme info')));
  const infoBody = el('div', { class:'pb' });
  infoBody.append(el('div', { class:'kv' },
    el('b',{},'Name'), el('span',{}, theme.name),
    el('b',{},'ID'), el('code',{}, theme.id),
    el('b',{},'Source'), el('code',{}, theme.sourceFilename),
    el('b',{},'Mode'), el('span',{}, theme.dark ? 'Dark' : 'Light'),
    el('b',{},'Font'), el('span',{}, theme.fontId || '—'),
    el('b',{},'Key shape'), el('span',{}, theme.keyShape),
    el('b',{},'Accent'), el('span',{}, theme.accent),
    el('b',{},'keySkin'), el('span',{}, theme.keySkin ? 'yes (SVG)' : 'no'),
    el('b',{},'Sound'), el('span',{}, theme.soundStyle || '—')
  ));
  right.append(infoBody);

  if (theme.variantCount > 1){
    const vpanel = el('div', { class:'panel', style:{marginTop:'14px'} });
    vpanel.append(el('div', { class:'ph' }, el('span', {}, 'Variants')));
    const vb = el('div', { class:'pb' });
    const row = el('div', { class:'variant-row' });
    theme.variantDots.forEach(d => {
      const b = el('button', {
        class: 'variant-pill' + (d.index === theme.variantIndex ? ' active' : ''),
        onclick: () => { state.selectedVariant[theme.id] = d.index; render(); }
      });
      const dot = el('span', { class:'vdot' });
      dot.style.background = intToCss(d.color, '#888');
      b.append(dot, document.createTextNode(' ' + d.label));
      row.append(b);
    });
    vb.append(row);
    vpanel.append(vb);
    right.append(vpanel);
  }

  body.append(left, right);
  wrap.append(body);
  app.append(wrap);
  setTimeout(()=>{ try{ ta.focus(); }catch(_){} }, 50);
}

/* ---------- download ---------- */
function downloadTheme(base){
  const blob = new Blob([JSON.stringify(base.raw, null, 0)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = cleanFilename(base.sourceFilename || base.name);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 2000);
}

/* ---------- boot ---------- */
function boot(){
  $('#fileInput').addEventListener('change', async e => {
    const files = [...e.target.files]; e.target.value = ''; ingestFiles(files);
  });
  $('#dirInput').addEventListener('change', async e => {
    const files = [...e.target.files]; e.target.value = ''; ingestFiles(files);
  });
  $('#btnAdd').addEventListener('click', ()=>$('#fileInput').click());
  $('#btnClear').addEventListener('click', async () => {
    if (!state.themes.length) return;
    if (!confirm('Remove all themes from this browser?')) return;
    await dbClear(); state.themes = []; state.selectedVariant = {};
    _themeMemo.clear();
    render(); toast('Cleared.');
  });
  $('#brandLink').addEventListener('click', e => { e.preventDefault(); location.hash = ''; });
  window.addEventListener('hashchange', render);
  refreshFromDb();
}
document.addEventListener('DOMContentLoaded', boot);
if (document.readyState !== 'loading') boot();