import { drawResult, encode, EXTENSIONS } from './editor.js';

/** Removes the extension and anything a filesystem might dislike. */
export function baseName(fileName) {
  return (fileName || 'image')
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .trim()
    .slice(0, 80) || 'image';
}

export function fileNameFor(card, opts, index, all) {
  const ext = EXTENSIONS[opts.format] || 'png';
  const prefix = (opts.prefix || '').trim();
  let name = `${prefix}${baseName(card.file.name)}.${ext}`;

  // Two "photo.jpg" files in one batch would overwrite each other.
  if (all) {
    const clash = all
      .slice(0, index)
      .some((c) => `${prefix}${baseName(c.file.name)}.${ext}` === name);
    if (clash) name = `${prefix}${baseName(card.file.name)}-${index + 1}.${ext}`;
  }
  return name;
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Full-resolution export of one card. */
export async function exportCard(card, opts) {
  const canvas = document.createElement('canvas');
  drawResult(canvas, card.cutoutImg, opts, 0, card.trimBox);
  const blob = await encode(canvas, opts.format, opts.quality);
  if (!blob) throw new Error('Export failed — the image may be too large.');
  triggerDownload(blob, fileNameFor(card, opts));
}

/** Copies the cutout to the clipboard as PNG (for Figma, Slack, Docs…). */
export async function copyCard(card, opts) {
  const canvas = document.createElement('canvas');
  drawResult(canvas, card.cutoutImg, { ...opts, format: 'image/png' }, 0, card.trimBox);
  const blob = await encode(canvas, 'image/png');
  if (!blob) throw new Error('Could not create the image.');
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    throw new Error('Clipboard images are not supported in this browser.');
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

/**
 * Zips every finished card. Compression is STORE because PNG/WebP/JPEG
 * are already compressed — deflating them again only costs time.
 */
export async function exportZip(cards, opts, onProgress) {
  // Loaded on demand: the ZIP library is ~100 kB and only needed here.
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const folder = zip.folder('cutlocal');
  const names = cards.map((c) => fileNameFor(c, opts));
  const seen = new Map();

  for (const card of cards) {
    const canvas = document.createElement('canvas');
    drawResult(canvas, card.cutoutImg, opts, 0, card.trimBox);
    const blob = await encode(canvas, opts.format, opts.quality);
    let name = names[cards.indexOf(card)] || 'image.png';
    if (seen.has(name)) {
      const n = seen.get(name) + 1;
      seen.set(name, n);
      name = name.replace(/\.(\w+)$/, `-${n}.$1`);
    } else {
      seen.set(name, 0);
    }
    if (blob) folder.file(name, blob);
    if (onProgress) onProgress(0.1 + (cards.indexOf(card) / cards.length) * 0.6);
  }

  const out = await zip.generateAsync(
    { type: 'blob', compression: 'STORE' },
    (meta) => onProgress && onProgress(0.7 + (meta.percent / 100) * 0.3)
  );
  triggerDownload(out, 'cutlocal-export.zip');
}

export { triggerDownload };
