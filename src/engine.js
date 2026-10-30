// ─────────────────────────────────────────────────────────────
// AI engine loader.
//
// The segmentation model is ~44–176 MB, so it is never loaded on
// page load. Nothing here runs until the user adds an image (or
// asks for it) — that keeps the landing page fast and keeps
// visitors on mobile data from paying for a download they may
// not want.
//
// The library is imported dynamically so it stays in its own
// chunk and never blocks first paint.
// ─────────────────────────────────────────────────────────────

export const MODELS = {
  fast: { id: 'isnet_quint8', label: 'Fast', modelMB: 44 },
  balanced: { id: 'isnet_fp16', label: 'Balanced', modelMB: 88 },
  best: { id: 'isnet', label: 'Best', modelMB: 176 },
};

/** ONNX Runtime WebAssembly build, downloaded once alongside the model. */
export const RUNTIME_MB = 12;

let libPromise = null;
let readyKey = null;
let readyPromise = null;
let listener = null;
let active = { model: 'fast', device: 'cpu' };

/** The engine reports progress through a single global callback. */
export function onProgress(fn) {
  listener = fn;
}

function emit(key, current, total) {
  if (!listener) return;
  try {
    listener(key, current, total);
  } catch {
    /* a broken listener must never break inference */
  }
}

/**
 * One config object is used for preload() and removeBackground().
 * The library memoises its session on JSON.stringify(config), so the
 * two must be identical or the model gets initialised twice.
 */
function buildConfig(modelKey, device) {
  return {
    model: MODELS[modelKey] ? MODELS[modelKey].id : MODELS.fast.id,
    device: device === 'gpu' ? 'gpu' : 'cpu',
    output: { format: 'image/png', quality: 1 },
    progress: emit,
  };
}

export function totalDownloadMB(modelKey) {
  const model = MODELS[modelKey] || MODELS.fast;
  return model.modelMB + RUNTIME_MB;
}

export function isReady(modelKey, device) {
  return readyKey === `${modelKey}|${device}` && readyPromise !== null;
}

/**
 * Downloads (once) and initialises the model. Safe to call repeatedly.
 */
export function loadEngine(modelKey = 'fast', device = 'cpu') {
  const key = `${modelKey}|${device}`;
  if (readyKey === key && readyPromise) return readyPromise;

  active = { model: modelKey, device };
  readyKey = key;
  readyPromise = (async () => {
    if (!libPromise) libPromise = import('@imgly/background-removal');
    const lib = await libPromise;
    await lib.preload(buildConfig(modelKey, device));
    return lib;
  })();

  // Let a failed download be retried.
  readyPromise.catch(() => {
    if (readyKey === key) {
      readyPromise = null;
      readyKey = null;
    }
  });

  return readyPromise;
}

/**
 * Returns a PNG blob with the background removed, at the original
 * resolution (the mask is rescaled back by the library).
 */
export async function removeBackground(file) {
  const lib = await loadEngine(active.model, active.device);
  const blob = await lib.removeBackground(file, buildConfig(active.model, active.device));
  if (!blob || blob.size === 0) throw new Error('The engine returned an empty image.');
  return blob;
}

/** Human readable label for a progress key coming from the library. */
export function progressLabel(key) {
  if (key.startsWith('fetch:/models/')) return 'Downloading AI model';
  if (key.startsWith('fetch:')) return 'Downloading engine files';
  if (key.startsWith('compute')) return 'Removing background';
  return 'Working';
}
