import { loadEngine, removeBackground, onProgress, isReady, progressLabel, totalDownloadMB, MODELS } from './engine.js';
import { DEFAULTS, PRESETS, drawResult, drawOriginal, loadImage, outDims, sourceRect, computeTrimBox } from './editor.js';
import { exportCard, exportZip, copyCard } from './download.js';

// ── Small helpers ──────────────────────────────────────────────────────────
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const MAX_PREVIEW = 1280; // px — previews never need full resolution
const STORE_KEY = 'cutlocal:settings:v1';
const PROC_HTML =
  '<span class="ring"></span><span class="proc-label">Queued</span><span class="proc-pct">0%</span>';

const state = {
  cards: [],
  queue: [],
  running: false,
  activeCard: null,
  engineBusy: false,
  opts: { ...DEFAULTS },
  model: 'fast',
  device: 'cpu',
  ranWith: null,
  cardSeq: 0,
};

let el = {};
let enginePromise = null;
let renderTimer = 0;
let toastTimer = 0;

// ── Boot ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

function init() {
  const year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());

  el = {
    dropzone: $('#dropzone'),
    fileinput: $('#fileinput'),
    bgInput: $('#bg-input'),
    status: $('#status'),
    statusTitle: $('#status-title'),
    statusDesc: $('#status-desc'),
    statusBar: $('#status-bar'),
    statusFill: $('#status-fill'),
    loadEngineBtn: $('#load-engine'),
    panel: $('#panel'),
    swatches: $('#swatches'),
    cpick: $('#cpick'),
    bgImageBtn: $('#bg-image-btn'),
    bgClearImage: $('#bg-clear-image'),
    bgBlur: $('#bg-blur'),
    bgBlurWrap: $('#bg-blur-wrap'),
    sizePreset: $('#size-preset'),
    customSize: $('#custom-size'),
    customW: $('#custom-w'),
    customH: $('#custom-h'),
    sizeNote: $('#size-note'),
    padding: $('#padding'),
    paddingVal: $('#padding-val'),
    shadow: $('#shadow'),
    trim: $('#trim'),
    format: $('#format'),
    qualityWrap: $('#quality-wrap'),
    quality: $('#quality'),
    qualityVal: $('#quality-val'),
    prefix: $('#prefix'),
    model: $('#model'),
    rerun: $('#rerun'),
    actrow: $('#actrow'),
    clearBtn: $('#clear-btn'),
    addMoreBtn: $('#add-more-btn'),
    zipBtn: $('#zip-btn'),
    rmeta: $('#rmeta'),
    rtitle: $('#rtitle'),
    rnote: $('#rnote'),
    grid: $('#grid'),
    toast: $('#toast'),
    year,
  };

  // Content-only pages (privacy) load this file but have no tool.
  if (!el.dropzone) return;

  restoreSettings();
  applyPreset(document.body.dataset.preset || 'default');
  syncControls();
  bindEvents();
  onProgress(handleEngineProgress);

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* offline support is a bonus, never a requirement */
      });
    });
  }
}

// ── Settings persistence ───────────────────────────────────────────────────
function restoreSettings() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.model in MODELS) state.model = saved.model;
    if (typeof saved.quality === 'number') state.opts.quality = saved.quality;
    if (typeof saved.prefix === 'string') state.opts.prefix = saved.prefix;
    if (typeof saved.shadow === 'boolean') state.opts.shadow = saved.shadow;
  } catch {
    /* corrupt storage should never break the tool */
  }
}

function saveSettings() {
  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        model: state.model,
        quality: state.opts.quality,
        prefix: state.opts.prefix,
        shadow: state.opts.shadow,
      })
    );
  } catch {
    /* private mode / quota */
  }
}

function applyPreset(name) {
  Object.assign(state.opts, PRESETS[name] || {});
}

// ── Events ─────────────────────────────────────────────────────────────────
function bindEvents() {
  const dz = el.dropzone;

  dz.addEventListener('click', () => {
    // Start the model download while the file picker is open.
    maybePreload();
    el.fileinput.click();
  });
  dz.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      maybePreload();
      el.fileinput.click();
    }
  });

  el.fileinput.addEventListener('change', () => {
    addFiles(el.fileinput.files);
    el.fileinput.value = '';
  });
  el.addMoreBtn.addEventListener('click', () => el.fileinput.click());
  el.clearBtn.addEventListener('click', clearAll);
  el.zipBtn.addEventListener('click', downloadZip);
  el.loadEngineBtn.addEventListener('click', () => startEngine({ announce: true }).catch(() => {}));
  el.rerun.addEventListener('click', reprocessAll);

  // Whole-window drag & drop
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
    dragDepth++;
    dz.classList.add('over');
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dz.classList.remove('over');
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    if (!e.dataTransfer) return;
    e.preventDefault();
    dragDepth = 0;
    dz.classList.remove('over');
    addFiles(e.dataTransfer.files);
  });

  // Paste an image from the clipboard
  document.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    addFiles(files);
  });

  bindPanel();
}

function bindPanel() {
  $$('#swatches [data-bg], #swatches [data-color]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.bg === 'transparent') setBackground('transparent');
      else setBackground('color', btn.dataset.color);
    });
  });

  el.cpick.addEventListener('input', () => setBackground('color', el.cpick.value));

  el.bgImageBtn.addEventListener('click', () => el.bgInput.click());
  el.bgInput.addEventListener('change', async () => {
    const file = el.bgInput.files?.[0];
    el.bgInput.value = '';
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      state.opts.bgImage = await loadImage(url);
      state.opts.bg = 'image';
      state.opts.backgroundBlur = false;
      syncSwatches();
      scheduleRender();
      toast('Image background applied');
    } catch {
      toast('That background image could not be loaded');
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  el.bgClearImage.addEventListener('click', () => {
    state.opts.bgImage = null;
    state.opts.backgroundBlur = false;
    if (state.opts.bg === 'image') state.opts.bg = 'transparent';
    syncSwatches();
    scheduleRender();
  });

  el.bgBlur.addEventListener('change', () => {
    state.opts.backgroundBlur = el.bgBlur.checked;
    scheduleRender();
  });

  el.sizePreset.addEventListener('change', () => {
    state.opts.preset = el.sizePreset.value;
    el.customSize.hidden = el.sizePreset.value !== 'custom';
    scheduleRender();
  });
  el.customW.addEventListener('input', () => {
    state.opts.customW = el.customW.value;
    scheduleRender();
  });
  el.customH.addEventListener('input', () => {
    state.opts.customH = el.customH.value;
    scheduleRender();
  });

  el.padding.addEventListener('input', () => {
    state.opts.padding = Number(el.padding.value);
    el.paddingVal.textContent = `${state.opts.padding}%`;
    scheduleRender();
  });

  el.shadow.addEventListener('change', () => {
    state.opts.shadow = el.shadow.checked;
    saveSettings();
    scheduleRender();
  });

  el.trim.addEventListener('change', () => {
    state.opts.trim = el.trim.checked;
    scheduleRender();
  });

  el.format.addEventListener('change', () => {
    state.opts.format = el.format.value;
    syncFormat();
    scheduleRender();
  });

  el.quality.addEventListener('input', () => {
    state.opts.quality = Number(el.quality.value) / 100;
    el.qualityVal.textContent = el.quality.value;
    saveSettings();
  });

  el.prefix.addEventListener('input', () => {
    state.opts.prefix = el.prefix.value;
    saveSettings();
  });

  el.model.addEventListener('change', () => {
    state.model = el.model.value;
    enginePromise = null;
    saveSettings();
    updateStatusIdle();
    updateMeta();
  });
}

// ── Engine ─────────────────────────────────────────────────────────────────
function setStatus(kind, title, desc, pct) {
  el.status.dataset.state = kind;
  el.statusTitle.textContent = title;
  el.statusDesc.textContent = desc;
  if (pct === undefined) {
    el.statusBar.hidden = true;
  } else {
    el.statusBar.hidden = false;
    el.statusFill.style.width = `${Math.max(2, Math.min(100, pct))}%`;
  }
  el.loadEngineBtn.hidden = kind === 'loading' || kind === 'ready';
}

function updateStatusIdle() {
  if (state.engineBusy) return;
  if (isReady(state.model, state.device)) {
    setStatus('ready', 'AI engine ready', `Cached · ${MODELS[state.model].label} model · nothing is uploaded`);
  } else {
    setStatus(
      'idle',
      'AI engine not loaded yet',
      `It downloads once (~${totalDownloadMB(state.model)} MB) when you add an image, then it is cached and works offline.`
    );
  }
}

function handleEngineProgress(key, current, total) {
  if (!total) return;
  const ratio = Math.min(1, current / total);

  if (key.startsWith('compute')) {
    const pct = Math.round(ratio * 100);
    if (state.activeCard) setCardProgress(state.activeCard, pct);
    return;
  }

  // Runtime files arrive first (~20% of the total), then the model.
  const weighted = key.includes('/models/') ? 20 + ratio * 80 : ratio * 20;
  if (state.engineBusy) {
    setStatus('loading', progressLabel(key), `${Math.round(weighted)}% · one-time download, cached afterwards`, weighted);
  }
  if (state.activeCard) setCardProgress(state.activeCard, Math.round(weighted));
}

function maybePreload() {
  if (isReady(state.model, state.device) || state.engineBusy) return;
  const conn = navigator.connection;
  if (conn && (conn.saveData || /2g/.test(conn.effectiveType || ''))) return;
  startEngine({ announce: false }).catch(() => {});
}

/**
 * Single entry point for the model download. Concurrent callers await the
 * same promise instead of starting a second download.
 */
function startEngine({ announce = true } = {}) {
  if (enginePromise) {
    if (announce && !state.engineBusy) announceEngine();
    return enginePromise;
  }

  state.engineBusy = true;
  announceEngine();

  enginePromise = loadEngine(state.model, state.device)
    .then(() => {
      state.engineBusy = false;
      updateStatusIdle();
    })
    .catch((err) => {
      state.engineBusy = false;
      enginePromise = null;
      setStatus(
        'error',
        'The AI engine could not load',
        `${err?.message || 'Network error'} — check your connection and try again.`
      );
      throw err;
    });

  return enginePromise;
}

function announceEngine() {
  setStatus('loading', 'Loading AI engine…', `About ${totalDownloadMB(state.model)} MB, downloaded once and cached`, 0);
}

// ── Files + queue ──────────────────────────────────────────────────────────
const MAX_FILE_MB = 80;

function addFiles(fileList) {
  const files = [...(fileList || [])];
  const images = files.filter((f) => f.type.startsWith('image/'));
  if (!images.length) {
    toast(files.length ? 'Those files are not images' : 'No images found');
    return;
  }

  let tooBig = 0;
  const accepted = images.filter((f) => {
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      tooBig++;
      return false;
    }
    return true;
  });

  if (!accepted.length) {
    toast(`Images must be under ${MAX_FILE_MB} MB`);
    return;
  }

  for (const file of accepted) {
    const card = createCard(file);
    state.cards.push(card);
    state.queue.push(card);
  }

  el.dropzone.hidden = true;
  el.panel.hidden = false;
  el.actrow.hidden = false;
  el.rmeta.hidden = false;

  updateMeta();
  runQueue();

  if (tooBig) toast(`${tooBig} image${tooBig > 1 ? 's were' : ' was'} too large (max ${MAX_FILE_MB} MB)`);
}

async function runQueue() {
  if (state.running) return;
  state.running = true;

  while (state.queue.length) {
    const card = state.queue.shift();
    if (!state.cards.includes(card)) continue; // removed while queued
    await processCard(card);
    updateMeta();
  }

  state.running = false;
  state.activeCard = null;
  updateMeta();
}

async function processCard(card) {
  card.state = 'proc';
  showProc(card, 'Removing…');

  try {
    if (!isReady(state.model, state.device)) await startEngine({ announce: true });
    if (!isReady(state.model, state.device)) throw new Error('The AI engine is not available.');

    state.activeCard = card;
    setCardProgress(card, 0);

    const blob = await removeBackground(card.file);
    card.cutoutBlob = blob;
    card.cutoutUrl = URL.createObjectURL(blob);
    card.cutoutImg = await loadImage(card.cutoutUrl);
    card.trimBox = computeTrimBox(card.cutoutImg);

    card.state = 'done';
    state.ranWith = state.model;
    hideProc(card);
    card.el.querySelector('[data-act="dl"]').disabled = false;
    card.el.querySelector('[data-act="copy"]').disabled = false;
    renderCard(card);
    if (card.view !== 'result') renderOriginal(card);
    updateSizeNote();
  } catch (err) {
    card.state = 'error';
    showError(card, err?.message || 'Something went wrong while processing this image.');
    console.error(err);
  } finally {
    state.activeCard = null;
  }
}

function showProc(card, label) {
  const proc = card.el.querySelector('.proc');
  proc.innerHTML = PROC_HTML;
  proc.hidden = false;
  card.el.querySelector('.proc-label').textContent = label;
  card.el.querySelector('.proc-pct').textContent = '0%';
}

function setCardProgress(card, pct) {
  const node = card.el.querySelector('.proc-pct');
  if (node && card.state === 'proc') node.textContent = `${pct}%`;
}

function hideProc(card) {
  card.el.querySelector('.proc').hidden = true;
}

function showError(card, message) {
  const proc = card.el.querySelector('.proc');
  proc.hidden = false;
  proc.innerHTML = `<div class="proc-err"><p>${escapeHtml(message)}</p><p style="margin-top:8px">Remove the card and try a smaller image.</p></div>`;
}

function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// ── Card ───────────────────────────────────────────────────────────────────
function createCard(file) {
  const id = `c${++state.cardSeq}`;
  const node = document.createElement('article');
  node.className = 'card';
  node.dataset.id = id;
  node.innerHTML = `
    <div class="card-tabs">
      <button type="button" class="on" data-view="result">Result</button>
      <button type="button" data-view="compare">Compare</button>
      <button type="button" data-view="original">Original</button>
    </div>
    <div class="stage" data-view="result">
      <canvas class="cv-orig"></canvas>
      <canvas class="cv-result on"></canvas>
      <div class="handle" hidden></div>
      <div class="proc">${PROC_HTML}</div>
    </div>
    <div class="card-foot">
      <span class="card-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
      <span class="card-dims" data-role="dims"></span>
      <button type="button" class="icon-btn" data-act="copy" title="Copy to clipboard" aria-label="Copy to clipboard" disabled>⧉</button>
      <button type="button" class="icon-btn primary" data-act="dl" title="Download" aria-label="Download" disabled>↓</button>
      <button type="button" class="icon-btn" data-act="remove" title="Remove from list" aria-label="Remove from list">✕</button>
    </div>`;

  const card = {
    id,
    file,
    el: node,
    stage: node.querySelector('.stage'),
    resultCanvas: node.querySelector('.cv-result'),
    origCanvas: node.querySelector('.cv-orig'),
    cutoutImg: null,
    cutoutBlob: null,
    cutoutUrl: null,
    origImg: null,
    origUrl: null,
    trimBox: null,
    split: 50,
    state: 'queued',
    view: 'result',
  };

  node.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => setView(card, btn.dataset.view));
  });

  node.querySelector('[data-act="dl"]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await exportCard(card, state.opts);
      toast('Saved');
    } catch (err) {
      toast(err?.message || 'Download failed');
    } finally {
      btn.disabled = false;
    }
  });

  node.querySelector('[data-act="copy"]').addEventListener('click', async () => {
    try {
      await copyCard(card, state.opts);
      toast('Copied to clipboard');
    } catch (err) {
      toast(err?.message || 'Copy failed');
    }
  });

  node.querySelector('[data-act="remove"]').addEventListener('click', () => removeCard(card));

  bindCompare(card);
  el.grid.prepend(node);
  return card;
}

function bindCompare(card) {
  const stage = card.stage;
  let dragging = false;

  const setSplit = (clientX) => {
    const rect = stage.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    card.split = Math.max(0, Math.min(100, pct));
    stage.style.setProperty('--split', `${card.split}%`);
  };

  stage.addEventListener('pointerdown', (e) => {
    if (card.view !== 'compare') return;
    dragging = true;
    stage.setPointerCapture?.(e.pointerId);
    setSplit(e.clientX);
  });
  stage.addEventListener('pointermove', (e) => {
    if (dragging) setSplit(e.clientX);
  });
  const stop = () => { dragging = false; };
  stage.addEventListener('pointerup', stop);
  stage.addEventListener('pointercancel', stop);
}

function setView(card, view) {
  card.view = view;
  card.stage.dataset.view = view;
  card.el.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === view));

  card.resultCanvas.classList.toggle('on', view !== 'original');
  card.origCanvas.classList.toggle('on', view === 'original' || view === 'compare');
  card.el.querySelector('.handle').hidden = view !== 'compare';

  if (view !== 'result') renderOriginal(card);
}

async function ensureOriginal(card) {
  if (card.origImg) return card.origImg;
  if (!card.origUrl) card.origUrl = URL.createObjectURL(card.file);
  card.origImg = await loadImage(card.origUrl);
  return card.origImg;
}

async function renderOriginal(card) {
  try {
    const img = await ensureOriginal(card);
    if (card.view === 'result') return; // user switched back while decoding
    drawOriginal(card.origCanvas, img, state.opts, MAX_PREVIEW, card.trimBox);
  } catch {
    /* the compare view is optional — never break the card over it */
  }
}

function renderCard(card) {
  if (!card.cutoutImg) return;
  drawResult(card.resultCanvas, card.cutoutImg, state.opts, MAX_PREVIEW, card.trimBox);

  const rect = sourceRect(card.cutoutImg, state.opts, card.trimBox);
  const full = outDims(rect.sw, rect.sh, state.opts);
  const label = card.el.querySelector('[data-role="dims"]');
  if (label) label.textContent = `${full.w}×${full.h}`;

  if (card.view !== 'result') renderOriginal(card);
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    for (const card of state.cards) {
      if (card.state === 'done') renderCard(card);
    }
    updateSizeNote();
  }, 40);
}

function updateSizeNote() {
  const sample = state.cards.find((c) => c.state === 'done' && c.cutoutImg);
  if (!sample) {
    if (el.sizeNote) el.sizeNote.textContent = '';
    return;
  }
  const full = outDims(
    sourceRect(sample.cutoutImg, state.opts, sample.trimBox).sw,
    sourceRect(sample.cutoutImg, state.opts, sample.trimBox).sh,
    state.opts
  );
  el.sizeNote.textContent = `→ ${full.w} × ${full.h} px`;
}

// ── Settings UI sync ───────────────────────────────────────────────────────
function setBackground(mode, color) {
  state.opts.bg = mode;
  if (color) state.opts.color = color;
  if (mode !== 'image') state.opts.backgroundBlur = false;
  syncSwatches();
  scheduleRender();
}

function syncSwatches() {
  const { bg, color } = state.opts;
  const target = String(color || '').toLowerCase();

  $$('#swatches [data-bg]').forEach((b) => b.classList.toggle('is-on', bg === 'transparent'));
  $$('#swatches [data-color]').forEach((b) =>
    b.classList.toggle('is-on', bg === 'color' && b.dataset.color.toLowerCase() === target)
  );

  const custom = el.swatches.querySelector('.swatch-custom');
  const matchesPreset = $$('#swatches [data-color]').some(
    (b) => b.dataset.color.toLowerCase() === target
  );
  custom.classList.toggle('is-on', bg === 'color' && !matchesPreset);
  el.bgClearImage.hidden = bg !== 'image';
  el.bgBlurWrap.hidden = bg !== 'image';
  el.bgBlur.checked = !!state.opts.backgroundBlur;
  el.bgImageBtn.classList.toggle('is-on', bg === 'image');
}

function syncFormat() {
  el.format.value = state.opts.format;
  el.qualityWrap.hidden = state.opts.format === 'image/png';
}

function syncControls() {
  const o = state.opts;
  el.model.value = state.model;
  el.sizePreset.value = o.preset;
  el.customSize.hidden = o.preset !== 'custom';
  el.customW.value = o.customW;
  el.customH.value = o.customH;
  el.padding.value = o.padding;
  el.paddingVal.textContent = `${o.padding}%`;
  el.shadow.checked = !!o.shadow;
  el.trim.checked = !!o.trim;
  el.quality.value = Math.round(o.quality * 100);
  el.qualityVal.textContent = el.quality.value;
  el.prefix.value = o.prefix || '';
  el.cpick.value = /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : '#a855f7';
  syncSwatches();
  syncFormat();
  updateStatusIdle();
}

// ── Batch actions ──────────────────────────────────────────────────────────
async function downloadZip() {
  const done = state.cards.filter((c) => c.state === 'done');
  if (!done.length) return;

  el.zipBtn.disabled = true;
  try {
    await exportZip(done, state.opts, (p) => {
      el.zipBtn.textContent = `⏳ Packaging ${Math.round(p * 100)}%`;
    });
    toast(`Saved ${done.length} image${done.length > 1 ? 's' : ''} as ZIP`);
  } catch (err) {
    toast(err?.message || 'ZIP export failed');
  } finally {
    updateMeta();
  }
}

async function reprocessAll() {
  if (state.running) return;
  el.rerun.hidden = true;
  state.ranWith = null;

  for (const card of state.cards) {
    card.state = 'queued';
    if (card.cutoutUrl) URL.revokeObjectURL(card.cutoutUrl);
    card.cutoutUrl = null;
    card.cutoutImg = null;
    card.cutoutBlob = null;
    card.trimBox = null;
    showProc(card, 'Queued');
    card.el.querySelector('[data-act="dl"]').disabled = true;
    card.el.querySelector('[data-act="copy"]').disabled = true;
  }

  state.queue = [...state.cards];
  updateMeta();
  await runQueue();
}

function removeCard(card) {
  state.cards = state.cards.filter((c) => c !== card);
  state.queue = state.queue.filter((c) => c !== card);
  if (card.cutoutUrl) URL.revokeObjectURL(card.cutoutUrl);
  if (card.origUrl) URL.revokeObjectURL(card.origUrl);
  card.el.remove();
  if (!state.cards.length) resetUI();
  else updateMeta();
  updateSizeNote();
}

function clearAll() {
  for (const card of state.cards) {
    if (card.cutoutUrl) URL.revokeObjectURL(card.cutoutUrl);
    if (card.origUrl) URL.revokeObjectURL(card.origUrl);
    card.el.remove();
  }
  state.cards = [];
  state.queue = [];
  resetUI();
}

function resetUI() {
  el.grid.innerHTML = '';
  el.dropzone.hidden = false;
  el.panel.hidden = true;
  el.actrow.hidden = true;
  el.rmeta.hidden = true;
  el.rerun.hidden = true;
  el.zipBtn.disabled = true;
  el.zipBtn.textContent = '↓ Download ZIP';
  el.sizeNote.textContent = '';
  state.ranWith = null;
}

function updateMeta() {
  const total = state.cards.length;
  const done = state.cards.filter((c) => c.state === 'done').length;
  const failed = state.cards.filter((c) => c.state === 'error').length;

  el.actrow.hidden = total === 0;
  el.rmeta.hidden = total === 0;
  el.rtitle.innerHTML = `<b>${total}</b> image${total === 1 ? '' : 's'}`;

  if (!total) {
    el.rnote.textContent = '';
    el.zipBtn.disabled = true;
    el.zipBtn.textContent = '↓ Download ZIP';
    return;
  }

  const parts = [done < total ? `${done}/${total} done` : `All ${total} done ✓`];
  if (failed) parts.push(`${failed} failed`);
  if (total > 1) parts.push('filenames kept in ZIP');
  el.rnote.textContent = parts.join(' · ');

  el.zipBtn.disabled = done === 0;
  el.zipBtn.textContent = done ? `↓ Download ZIP (${done})` : '↓ Download ZIP';
  el.rerun.hidden = !(done && state.ranWith && state.ranWith !== state.model);
}

// ── Toast ──────────────────────────────────────────────────────────────────
function toast(message) {
  el.toast.textContent = message;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2600);
}
