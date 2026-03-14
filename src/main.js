import { removeBackground } from '@imgly/background-removal';
import JSZip from 'jszip';

// ── State ──────────────────────────────────────────────────────────────────
let bgMode = 'transparent';
let bgImageUrl = null;
let cards = [];
let queue = [];
let running = false;
let totalDone = 0;

// ── Boot: auto-load on page open ───────────────────────────────────────────
async function boot() {
  let fakeP = 0;
  const fill = document.getElementById('sfill');
  const fakeTimer = setInterval(() => {
    fakeP = Math.min(fakeP + Math.random() * 4, 88);
    fill.style.width = fakeP + '%';
  }, 180);

  try {
    document.getElementById('sdot').className = 'sdot loading';

    // Warm up — pre-fetch model config so first image is instant
    await removeBackground(await createTinyBlob(), {
      model: 'isnet',
      output: { format: 'image/png', type: 'foreground' },
      progress: (key, cur, tot) => {
        if (tot > 0) {
          const real = Math.round((cur / tot) * 100);
          fill.style.width = Math.max(fakeP, real) + '%';
          document.getElementById('sdesc').textContent =
            'Downloading AI model… ' + real + '% (cached after this)';
        }
      }
    });

    clearInterval(fakeTimer);
    fill.style.width = '100%';
    if (navigator.gpu) document.getElementById('gpu-tag').style.display = '';

    setTimeout(() => {
      document.getElementById('sdot').className = 'sdot ready';
      document.getElementById('stitle').textContent = 'Ready — drop your images below';
      document.getElementById('sdesc').textContent = 'AI loaded · images never leave your device';
      document.getElementById('sprog').style.display = 'none';
      document.getElementById('dropzone').classList.remove('disabled');
    }, 350);

  } catch (e) {
    clearInterval(fakeTimer);
    document.getElementById('sdot').className = 'sdot error';
    document.getElementById('stitle').textContent = 'Failed to load';
    document.getElementById('sdesc').textContent = e.message + ' — refresh to retry';
    document.getElementById('sprog').style.display = 'none';
    console.error(e);
  }
}

// tiny 1×1 transparent PNG blob to warm up the model
async function createTinyBlob() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 4;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 4, 4);
  return new Promise(res => canvas.toBlob(res, 'image/png'));
}

// ── Event wiring ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const dz = document.getElementById('dropzone');
  const fi = document.getElementById('fileinput');

  dz.addEventListener('click', () => fi.click());
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); handleFiles(e.dataTransfer.files); });
  fi.addEventListener('change', () => handleFiles(fi.files));

  document.getElementById('add-more-btn').addEventListener('click', () => fi.click());
  document.getElementById('clear-btn').addEventListener('click', clearAll);
  document.getElementById('zip-btn').addEventListener('click', downloadAll);

  document.querySelectorAll('.swatch[data-bg]').forEach(sw =>
    sw.addEventListener('click', () => setBg(sw.dataset.bg, sw))
  );
  document.getElementById('cpick').addEventListener('change', function () { setBgColor(this.value); });
  document.getElementById('bg-img-btn').addEventListener('click', () => document.getElementById('bginput').click());
  document.getElementById('bginput').addEventListener('change', function () { setBgImage(this); });
  document.getElementById('reprocess-btn').addEventListener('click', reprocessAll);

  boot();
});

// ── File handling ──────────────────────────────────────────────────────────
function handleFiles(files) {
  const imgs = [...files].filter(f => f.type.startsWith('image/'));
  if (!imgs.length) return;

  document.getElementById('dropzone').style.display = 'none';
  document.getElementById('bgrow').classList.add('show');
  document.getElementById('actrow').classList.add('show');
  document.getElementById('rmeta').classList.add('show');

  imgs.forEach(f => {
    const id = 'c' + Date.now() + Math.random().toString(36).slice(2, 6);
    const card = buildCard(id, f);
    cards.push(card);
    queue.push(card);
  });

  updateMeta();
  runQueue();
}

// ── Queue ──────────────────────────────────────────────────────────────────
async function runQueue() {
  if (running) return;
  running = true;
  while (queue.length) await processCard(queue.shift());
  running = false;
  if (totalDone > 0) {
    document.getElementById('zip-btn').disabled = false;
    document.getElementById('reprocess-btn').style.display = '';
  }
}

async function processCard(card) {
  card.state = 'proc';
  card.proc.style.display = 'flex';
  card.pct.textContent = '—';

  try {
    const blob = new Blob([await card.file.arrayBuffer()], { type: card.file.type });
    card.resultBlob = await removeBackground(blob, {
      model: 'isnet',
      progress: (key, cur, tot) => {
        if (tot > 0) card.pct.textContent = Math.round((cur / tot) * 100) + '%';
      },
      output: { format: 'image/png', type: 'foreground' }
    });
    card.state = 'done';
    totalDone++;
    await renderCard(card);
    card.proc.style.display = 'none';
    card.dlbtn.disabled = false;
    card.dlbtn.addEventListener('click', () => dlCard(card));
    updateMeta();
  } catch (e) {
    card.state = 'error';
    card.proc.style.display = 'none';
    card.el.querySelector('.card-img').innerHTML =
      '<div class="card-err"><div class="card-err-icon">⚠</div><p>' + (e.message || 'Processing failed') + '</p></div>';
    console.error(e);
  }
}

// ── Render ─────────────────────────────────────────────────────────────────
async function renderCard(card) {
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res; img.onerror = rej;
    img.src = URL.createObjectURL(card.resultBlob);
  });

  const c = card.canvas;
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d');

  if (bgMode === 'transparent') {
    ctx.clearRect(0, 0, c.width, c.height);
  } else if (bgMode === 'image' && bgImageUrl) {
    const bg = new Image();
    await new Promise(r => { bg.onload = r; bg.src = bgImageUrl; });
    ctx.drawImage(bg, 0, 0, c.width, c.height);
  } else {
    ctx.fillStyle = bgMode;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(img.src);

  c.style.display = 'block';
  card.origImg.style.display = 'none';
  card.el.querySelectorAll('.ctab').forEach(t => t.classList.toggle('on', t.dataset.t === 'result'));
}

async function reprocessAll() {
  for (const c of cards.filter(c => c.state === 'done')) await renderCard(c);
}

// ── BG Controls ────────────────────────────────────────────────────────────
function setBg(val, el) {
  bgMode = val; bgImageUrl = null;
  document.querySelectorAll('.swatch').forEach(s => s.classList.remove('on'));
  if (el) el.classList.add('on');
  reprocessAll();
}

function setBgColor(val) {
  bgMode = val; bgImageUrl = null;
  document.querySelectorAll('.swatch').forEach(s => s.classList.remove('on'));
  document.getElementById('cpick-disp').style.background = val;
  reprocessAll();
}

function setBgImage(input) {
  const f = input.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = e => {
    bgMode = 'image'; bgImageUrl = e.target.result;
    document.querySelectorAll('.swatch').forEach(s => s.classList.remove('on'));
    reprocessAll();
  };
  r.readAsDataURL(f);
}

// ── Download ───────────────────────────────────────────────────────────────
function dlCard(card) {
  card.canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = card.file.name.replace(/\.[^.]+$/, '') + '_nobg.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

async function downloadAll() {
  const done = cards.filter(c => c.state === 'done');
  if (!done.length) return;
  const btn = document.getElementById('zip-btn');
  btn.disabled = true; btn.textContent = '⏳ Zipping...';

  const zip = new JSZip();
  const folder = zip.folder('cutlocal');
  for (const card of done) {
    await new Promise(res => {
      card.canvas.toBlob(blob => {
        folder.file(card.file.name.replace(/\.[^.]+$/, '') + '_nobg.png', blob);
        res();
      }, 'image/png');
    });
  }
  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url; a.download = 'cutlocal_export.zip'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  btn.disabled = false; btn.textContent = '↓ Download ZIP';
}

// ── Clear ──────────────────────────────────────────────────────────────────
function clearAll() {
  cards = []; queue = []; running = false; totalDone = 0;
  document.getElementById('grid').innerHTML = '';
  document.getElementById('dropzone').style.display = '';
  document.getElementById('bgrow').classList.remove('show');
  document.getElementById('actrow').classList.remove('show');
  document.getElementById('rmeta').classList.remove('show');
  document.getElementById('zip-btn').disabled = true;
  document.getElementById('reprocess-btn').style.display = 'none';
}

// ── Card ───────────────────────────────────────────────────────────────────
function buildCard(id, file) {
  const el = document.createElement('div');
  el.className = 'card'; el.id = id;
  el.innerHTML = `
    <div class="card-tabs">
      <button class="ctab on" data-t="result">Result</button>
      <button class="ctab" data-t="orig">Original</button>
    </div>
    <div class="card-img">
      <canvas style="display:none"></canvas>
      <img alt="" style="display:block">
      <div class="proc-ov">
        <div class="proc-ring"></div>
        <div class="proc-lbl">Processing</div>
        <div class="proc-pct">—</div>
      </div>
    </div>
    <div class="card-foot">
      <div class="card-name">${file.name}</div>
      <button class="card-dl" disabled>↓ PNG</button>
    </div>`;

  document.getElementById('grid').prepend(el);

  const canvas = el.querySelector('canvas');
  const origImg = el.querySelector('img');
  origImg.src = URL.createObjectURL(file);

  el.querySelectorAll('.ctab').forEach(tab => {
    tab.addEventListener('click', () => {
      el.querySelectorAll('.ctab').forEach(t => t.classList.remove('on'));
      tab.classList.add('on');
      if (tab.dataset.t === 'result' && canvas.width > 0) {
        canvas.style.display = 'block'; origImg.style.display = 'none';
      } else {
        origImg.style.display = 'block'; canvas.style.display = 'none';
      }
    });
  });

  return {
    id, file, el, canvas, origImg,
    proc: el.querySelector('.proc-ov'),
    pct: el.querySelector('.proc-pct'),
    dlbtn: el.querySelector('.card-dl'),
    resultBlob: null, state: 'pending'
  };
}

function updateMeta() {
  const total = cards.length;
  const done = cards.filter(c => c.state === 'done').length;
  document.getElementById('rtitle').innerHTML = `<span>${total}</span> image${total !== 1 ? 's' : ''}`;
  document.getElementById('rnote').textContent = done < total ? `${done}/${total} done` : `All ${total} done ✓`;
}
