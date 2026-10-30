// ─────────────────────────────────────────────────────────────
// Canvas compositor.
//
// Background removal is the expensive part and only runs once per
// image. Everything below is plain 2D canvas work, so changing the
// background colour, size, padding or format re-renders instantly
// without touching the model again.
// ─────────────────────────────────────────────────────────────

/** Browsers get unstable above this, and nobody needs it. */
const MAX_SIDE = 6000;

export const SIZE_PRESETS = {
  original: { mode: 'original' },
  long2048: { mode: 'longest', size: 2048 },
  long1024: { mode: 'longest', size: 1024 },
  sq1080: { mode: 'square', size: 1080 },
  sq600: { mode: 'square', size: 600 },
  og: { mode: 'exact', w: 1200, h: 630 },
  custom: { mode: 'exact' },
};

export const DEFAULTS = {
  bg: 'transparent', // transparent | color | image
  color: '#ffffff',
  bgImage: null, // HTMLImageElement
  preset: 'original',
  customW: 1200,
  customH: 1200,
  padding: 0,
  shadow: false,
  trim: false,
  format: 'image/png',
  quality: 0.92,
  prefix: '',
};

/** Per-page starting points, so each landing page opens ready to go. */
export const PRESETS = {
  default: {},
  white: { bg: 'color', color: '#ffffff', preset: 'sq1080', padding: 4, format: 'image/jpeg' },
  passport: { bg: 'color', color: '#ffffff', preset: 'sq600', padding: 6, format: 'image/jpeg' },
  transparent: { bg: 'transparent', preset: 'original', format: 'image/png' },
};

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function intOr(value, fallback) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * The pixel size of the finished file (before the preview downscale).
 */
export function outDims(srcW, srcH, opts) {
  const spec = SIZE_PRESETS[opts.preset] || SIZE_PRESETS.original;
  let w = srcW;
  let h = srcH;

  if (spec.mode === 'longest') {
    const s = Math.min(1, spec.size / Math.max(srcW, srcH));
    w = Math.round(srcW * s);
    h = Math.round(srcH * s);
  } else if (spec.mode === 'square') {
    w = h = spec.size;
  } else if (spec.mode === 'exact') {
    w = intOr(opts.customW, 1200);
    h = intOr(opts.customH, 1200);
  }

  const p = clamp(opts.padding || 0, 0, 40) / 100;
  if (spec.mode !== 'square' && spec.mode !== 'exact' && p > 0) {
    const pad = Math.round(Math.max(w, h) * p);
    w += pad * 2;
    h += pad * 2;
  }

  const cap = MAX_SIDE / Math.max(w, h);
  if (cap < 1) {
    w = Math.round(w * cap);
    h = Math.round(h * cap);
  }
  return { w: Math.max(1, w), h: Math.max(1, h) };
}

/**
 * The part of the source image that should be used: everything, or the
 * subject's bounding box when "trim edges" is on.
 */
export function sourceRect(img, opts, trimBox) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const box = trimBox !== undefined ? trimBox : opts && opts.trimBox;
  if (!opts || !opts.trim || !box || box.w < 2 || box.h < 2) return { sx: 0, sy: 0, sw: w, sh: h };
  const sx = Math.max(0, Math.min(w - 1, box.x));
  const sy = Math.max(0, Math.min(h - 1, box.y));
  return {
    sx,
    sy,
    sw: Math.max(1, Math.min(w - sx, box.w)),
    sh: Math.max(1, Math.min(h - sy, box.h)),
  };
}

/**
 * Bounding box of the non-transparent pixels, measured on a ~700 px
 * copy and mapped back to full resolution. Runs once per image.
 */
export function computeTrimBox(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return null;

  const s = Math.min(1, 700 / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * s));
  const ch = Math.max(1, Math.round(h * s));

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, cw, ch);
  const data = ctx.getImageData(0, 0, cw, ch).data;

  let minX = cw;
  let minY = ch;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (data[(y * cw + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null;

  // One pixel of slack so a soft edge is never clipped.
  minX = Math.max(0, minX - 1);
  minY = Math.max(0, minY - 1);
  maxX = Math.min(cw - 1, maxX + 1);
  maxY = Math.min(ch - 1, maxY + 1);

  const x = Math.floor(minX / s);
  const y = Math.floor(minY / s);
  return {
    x,
    y,
    w: Math.min(w - x, Math.ceil((maxX - minX + 1) / s)),
    h: Math.min(h - y, Math.ceil((maxY - minY + 1) / s)),
  };
}

function paintBackground(ctx, W, H, opts) {
  if (opts.bg === 'color') {
    ctx.fillStyle = opts.color || '#ffffff';
    ctx.fillRect(0, 0, W, H);
    return;
  }

  if (opts.bg === 'image' && opts.bgImage && opts.bgImage.naturalWidth) {
    const img = opts.bgImage;
    const cover = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    // Overscan slightly so a blur never reveals the canvas edge.
    const over = opts.backgroundBlur ? 1.15 : 1;
    const w = img.naturalWidth * cover * over;
    const h = img.naturalHeight * cover * over;

    ctx.save();
    if (opts.backgroundBlur) {
      ctx.filter = `blur(${Math.max(2, Math.round(Math.min(W, H) * 0.04))}px)`;
    }
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    ctx.restore();
    return;
  }

  if (opts.bg === 'image') {
    ctx.fillStyle = '#161616';
    ctx.fillRect(0, 0, W, H);
  }
  // 'transparent' → leave the canvas empty.
}

/**
 * Draws the finished image into `canvas`. Synchronous, so it can be
 * called on every slider movement without a queue.
 *
 * @param {HTMLCanvasElement} canvas destination (reused, resized here)
 * @param {HTMLImageElement} img     the cutout
 * @param {object} opts              export options
 * @param {number} maxDim            cap for previews (0 = full size)
 */
export function drawResult(canvas, img, opts, maxDim = 0, trimBox) {
  const { sx, sy, sw: srcW, sh: srcH } = sourceRect(img, opts, trimBox);
  const target = outDims(srcW, srcH, opts);

  const down = maxDim > 0 && Math.max(target.w, target.h) > maxDim
    ? maxDim / Math.max(target.w, target.h)
    : 1;

  const W = Math.max(1, Math.round(target.w * down));
  const H = Math.max(1, Math.round(target.h * down));

  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const jpeg = opts.format === 'image/jpeg';
  const effective = jpeg && opts.bg === 'transparent'
    ? { ...opts, bg: 'color', color: '#ffffff' } // JPEG has no alpha
    : opts;

  paintBackground(ctx, W, H, effective);

  // Content box: in fixed-canvas modes padding insets the subject,
  // in free modes the canvas was already grown by outDims().
  const spec = SIZE_PRESETS[opts.preset] || SIZE_PRESETS.original;
  const fixed = spec.mode === 'square' || spec.mode === 'exact';
  const p = clamp(opts.padding || 0, 0, 40) / 100;
  const padX = fixed ? W * p : 0;
  const padY = fixed ? H * p : 0;

  const boxW = Math.max(1, W - padX * 2);
  const boxH = Math.max(1, H - padY * 2);
  const scale = Math.min(boxW / srcW, boxH / srcH);
  const dw = srcW * scale;
  const dh = srcH * scale;
  const dx = (W - dw) / 2;
  const dy = (H - dh) / 2;

  if (opts.shadow) {
    ctx.save();
    const unit = Math.min(W, H);
    ctx.shadowColor = 'rgba(0,0,0,0.42)';
    ctx.shadowBlur = unit * 0.055;
    ctx.shadowOffsetY = unit * 0.03;
    ctx.drawImage(img, sx, sy, srcW, srcH, dx, dy, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(img, sx, sy, srcW, srcH, dx, dy, dw, dh);
  }

  return { w: W, h: H };
}

/**
 * Same geometry, but showing the untouched photo — used by the
 * compare slider, so both halves line up pixel for pixel.
 */
export function drawOriginal(canvas, img, opts, maxDim = 0, trimBox) {
  const { sx, sy, sw: srcW, sh: srcH } = sourceRect(img, opts, trimBox);
  const target = outDims(srcW, srcH, opts);
  const down = maxDim > 0 && Math.max(target.w, target.h) > maxDim
    ? maxDim / Math.max(target.w, target.h)
    : 1;

  const W = Math.max(1, Math.round(target.w * down));
  const H = Math.max(1, Math.round(target.h * down));

  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, W, H);

  const spec = SIZE_PRESETS[opts.preset] || SIZE_PRESETS.original;
  const fixed = spec.mode === 'square' || spec.mode === 'exact';
  const p = clamp(opts.padding || 0, 0, 40) / 100;
  const boxW = Math.max(1, W - (fixed ? W * p * 2 : 0));
  const boxH = Math.max(1, H - (fixed ? H * p * 2 : 0));
  const scale = Math.min(boxW / srcW, boxH / srcH);
  const dw = srcW * scale;
  const dh = srcH * scale;
  ctx.drawImage(img, sx, sy, srcW, srcH, (W - dw) / 2, (H - dh) / 2, dw, dh);

  return { w: W, h: H };
}

/** PNG / WebP / JPEG encoding. Resolves to an empty blob on failure. */
export function encode(canvas, format, quality) {
  return new Promise((resolve) => {
    const type = format || 'image/png';
    const q = type === 'image/png' ? undefined : clamp(quality, 0.4, 1);
    canvas.toBlob((blob) => resolve(blob), type, q);
  });
}

export const EXTENSIONS = {
  'image/png': 'png',
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
};

/** Loads a blob into an <img>, which is what the canvas draws from. */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file could not be decoded as an image.'));
    img.src = src;
  });
}
