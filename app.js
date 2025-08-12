// Minecraft Skin Layerer - app.js
// Handles layer management, image normalization, compositing, 3D preview, export, and UI logic

// --- Constants ---
const SKIN_SIZE = 64;
const LEGACY_HEIGHT = 32;
const MODERN_HEIGHT = 64;
const FLAT_CANVAS_ID = 'flat-preview';
const LAYERS_LIST_ID = 'layers-list';
const LIBRARY_SKINS = [
  { name: 'Steve', src: 'assets/skins/steve.png' },
  { name: 'Tinkerer', src: 'assets/skins/tinkerer.png' }
];

// --- State ---
let layers = [];
let selectedLayerIdx = null;
let flatCanvas = null;
let flatCtx = null;
let skinview3d = null;
let skinViewer = null;
let lastComposite = null;

// --- Utility Functions ---
function showMessage(msg, timeout = 3000) {
  const el = document.getElementById('message');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, timeout);
}

function isLegacySkin(img) {
  return img.height === LEGACY_HEIGHT && img.width === SKIN_SIZE;
}

function normalizeImage(img, cb) {
  // Accepts HTMLImageElement or HTMLCanvasElement
  // Returns a 64x64 canvas, scaling or padding as needed
  const canvas = document.createElement('canvas');
  canvas.width = SKIN_SIZE;
  canvas.height = MODERN_HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, SKIN_SIZE, MODERN_HEIGHT);
  // Handle legacy 64x32
  if (img.width === SKIN_SIZE && img.height === LEGACY_HEIGHT) {
    ctx.drawImage(img, 0, 0);
    // Copy top half to bottom half (fill with transparent)
    // Optionally, fill lower half with transparent (already done)
    cb(canvas, 'legacy');
    return;
  }
  // Handle 2:1 ratio (e.g. 128x64)
  if (img.width / img.height === 2 && img.width > SKIN_SIZE) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, SKIN_SIZE, MODERN_HEIGHT);
    cb(canvas, 'modern');
    return;
  }
  // Handle 64x64 or 1:1 ratio
  if (img.width === SKIN_SIZE && img.height === MODERN_HEIGHT) {
    ctx.drawImage(img, 0, 0);
    cb(canvas, 'modern');
    return;
  }
  // Other aspect ratios: fit and warn
  ctx.imageSmoothingEnabled = false;
  let scale = Math.min(SKIN_SIZE / img.width, MODERN_HEIGHT / img.height);
  let w = img.width * scale;
  let h = img.height * scale;
  let x = (SKIN_SIZE - w) / 2;
  let y = (MODERN_HEIGHT - h) / 2;
  ctx.drawImage(img, 0, 0, img.width, img.height, x, y, w, h);
  showMessage('Image was auto-fit to 64x64. Check preview.');
  cb(canvas, 'fit');
}

function loadImage(src, cb, errCb) {
  const img = new window.Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => cb(img);
  img.onerror = errCb || (() => showMessage('Failed to load image: ' + src));
  img.src = src;
}

function makeLayer({ name, src, img, visible = true, opacity = 1.0, type = 'custom' }, cb) {
  // Loads and normalizes image, then returns layer object
  const finish = (canvas, normType) => {
    cb({
      name,
      src,
      img: canvas,
      visible,
      opacity,
      type,
      normType
    });
  };
  if (img) {
    normalizeImage(img, finish);
  } else if (src) {
    loadImage(src, (loadedImg) => normalizeImage(loadedImg, finish), () => showMessage('Failed to load: ' + name));
  }
}

function updateLayersList() {
  const ul = document.getElementById(LAYERS_LIST_ID);
  ul.innerHTML = '';
  layers.forEach((layer, idx) => {
    const li = document.createElement('li');
    li.className = 'layer-item' + (selectedLayerIdx === idx ? ' selected' : '');
    li.setAttribute('draggable', 'true');
    // Thumbnail
    const thumb = document.createElement('canvas');
    thumb.width = thumb.height = 32;
    thumb.className = 'layer-thumb';
    thumb.title = layer.name;
    const tctx = thumb.getContext('2d');
    tctx.imageSmoothingEnabled = false;
    tctx.clearRect(0, 0, 32, 32);
    tctx.drawImage(layer.img, 0, 0, 32, 32);
    thumb.onclick = () => selectLayer(idx);
    li.appendChild(thumb);
    // Name
    const nameSpan = document.createElement('span');
    nameSpan.className = 'layer-name';
    nameSpan.textContent = layer.name;
    nameSpan.onclick = () => selectLayer(idx);
    li.appendChild(nameSpan);
    // Actions
    const actions = document.createElement('div');
    actions.className = 'layer-actions';
    // Visibility
    const visBtn = document.createElement('button');
    visBtn.className = 'layer-action-btn';
    visBtn.innerHTML = layer.visible ? '👁️' : '🚫';
    visBtn.title = layer.visible ? 'Hide layer' : 'Show layer';
    visBtn.onclick = (e) => { e.stopPropagation(); toggleLayerVisibility(idx); };
    actions.appendChild(visBtn);
    // Remove
    const remBtn = document.createElement('button');
    remBtn.className = 'layer-action-btn';
    remBtn.innerHTML = '🗑️';
    remBtn.title = 'Remove layer';
    remBtn.onclick = (e) => { e.stopPropagation(); removeLayer(idx); };
    actions.appendChild(remBtn);
    li.appendChild(actions);
    // Select on click
    li.onclick = () => selectLayer(idx);
    ul.appendChild(li);
  });
  // Re-init SortableJS
  if (window.Sortable) {
    if (!ul._sortable) {
      ul._sortable = Sortable.create(ul, {
        animation: 150,
        onEnd: function (evt) {
          if (evt.oldIndex !== evt.newIndex) {
            const moved = layers.splice(evt.oldIndex, 1)[0];
            layers.splice(evt.newIndex, 0, moved);
            updateLayersList();
          }
        }
      });
    }
  }
}

function selectLayer(idx) {
  selectedLayerIdx = idx;
  updateLayersList();
  showLayerProps(idx);
}

function showLayerProps(idx) {
  const props = document.getElementById('layer-props');
  if (idx == null || !layers[idx]) {
    props.style.display = 'none';
    return;
  }
  props.style.display = 'block';
  document.getElementById('layer-props-thumb').src = layers[idx].img.toDataURL();
  document.getElementById('layer-opacity').value = Math.round(layers[idx].opacity * 100);
}

document.getElementById('layer-opacity').addEventListener('input', function() {
  if (selectedLayerIdx != null && layers[selectedLayerIdx]) {
    layers[selectedLayerIdx].opacity = this.value / 100;
  }
});

document.getElementById('layer-opacity').addEventListener('change', function() {
  if (selectedLayerIdx != null && layers[selectedLayerIdx]) {
    showLayerProps(selectedLayerIdx);
  }
});

function toggleLayerVisibility(idx) {
  layers[idx].visible = !layers[idx].visible;
  updateLayersList();
}

function removeLayer(idx) {
  layers.splice(idx, 1);
  if (selectedLayerIdx === idx) selectedLayerIdx = null;
  updateLayersList();
  showLayerProps(selectedLayerIdx);
}

function addLayerFromLibrary(src, name) {
  makeLayer({ name, src, type: 'library' }, (layer) => {
    layers.push(layer);
    updateLayersList();
    showMessage('Added "' + name + '" as new layer.');
  });
}

function addLayerFromFile(file) {
  if (!file.type.match('image/png')) {
    showMessage('Only PNG images are supported.');
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e) {
    loadImage(e.target.result, (img) => {
      makeLayer({ name: file.name.replace(/\.png$/i, ''), img, type: 'custom' }, (layer) => {
        layers.push(layer);
        updateLayersList();
        showMessage('Imported "' + file.name + '" as new layer.');
      });
    }, () => showMessage('Failed to load image.'));
  };
  reader.readAsDataURL(file);
}

function compositeLayers() {
  // Returns a 64x64 canvas composited from visible layers, top-to-bottom
  const canvas = document.createElement('canvas');
  canvas.width = SKIN_SIZE;
  canvas.height = MODERN_HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, SKIN_SIZE, MODERN_HEIGHT);
  layers.forEach(layer => {
    if (layer.visible) {
      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(layer.img, 0, 0);
    }
  });
  ctx.globalAlpha = 1.0;
  return canvas;
}

function renderPreviews() {
  // Composite layers and update both previews
  const composite = compositeLayers();
  // Flat preview
  flatCtx.clearRect(0, 0, SKIN_SIZE, MODERN_HEIGHT);
  flatCtx.drawImage(composite, 0, 0);
  lastComposite = composite;
  // 3D preview
  update3DPreview(composite);
}

function update3DPreview(canvas) {
  if (!skinViewer) {
    skinViewer = new skinview3d.SkinViewer({
      canvas: document.createElement('canvas'),
      width: 192,
      height: 256,
      renderPaused: false
    });
    document.getElementById('skinview3d-container').appendChild(skinViewer.canvas);
    skinViewer.controls.enableZoom = true;
    skinViewer.controls.enableRotate = true;
    skinViewer.animation = new skinview3d.WalkingAnimation();
    skinViewer.animation.paused = true;
    skinViewer.camera.position.set(20, 20, 40);
  }
  skinViewer.loadSkin(canvas.toDataURL());
}

function exportSkin() {
  if (!lastComposite) {
    showMessage('Please Render first.');
    return;
  }
  lastComposite.toBlob(function(blob) {
    saveAs(blob, 'skin.png');
  }, 'image/png');
}

// --- UI Event Handlers ---
document.getElementById('render-btn').onclick = renderPreviews;
document.getElementById('export-btn').onclick = exportSkin;
document.getElementById('library-toggle').onclick = openLibrary;
document.getElementById('library-toggle-side').onclick = openLibrary;
document.getElementById('library-close').onclick = closeLibrary;

document.getElementById('import-input').addEventListener('change', function(e) {
  if (e.target.files && e.target.files[0]) {
    addLayerFromFile(e.target.files[0]);
    e.target.value = '';
  }
});

document.querySelectorAll('.library-item').forEach(item => {
  item.onclick = function() {
    addLayerFromLibrary(item.dataset.src, item.dataset.name);
    closeLibrary();
  };
});

function openLibrary() {
  document.getElementById('library-overlay').style.display = 'flex';
  document.getElementById('library-close').focus();
}
function closeLibrary() {
  document.getElementById('library-overlay').style.display = 'none';
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeLibrary();
  if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
    renderPreviews();
    e.preventDefault();
  }
});

// --- Drag-and-drop import ---
document.querySelector('.layers-panel').addEventListener('dragover', function(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});
document.querySelector('.layers-panel').addEventListener('drop', function(e) {
  e.preventDefault();
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    addLayerFromFile(e.dataTransfer.files[0]);
  }
});

// --- Initialization ---
window.addEventListener('DOMContentLoaded', function() {
  flatCanvas = document.getElementById(FLAT_CANVAS_ID);
  flatCtx = flatCanvas.getContext('2d');
  // Pre-populate with Steve as base layer
  makeLayer({ name: 'Steve', src: 'assets/skins/steve.png', type: 'library' }, (layer) => {
    layers.push(layer);
    updateLayersList();
    renderPreviews();
  });
});
