// Minecraft Skin Layerer - app.js (ESM version)
// Handles layer management, image normalization, compositing, 3D preview, export, and UI logic

import Sortable from "https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/+esm";
import * as skinview3d from "https://cdn.jsdelivr.net/npm/skinview3d@3.4.1/+esm";
import saveAs from "https://cdn.jsdelivr.net/npm/file-saver@2.0.5/+esm";

// --- Constants ---
const SKIN_SIZE = 64;
const LEGACY_HEIGHT = 32;
const MODERN_HEIGHT = 64;
const FLAT_CANVAS_ID = 'flat-preview';
const LAYERS_LIST_ID = 'layers-list';
const LIBRARY_JSON = 'assets/skin-library.json';
let LIBRARY_CATEGORIES = [];
let LIBRARY_SKINS = [];
const SYSTEM_VERSION = 1;
const CONTENT_VERSION = 8;

// --- State ---
let layers = [];
let selectedLayerIdx = null;
let flatCanvas = null;
let flatCtx = null;
let skinViewer = null;
let lastComposite = null;
let librarySelectedCategory = null;
let librarySearchQuery = "";

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

function makeLayer({ name, src, img, visible = true, opacity = 1.0, type = 'custom', credits = undefined }, cb) {
  // Loads and normalizes image, then returns layer object
  const finish = (canvas, normType) => {
    cb({
      name,
      src,
      img: canvas,
      visible,
      opacity,
      type,
      normType,
      credits: credits || undefined,
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
    // Truncate long names for display, show full name on hover
    const maxLen = 18;
    let displayName = layer.name;
    if (displayName.length > maxLen) {
      displayName = displayName.slice(0, maxLen - 1) + '…';
    }
    nameSpan.textContent = displayName;
    nameSpan.title = layer.name;
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

function addLayerFromLibrary(src, name, credits) {
  makeLayer({ name, src, type: 'library', credits: credits }, (layer) => {
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


// --- UI Event Handlers ---
document.getElementById('render-btn').onclick = renderPreviews;
// Modal open/close logic
const exportImportModal = document.getElementById('export-import-modal');
const exportImportBtn = document.getElementById('export-import-modal-btn');
const exportImportClose = document.getElementById('export-import-close');
const exportImportMsg = document.getElementById('export-import-message');

function showExportImportModal() {
  exportImportModal.style.display = 'flex';
  exportImportClose.focus();
  exportImportMsg.style.display = 'none';
  exportImportMsg.textContent = '';
}
    // Export PNG button logic
    document.getElementById('export-png-btn').onclick = function() {
      // Ensure previews are up to date
      renderPreviews();
      // Use the last composited skin
      let composite = lastComposite;
      if (!composite) {
        showMessage('Nothing to export. Please render your skin first.');
        return;
      }
      composite.toBlob(function(blob) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'minecraft-skin.png';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => document.body.removeChild(a), 100);
        exportImportMsg.textContent = 'PNG exported. This is the format you can import into Minecraft.';
        exportImportMsg.style.display = 'block';

        // Check for credited layers
        const creditedLayers = layers.filter(l => l.visible && l.credits);
        if (creditedLayers.length > 0) {
          // Fill modal content
          document.getElementById('credits-count').textContent = creditedLayers.length;
          const creditsList = document.getElementById('credits-list');
          creditsList.innerHTML = '';
          creditedLayers.forEach(layer => {
            const a = document.createElement('a');
            a.textContent = layer.name;
            a.href = typeof layer.credits === 'string' ? layer.credits : '#';
            a.target = '_blank';
            a.className = 'd-block mb-1';
            creditsList.appendChild(a);
          });
          // Show Bootstrap modal
          const modal = new bootstrap.Modal(document.getElementById('export-credits-modal'));
          modal.show();
        }
      }, 'image/png');
    };
function closeExportImportModal() {
  exportImportModal.style.display = 'none';
}

exportImportBtn.onclick = showExportImportModal;
exportImportClose.onclick = closeExportImportModal;

document.addEventListener('keydown', function(e) {
  if (exportImportModal.style.display === 'flex' && e.key === 'Escape') closeExportImportModal();
});

// Export button in modal
document.getElementById('export-btn').onclick = function() {
  exportSkin(function(msg) {
    exportImportMsg.textContent = msg;
    exportImportMsg.style.display = 'block';
  });
};
document.getElementById('library-toggle').onclick = openLibrary;
document.getElementById('library-toggle-side').onclick = openLibrary;
document.getElementById('library-close').onclick = closeLibrary;

// Import logic for modal
function importSkinforgeFile(file, msgCb) {
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const data = JSON.parse(ev.target.result);
      if (typeof data.systemCompatibilityVersion !== 'undefined') {
        if (data.systemCompatibilityVersion < 1) {
          msgCb('Incompatible .skinforge file (systemCompatibilityVersion mismatch).');
          showToast('Incompatible .skinforge file.');
          return;
        }
        if (data.systemCompatibilityVersion > SYSTEM_VERSION) {
          msgCb('Incompatible .skinforge file. (are you from the future?)');
          showToast('Incompatible .skinforge file. (are you from the future?)');
          return;
        }
      } else {
        msgCb('Incompatible .skinforge file (systemCompatibilityVersion mismatch).');
        showToast('Incompatible .skinforge file.');
        return;
      }
      if (!data.exportType || !Array.isArray(data.layers)) {
        msgCb('Invalid .skinforge file.');
        return;
      }
      layers = [];
      let missingLayer = false;
      if (data.exportType === 'embedded') {
        let loaded = 0;
        data.layers.forEach((l, idx) => {
          loadImage(l.imgData, img => {
            makeLayer({
              name: l.name,
              img,
              visible: l.visible,
              opacity: l.opacity,
              type: l.type,
              src: l.src,
              credits: l.credits
            }, layer => {
              layers[idx] = layer;
              loaded++;
              if (loaded === data.layers.length) {
                updateLayersList();
                renderPreviews();
                msgCb('Imported embedded .skinforge config.');
              }
            });
          }, () => {
            missingLayer = true;
            loadImage('assets/error.png', errImg => {
              makeLayer({
                name: 'Missing Layer',
                img: errImg,
                visible: true,
                opacity: 1.0,
                type: 'error'
              }, layer => {
                layers[idx] = layer;
                loaded++;
                if (loaded === data.layers.length) {
                  updateLayersList();
                  renderPreviews();
                  msgCb('Imported embedded .skinforge config (some layers missing).');
                  showToast('One or more layers did not exist and were replaced with error.png');
                }
              });
            });
          });
        });
      } else if (data.exportType === 'reference') {
        let loaded = 0;
        data.layers.forEach((l, idx) => {
          if (l.type === 'library' && l.src) {
            loadImage(l.src, img => {
              makeLayer({
                name: l.name,
                img,
                visible: l.visible,
                opacity: l.opacity,
                type: l.type,
                src: l.src,
                credits: l.credits
              }, layer => {
                layers[idx] = layer;
                loaded++;
                if (loaded === data.layers.length) {
                  updateLayersList();
                  renderPreviews();
                  msgCb('Imported reference .skinforge config.');
                }
              });
            }, () => {
              missingLayer = true;
              loadImage('assets/error.png', errImg => {
                makeLayer({
                  name: 'Missing Layer',
                  img: errImg,
                  visible: true,
                  opacity: 1.0,
                  type: 'error'
                }, layer => {
                  layers[idx] = layer;
                  loaded++;
                  if (loaded === data.layers.length) {
                    updateLayersList();
                    renderPreviews();
                    msgCb('Imported reference .skinforge config (some layers missing).');
                    showToast('One or more layers did not exist and were replaced with error.png');
                  }
                });
              });
            });
          } else {
            loaded++;
            if (loaded === data.layers.length) {
              updateLayersList();
              renderPreviews();
              msgCb('Imported reference .skinforge config (some custom layers missing).');
            }
          }
        });
      } else {
        msgCb('Unknown exportType in .skinforge file.');
      }
    } catch (err) {
      msgCb('Failed to parse .skinforge file.');
    }
  };
  reader.readAsText(file);
}

// Modal import input
document.getElementById('import-input-modal').addEventListener('change', function(e) {
  if (e.target.files && e.target.files[0]) {
    importSkinforgeFile(e.target.files[0], function(msg) {
      exportImportMsg.textContent = msg;
      exportImportMsg.style.display = 'block';
    });
    e.target.value = '';
  }
});

// Keep legacy PNG import for sidebar
document.getElementById('import-input').addEventListener('change', function(e) {
  if (e.target.files && e.target.files[0]) {
    addLayerFromFile(e.target.files[0]);
    e.target.value = '';
  }
});
// Accepts a callback for modal message
function exportSkin(msgCb) {
  if (!layers.length) {
    msgCb('No layers to export.');
    return;
  }
  const embed = document.getElementById('export-embed-checkbox').checked;
  const exportType = embed ? 'embedded' : 'reference';
  const exported = {
    exportType,
    systemCompatibilityVersion: SYSTEM_VERSION,
    contentVersion: CONTENT_VERSION,
    layers: layers.map(layer => {
      const base = {
        credits: layer.credits || undefined,
        name: layer.name,
        type: layer.type,
        opacity: layer.opacity,
        visible: layer.visible,
      };
      if (embed) {
        base.imgData = layer.img.toDataURL();
        base.src = layer.src || null;
      } else {
        base.src = layer.type === 'library' ? layer.src : null;
      }
      return base;
    })
  };
  const json = JSON.stringify(exported, null, 2);
  const blob = new Blob([json], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'skinforge-config.skinforge';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 100);
  msgCb('Configuration exported as .skinforge file.');
}

// --- Toast for missing layers ---
function showToast(msg) {
  let toast = document.getElementById('missing-layer-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'missing-layer-toast';
  toast.className = 'toast align-items-center text-bg-danger border-0 position-fixed bottom-0 end-0 m-4';
  toast.style.zIndex = '4000';
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    toast.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${msg}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    `;
    document.body.appendChild(toast);
  } else {
    toast.querySelector('.toast-body').textContent = msg;
  }
  if (window.bootstrap && window.bootstrap.Toast) {
    const bsToast = window.bootstrap.Toast.getOrCreateInstance(toast);
    bsToast.show();
  } else {
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 10000);
  }
}

function renderLibraryControls() {
  const select = document.getElementById('library-category-select');
  select.innerHTML = '';
  LIBRARY_CATEGORIES.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  });
  // Default to first category
  if (!librarySelectedCategory && LIBRARY_CATEGORIES.length) {
    librarySelectedCategory = LIBRARY_CATEGORIES[0];
    select.value = librarySelectedCategory;
  } else {
    select.value = librarySelectedCategory;
  }
}

document.getElementById('library-category-select').addEventListener('change', function() {
  librarySelectedCategory = this.value;
  renderLibraryList();
});

document.getElementById('library-search').addEventListener('input', function() {
  librarySearchQuery = this.value;
  renderLibraryList();
});

function renderLibraryList() {
  const container = document.getElementById('library-list');
  container.innerHTML = '';
  // Filter by selected category and search query
  const query = librarySearchQuery ? librarySearchQuery.trim().toLowerCase() : '';
  const skins = LIBRARY_SKINS.filter(skin =>
    skin.category === librarySelectedCategory &&
    (!query || skin.name.toLowerCase().includes(query))
  );
  if (!skins.length) {
    const emptyMsg = document.createElement('div');
    emptyMsg.style.color = 'var(--bs-secondary)';
    emptyMsg.style.padding = '1em';
    emptyMsg.textContent = 'No skins found.';
    container.appendChild(emptyMsg);
    return;
  }
  skins.forEach(skin => {
    const item = document.createElement('div');
    item.className = 'library-item';
    item.dataset.src = skin.src;
    item.dataset.credits = skin.credits;
    const img = document.createElement('img');
    img.src = skin.src;
    img.alt = skin.name + ' skin';
    item.appendChild(img);
    const span = document.createElement('span');
    span.textContent = skin.name;
    item.appendChild(span);
    item.onclick = function() {
      addLayerFromLibrary(skin.src, skin.name, skin.credits);
      closeLibrary();
    };
    container.appendChild(item);
  });
}

function openLibrary() {
  document.getElementById('library-overlay').style.display = 'flex';
  document.getElementById('library-close').focus();
  renderLibraryControls();
  renderLibraryList();
}

// Add missing closeLibrary function
function closeLibrary() {
  document.getElementById('library-overlay').style.display = 'none';
}

document.getElementById('library-category-select').addEventListener('change', function() {
  librarySelectedCategory = this.value;
  renderLibraryList();
});

document.getElementById('library-search').addEventListener('input', function() {
  librarySearchQuery = this.value;
  renderLibraryList();
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
  // Load library JSON
  fetch(LIBRARY_JSON)
    .then(res => res.json())
    .then(data => {
      LIBRARY_CATEGORIES = data.categories || [];
      LIBRARY_SKINS = data.skins || [];
      // Load specific layers by name on startup
      let defaultLayerNames = ['Skintone H03', 'Blue Steve Shirt', 'Blue Steve Pants', 'Steve Eyes', 'Steve Hair', 'Steve Beard'];
      let loadedCount = 0;
      layers = new Array(defaultLayerNames.length);
      defaultLayerNames.forEach((layerName, idx) => {
        const skin = LIBRARY_SKINS.find(s => s.name === layerName);
        if (skin) {
          makeLayer({ name: skin.name, src: skin.src, type: 'library', credits: skin.credits }, (layer) => {
            layers[idx] = layer;
            loadedCount++;
            if (loadedCount === defaultLayerNames.length) {
              updateLayersList();
              renderPreviews();
            }
          });
        } else {
          loadedCount++;
          if (loadedCount === defaultLayerNames.length) {
            updateLayersList();
            renderPreviews();
          }
        }
      });
      // Set default category for library select
      librarySelectedCategory = LIBRARY_CATEGORIES[1];
    });
});
