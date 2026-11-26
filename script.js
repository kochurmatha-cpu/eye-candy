/* =========================================================================
   WM Theme Viewer — script.js
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
const state = { themes: [], query: '', selectedVariant: {} };

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

function buildSkinSvg(rawTheme, slot, groupColors){
  if (!slot || !Array.isArray(slot.layers)) return null;
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

  if (theme.keySkin?.slots?.board){
    const boardArt = buildSkinSvg(theme._raw, theme.keySkin.slots.board, { backgroundInt: theme._raw.boardBackground });
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
    for (const k of row) r.append(buildKey(theme, k, { big, stage }));
    rows.append(r);
  }
  stage.append(rows);
  return stage;
}

function buildKey(theme, k, { big, stage }){
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
    const art = buildSkinSvg(theme._raw, slot, groupColors);
    if (art){
      keyEl.classList.add('has-skin');
      keyEl.insertBefore(art.svg, label);

      // *** FIXED LABEL POSITIONING ***
      // labelShift is an offset from the natural center of the cap face,
      // not from the slot's top edge.
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
        'Theme not found. ', el('