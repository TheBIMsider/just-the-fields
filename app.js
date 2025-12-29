/* Just the Fields (v1 scaffold)
  Viewer-only, offline-friendly JSON viewer.
  No backend. No installs. GitHub Pages compatible.

  This file starts with:
  - Drag/drop + file picker
  - Safe JSON parsing with per-file errors
  - File list UI + selection
  - Basic viewer shell
  - Raw JSON toggle (works once a file is selected)

  Next steps (we will do feature-by-feature):
  1) Record type detection (Issue, RFI, Submittal, Generic)
  2) Templates + collapsible sections + arrays collapsed
  3) Search filtering on label/path/value
*/

'use strict';

/* ------------------------------------------------------------
    Constants
------------------------------------------------------------ */

// Special template-select value for “Auto (best match)”
const TEMPLATE_AUTO_ID = '__auto__';

/** @typedef {"Issue"|"RFI"|"Submittal"|"Generic"} RecordType */

/**
 * Represents a loaded file and its parsed content (or error).
 */
class LoadedFile {
  /**
   * @param {File} file
   * @param {number} id
   */
  constructor(file, id) {
    this.id = id;
    this.file = file;
    this.name = file.name;
    this.size = file.size;
    this.lastModified = file.lastModified;
    this.text = '';
    this.json = null;
    /** @type {string|null} */
    this.error = null;
    /** @type {RecordType} */
    this.recordType = 'Generic';
  }
}

/* ------------------------------------------------------------
    DOM references + App state
------------------------------------------------------------ */

const els = {
  dropZone: document.getElementById('dropZone'),
  fileInput: document.getElementById('fileInput'),
  fileList: document.getElementById('fileList'),
  viewer: document.getElementById('viewer'),
  viewerTitle: document.getElementById('viewerTitle'),
  viewerMeta: document.getElementById('viewerMeta'),
  modeSelect: document.getElementById('modeSelect'),
  downloadTemplateBtn: document.getElementById('downloadTemplateBtn'),
  recordSelect: document.getElementById('recordSelect'),
  searchInput: document.getElementById('searchInput'),
  recordSearchGroup: document.getElementById('recordSearchGroup'),
  includeCollapsedToggle: document.getElementById('includeCollapsedToggle'),
  includeCollapsedLabel: document.getElementById('includeCollapsedLabel'),
  rawToggle: document.getElementById('rawToggle'),
  themeToggle: document.getElementById('themeToggle'),
  pathToggle: document.getElementById('pathToggle'),
  datasetBar: document.getElementById('datasetBar'),
  datasetFilter: document.getElementById('datasetFilter'),
  datasetJump: document.getElementById('datasetJump'),
  datasetGoBtn: document.getElementById('datasetGoBtn'),
  datasetResetBtn: document.getElementById('datasetResetBtn'),

  // Templates (Session 10)
  templateInput: document.getElementById('templateInput'),
  uploadTemplateBtn: document.getElementById('uploadTemplateBtn'),
  templateSelect: document.getElementById('templateSelect'),

  clearBtn: document.getElementById('clearBtn'),
};

/*
  App state map (high level)
  - files: loaded JSON files (each with extracted records + metadata)
  - activeFileId: which file is currently selected
  - selectedRecordIndexByFileId: record dropdown selection per file (Records mode)
  - viewModeByFileId: per-file mode override (auto | dataset | records)
  - templates + activeTemplateId: uploaded templates and current selection (None | Auto | explicit)
  - UI toggles: theme, showPaths, collapse behavior, search behavior
*/
const state = {
  /** @type {LoadedFile[]} */
  files: [],
  /** @type {number|null} */
  activeFileId: null,

  // Per-file selected record index (for multi-record files)
  /** @type {Record<number, number>} */
  selectedRecordIndexByFileId: {},

  // Per-file viewer mode override: 'auto' | 'dataset' | 'records'
  /** @type {Record<number, 'auto'|'dataset'|'records'>} */
  viewModeByFileId: {},

  searchQuery: '',
  includeCollapsedInSearch: false,
  showPaths: false,
  showRaw: false,

  // Theme: 'light' or 'dark'
  theme: 'light',

  // Dataset mode UI state per file (Session 6)
  /** @type {Record<number, { filter: string, jumpIndex: number|null, lastJumpInput: string }>} */
  datasetUiByFileId: {},

  // Templates (Session 10)
  /** @type {{ id: string, name: string, rawText: string, template: any, sourceFileName: string }[]} */
  templates: [],
  /** @type {string|null} */
  activeTemplateId: null,
};

/* ------------------------------------------------------------
    Utilities
------------------------------------------------------------ */

function looksLikeUrl(s) {
  if (typeof s !== 'string') return false;
  return /^https?:\/\/\S+/i.test(s);
}

function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  const value = i === 0 ? String(Math.round(n)) : n.toFixed(1);
  return `${value} ${units[i]}`;
}

/**
 * Apply Prism highlighting to any JSON code blocks under a root element.
 * Safe no-op if Prism is not loaded.
 * @param {HTMLElement} root
 */
function highlightJsonIn(root) {
  if (!root) return;
  if (window.Prism && typeof window.Prism.highlightAllUnder === 'function') {
    window.Prism.highlightAllUnder(root);
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/**
 * Normalize a value to a single readable line.
 * Used for labels, badges, and compact previews.
 */
function safeOneLine(s, maxLen) {
  const str = String(s == null ? '' : s)
    .replace(/\s+/g, ' ')
    .trim();
  if (!str) return '';
  return str.length > maxLen ? `${str.slice(0, maxLen)}…` : str;
}

function initTheme() {
  const saved = readThemePreference();
  state.theme = saved || 'light';
  applyTheme(state.theme);

  // Set toggle position
  if (els.themeToggle) {
    els.themeToggle.checked = state.theme === 'dark';
    els.themeToggle.addEventListener('change', () => {
      const next = els.themeToggle.checked ? 'dark' : 'light';
      state.theme = next;
      applyTheme(next);
      writeThemePreference(next);
    });
  }
}

/**
 * Apply theme to the app and to Prism CSS links.
 * @param {'light'|'dark'} theme
 */
function applyTheme(theme) {
  document.documentElement.setAttribute(
    'data-theme',
    theme === 'dark' ? 'dark' : 'light'
  );

  // Prism theme links
  const prismLight = document.getElementById('prismLight');
  const prismDark = document.getElementById('prismDark');

  if (prismLight && prismDark) {
    const useDark = theme === 'dark';
    prismLight.disabled = useDark;
    prismDark.disabled = !useDark;
  }
}

function readThemePreference() {
  try {
    const v = localStorage.getItem('jtfTheme');
    if (v === 'light' || v === 'dark') return v;
    return null;
  } catch {
    return null;
  }
}

/** @param {'light'|'dark'} theme */
function writeThemePreference(theme) {
  try {
    localStorage.setItem('jtfTheme', theme);
  } catch {
    // Ignore storage failures (private mode, blocked storage, etc.)
  }
}

const RECORD_SEARCH_PLACEHOLDER = 'Records: search fields and values…';
const DATASET_SEARCH_PLACEHOLDER =
  'Dataset: use the filter box above (templates do not apply)';

/* ------------------------------------------------------------
    Event wiring + init
------------------------------------------------------------ */

function init() {
  // Drag and drop events
  els.dropZone.addEventListener('dragenter', onDragEnter);
  els.dropZone.addEventListener('dragover', onDragOver);
  els.dropZone.addEventListener('dragleave', onDragLeave);
  els.dropZone.addEventListener('drop', onDrop);

  // Click-to-select (input is invisible but clickable)
  els.fileInput.addEventListener('change', async (e) => {
    const input = /** @type {HTMLInputElement} */ (e.currentTarget);
    if (!input.files) return;
    await addFiles(Array.from(input.files));
    // Reset input so selecting the same file again still triggers change
    input.value = '';
  });

  // Keyboard: Enter/Space on drop zone triggers file picker
  els.dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      els.fileInput.click();
    }
  });

  els.recordSelect.addEventListener('change', () => {
    const lf = getActiveFile();
    if (!lf) return;

    const idx = Number(els.recordSelect.value);
    state.selectedRecordIndexByFileId[lf.id] = Number.isFinite(idx) ? idx : 0;
    renderViewer();
  });

  if (els.modeSelect) {
    els.modeSelect.addEventListener('change', () => {
      const lf = getActiveFile();
      if (!lf) return;

      const v = els.modeSelect.value;
      state.viewModeByFileId[lf.id] =
        v === 'dataset' || v === 'records' ? v : 'auto';

      renderViewer();
    });
  }

  els.rawToggle.addEventListener('change', () => {
    state.showRaw = els.rawToggle.checked;
    renderViewer();
  });

  els.searchInput.addEventListener('input', () => {
    state.searchQuery = els.searchInput.value.trim();
    renderViewer();
  });

  els.includeCollapsedToggle.addEventListener('change', () => {
    state.includeCollapsedInSearch = els.includeCollapsedToggle.checked;
    renderViewer();
  });

  els.pathToggle.addEventListener('change', () => {
    state.showPaths = els.pathToggle.checked;
    renderViewer();
  });

  els.clearBtn.addEventListener('click', clearAll);

  // Templates (Session 10)
  if (els.uploadTemplateBtn && els.templateInput) {
    els.uploadTemplateBtn.addEventListener('click', () => {
      els.templateInput.click();
    });

    els.templateInput.addEventListener('change', async (e) => {
      const input = /** @type {HTMLInputElement} */ (e.currentTarget);
      if (!input.files) return;

      await addTemplateFiles(Array.from(input.files));

      // Reset so picking the same file again still fires change
      input.value = '';
    });
  }

  if (els.templateSelect) {
    els.templateSelect.addEventListener('change', () => {
      const raw = String(els.templateSelect.value || '');

      // Values:
      // - ""              => None
      // - "__auto__"      => Auto (best match)
      // - "tpl_..."       => Explicit template ID
      state.activeTemplateId = raw ? raw : null;

      renderTemplateSelect();
      renderViewer();
    });
  }

  // Download starter template (Session 10)
  if (els.downloadTemplateBtn) {
    els.downloadTemplateBtn.addEventListener('click', () => {
      downloadDefaultStarterTemplate();
    });
  }

  // Dataset bar listeners
  if (els.datasetFilter) {
    els.datasetFilter.addEventListener('input', () => {
      const lf = getActiveFile();
      if (!lf) return;

      const entry = state.datasetUiByFileId[lf.id] || {
        filter: '',
        jumpIndex: null,
        lastJumpInput: '',
      };

      entry.filter = els.datasetFilter.value.trim();
      entry.jumpIndex = null; // typing filter cancels jump mode
      state.datasetUiByFileId[lf.id] = entry;

      if (els.datasetJump) els.datasetJump.value = '';
      renderViewer();
    });
  }

  // Persist dataset row input as the user types (even before Go)
  if (els.datasetJump) {
    els.datasetJump.addEventListener('input', () => {
      const lf = getActiveFile();
      if (!lf) return;

      if (!state.datasetUiByFileId[lf.id]) {
        state.datasetUiByFileId[lf.id] = {
          filter: '',
          jumpIndex: null,
          lastJumpInput: '',
        };
      }

      state.datasetUiByFileId[lf.id].lastJumpInput = String(
        els.datasetJump.value || ''
      );
    });
  }

  function runDatasetGo() {
    const lf = getActiveFile();
    if (!lf) return;

    const rawStr = String(els.datasetJump.value || '').trim();

    // Empty input means "exit jump mode"
    if (!rawStr) {
      const entry = state.datasetUiByFileId[lf.id] || {
        filter: '',
        jumpIndex: null,
        lastJumpInput: '',
      };
      entry.jumpIndex = null;
      entry.lastJumpInput = '';
      state.datasetUiByFileId[lf.id] = entry;
      renderViewer();
      return;
    }

    const raw = Number(rawStr);
    const idx1 = Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : 1;

    const entry = state.datasetUiByFileId[lf.id] || {
      filter: '',
      jumpIndex: null,
      lastJumpInput: '',
    };
    entry.jumpIndex = idx1 - 1; // store as 0-based
    entry.lastJumpInput = rawStr; // keep what the user typed visible
    state.datasetUiByFileId[lf.id] = entry;

    // Keep the value stable (esp. after we re-render)
    els.datasetJump.value = String(rawStr);

    renderViewer();
  }

  if (els.datasetJump) {
    els.datasetJump.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runDatasetGo();
      }
    });
  }

  if (els.datasetGoBtn) {
    els.datasetGoBtn.addEventListener('click', () => {
      runDatasetGo();
    });
  }

  if (els.datasetResetBtn) {
    els.datasetResetBtn.addEventListener('click', () => {
      const lf = getActiveFile();
      if (!lf) return;

      state.datasetUiByFileId[lf.id] = {
        filter: '',
        jumpIndex: null,
        lastJumpInput: '',
      };
      els.datasetFilter.value = '';
      els.datasetJump.value = '';
      renderViewer();
    });
  }

  initTheme();

  renderFileList();
  renderViewer();
}

/** Drag events */
function onDragEnter(e) {
  e.preventDefault();
  els.dropZone.classList.add('dragover');
}
function onDragOver(e) {
  e.preventDefault();
  els.dropZone.classList.add('dragover');
}
function onDragLeave(e) {
  e.preventDefault();
  els.dropZone.classList.remove('dragover');
}
async function onDrop(e) {
  e.preventDefault();
  els.dropZone.classList.remove('dragover');

  const dt = e.dataTransfer;
  if (!dt) return;

  const files = Array.from(dt.files || []);
  await addFiles(files);
}

/**
 * Add files to state (JSON only), parse them, update UI.
 * @param {File[]} files
 */
async function addFiles(files) {
  const jsonFiles = files.filter((f) => isProbablyJsonFile(f));
  if (jsonFiles.length === 0) return;

  const startId = state.files.length
    ? Math.max(...state.files.map((f) => f.id)) + 1
    : 1;

  const loaded = jsonFiles.map((file, i) => new LoadedFile(file, startId + i));

  // Parse sequentially to keep it simple and predictable
  for (const lf of loaded) {
    await readAndParse(lf);
    state.files.push(lf);
  }

  // Auto-select the most recently added file that parsed successfully,
  // otherwise select the newest error (so users see what happened).
  const newestGood = [...loaded].reverse().find((f) => !f.error);
  const newestAny = loaded[loaded.length - 1];
  setActiveFile((newestGood || newestAny).id);

  renderFileList();
  renderViewer();
  renderTemplateSelect();
}

/**
 * Basic filter for JSON-ish files.
 * Accepts:
 * - .json file extension
 * - application/json mimetype (when provided)
 * @param {File} file
 */
function isProbablyJsonFile(file) {
  const nameOk = file.name.toLowerCase().endsWith('.json');
  const typeOk = file.type === 'application/json';
  return nameOk || typeOk;
}

/**
 * Read file text and parse JSON safely.
 * @param {LoadedFile} lf
 */
async function readAndParse(lf) {
  try {
    lf.text = await lf.file.text();

    // Guard: empty file
    if (!lf.text.trim()) {
      lf.error = 'File is empty. Please provide a JSON file with content.';
      lf.json = null;
      return;
    }

    lf.json = JSON.parse(lf.text);
    lf.error = null;

    // Detect type (Issue/RFI/Submittal/Generic) based on the JSON we parsed.
    lf.recordType = detectRecordType(lf.json);
  } catch (err) {
    lf.json = null;
    lf.recordType = 'Generic';
    lf.error = buildJsonErrorMessage(err);
  }
}

/**
 * Create a friendlier JSON parse error message.
 * @param {unknown} err
 */
function buildJsonErrorMessage(err) {
  if (err instanceof SyntaxError) {
    // Browsers often include position info in the message.
    return `Invalid JSON: ${err.message}`;
  }
  return 'Could not read or parse this file as JSON.';
}

/**
 * Set the active file by id.
 * @param {number} id
 */
function setActiveFile(id) {
  state.activeFileId = id;

  // Default record selection for this file
  if (state.selectedRecordIndexByFileId[id] == null) {
    state.selectedRecordIndexByFileId[id] = 0;
  }

  // Default mode for this file
  if (state.viewModeByFileId[id] == null) {
    state.viewModeByFileId[id] = 'auto';
  }

  els.clearBtn.disabled = state.files.length === 0;
  syncViewerControlsEnabled();

  // Keep toggle UI in sync with state
  els.includeCollapsedToggle.checked = Boolean(state.includeCollapsedInSearch);
}

/** Enable or disable viewer controls based on active file availability. */
function syncViewerControlsEnabled() {
  const lf = getActiveFile();
  const hasFile = Boolean(lf);
  if (els.modeSelect) els.modeSelect.disabled = !hasFile;

  els.searchInput.disabled = !hasFile;
  els.includeCollapsedToggle.disabled = !hasFile;
  els.pathToggle.disabled = !hasFile;
  els.rawToggle.disabled = !hasFile;

  // recordSelect will be enabled in renderViewer if there are multiple records
  els.recordSelect.disabled = true;
}

/** @returns {LoadedFile|null} */
function getActiveFile() {
  if (state.activeFileId == null) return null;
  return state.files.find((f) => f.id === state.activeFileId) || null;
}

/** Clear all loaded files and reset UI. */
function clearAll() {
  state.files = [];
  state.activeFileId = null;
  state.selectedRecordIndexByFileId = {};
  state.viewModeByFileId = {};
  state.datasetUiByFileId = {};

  state.searchQuery = '';
  state.includeCollapsedInSearch = false;
  state.showPaths = false;
  state.showRaw = false;

  els.includeCollapsedToggle.checked = false;
  els.pathToggle.checked = false;

  els.recordSelect.innerHTML = `<option value="0">1</option>`;

  els.recordSelect.disabled = true;

  renderFileList();
  renderViewer();
  syncViewerControlsEnabled();
  els.clearBtn.disabled = true;
}

/** Render file list panel. */
function renderFileList() {
  if (state.files.length === 0) {
    els.fileList.innerHTML = `<div class="empty-state">No files loaded yet.</div>`;
    return;
  }

  const html = state.files
    .map((f) => {
      const isActive = f.id === state.activeFileId;
      const modified = f.lastModified
        ? new Date(f.lastModified).toLocaleString()
        : 'Unknown';
      const size = formatBytes(f.size);

      return `
        <div class="file-item ${isActive ? 'active' : ''}" data-file-id="${
        f.id
      }" role="button" tabindex="0">
          <div class="file-name" title="${escapeHtml(f.name)}">${escapeHtml(
        f.name
      )}</div>
          <div class="file-meta">
            <span class="file-badge">Size: ${size}</span>
            <span class="file-badge">Modified: ${escapeHtml(modified)}</span>
            <span class="file-badge">Type: ${escapeHtml(f.recordType)}</span>
          </div>
          ${
            f.error
              ? `<div class="file-error">${escapeHtml(f.error)}</div>`
              : ''
          }
        </div>
      `;
    })
    .join('');

  els.fileList.innerHTML = html;

  // Click/keyboard handlers for selecting a file
  els.fileList.querySelectorAll('.file-item').forEach((node) => {
    node.addEventListener('click', () => {
      const id = Number(node.getAttribute('data-file-id'));
      setActiveFile(id);
      renderFileList();
      renderViewer();
    });

    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const id = Number(node.getAttribute('data-file-id'));
        setActiveFile(id);
        renderFileList();
        renderViewer();
      }
    });
  });
}

/** Render main viewer based on active file and toggle state. */
function renderViewer() {
  const lf = getActiveFile();

  if (!lf) {
    els.viewerTitle.textContent = 'No file selected';
    els.viewerMeta.textContent = '';
    els.viewer.innerHTML = `<div class="empty-state">Drop a JSON file on the left to start snooping. 🕵️</div>`;
    return;
  }

  els.viewerTitle.textContent = lf.name;
  if (els.modeSelect) {
    const userMode = state.viewModeByFileId?.[lf.id] || 'auto';
    els.modeSelect.value = userMode;
  }

  if (lf.error) {
    els.viewerMeta.textContent =
      'This file has errors. Raw view may still show what was read.';
  } else {
    const { records, sourcePath } = extractRecords(lf.json);
    const countText =
      records && records.length > 1 ? ` • Records: ${records.length}` : '';
    const fromText =
      sourcePath && sourcePath !== '$' ? ` • From: ${sourcePath}` : '';
    els.viewerMeta.textContent = `Detected: ${lf.recordType}${countText}${fromText}`;
  }

  // If raw toggle is on, always show raw (even if parse failed).
  if (state.showRaw) {
    els.recordSelect.disabled = true;
    const raw = lf.text || '';

    els.viewer.innerHTML = `
  <pre class="raw-json language-json"><code class="language-json">${escapeHtml(
    raw
  )}</code></pre>
`;

    highlightJsonIn(els.viewer);
    return;
  }

  // Build record list and populate record selector if needed
  const parsedOk = !lf.error && lf.json != null;
  const userMode = state.viewModeByFileId?.[lf.id] || 'auto';
  const autoDataset = parsedOk && isLargeFlatArrayDataset(lf.json);

  const datasetMode =
    parsedOk &&
    Array.isArray(lf.json) &&
    (userMode === 'dataset'
      ? true
      : userMode === 'records'
      ? false
      : autoDataset);

  // Records search is not applicable in Dataset Mode (dataset has its own filter)
  if (els.searchInput) {
    els.searchInput.disabled = datasetMode;
    // Hide the record-search UI completely in Dataset mode
    if (els.recordSearchGroup) els.recordSearchGroup.hidden = datasetMode;

    if (els.recordSearchGroup) {
      els.recordSearchGroup.classList.toggle('is-disabled', datasetMode);
    }

    if (datasetMode) {
      // Clear any record-search state so we don't show stale highlights
      state.searchQuery = '';
      els.searchInput.value = '';
      els.searchInput.placeholder = DATASET_SEARCH_PLACEHOLDER;
    } else {
      els.searchInput.placeholder = RECORD_SEARCH_PLACEHOLDER;
    }
  }

  // Include-collapsed is only relevant for record searching
  if (els.includeCollapsedToggle) {
    els.includeCollapsedToggle.disabled = datasetMode;
    if (els.includeCollapsedLabel)
      els.includeCollapsedLabel.hidden = datasetMode;

    if (els.includeCollapsedLabel) {
      els.includeCollapsedLabel.classList.toggle('is-disabled', datasetMode);
    }

    if (datasetMode) {
      state.includeCollapsedInSearch = false;
      els.includeCollapsedToggle.checked = false;
    }
  }

  let records = [];
  let sourcePath = null;

  if (parsedOk) {
    const extracted = extractRecords(lf.json);
    records = extracted.records || [];
    sourcePath = extracted.sourcePath;

    // Toggle dataset bar vs record picker
    if (els.datasetBar) {
      els.datasetBar.hidden = !datasetMode;
    }

    if (datasetMode) {
      // Dataset mode: record picker is not used
      els.recordSelect.disabled = true;
      els.recordSelect.innerHTML = `<option value="0">Dataset</option>`;

      // Treat the dataset as a single "record" for internal flow
      records = [lf.json];
      sourcePath = '$';
    } else {
      const hasMany = records.length > 1;
      els.recordSelect.disabled = !hasMany;

      if (hasMany) {
        const currentIdx = state.selectedRecordIndexByFileId[lf.id] ?? 0;
        const safeIdx = clamp(currentIdx, 0, records.length - 1);
        state.selectedRecordIndexByFileId[lf.id] = safeIdx;

        // Multi-record labels: template-aware + match-aware
        els.recordSelect.innerHTML = records
          .map((rec, i) => {
            const resolved = getTemplateForRecord(rec);
            const tplForThisRecord = resolved ? resolved.templateObj : null;

            const label = buildRecordLabel(
              lf.recordType,
              rec,
              i,
              tplForThisRecord
            );
            return `<option value="${i}">${escapeHtml(label)}</option>`;
          })
          .join('');

        els.recordSelect.value = String(safeIdx);
      } else {
        // Single-record label: template-aware + match-aware
        const firstRecord = records[0] || lf.json;

        const resolved = getTemplateForRecord(firstRecord);
        const tplForThisRecord = resolved ? resolved.templateObj : null;

        const label = buildRecordLabel(
          lf.recordType,
          firstRecord,
          0,
          tplForThisRecord
        );

        els.recordSelect.innerHTML = `<option value="0">${escapeHtml(
          label
        )}</option>`;
      }
    }
  } else {
    els.recordSelect.disabled = true;
    els.recordSelect.innerHTML = `<option value="0">Record 1</option>`;
  }

  // v1 scaffold: this will become templated view.
  if (lf.error) {
    els.viewer.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Error</h3>
          <div class="chevron">!</div>
        </div>
        <div class="card-body">
          <div class="field">
            <div class="field-label">Problem</div>
            <div class="field-value">${escapeHtml(lf.error)}</div>
          </div>
          <div class="field">
            <div class="field-label">Tip</div>
            <div class="field-value">Flip on "Raw JSON" to see the file contents.</div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  const idx = state.selectedRecordIndexByFileId[lf.id] ?? 0;
  const record = records.length
    ? records[clamp(idx, 0, records.length - 1)]
    : lf.json;

  if (datasetMode && Array.isArray(lf.json)) {
    // Show + enable dataset controls
    if (els.datasetBar) els.datasetBar.hidden = false;
    if (els.datasetFilter) els.datasetFilter.disabled = false;
    if (els.datasetJump) els.datasetJump.disabled = false;
    if (els.datasetGoBtn) els.datasetGoBtn.disabled = false;
    if (els.datasetResetBtn) els.datasetResetBtn.disabled = false;

    // Ensure state exists
    if (!state.datasetUiByFileId[lf.id]) {
      state.datasetUiByFileId[lf.id] = {
        filter: '',
        jumpIndex: null,
        lastJumpInput: '',
      };
    }

    // Restore UI values (so switching modes doesn't wipe what the user typed)
    const dsEntry = state.datasetUiByFileId[lf.id];
    if (els.datasetFilter) els.datasetFilter.value = dsEntry.filter || '';
    if (els.datasetJump) {
      els.datasetJump.value =
        dsEntry.lastJumpInput ||
        (Number.isFinite(dsEntry.jumpIndex)
          ? String(dsEntry.jumpIndex + 1)
          : '');
    }

    els.viewer.innerHTML = renderDatasetView(lf.json, lf.id);
  } else {
    // If we are leaving Dataset mode and we had a jumped row selected,
    // keep Records mode aligned to that same row.
    const dsEntry = state.datasetUiByFileId?.[lf.id];
    if (dsEntry && Number.isFinite(dsEntry.jumpIndex) && records.length) {
      const safe = clamp(dsEntry.jumpIndex, 0, records.length - 1);
      state.selectedRecordIndexByFileId[lf.id] = safe;
    }

    // Disable dataset controls
    if (els.datasetFilter) els.datasetFilter.disabled = true;
    if (els.datasetJump) els.datasetJump.disabled = true;
    if (els.datasetGoBtn) els.datasetGoBtn.disabled = true;
    if (els.datasetResetBtn) els.datasetResetBtn.disabled = true;
    if (els.datasetBar) els.datasetBar.hidden = true;

    // Recompute idx/record AFTER syncing
    const recordIndex = state.selectedRecordIndexByFileId[lf.id] ?? 0;
    const activeRecord = records.length
      ? records[clamp(recordIndex, 0, records.length - 1)]
      : lf.json;

    // Templates apply ONLY in Records Mode, and only if the template matches this record
    const resolved = getTemplateForRecord(activeRecord);
    const tplForThisRecord = resolved ? resolved.templateObj : null;

    els.viewer.innerHTML = renderRecordView(
      lf.recordType,
      activeRecord,
      tplForThisRecord
    );
  }

  // Wire collapsible handlers inside the viewer
  wireViewerInteractions();

  // Syntax highlight any JSON blocks (expanded arrays/objects, etc.)
  highlightJsonIn(els.viewer);

  // Apply search (Issue template first)
  applySearchToViewer(lf.recordType);
}

/**
 * Try to detect the record type for a loaded JSON payload.
 * Handles:
 * - single object
 * - array of objects
 * - wrapper object with an array inside (Issues, Items, Results, Data, etc.)
 * @param {any} json
 * @returns {RecordType}
 */
function detectRecordType(json) {
  const { records } = extractRecords(json);

  // No records found (or record is not an object we can inspect)
  if (!records || records.length === 0) return 'Generic';

  // If mixed types, we will call it Generic for v1.
  // (Later we can display per-item templates.)
  const types = new Set(records.map((r) => detectRecordTypeFromObject(r)));
  if (types.size === 1)
    return /** @type {RecordType} */ (types.values().next().value);

  return 'Generic';
}

/**
 * Extract a list of “records” from common API response shapes.
 *
 * Supported shapes:
 * - Array payload: records = array (objects only)
 * - Object payload: tries to find an inner array under common keys (data/items/results/records)
 *   otherwise treats the object itself as a single record: records = [object]
 *
 * Returns:
 * - records: array of objects (best effort)
 * - sourcePath: a simple JSONPath-ish hint (best effort), used for UI messaging/debugging
 *
 * @param {any} json
 * @returns {{ records: any[], sourcePath: string|null }}
 */
function extractRecords(json) {
  // Array payload: most common for list endpoints
  if (Array.isArray(json)) {
    return {
      records: json.filter((x) => x && typeof x === 'object'),
      sourcePath: '$',
    };
  }

  // Single object payload
  if (json && typeof json === 'object') {
    // Look for likely array containers first.
    // Add to this list anytime you see new API shapes.
    const candidateKeys = [
      'items',
      'results',
      'data',
      'value',
      'records',
      'issues',
      'rfis',
      'submittals',
      'Issues',
      'RFIs',
      'Submittals',
      'Items',
      'Results',
      'Data',
      'Value',
      'Records',
    ];

    for (const key of candidateKeys) {
      if (Array.isArray(json[key])) {
        const arr = json[key].filter((x) => x && typeof x === 'object');
        return { records: arr, sourcePath: `$.${key}` };
      }
    }

    // If no obvious array container, treat the object itself as a single record.
    return { records: [json], sourcePath: '$' };
  }

  // Anything else (string, number, null, etc.)
  return { records: [], sourcePath: null };
}

// ===============================
// Session 6 – Dataset helpers
// ===============================

function isLargeFlatArrayDataset(json) {
  if (!Array.isArray(json)) return false;

  // Only treat bigger arrays as “dataset candidates”
  if (json.length < 80) return false;

  // Sample some objects
  const sample = json
    .filter((x) => x && typeof x === 'object' && !Array.isArray(x))
    .slice(0, 25);

  if (sample.length < 10) return false;

  // How consistent are keys?
  const keySets = sample.map((o) => new Set(Object.keys(o)));
  const allKeys = new Set();
  keySets.forEach((s) => s.forEach((k) => allKeys.add(k)));

  if (allKeys.size === 0) return false;

  let commonCount = 0;
  for (const k of allKeys) {
    let hits = 0;
    for (const s of keySets) if (s.has(k)) hits++;
    if (hits / keySets.length >= 0.6) commonCount++;
  }

  const commonRatio = commonCount / allKeys.size;

  // How “flat” are the values? (primitive-heavy)
  let totalVals = 0;
  let nestedVals = 0;

  for (const o of sample) {
    for (const k of Object.keys(o)) {
      totalVals++;
      const v = o[k];
      if (v && typeof v === 'object') nestedVals++;
    }
  }

  const nestedRatio = totalVals ? nestedVals / totalVals : 1;

  return commonRatio >= 0.25 && nestedRatio <= 0.25;
}

function rowMatchesFilter(row, filter) {
  if (!filter) return true;
  if (!row || typeof row !== 'object') return false;

  const f = filter.toLowerCase();

  // Cheap and useful: common “identity” fields first
  const candidates = [
    pickFirst(row, ['Id', 'id', 'ID']),
    pickFirst(row, ['Number', 'number', 'No', 'no', 'code', 'Code']),
    pickFirst(row, ['Title', 'title', 'Name', 'name', 'Subject', 'subject']),
    pickFirst(row, ['Status', 'status']),
    pickFirst(row, ['Type', 'type']),
  ]
    .filter((v) => v != null)
    .map((v) => String(v).toLowerCase());

  if (candidates.some((t) => t.includes(f))) return true;

  // Fall back: scan primitive fields only (avoid stringify the whole thing)
  for (const k of Object.keys(row)) {
    const v = row[k];
    if (v == null) continue;
    if (typeof v === 'string' && v.toLowerCase().includes(f)) return true;
    if (typeof v === 'number' && String(v).includes(filter)) return true;
    if (typeof v === 'boolean' && String(v).includes(f)) return true;
  }

  return false;
}

function buildDatasetSummary(arr) {
  if (!Array.isArray(arr)) return null;

  const total = arr.length;
  const sample = arr
    .filter((x) => x && typeof x === 'object' && !Array.isArray(x))
    .slice(0, 30);

  const objectRows = sample.length;

  // Common keys hint (reuses existing helper)
  const commonKeys = commonKeysFromArrayOfObjects(sample, 6);

  // Lightweight nesting hint (sample only)
  let totalFields = 0;
  let nestedFields = 0;

  for (const row of sample) {
    for (const k of Object.keys(row)) {
      totalFields++;
      const v = row[k];
      if (v && typeof v === 'object') nestedFields++;
    }
  }

  const nestedRatio = totalFields ? nestedFields / totalFields : 0;
  const shapeHint =
    nestedRatio <= 0.15
      ? 'Mostly flat (table-like)'
      : nestedRatio <= 0.35
      ? 'Some nested fields'
      : 'Nested-heavy rows';

  return {
    total,
    objectRows,
    sampleSize: sample.length,
    commonKeys,
    nestedRatio,
    shapeHint,
  };
}

function renderDatasetSummaryCard(arr) {
  const s = buildDatasetSummary(arr);
  if (!s) return '';

  const keyHint = s.commonKeys.length
    ? s.commonKeys.join(', ')
    : '(none found)';
  const nestedPct = `${Math.round(s.nestedRatio * 100)}%`;

  return `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Dataset summary</h3>
        <div class="chevron">Hint</div>
      </div>
      <div class="card-body">
        ${renderKV('Rows', s.total)}
        ${renderKV(
          'Sampled rows',
          `${s.sampleSize} (object rows: ${s.objectRows})`
        )}
        ${renderKV(
          'Shape',
          `${s.shapeHint} • Nested fields (sample): ${nestedPct}`
        )}
        ${renderKV('Common keys (sample)', keyHint)}
      </div>
    </div>
  `;
}

function renderDatasetView(arr, lfId) {
  const entry = state.datasetUiByFileId[lfId] || {
    filter: '',
    jumpIndex: null,
  };
  const filter = entry.filter || '';
  const jumpIndex = Number.isFinite(entry.jumpIndex) ? entry.jumpIndex : null;

  // Jump mode: show a single row (no paging, no drama)
  if (jumpIndex != null) {
    const safe = clamp(jumpIndex, 0, arr.length - 1);
    const item = arr[safe];

    const requestedLabel = entry.lastJumpInput
      ? entry.lastJumpInput
      : String(jumpIndex + 1);
    const outOfRange = jumpIndex < 0 || jumpIndex > arr.length - 1;

    const jumpNote = outOfRange
      ? `<div class="array-note">Row ${escapeHtml(
          requestedLabel
        )} is out of range (valid: 1–${arr.length}). Showing Row ${
          safe + 1
        } instead.</div>`
      : '';

    const summaryCard = renderDatasetSummaryCard(arr);

    return `
    ${summaryCard}
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Row ${safe + 1} of ${arr.length}</h3>
        <div class="chevron">Dataset</div>
      </div>
      ${jumpNote}
      <div class="card-body">
        ${renderObjectAsKv(item, `$[${safe}]`)}
      </div>
    </div>
  `;
  }

  // Filtered list mode (capped)
  const indexed = arr.map((row, idx) => ({ row, idx }));
  const matches = filter
    ? indexed.filter(({ row }) => rowMatchesFilter(row, filter))
    : indexed;

  const HARD_MAX = 80; // list cap for dataset mode (separate from generic arrays)
  const show = matches.slice(0, HARD_MAX);

  const meta =
    matches.length > show.length
      ? `Showing ${show.length} of ${matches.length} matching rows (dataset has ${arr.length})`
      : `Showing ${show.length} rows (dataset has ${arr.length})`;

  const note =
    matches.length > HARD_MAX
      ? `<div class="array-note">
         Showing the first ${HARD_MAX} rows for performance.
         Use the filter or jump to a specific row to explore the rest.
       </div>`
      : '';

  const cards = show.map(({ row, idx }) => {
    return renderArrayItem(arr, row, idx);
  });

  const summaryCard = renderDatasetSummaryCard(arr);

  return `
    ${summaryCard}
    <div class="array-meta-row">
      <div class="array-meta">${escapeHtml(meta)}</div>
    </div>
    ${note}
    <div class="array-list">
      ${cards.join('')}
    </div>
  `;
}

/**
 * Detect record type for a single object record.
 * Uses:
 * - explicit "type/entity/resource" string hints if present
 * - otherwise key-based heuristics
 * @param {any} obj
 * @returns {RecordType}
 */
function detectRecordTypeFromObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return 'Generic';

  // 1) Explicit hint fields (string values)
  const hint = firstString(obj, [
    'type',
    'Type',
    'entity',
    'Entity',
    'resource',
    'Resource',
    'recordType',
    'RecordType',
  ]);
  if (hint) {
    const norm = hint.toLowerCase();
    if (norm.includes('issue')) return 'Issue';
    if (norm === 'rfi' || norm.includes('request for information'))
      return 'RFI';
    if (norm.includes('submittal')) return 'Submittal';
  }

  // 2) Shape sniffing (heuristics)
  // Your Issue example has many of these: Title, Number, Status, Priority, AssignedTo, Viewpoints, History
  const has = (k) => Object.prototype.hasOwnProperty.call(obj, k);

  // Issue signals
  const issueSignals =
    (has('Title') || has('title')) &&
    (has('Status') || has('status')) &&
    (has('Priority') || has('priority')) &&
    (has('AssignedTo') || has('assignedTo') || has('Author') || has('author'));

  const issueExtraSignals =
    has('Viewpoints') ||
    has('viewpoints') ||
    has('Disciplines') ||
    has('disciplines') ||
    has('History') ||
    has('history');

  if (issueSignals && issueExtraSignals) return 'Issue';

  // RFI signals (common-ish naming patterns across systems)
  // We keep this broad, because RFI schemas vary wildly.
  const rfiSignals =
    hasAny(obj, ['Question', 'question', 'RfiQuestion', 'rfiQuestion']) ||
    hasAny(obj, ['Answer', 'answer', 'Response', 'response']) ||
    (hasAny(obj, ['BallInCourt', 'ballInCourt', 'DueDate', 'dueDate']) &&
      hasAny(obj, ['RfiNumber', 'rfiNumber', 'RfiId', 'rfiId']));

  if (rfiSignals) return 'RFI';

  // Submittal signals
  const submittalSignals =
    hasAny(obj, ['SpecSection', 'specSection', 'SpecificationSection']) ||
    hasAny(obj, ['Revision', 'revision', 'RevisionNumber']) ||
    hasAny(obj, [
      'SubmittalNumber',
      'submittalNumber',
      'SubmittalId',
      'submittalId',
    ]) ||
    (hasAny(obj, [
      'ReviewStatus',
      'reviewStatus',
      'ReviewDate',
      'reviewDate',
    ]) &&
      hasAny(obj, ['DueDate', 'dueDate']));

  if (submittalSignals) return 'Submittal';

  return 'Generic';
}

/**
 * Return the first non-empty string found in obj for the given keys.
 * @param {any} obj
 * @param {string[]} keys
 * @returns {string|null}
 */
function firstString(obj, keys) {
  for (const k of keys) {
    if (
      obj &&
      typeof obj === 'object' &&
      typeof obj[k] === 'string' &&
      obj[k].trim()
    ) {
      return obj[k].trim();
    }
  }
  return null;
}

/**
 * True if any key exists on obj.
 * @param {any} obj
 * @param {string[]} keys
 */
function hasAny(obj, keys) {
  return keys.some((k) => Object.prototype.hasOwnProperty.call(obj, k));
}

function isUsablePrimitive(v) {
  if (v == null) return false;
  const t = typeof v;
  return t === 'string' || t === 'number' || t === 'boolean';
}

function pickFirstPrimitive(obj, keys) {
  const v = pickFirst(obj, keys);
  return isUsablePrimitive(v) ? v : null;
}

function pickIdLike(obj) {
  return pickFirstPrimitive(obj, [
    'Id',
    'id',
    'ID',
    'uid',
    'Uid',
    'GUID',
    'guid',
    'uuid',
    'UUID',
    'key',
    'Key',
  ]);
}

function pickCodeLike(obj) {
  return pickFirstPrimitive(obj, [
    'Number',
    'number',
    'No',
    'no',
    'code',
    'Code',
    'ref',
    'Ref',
    'reference',
    'Reference',
  ]);
}

function pickNameLike(obj) {
  return pickFirstPrimitive(obj, [
    'Title',
    'title',
    'Name',
    'name',
    'Subject',
    'subject',
    'Summary',
    'summary',
    'DisplayName',
    'displayName',
  ]);
}

function pickEmailLike(obj) {
  return pickFirstPrimitive(obj, ['Email', 'email', 'mail', 'Mail']);
}

function pickStatusLike(obj) {
  const v = pickFirst(obj, ['Status', 'status', 'State', 'state']);
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (v && typeof v === 'object') {
    const n = pickFirstPrimitive(v, ['Name', 'name', 'Label', 'label']);
    if (n != null) return String(n).trim();
  }
  return null;
}

function buildGenericIdentityLabel(obj, base) {
  if (!obj || typeof obj !== 'object') return base;

  const name = pickNameLike(obj);
  const email = pickEmailLike(obj);
  const code = pickCodeLike(obj);
  const id = pickIdLike(obj);
  const status = pickStatusLike(obj);

  // Deterministic: always build in the same order.
  // Goal: show something humans recognize first (name/email), then identifiers.
  let main = '';

  if (name) main = safeOneLine(name, 70);
  else if (email) main = safeOneLine(email, 70);
  else if (code != null) main = `#${safeOneLine(code, 40)}`;
  else if (id != null) main = `Id ${safeOneLine(id, 40)}`;
  else main = base;

  const bits = [main];

  // Add a second bit only if it adds real value and isn’t duplicative noise
  if (name && code != null) bits.push(`#${safeOneLine(code, 30)}`);
  else if (name && id != null) bits.push(`Id ${safeOneLine(id, 30)}`);
  else if (email && name) bits.push(safeOneLine(name, 40));
  else if (email && id != null) bits.push(`Id ${safeOneLine(id, 30)}`);
  else if (code != null && id != null) bits.push(`Id ${safeOneLine(id, 30)}`);

  // Status is useful, but keep it short
  if (status) bits.push(`(${safeOneLine(status, 22)})`);

  // Always include base at the end if main isn't already the base
  if (main !== base) bits.push(base);

  // Dedupe exact repeats
  const seen = new Set();
  const out = [];
  for (const b of bits) {
    const t = String(b || '').trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }

  return out.join(' • ');
}

/**
 * Build a human-friendly label for the record dropdown.
 * Template-aware:
 * - If a template with recordLabel.fields is active, use it first.
 * - Otherwise fall back to Issue/Generic heuristics.
 *
 * @param {RecordType} recordType
 * @param {any} record
 * @param {number} index
 * @param {any|null} activeTemplateObj  // pass template.template here
 */
function buildRecordLabel(recordType, record, index, activeTemplateObj) {
  const base = `Record ${index + 1}`;
  if (!record || typeof record !== 'object') return base;

  // 1) Template-driven labels (highest priority)
  const tplLabel = buildTemplateRecordLabel(activeTemplateObj, record, index);
  if (tplLabel) return tplLabel;

  // 2) Built-in Issue labels (v1 special-case)
  if (recordType === 'Issue') {
    const num = pickFirstPrimitive(record, ['Number', 'number']);
    const title = pickFirstPrimitive(record, [
      'Title',
      'title',
      'Name',
      'name',
    ]);
    const id = pickIdLike(record);
    const status = pickStatusLike(record);

    const t = title ? safeOneLine(title, 70) : '';
    const s = status ? safeOneLine(status, 22) : '';

    if (num != null && t) {
      return [`#${num}`, t, s ? `(${s})` : '', base]
        .filter(Boolean)
        .join(' • ');
    }
    if (num != null) {
      return [`#${num}`, s ? `(${s})` : '', base].filter(Boolean).join(' • ');
    }
    if (t && id != null) {
      return [t, `Id ${safeOneLine(id, 30)}`, s ? `(${s})` : '', base]
        .filter(Boolean)
        .join(' • ');
    }
    if (t) return [t, s ? `(${s})` : '', base].filter(Boolean).join(' • ');
    if (id != null)
      return [`Id ${safeOneLine(id, 30)}`, s ? `(${s})` : '', base]
        .filter(Boolean)
        .join(' • ');

    return base;
  }

  // 3) Generic fallback
  return buildGenericIdentityLabel(record, base);
}

/**
 * Build a label using template.recordLabel.fields.
 * Missing fields are skipped silently.
 *
 * @param {any|null} tpl
 * @param {any} record
 * @param {number} index
 * @returns {string}
 */
function buildTemplateRecordLabel(tpl, record, index) {
  if (!tpl || typeof tpl !== 'object') return '';

  const rl = tpl.recordLabel;
  if (!rl || typeof rl !== 'object') return '';

  const fields = Array.isArray(rl.fields) ? rl.fields : [];
  const fallback =
    typeof rl.fallback === 'string' && rl.fallback.trim()
      ? rl.fallback
      : `Record {n}`;

  const parts = [];

  for (const f of fields) {
    if (!f || typeof f !== 'object') continue;

    const path = String(f.path || '').trim();
    if (!path) continue;

    const raw = getValueAtPath(record, path);
    if (raw == null) continue;

    // Only use primitives for labels (keeps dropdown readable)
    const t = typeof raw;
    if (t !== 'string' && t !== 'number' && t !== 'boolean') continue;

    let text = String(raw).trim();
    if (!text) continue;

    // Optional: show only the last N characters (useful for VINs, GUIDs, long ids)
    if (Number.isFinite(f.lastChars)) {
      const n = Math.max(1, Math.floor(f.lastChars));
      if (text.length > n) text = text.slice(text.length - n);
    }

    const maxLen = Number.isFinite(f.maxLen)
      ? Math.max(1, Math.floor(f.maxLen))
      : 80;

    if (text.length > maxLen) text = `${text.slice(0, maxLen)}…`;

    const prefix = typeof f.prefix === 'string' ? f.prefix : '';
    const suffix = typeof f.suffix === 'string' ? f.suffix : '';

    parts.push(`${prefix}${text}${suffix}`);
  }

  if (parts.length) return parts.join('');

  // Fallback supports {n}
  return fallback.replaceAll('{n}', String(index + 1));
}

/**
 * ===============================
 * Session 11 – Templates (Apply + Render)
 * Records Mode ONLY (Dataset Mode must not use templates).
 * ===============================
 */

/**
 * Get a nested value from an object using a simple path.
 * Supported:
 * - Dot paths: "Status.Name"
 * - Bracket indexes: "Items[0].Title"
 * - Mixed: "Foo.Bar[2].Baz"
 *
 * Guardrails:
 * - No execution
 * - No wildcards
 * - No filters
 * - Missing path returns undefined
 *
 * @param {any} obj
 * @param {string} path
 * @returns {any}
 */
function getValueAtPath(obj, path) {
  if (!path || typeof path !== 'string') return undefined;
  if (obj == null) return undefined;

  // Tokenize: words between dots, and [number] indexes
  const tokens = [];
  const re = /[^.[\]]+|\[(\d+)\]/g;

  let m;
  while ((m = re.exec(path))) {
    if (m[0][0] === '[') {
      tokens.push(Number(m[1]));
    } else {
      tokens.push(m[0]);
    }
  }

  let cur = obj;
  for (const t of tokens) {
    if (cur == null) return undefined;

    if (typeof t === 'number') {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[t];
      continue;
    }

    if (typeof cur !== 'object') return undefined;
    cur = cur[t];
  }

  return cur;
}

/* ------------------------------------------------------------
    Rendering (viewer, cards, formatting)
------------------------------------------------------------ */

/**
 * Template field renderer.
 * Missing values return '' (silent, no warnings).
 *
 * Template formats (v1):
 * - text (default)
 * - multiline (string with line breaks)
 * - badge (small pill)
 * - link (URL-ish string)
 * - date (ISO-like string -> local time)
 * - json (shows value with collapsible rendering)
 *
 * @param {any} record
 * @param {{ path: string, label: string, format?: string }} field
 * @returns {string}
 */
function renderTemplateField(record, field) {
  const path = String(field.path || '').trim();
  const label = String(field.label || '').trim();
  const format = String(field.format || 'text')
    .trim()
    .toLowerCase();

  if (!path || !label) return '';

  const value = getValueAtPath(record, path);

  // Missing path renders empty (silent)
  if (value === undefined) return '';

  // Normalize formatting behavior
  if (format === 'badge') {
    // Keep badges readable; null shows as a "null" badge like the generic renderer
    const badgeText =
      value == null ? 'null' : safeOneLine(String(value), 60) || '';
    if (!badgeText) return '';

    // IMPORTANT: we generate the <span> ourselves (not from user input),
    // and we still escape the text inside it.
    return renderKVHtml(
      label,
      `<span class="badge">${escapeHtml(badgeText)}</span>`
    );
  }

  if (format === 'date') {
    const dt = formatDateTime(value);
    if (!dt) return '';
    return renderKV(label, dt);
  }

  if (format === 'link') {
    // Let renderValue create a real <a> when it looks like a URL
    if (typeof value !== 'string') return '';
    return renderKV(label, value, { link: true });
  }

  if (format === 'multiline') {
    if (typeof value !== 'string') return '';
    return renderKV(label, value, { rich: true });
  }

  if (format === 'kvlist') {
    const html = renderKvListValue(value, field);
    if (!html) return '';
    return renderKVHtml(label, html, { path: `$.$TEMPLATE.${path}` });
  }

  if (format === 'kvlist') {
    const html = renderKvListValue(value, field);
    if (!html) return '';
    return renderKVHtml(label, html, { path: `$.$TEMPLATE.${path}` });
  }

  if (format === 'kvlist') {
    const html = renderKvListValue(value, field);
    if (!html) return '';
    return renderKVHtml(label, html, { path: `$.$TEMPLATE.${path}` });
  }

  if (format === 'json') {
    const isHeavy = value && typeof value === 'object';
    return renderKV(label, value, {
      collapsible: Boolean(isHeavy),
      path: `$.$TEMPLATE.${path}`,
      link: false,
      rich: false,
    });
  }

  if (format === 'kvlist') {
    const html = renderKvListValue(value, field);
    if (!html) return '';
    return renderKVHtml(label, html, { path: `$.$TEMPLATE.${path}` });
  }

  // Default: text
  return renderKV(label, value);
}

/**
 * Count how many template fields actually exist on the record.
 * We treat "exists" as getValueAtPath(record, path) !== undefined.
 * This helps us show a friendly message when a template doesn't fit.
 *
 * @param {any} template
 * @param {any} record
 * @returns {number}
 */
function countTemplateFieldHits(template, record) {
  if (!template || typeof template !== 'object') return 0;
  if (!record || typeof record !== 'object') return 0;
  if (!Array.isArray(template.layout)) return 0;

  let hits = 0;

  for (const sec of template.layout) {
    if (!sec || typeof sec !== 'object') continue;
    const fields = Array.isArray(sec.fields) ? sec.fields : [];
    for (const f of fields) {
      if (!f || typeof f !== 'object') continue;
      const p = String(f.path || '').trim();
      if (!p) continue;

      const v = getValueAtPath(record, p);
      if (v === undefined) continue;

      const fmt = String(f.format || 'text')
        .trim()
        .toLowerCase();
      if (fmt === 'kvlist') {
        // Count as a hit if the list renders anything.
        // If showEmpty is true, this will still count even when values are blank,
        // as long as the attribute Name exists.
        const html = renderKvListValue(v, f);
        if (html) hits++;
        continue;
      }

      hits++;
    }
  }

  return hits;
}

/**
 * Render a template-driven record view (Records Mode only).
 * Respects section order and field order.
 * Missing fields simply don't render.
 *
 * If the template doesn't "hit" any paths for this record,
 * show a friendly hint card and a collapsed full record as fallback.
 *
 * @param {any} template
 * @param {any} record
 * @returns {string}
 */
function renderTemplateRecordView(template, record) {
  if (!template || typeof template !== 'object')
    return renderGenericPrettyView(record);
  if (!Array.isArray(template.layout)) return renderGenericPrettyView(record);

  const hitCount = countTemplateFieldHits(template, record);

  // If no fields exist on this record, show a clear hint and a safe fallback.
  if (hitCount === 0) {
    const tplName =
      typeof template.templateName === 'string' && template.templateName.trim()
        ? template.templateName.trim()
        : 'Selected template';

    return `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">No fields from this template were found</h3>
          <div class="chevron">Hint</div>
        </div>
        <div class="card-body">
          ${renderKV('Template', tplName)}
          ${renderKV(
            'What happened',
            'This record does not contain any of the fields defined in the template.'
          )}
          ${renderKV(
            'What to do',
            'Check your template paths, or adjust match.requiredKeys so the template only applies to the right records.'
          )}
          ${renderKV('Fallback', 'Showing the full record below (collapsed).')}
          ${renderKV('Record', record, { collapsible: true })}
        </div>
      </div>
    `;
  }

  const sections = template.layout.map((sec, i) => {
    const title = String(sec.section || '').trim() || `Section ${i + 1}`;
    const fields = Array.isArray(sec.fields) ? sec.fields : [];

    const bodyParts = fields
      .map((f) => renderTemplateField(record, f))
      .filter(Boolean);

    // First section open by default, others closed
    const open = i === 0;

    return renderCollapsibleCard(title, open, bodyParts);
  });

  return sections.join('');
}

/**
 * Render a record view based on detected type.
 * Template has priority if active (Records Mode will decide whether templates apply).
 *
 * @param {RecordType} recordType
 * @param {any} record
 * @param {any|null} activeTemplate
 */
function renderRecordView(recordType, record, activeTemplate) {
  if (activeTemplate) {
    return renderTemplateRecordView(activeTemplate, record);
  }
  if (recordType === 'Issue') return renderIssueTemplate(record);
  return renderGenericPrettyView(record);
}

/**
 * Issue Template (v1)
 * Focus on the fields that usually matter first.
 * Everything else can be explored later via Raw JSON.
 * @param {any} issue
 */
function renderIssueTemplate(issue) {
  if (!issue || typeof issue !== 'object')
    return renderGenericPrettyView(issue);

  // Summary picks
  const id = pickFirst(issue, ['Id', 'id']);
  const number = pickFirst(issue, ['Number', 'number']);
  const title = pickFirst(issue, ['Title', 'title']);
  const desc = pickFirst(issue, ['Description', 'description']);

  // People
  const author = pickPerson(issue, ['Author', 'author']);
  const assigned = pickPerson(issue, ['AssignedTo', 'assignedTo']);
  const lastModBy = pickPerson(issue, [
    'LastModificationAuthor',
    'lastModificationAuthor',
  ]);

  // Dates
  const created = pickFirst(issue, ['CreationDate', 'creationDate']);
  const modified = pickFirst(issue, [
    'LastModificationDate',
    'lastModificationDate',
  ]);
  const due = pickFirst(issue, ['DueDate', 'dueDate']);
  const closed = pickFirst(issue, ['ClosingDate', 'closingDate']);

  // Classification objects often have Name/Color/Id
  const status = pickNamed(issue, ['Status', 'status']);
  const priority = pickNamed(issue, ['Priority', 'priority']);
  const type = pickNamed(issue, ['Type', 'type']);
  const phase = pickNamed(issue, ['ProjectPhase', 'projectPhase']);
  const zone = pickNamed(issue, ['ProjectZone', 'projectZone']);

  // Arrays and other heavy stuff
  const disciplines = pickFirst(issue, ['Disciplines', 'disciplines']);
  const custom = pickFirst(issue, ['CustomAttributes', 'customAttributes']);
  const comments = pickFirst(issue, ['Comments', 'comments']);
  const attachments = pickFirst(issue, ['Attachments', 'attachments']);
  const viewpoints = pickFirst(issue, ['Viewpoints', 'viewpoints']);
  const history = pickFirst(issue, ['History', 'history']);

  const headerTitle = title ? escapeHtml(String(title)) : 'Issue';
  const headerBadge =
    number != null
      ? `<span class="badge">#${escapeHtml(String(number))}</span>`
      : '';

  return `
    <div class="card">
      <div class="card-header">
        <div style="display:flex; align-items:center; gap:10px;">
          <h3 class="card-title">${headerTitle}</h3>
          ${headerBadge}
        </div>
        <div class="chevron">Issue</div>
      </div>
      <div class="card-body">
        ${renderKV('Id', id)}
        ${renderKV('Number', number)}
        ${renderKV('Title', title)}
        ${renderKV('Status', status?.Name || status?.name)}
        ${renderKV('Priority', priority?.Name || priority?.name)}
        ${renderKV('Type', type?.Name || type?.name)}
      </div>
    </div>

    ${renderCollapsibleCard('Summary', true, [
      renderKV('Description', desc, { rich: true }),
      renderKV('Group', pickFirst(issue, ['Group', 'group'])),
      renderKV(
        'Creation Source',
        pickFirst(issue, ['CreationSource', 'creationSource'])
      ),
      renderKV(
        'Restricted',
        pickFirst(issue, ['IsRestricted', 'isRestricted'])
      ),
      renderKV('Viewer URL', pickFirst(issue, ['ViewerUrl', 'viewerUrl']), {
        link: true,
      }),
    ])}

    ${renderCollapsibleCard('People', false, [
      renderKV('Author', formatPerson(author)),
      renderKV('Assigned To', formatPerson(assigned)),
      renderKV('Last Modified By', formatPerson(lastModBy)),
    ])}

    ${renderCollapsibleCard('Dates', false, [
      renderKV('Created', formatDateTime(created)),
      renderKV('Last Modified', formatDateTime(modified)),
      renderKV('Due', formatDateTime(due)),
      renderKV('Closed', formatDateTime(closed)),
    ])}

    ${renderCollapsibleCard('Classification', false, [
      renderKV('Disciplines', disciplines, { collapsible: true }),
      renderKV('Phase', phase?.Name || phase?.name),
      renderKV('Zone', zone?.Name || zone?.name),
    ])}

    ${renderCollapsibleCard('Custom Attributes', false, [
      renderKV('Custom Attributes', custom, { collapsible: true }),
    ])}

    ${renderCollapsibleCard('Comments', false, [
      renderKV('Comments', comments, { collapsible: true }),
    ])}

    ${renderCollapsibleCard('Attachments', false, [
      renderKV('Attachments', attachments, { collapsible: true }),
    ])}

    ${renderCollapsibleCard('Viewpoints', false, [
      renderKV('Viewpoints', viewpoints, { collapsible: true }),
    ])}

    ${renderCollapsibleCard('History', false, [
      renderKV('History', history, { collapsible: true }),
    ])}
  `;
}

/**
 * Generic pretty view: shows top-level keys and lets user expand arrays/objects.
 * Keeps v1 safe for unknown shapes.
 * @param {any} record
 */
function renderGenericPrettyView(record) {
  const summary = buildGenericSummary(record);

  return `
    ${renderCollapsibleCard('Generic Pretty View', true, [
      renderKV('Top-level type', summary.topType),
      summary.topSummary
        ? renderKV('Top-level summary', summary.topSummary)
        : '',
      summary.highValue.length
        ? renderCollapsibleCard(
            'Likely important fields',
            true,
            summary.highValue
          )
        : '',
      renderKV('Record', record, { collapsible: true }),
    ])}
  `;
}

/**
 * Render a collapsible card. Body starts open or closed.
 * @param {string} title
 * @param {boolean} open
 * @param {string[]} bodyParts
 */
function renderCollapsibleCard(title, open, bodyParts) {
  const content = bodyParts.filter(Boolean).join('');
  const isOpen = open ? 'true' : 'false';
  const bodyStyle = open ? '' : 'style="display:none;"';
  const chevron = open ? 'v' : '>';

  return `
    <div class="card" data-collapsible="true" data-open="${isOpen}">
      <div class="card-header">
        <button class="card-header-button" type="button" aria-expanded="${isOpen}">
          <h3 class="card-title">${escapeHtml(title)}</h3>
          <div class="card-actions">
            <div class="chevron" data-chevron="true">${chevron}</div>
          </div>
        </button>
      </div>
      <div class="card-body" data-collapsible-body="true" ${bodyStyle}>
        ${content || `<div class="empty-state">Nothing here.</div>`}
      </div>
    </div>
  `;
}

function buildGenericSummary(value) {
  const topType = Array.isArray(value) ? 'array' : typeof value;

  // Summary line (short, stable, readable)
  const topSummary = summarizeTopLevel(value);

  // "Likely important fields" (only for objects, and arrays of objects)
  const highValue = buildHighValueFieldRows(value);

  return { topType, topSummary, highValue };
}

function summarizeTopLevel(value) {
  if (value == null) return 'null';
  if (typeof value !== 'object') return String(value);

  if (Array.isArray(value)) {
    const len = value.length;
    const dist = arrayTypeDistribution(value);
    const distText = Object.entries(dist)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k}: ${n}`)
      .join(', ');

    // If it is an array of objects, show a tiny key hint
    const objKeys = commonKeysFromArrayOfObjects(value, 8);
    const keyHint = objKeys.length
      ? ` • Common keys: ${objKeys.join(', ')}`
      : '';

    return `Length: ${len}${
      distText ? ` • Contents: ${distText}` : ''
    }${keyHint}`;
  }

  function topLevelValueStats(obj) {
    const stats = {
      string: 0,
      number: 0,
      boolean: 0,
      null: 0,
      array: 0,
      object: 0,
      other: 0,
    };

    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return stats;

    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (v == null) {
        stats.null++;
      } else if (Array.isArray(v)) {
        stats.array++;
      } else {
        const t = typeof v;
        if (t === 'string') stats.string++;
        else if (t === 'number') stats.number++;
        else if (t === 'boolean') stats.boolean++;
        else if (t === 'object') stats.object++;
        else stats.other++;
      }
    }

    return stats;
  }

  // Plain object
  const keys = Object.keys(value);
  if (!keys.length) return '(no keys)';

  const stats = topLevelValueStats(value);
  const statsText = Object.entries(stats)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k}: ${n}`)
    .join(', ');

  const preview = keys.slice(0, 18).join(', ');
  const more = keys.length > 18 ? `, … (+${keys.length - 18})` : '';

  return `Keys: ${keys.length}${
    statsText ? ` • Top-level: ${statsText}` : ''
  } • Preview: ${preview}${more}`;
}

function buildHighValueFieldRows(value) {
  // If it is an array of objects, try the first object as a "representative"
  if (Array.isArray(value)) {
    const firstObj = value.find(
      (x) => x && typeof x === 'object' && !Array.isArray(x)
    );
    if (firstObj) return buildHighValueFieldRows(firstObj);
    return [];
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];

  const candidates = [
    { label: 'Id', keys: ['Id', 'id', 'ID', 'uid', 'guid', 'uuid'] },
    { label: 'Number', keys: ['Number', 'number', 'No', 'no', 'code', 'Code'] },
    {
      label: 'Title',
      keys: ['Title', 'title', 'Subject', 'subject', 'Summary', 'summary'],
    },
    { label: 'Name', keys: ['Name', 'name', 'DisplayName', 'displayName'] },
    { label: 'Status', keys: ['Status', 'status', 'State', 'state'] },
    { label: 'Type', keys: ['Type', 'type', 'Category', 'category'] },
    { label: 'Priority', keys: ['Priority', 'priority'] },
    {
      label: 'Created',
      keys: [
        'CreationDate',
        'creationDate',
        'createdAt',
        'CreatedAt',
        'created',
      ],
    },
    {
      label: 'Updated',
      keys: [
        'LastModificationDate',
        'lastModificationDate',
        'updatedAt',
        'UpdatedAt',
        'modified',
      ],
    },
    { label: 'Due', keys: ['DueDate', 'dueDate', 'due'] },
    {
      label: 'URL',
      keys: ['Url', 'url', 'Link', 'link', 'ViewerUrl', 'viewerUrl'],
    },
  ];

  const rows = [];

  for (const c of candidates) {
    const v = pickFirst(value, c.keys);
    if (v == null) continue;

    // Keep it readable. If the value is a big object/array, render it collapsed.
    const isHeavy = typeof v === 'object';
    rows.push(
      renderKV(c.label, v, { collapsible: isHeavy, link: c.label === 'URL' })
    );
  }

  // Add one extra: "Owner-like" fields if present
  const owner = pickFirst(value, [
    'Owner',
    'owner',
    'Author',
    'author',
    'CreatedBy',
    'createdBy',
  ]);
  if (owner != null) {
    rows.push(
      renderKV('Owner-like', owner, { collapsible: typeof owner === 'object' })
    );
  }

  return rows;
}

function arrayTypeDistribution(arr) {
  const dist = {};
  for (const item of arr) {
    const t =
      item == null ? 'null' : Array.isArray(item) ? 'array' : typeof item;
    dist[t] = (dist[t] || 0) + 1;
  }
  return dist;
}

function commonKeysFromArrayOfObjects(arr, limit) {
  const counts = new Map();

  for (const item of arr) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;

    for (const k of Object.keys(item)) {
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }

  const sorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(0, limit));

  return sorted.map(([k]) => k);
}

/**
 * Render a key-value row with smart value rendering.
 * @param {string} key
 * @param {any} value
 * @param {{ collapsible?: boolean, link?: boolean, rich?: boolean, path?: string }=} opts
 */
function renderKV(key, value, opts) {
  const o = opts || {};
  const v = renderValue(value, o);
  if (v === '') return '';

  const pathHtml =
    state.showPaths && o.path
      ? `<div class="path-hint" title="${escapeHtml(o.path)}">${escapeHtml(
          o.path
        )}</div>`
      : '';

  // Build without template-literal indentation/newlines.
  // This prevents extra blank lines when the parent uses white-space: pre-wrap.
  return [
    `<div class="kv">`,
    `<div class="k" title="${escapeHtml(key)}">${escapeHtml(key)}</div>`,
    `<div class="v">`,
    pathHtml,
    v,
    `</div>`,
    `</div>`,
  ].join('');
}

/**
 * Render a KV row where the value is already-built HTML.
 * Use this ONLY when the HTML is generated by our code (not user JSON).
 *
 * @param {string} key
 * @param {string} htmlValue
 * @param {{ path?: string }=} opts
 */
function renderKVHtml(key, htmlValue, opts) {
  const o = opts || {};
  const v = String(htmlValue || '');
  if (!v) return '';

  const pathHtml =
    state.showPaths && o.path
      ? `<div class="path-hint" title="${escapeHtml(o.path)}">${escapeHtml(
          o.path
        )}</div>`
      : '';

  // Same no-whitespace strategy as renderKV().
  return [
    `<div class="kv">`,
    `<div class="k" title="${escapeHtml(key)}">${escapeHtml(key)}</div>`,
    `<div class="v">`,
    pathHtml,
    v,
    `</div>`,
    `</div>`,
  ].join('');
}

function renderKvListValue(arrValue, cfg) {
  if (!Array.isArray(arrValue) || arrValue.length === 0) return '';

  const c = cfg || {};
  const itemKeyPath = String(c.itemKeyPath || 'Name').trim() || 'Name';

  const valuePaths =
    Array.isArray(c.valuePaths) && c.valuePaths.length
      ? c.valuePaths.map((p) => String(p || '').trim()).filter(Boolean)
      : ['TextValue', 'PredefinedValues.Name', 'PredefinedValues[0].Name'];

  const maxItems = Number.isFinite(c.maxItems)
    ? Math.max(1, Math.floor(c.maxItems))
    : 6;

  const showEmpty = Boolean(c.showEmpty);
  const emptyText =
    typeof c.emptyText === 'string' && c.emptyText.trim()
      ? c.emptyText.trim()
      : '(empty)';

  const rows = [];

  for (const item of arrValue) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;

    const kRaw = getValueAtPath(item, itemKeyPath);
    const key = kRaw == null ? '' : String(kRaw).trim();
    if (!key) continue;

    let val = null;

    for (const vp of valuePaths) {
      const v = getValueAtPath(item, vp);

      // Handle dropdown values (arrays like PredefinedValues)
      if (Array.isArray(v)) {
        const names = v
          .map((x) => (x && typeof x === 'object' ? x.Name ?? x.name : x))
          .filter((x) => x != null)
          .map((x) => String(x).trim())
          .filter(Boolean);

        if (names.length) {
          val = names.join(', ');
          break;
        }
        continue;
      }

      // Handle text value
      if (v != null && String(v).trim() !== '') {
        val = v;
        break;
      }
    }

    const finalText =
      val == null || String(val).trim() === ''
        ? showEmpty
          ? emptyText
          : ''
        : String(val);

    if (!finalText) continue;

    rows.push(
      [
        `<div class="kvlist-row">`,
        `<div class="kvlist-k" title="${escapeHtml(key)}">${escapeHtml(
          key
        )}</div>`,
        `<div class="kvlist-v${
          finalText === emptyText ? ' is-empty' : ''
        }">${escapeHtml(finalText)}</div>`,
        `</div>`,
      ].join('')
    );

    if (rows.length >= maxItems) break;
  }

  if (!rows.length) return '';
  return `<div class="kvlist">${rows.join('')}</div>`;
}

/**
 * Render an array-of-objects as key/value rows inside a single template field.
 * Designed for NFK CustomAttributes where each item has Name + (TextValue or PredefinedValues).
 *
 * @param {any} arrValue
 * @param {{
 *   itemKeyPath?: string,
 *   valuePaths?: string[],
 *   maxItems?: number,
 *   showEmpty?: boolean,
 *   emptyText?: string
 * }=} cfg
 * @returns {string} HTML (safe, generated by us)
 */
function renderKvListValue(arrValue, cfg) {
  if (!Array.isArray(arrValue) || arrValue.length === 0) return '';

  const c = cfg || {};
  const itemKeyPath = String(c.itemKeyPath || 'Name').trim() || 'Name';

  const valuePaths =
    Array.isArray(c.valuePaths) && c.valuePaths.length
      ? c.valuePaths.map((p) => String(p || '').trim()).filter(Boolean)
      : ['TextValue', 'PredefinedValues.Name', 'PredefinedValues[0].Name'];

  const maxItems = Number.isFinite(c.maxItems)
    ? Math.max(1, Math.floor(c.maxItems))
    : 6;

  const showEmpty = Boolean(c.showEmpty);
  const emptyText =
    typeof c.emptyText === 'string' && c.emptyText.trim()
      ? c.emptyText.trim()
      : '(empty)';

  const rows = [];

  for (const item of arrValue) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;

    const kRaw = getValueAtPath(item, itemKeyPath);
    const key = kRaw == null ? '' : String(kRaw).trim();
    if (!key) continue;

    let val = null;

    for (const vp of valuePaths) {
      const v = getValueAtPath(item, vp);

      // If path returns an array (e.g., PredefinedValues), join names.
      if (Array.isArray(v)) {
        const names = v
          .map((x) => (x && typeof x === 'object' ? x.Name ?? x.name : x))
          .filter((x) => x != null)
          .map((x) => String(x).trim())
          .filter(Boolean);

        if (names.length) {
          val = names.join(', ');
          break;
        }
        continue;
      }

      if (v != null && String(v).trim() !== '') {
        val = v;
        break;
      }
    }

    const finalText =
      val == null || String(val).trim() === ''
        ? showEmpty
          ? emptyText
          : ''
        : String(val);

    if (!finalText) continue;

    rows.push(
      `<div class="kvlist-row">` +
        `<div class="kvlist-k" title="${escapeHtml(key)}">${escapeHtml(
          key
        )}</div>` +
        `<div class="kvlist-v${
          finalText === emptyText ? ' is-empty' : ''
        }">${escapeHtml(finalText)}</div>` +
        `</div>`
    );

    if (rows.length >= maxItems) break;
  }

  if (!rows.length) return '';
  return `<div class="kvlist">${rows.join('')}</div>`;
}

/**
 * Render an array-of-objects as key/value rows inside a single template field.
 * Designed for things like NFK CustomAttributes where shape varies by project.
 *
 * Supports showing empty values when showEmpty is true.
 *
 * @param {any} arrValue
 * @param {{
 *   itemKeyPath?: string,
 *   valuePaths?: string[],
 *   maxItems?: number,
 *   showEmpty?: boolean,
 *   emptyText?: string
 * }=} cfg
 * @returns {string} HTML (safe, generated by us)
 */
function renderKvListValue(arrValue, cfg) {
  if (!Array.isArray(arrValue) || arrValue.length === 0) return '';

  const c = cfg || {};
  const itemKeyPath = String(c.itemKeyPath || 'Name').trim() || 'Name';

  // Default: NFK-style (text OR predefined dropdown names)
  const valuePaths =
    Array.isArray(c.valuePaths) && c.valuePaths.length
      ? c.valuePaths.map((p) => String(p || '').trim()).filter(Boolean)
      : ['TextValue', 'PredefinedValues.Name', 'PredefinedValues[0].Name'];

  const maxItems = Number.isFinite(c.maxItems)
    ? Math.max(1, Math.floor(c.maxItems))
    : 6;

  // New: show empties
  const showEmpty = Boolean(c.showEmpty);
  const emptyText =
    typeof c.emptyText === 'string' && c.emptyText.trim()
      ? c.emptyText.trim()
      : '(empty)';

  const rows = [];

  for (const item of arrValue) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;

    const kRaw = getValueAtPath(item, itemKeyPath);
    const key = kRaw == null ? '' : String(kRaw).trim();
    if (!key) continue;

    // Find first “real” value using the configured paths.
    let val = null;

    for (const vp of valuePaths) {
      const v = getValueAtPath(item, vp);

      // Special handling: arrays like PredefinedValues (could be 0..n)
      if (Array.isArray(v)) {
        const names = v
          .map((x) => (x && typeof x === 'object' ? x.Name ?? x.name : x))
          .filter((x) => x != null)
          .map((x) => String(x).trim())
          .filter(Boolean);

        if (names.length) {
          val = names.join(', ');
          break;
        }
        continue;
      }

      if (v != null && String(v).trim() !== '') {
        val = v;
        break;
      }
    }

    // New behavior: show empty if enabled
    const finalText =
      val == null || String(val).trim() === ''
        ? showEmpty
          ? emptyText
          : ''
        : String(val);

    if (!finalText) continue;

    rows.push(
      `<div class="kvlist-row">` +
        `<div class="kvlist-k" title="${escapeHtml(key)}">${escapeHtml(
          key
        )}</div>` +
        `<div class="kvlist-v${
          finalText === emptyText ? ' is-empty' : ''
        }">${escapeHtml(finalText)}</div>` +
        `</div>`
    );

    if (rows.length >= maxItems) break;
  }

  if (!rows.length) return '';

  return `<div class="kvlist">${rows.join('')}</div>`;
}

/**
 * Render an array-of-objects as key/value rows inside a single template field.
 * Designed for things like NFK CustomAttributes where shape varies by project.
 *
 * @param {any} arrValue
 * @param {{
 *   itemKeyPath?: string,
 *   valuePaths?: string[],
 *   maxItems?: number
 * }=} cfg
 * @returns {string} HTML (safe, generated by us)
 */
function renderKvListValue(arrValue, cfg) {
  if (!Array.isArray(arrValue) || arrValue.length === 0) return '';

  const c = cfg || {};
  const itemKeyPath = String(c.itemKeyPath || 'Name').trim() || 'Name';

  // Default: NFK-style (text OR predefined dropdown names)
  const valuePaths =
    Array.isArray(c.valuePaths) && c.valuePaths.length
      ? c.valuePaths.map((p) => String(p || '').trim()).filter(Boolean)
      : ['TextValue', 'PredefinedValues.Name', 'PredefinedValues[0].Name'];

  const maxItems = Number.isFinite(c.maxItems) ? Math.max(1, c.maxItems) : 6;

  const rows = [];

  for (const item of arrValue) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;

    const kRaw = getValueAtPath(item, itemKeyPath);
    const key = kRaw == null ? '' : String(kRaw).trim();
    if (!key) continue;

    // Find first “real” value using the configured paths.
    let val = null;

    for (const vp of valuePaths) {
      const v = getValueAtPath(item, vp);

      // Special handling: arrays like PredefinedValues (could be 0..n)
      if (Array.isArray(v)) {
        const names = v
          .map((x) => (x && typeof x === 'object' ? x.Name ?? x.name : x))
          .filter((x) => x != null)
          .map((x) => String(x).trim())
          .filter(Boolean);

        if (names.length) {
          val = names.join(', ');
          break;
        }
        continue;
      }

      if (v != null && String(v).trim() !== '') {
        val = v;
        break;
      }
    }

    if (val == null || String(val).trim() === '') continue;

    rows.push(
      `<div class="kvlist-row">` +
        `<div class="kvlist-k">${escapeHtml(key)}</div>` +
        `<div class="kvlist-v">${escapeHtml(String(val))}</div>` +
        `</div>`
    );

    if (rows.length >= maxItems) break;
  }

  if (!rows.length) return '';

  return `<div class="kvlist">${rows.join('')}</div>`;
}

/**
 * Render values safely. Arrays and objects are collapsed by default if collapsible is true.
 * @param {any} value
 * @param {{ collapsible?: boolean, link?: boolean, rich?: boolean }=} opts
 */
function renderValue(value, opts) {
  const o = opts || {};

  if (value == null) return `<span class="badge">null</span>`;

  // If link option is set and it looks like a URL, make it clickable
  if (o.link && typeof value === 'string' && looksLikeUrl(value)) {
    return `<a href="${escapeHtml(
      value
    )}" target="_blank" rel="noreferrer">${escapeHtml(value)}</a>`;
  }

  // Rich text: preserve line breaks, but still escape HTML
  if (o.rich && typeof value === 'string') {
    return escapeHtml(value);
  }

  // Primitive types
  if (typeof value === 'string') return escapeHtml(value);
  if (typeof value === 'number' || typeof value === 'boolean')
    return escapeHtml(String(value));

  // Arrays
  if (Array.isArray(value)) {
    const isEmpty = value.length === 0;
    const emptyClass = isEmpty ? ' is-empty-array' : '';

    // Non-collapsible arrays are printed as JSON text
    if (!o.collapsible) {
      return escapeHtml(JSON.stringify(value, null, 2));
    }

    // Keep preview short and optional
    const previewCount = Math.min(3, value.length);
    const preview = previewCount ? buildArrayPreview(value, previewCount) : '';

    // Build markup with string joining so we do NOT emit newline/indent whitespace nodes.
    // This matters because .kv .v uses white-space: pre-wrap, which will preserve those.
    const parts = [
      `<div data-value-collapsible="true" data-open="false" class="value-array${emptyClass}">`,
      `<button class="mini-btn" type="button" data-toggle-value="true">`,
      isEmpty ? `Expand array (0)` : `Expand array (${value.length})`,
      `</button>`,
    ];

    // Only show preview for non-empty arrays (empty previews add visual noise)
    if (!isEmpty) {
      parts.push(
        `<span class="array-preview">`,
        `Preview: ${escapeHtml(preview)}${
          value.length > previewCount ? ', …' : ''
        }`,
        `</span>`
      );
    }

    parts.push(
      `<div data-value-body="true" style="display:none; margin-top:10px;">`,
      renderArrayAsList(value, o.path || '$'),
      `</div>`,
      `</div>`
    );

    return parts.join('');
  }

  // Objects
  if (typeof value === 'object') {
    if (!o.collapsible) {
      return escapeHtml(JSON.stringify(value, null, 2));
    }

    const keys = Object.keys(value);
    const preview = buildObjectPreview(value, 3);

    // Same strategy as arrays: no newline/indent whitespace nodes.
    return [
      `<div data-value-collapsible="true" data-open="false" class="value-object">`,
      `<button class="mini-btn" type="button" data-toggle-value="true">Expand object (${keys.length} keys)</button>`,
      `<span class="object-preview">Preview: ${escapeHtml(preview)}</span>`,
      `<div data-value-body="true" style="display:none; margin-top:10px;">`,
      renderObjectAsKv(value, o.path || '$'),
      `</div>`,
      `</div>`,
    ].join('');
  }

  // Anything else
  return escapeHtml(String(value));
}

function buildArrayPreview(arr, previewCount) {
  if (!Array.isArray(arr) || arr.length === 0) return '(empty)';

  const parts = arr.slice(0, previewCount).map((x) => {
    if (x == null) return 'null';
    if (Array.isArray(x)) return `Array(${x.length})`;
    if (typeof x !== 'object') return String(x);

    // Object item: show a couple of useful pairs
    const pairs = pickPreviewPairs(x, 2);
    if (!pairs.length) return '{…}';
    return `{ ${pairs.map(([k, v]) => `${k}: ${v}`).join(', ')} }`;
  });

  return parts.join(', ');
}

function buildObjectPreview(obj, maxPairs) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return String(obj);

  const pairs = pickPreviewPairs(obj, maxPairs);
  const nested = countNestedTopLevel(obj);

  const pairText = pairs.length
    ? pairs.map(([k, v]) => `${k}: ${v}`).join(', ')
    : '(no simple fields)';

  const nestedBits = [];
  if (nested.objects) nestedBits.push(`obj: ${nested.objects}`);
  if (nested.arrays) nestedBits.push(`arr: ${nested.arrays}`);
  const nestedText = nestedBits.length
    ? ` • Nested: ${nestedBits.join(', ')}`
    : '';

  return `${pairText}${nestedText}`;
}

function pickPreviewPairs(obj, maxPairs) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];

  // Prefer human-friendly keys first
  const preferred = [
    'Title',
    'title',
    'Name',
    'name',
    'Subject',
    'subject',
    'Number',
    'number',
    'Id',
    'id',
    'Status',
    'status',
    'Type',
    'type',
  ];

  const out = [];
  const used = new Set();

  // 1) preferred keys
  for (const k of preferred) {
    if (out.length >= maxPairs) break;
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;

    const v = obj[k];
    const sv = simplePreviewValue(v);
    if (sv == null) continue;

    out.push([k, sv]);
    used.add(k);
  }

  // 2) fill from remaining keys
  for (const k of Object.keys(obj)) {
    if (out.length >= maxPairs) break;
    if (used.has(k)) continue;

    const v = obj[k];
    const sv = simplePreviewValue(v);
    if (sv == null) continue;

    out.push([k, sv]);
  }

  return out;
}

function simplePreviewValue(v) {
  if (v == null) return 'null';
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    return s.length > 40 ? `${s.slice(0, 40)}…` : s;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);

  // If it is an array/object, keep it short
  if (Array.isArray(v)) return `Array(${v.length})`;
  if (typeof v === 'object') return 'Object';
  return null;
}

function countNestedTopLevel(obj) {
  let arrays = 0;
  let objects = 0;

  for (const k of Object.keys(obj || {})) {
    const v = obj[k];
    if (Array.isArray(v)) arrays++;
    else if (v && typeof v === 'object') objects++;
  }

  return { arrays, objects };
}

function renderObjectAsKv(obj, basePath) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';

  const base = basePath || '$';

  const keys = Object.keys(obj);
  if (!keys.length) return `<div class="empty-state">(no keys)</div>`;

  // Sort keys so the "human" ones appear first, then the rest alphabetically.
  const preferred = [
    'Id',
    'id',
    'Number',
    'number',
    'Title',
    'title',
    'Name',
    'name',
    'Subject',
    'subject',
    'Status',
    'status',
    'Type',
    'type',
    'Priority',
    'priority',
    'CreationDate',
    'creationDate',
    'LastModificationDate',
    'lastModificationDate',
    'DueDate',
    'dueDate',
    'Url',
    'url',
    'ViewerUrl',
    'viewerUrl',
  ];

  const preferredSet = new Set(preferred);

  const sorted = [
    ...keys.filter((k) => preferredSet.has(k)),
    ...keys
      .filter((k) => !preferredSet.has(k))
      .sort((a, b) => a.localeCompare(b)),
  ];

  return sorted
    .map((k) => {
      const v = obj[k];

      // Keep nesting safe:
      // - objects and arrays remain collapsible (so no runaway render)
      const isHeavy = v && typeof v === 'object';
      const isUrlKey =
        String(k).toLowerCase().includes('url') ||
        String(k).toLowerCase().includes('link');

      const nextPath = `${base}.${k}`;

      return renderKV(k, v, {
        collapsible: isHeavy,
        link: isUrlKey && typeof v === 'string',
        rich: typeof v === 'string' && v.includes('\n'),
        path: nextPath,
      });
    })
    .join('');
}

function renderArrayAsList(arr, arrayPath) {
  if (!Array.isArray(arr)) return '';

  if (arr.length === 0) {
    return `<div class="empty-state">(empty array)</div>`;
  }

  const HARD_MAX = 50; // guardrail against huge arrays freezing the UI
  const showCount = Math.min(arr.length, HARD_MAX);

  const metaLeft =
    arr.length > showCount
      ? `Showing 1–${showCount} of ${arr.length}`
      : `Items: ${arr.length}`;

  const hardMaxNote =
    arr.length > HARD_MAX
      ? `<div class="array-note">Note: showing the first ${HARD_MAX} items for performance.</div>`
      : '';

  const itemsHtml = arr
    .slice(0, showCount)
    .map((item, idx) => renderArrayItem(arr, item, idx))
    .join('');

  // Important: build without template-literal indentation/newlines.
  // This prevents extra vertical whitespace because the parent uses white-space: pre-wrap.
  return [
    `<div class="array-meta-row">`,
    `<div class="array-meta">${escapeHtml(metaLeft)}</div>`,
    `</div>`,
    hardMaxNote,
    `<div class="array-list">`,
    itemsHtml,
    `</div>`,
  ].join('');
}

function renderArrayItem(parentArr, item, idx) {
  // Primitives: show as a single KV row
  if (item == null || typeof item !== 'object') {
    return [
      `<div class="array-item">`,
      renderKV(`[${idx}]`, item),
      `</div>`,
    ].join('');
  }

  // Arrays inside arrays: keep it collapsible
  if (Array.isArray(item)) {
    return [
      `<div class="array-item">`,
      renderKV(`[${idx}]`, item, { collapsible: true }),
      `</div>`,
    ].join('');
  }

  // Object item: collapsible block with a compact title
  const summary = buildItemSummary(item, idx);

  // Important: add array-item-card so compact CSS applies.
  // Also build with join('') to avoid whitespace nodes.
  return [
    `<div class="card array-item-card" data-collapsible="true" data-open="false">`,
    `<div class="card-header">`,
    `<button class="card-header-button" type="button" aria-expanded="false">`,
    `<h3 class="card-title">${escapeHtml(summary)}</h3>`,
    `<div class="card-actions"><div class="chevron" data-chevron="true">&gt;</div></div>`,
    `</button>`,
    `</div>`,
    `<div class="card-body" data-collapsible-body="true" style="display:none;">`,
    renderObjectAsKv(item, `$[${idx}]`),
    `</div>`,
    `</div>`,
  ].join('');
}

function buildItemSummary(obj, idx) {
  // Use same “human” keys we already favor
  const id = pickFirst(obj, ['Id', 'id', 'ID', 'uid', 'guid', 'uuid']);
  const num = pickFirst(obj, ['Number', 'number', 'No', 'no', 'code', 'Code']);
  const title = pickFirst(obj, [
    'Title',
    'title',
    'Subject',
    'subject',
    'Name',
    'name',
    'Summary',
    'summary',
  ]);
  const status = pickFirst(obj, [
    'Status',
    'status',
    'State',
    'state',
    'ReviewStatus',
    'reviewStatus',
  ]);

  const bits = [];

  bits.push(`[${idx}]`);

  if (id != null) bits.push(`Id ${String(id)}`);
  if (num != null) bits.push(`#${String(num)}`);

  if (title && typeof title === 'string' && title.trim()) {
    const t = title.trim();
    bits.push(t.length > 60 ? `${t.slice(0, 60)}…` : t);
  }

  if (status && typeof status === 'string' && status.trim()) {
    bits.push(`(${status.trim()})`);
  } else if (status && typeof status === 'object') {
    const sName = pickFirst(status, ['Name', 'name']);
    if (typeof sName === 'string' && sName.trim())
      bits.push(`(${sName.trim()})`);
  }

  // Fallback: if it has no obvious identifiers, show key count
  if (bits.length === 1) {
    bits.push(`Object (${Object.keys(obj).length} keys)`);
  }

  return bits.join(' • ');
}

/**
 * Wire up collapsible cards and value expanders inside the viewer.
 * Runs after els.viewer.innerHTML is set.
 */
function wireViewerInteractions() {
  // Collapsible cards
  els.viewer.querySelectorAll('[data-collapsible="true"]').forEach((card) => {
    const btn = card.querySelector('.card-header-button');
    const body = card.querySelector('[data-collapsible-body="true"]');
    const chev = card.querySelector('[data-chevron="true"]');
    if (!btn || !body || !chev) return;

    btn.addEventListener('click', () => {
      const open = card.getAttribute('data-open') === 'true';
      const next = !open;
      card.setAttribute('data-open', next ? 'true' : 'false');
      btn.setAttribute('aria-expanded', next ? 'true' : 'false');
      body.style.display = next ? '' : 'none';
      chev.textContent = next ? 'v' : '>';
    });
  });

  // Collapsible values (arrays/objects)
  els.viewer
    .querySelectorAll('[data-value-collapsible="true"]')
    .forEach((wrap) => {
      const btn = wrap.querySelector('[data-toggle-value="true"]');
      const body = wrap.querySelector('[data-value-body="true"]');
      if (!btn || !body) return;

      const expandLabel = btn.textContent;
      const collapseLabel = expandLabel.replace(/^Expand\b/, 'Collapse');

      btn.addEventListener('click', () => {
        const open = wrap.getAttribute('data-open') === 'true';
        const next = !open;
        wrap.setAttribute('data-open', next ? 'true' : 'false');
        body.style.display = next ? '' : 'none';
        btn.textContent = next ? collapseLabel : expandLabel;

        // If we just opened it, highlight any JSON inside
        if (next) highlightJsonIn(wrap);
      });
    });
}

/**
 * Apply search styling to the currently rendered viewer.
 * Session 2: Works for any template that renders .kv rows (Issue + Generic today).
 * - Matches label OR value text (case-insensitive)
 * - Highlights hits, dims non-hits
 * - Optional: include/exclude collapsed content
 * - Marks section headers when matches exist inside (when include collapsed is on)
 * @param {RecordType} recordType
 */
function applySearchToViewer(recordType) {
  // Raw view is just a <pre>, do not try to mark it up
  if (state.showRaw) {
    clearSearchMarks();
    clearTextHighlights();
    clearSectionMarks();
    return;
  }

  const q = (state.searchQuery || '').trim();
  if (!q) {
    clearSearchMarks();
    clearTextHighlights();
    clearSectionMarks();
    return;
  }

  const needle = q.toLowerCase();
  const includeCollapsed = Boolean(state.includeCollapsedInSearch);

  // Start clean each time to avoid stacking <mark> tags
  clearSearchMarks();
  clearTextHighlights();
  clearSectionMarks();

  /** @type {NodeListOf<HTMLElement>} */
  const rows = els.viewer.querySelectorAll('.kv');
  if (!rows.length) return;

  rows.forEach((row) => {
    // If we are NOT including collapsed content, skip rows not currently visible.
    if (!includeCollapsed && !isElementVisible(row)) return;

    const k = row.querySelector('.k');
    const v = row.querySelector('.v');

    const labelText = (k?.textContent || '').toLowerCase();
    const valueText = (v?.textContent || '').toLowerCase();

    const hit = labelText.includes(needle) || valueText.includes(needle);

    row.classList.toggle('is-hit', hit);
    row.classList.toggle('is-dim', !hit);

    // Highlight matched fragments in label/value text (but only for hits)
    if (hit) {
      if (k) highlightTextInElement(k, q);
      if (v) highlightTextInElement(v, q);
    }
  });

  // If include-collapsed is on, mark section headers that contain hits
  if (includeCollapsed) {
    markSectionsWithHits();
  }
}

/**
 * True if element is visible (not display:none up the tree).
 * This is cheap and avoids searching inside collapsed sections unless enabled.
 * @param {HTMLElement} el
 */
function isElementVisible(el) {
  // offsetParent is null for display:none (and for some fixed elements),
  // so we add a computed-style fallback.
  if (el.offsetParent !== null) return true;

  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;

  // Walk up for a parent with display:none
  let p = el.parentElement;
  while (p) {
    const s = window.getComputedStyle(p);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    p = p.parentElement;
  }
  return true;
}

/** Clear any prior search styling in the viewer. */
function clearSearchMarks() {
  els.viewer
    .querySelectorAll('.kv.is-hit, .kv.is-dim, .field.is-hit, .field.is-dim')
    .forEach((el) => el.classList.remove('is-hit', 'is-dim'));
}

/** Remove any existing <mark> highlights we previously added. */
function clearTextHighlights() {
  els.viewer.querySelectorAll('mark.jtf-mark').forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;

    // Replace the <mark> with its text content
    parent.replaceChild(document.createTextNode(m.textContent || ''), m);

    // Merge adjacent text nodes to keep DOM tidy
    parent.normalize();
  });
}

/**
 * Highlight occurrences of query inside an element, without touching nested elements
 * like links and buttons. This avoids breaking controls.
 * @param {Element} el
 * @param {string} query
 */
function highlightTextInElement(el, query) {
  const q = (query || '').trim();
  if (!q) return;

  // Do not highlight inside these, it can break behavior or semantics
  const blockedTags = new Set([
    'A',
    'BUTTON',
    'INPUT',
    'SELECT',
    'TEXTAREA',
    'PRE',
    'CODE',
  ]);
  if (blockedTags.has(el.tagName)) return;

  // We only highlight within direct text nodes, not inside child elements
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Skip empty/whitespace-only nodes
      if (!node.nodeValue || !node.nodeValue.trim())
        return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  if (!nodes.length) return;

  const qLower = q.toLowerCase();

  nodes.forEach((textNode) => {
    const text = textNode.nodeValue || '';
    const lower = text.toLowerCase();
    const idx = lower.indexOf(qLower);
    if (idx === -1) return;

    // Split and wrap all matches (not just the first)
    const frag = document.createDocumentFragment();
    let start = 0;

    while (true) {
      const i = lower.indexOf(qLower, start);
      if (i === -1) break;

      // Text before match
      if (i > start) {
        frag.appendChild(document.createTextNode(text.slice(start, i)));
      }

      // Matched text wrapped in <mark>
      const mark = document.createElement('mark');
      mark.className = 'jtf-mark';
      mark.textContent = text.slice(i, i + q.length);
      frag.appendChild(mark);

      start = i + q.length;
    }

    // Remaining text after last match
    if (start < text.length) {
      frag.appendChild(document.createTextNode(text.slice(start)));
    }

    // Replace original text node
    const parent = textNode.parentNode;
    if (!parent) return;
    parent.replaceChild(frag, textNode);
  });
}

/** Clear section header marks and counts. */
function clearSectionMarks() {
  els.viewer.querySelectorAll('.card.search-hit').forEach((card) => {
    card.classList.remove('search-hit');
  });
  els.viewer.querySelectorAll('.search-count').forEach((n) => n.remove());
}

/**
 * Mark collapsible cards that contain any hits and add a match count badge.
 * Looks for .kv.is-hit inside each card body.
 */
function markSectionsWithHits() {
  els.viewer
    .querySelectorAll('.card[data-collapsible="true"]')
    .forEach((card) => {
      const body = card.querySelector('[data-collapsible-body="true"]');
      const headerTitle = card.querySelector('.card-title');
      if (!body || !headerTitle) return;

      const hits = body.querySelectorAll('.kv.is-hit');
      if (!hits.length) return;

      card.classList.add('search-hit');

      // Add a count badge to the title
      const badge = document.createElement('span');
      badge.className = 'search-count';
      badge.textContent = `${hits.length}`;
      headerTitle.appendChild(badge);
    });
}

/**
 * Pick first matching value from a list of keys.
 * @param {any} obj
 * @param {string[]} keys
 */
function pickFirst(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
  }
  return null;
}

/**
 * Pick "named" object like Status/Priority/Type with Name/Color/Id
 * @param {any} obj
 * @param {string[]} keys
 */
function pickNamed(obj, keys) {
  const v = pickFirst(obj, keys);
  if (!v || typeof v !== 'object') return null;
  return v;
}

/**
 * Pick a person object and return a normalized shape.
 * @param {any} obj
 * @param {string[]} keys
 */
function pickPerson(obj, keys) {
  const p = pickFirst(obj, keys);
  if (!p || typeof p !== 'object') return null;
  return {
    firstName: pickFirst(p, ['FirstName', 'firstName']) || '',
    lastName: pickFirst(p, ['LastName', 'lastName']) || '',
    email: pickFirst(p, ['Email', 'email']) || '',
    userName: pickFirst(p, ['UserName', 'userName']) || '',
    id: pickFirst(p, ['Id', 'id']),
  };
}

function formatPerson(p) {
  if (!p) return '';
  const name = `${p.firstName || ''} ${p.lastName || ''}`.trim();
  if (name && p.email) return `${name} <${p.email}>`;
  if (name) return name;
  if (p.email) return p.email;
  if (p.userName) return p.userName;
  if (p.id != null) return `Id ${p.id}`;
  return '';
}

function formatDateTime(value) {
  if (!value) return '';
  if (typeof value !== 'string') return String(value);

  // Handles "2023-01-05T23:21:29.59" and ISO-like strings
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

// ===============================
// Session 10 – Templates (Step 2)
// Upload + parse + validate
// ===============================

/**
 * Parse JSON or JSONC (JSON with // and /* *\/ comments).
 * We only support a simple, safe subset:
 * - Line comments: // ...
 * - Block comments: /* ... *\/
 * - Trailing commas in objects/arrays are NOT supported (keep it strict)
 * @param {string} text
 * @returns {any}
 */
function parseJsonOrJsonc(text) {
  const stripped = stripJsoncComments(text);
  return JSON.parse(stripped);
}

/**
 * Remove // and / * * / comments, while trying not to break strings.
 * This is a small state machine, not a regex hack.
 * @param {string} input
 */
function stripJsoncComments(input) {
  let out = '';
  let i = 0;

  let inString = false;
  let stringQuote = '"';
  let escaped = false;

  while (i < input.length) {
    const c = input[i];
    const next = input[i + 1];

    if (inString) {
      out += c;

      if (escaped) {
        escaped = false;
      } else if (c === '\\') {
        escaped = true;
      } else if (c === stringQuote) {
        inString = false;
      }

      i++;
      continue;
    }

    // Enter string
    if (c === '"' || c === "'") {
      inString = true;
      stringQuote = c;
      out += c;
      i++;
      continue;
    }

    // Line comment //
    if (c === '/' && next === '/') {
      i += 2;
      while (i < input.length && input[i] !== '\n') i++;
      continue;
    }

    // Block comment /* */
    if (c === '/' && next === '*') {
      i += 2;
      while (i < input.length) {
        if (input[i] === '*' && input[i + 1] === '/') {
          i += 2;
          break;
        }
        i++;
      }
      continue;
    }

    out += c;
    i++;
  }

  return out;
}

/**
 * Minimal template validation for Step 2.
 * We are NOT supporting logic, loops, conditions, mutation, or anything fancy.
 * If invalid: return { ok:false, error:"..." }
 * @param {any} t
 */
function validateTemplate(t) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) {
    return { ok: false, error: 'Template must be a JSON object.' };
  }

  if (t.templateVersion !== 1) {
    return { ok: false, error: 'templateVersion must be 1.' };
  }

  if (typeof t.templateName !== 'string' || !t.templateName.trim()) {
    return { ok: false, error: 'templateName must be a non-empty string.' };
  }

  if (!Array.isArray(t.layout)) {
    return { ok: false, error: 'layout must be an array of sections.' };
  }

  for (const [si, section] of t.layout.entries()) {
    if (!section || typeof section !== 'object' || Array.isArray(section)) {
      return { ok: false, error: `layout[${si}] must be an object.` };
    }
    if (typeof section.section !== 'string' || !section.section.trim()) {
      return { ok: false, error: `layout[${si}].section must be a string.` };
    }
    if (!Array.isArray(section.fields)) {
      return { ok: false, error: `layout[${si}].fields must be an array.` };
    }

    for (const [fi, f] of section.fields.entries()) {
      if (!f || typeof f !== 'object' || Array.isArray(f)) {
        return {
          ok: false,
          error: `layout[${si}].fields[${fi}] must be an object.`,
        };
      }
      if (typeof f.path !== 'string' || !f.path.trim()) {
        return {
          ok: false,
          error: `layout[${si}].fields[${fi}].path must be a string.`,
        };
      }
      if (typeof f.label !== 'string' || !f.label.trim()) {
        return {
          ok: false,
          error: `layout[${si}].fields[${fi}].label must be a string.`,
        };
      }
    }
  }

  // Optional blocks: match, recordLabel. We only sanity check types.
  if (t.match != null) {
    if (typeof t.match !== 'object' || Array.isArray(t.match)) {
      return { ok: false, error: 'match must be an object if provided.' };
    }
    if (t.match.requiredKeys != null && !Array.isArray(t.match.requiredKeys)) {
      return {
        ok: false,
        error: 'match.requiredKeys must be an array if provided.',
      };
    }
  }

  if (t.recordLabel != null) {
    if (typeof t.recordLabel !== 'object' || Array.isArray(t.recordLabel)) {
      return { ok: false, error: 'recordLabel must be an object if provided.' };
    }
    if (t.recordLabel.fields != null && !Array.isArray(t.recordLabel.fields)) {
      return {
        ok: false,
        error: 'recordLabel.fields must be an array if provided.',
      };
    }
  }

  return { ok: true, error: null };
}

/**
 * Add template files to state.
 * Accepts .json and .jsonc. Invalid templates are ignored with console warnings.
 * @param {File[]} files
 */
async function addTemplateFiles(files) {
  const candidates = files.filter((f) => {
    const n = f.name.toLowerCase();
    return (
      n.endsWith('.json') ||
      n.endsWith('.jsonc') ||
      f.type === 'application/json'
    );
  });

  if (!candidates.length) return;

  for (const f of candidates) {
    try {
      const raw = await f.text();
      const parsed = parseJsonOrJsonc(raw);

      const v = validateTemplate(parsed);
      if (!v.ok) {
        console.warn(`JTF: Template rejected (${f.name}): ${v.error}`);
        continue;
      }

      const id = `tpl_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      state.templates.push({
        id,
        name: String(parsed.templateName),
        rawText: raw,
        template: parsed,
        sourceFileName: f.name,
      });

      // If nothing active yet, set the first valid one
      if (!state.activeTemplateId) {
        state.activeTemplateId = id;
      }
    } catch (err) {
      console.warn(`JTF: Template failed to load (${f.name}):`, err);
      continue;
    }
  }

  renderTemplateSelect();
}

/** Refresh the Template dropdown UI from state. */
function renderTemplateSelect() {
  if (!els.templateSelect) return;

  const hasAny = state.templates.length > 0;
  els.templateSelect.disabled = !hasAny;

  const options = [
    `<option value="">None</option>`,

    // Only show Auto if there is at least one uploaded template
    ...(hasAny
      ? [
          `<option value="${TEMPLATE_AUTO_ID}">Auto (best match per record)</option>`,
        ]
      : []),

    ...state.templates.map((t) => {
      const label = `${t.name} (${t.sourceFileName})`;
      return `<option value="${escapeHtml(t.id)}">${escapeHtml(
        label
      )}</option>`;
    }),
  ].join('');

  els.templateSelect.innerHTML = options;
  els.templateSelect.value = state.activeTemplateId || '';
}

/* ------------------------------------------------------------
    Template system (parse, validate, match, apply)
------------------------------------------------------------ */

/**
 * Return the explicitly selected template registry entry (not “Auto”).
 * @returns {{ id: string, name: string, rawText: string, template: any, sourceFileName: string } | null}
 */
function getExplicitActiveTemplate() {
  const id = state.activeTemplateId;
  if (!id) return null;
  if (id === TEMPLATE_AUTO_ID) return null;
  return state.templates.find((t) => t.id === id) || null;
}

/**
 * Compute a “best match” template for a specific record.
 *
 * Strategy (simple + predictable):
 * 1) Only consider templates that pass templateMatchesRecord().
 * 2) Prefer templates that actually “hit” more fields (countTemplateFieldHits).
 * 3) Break ties by “specificity” (more requiredKeys, then typeField present).
 *
 * Guardrail:
 * - If a template matches but hits 0 fields, we do NOT auto-apply it.
 *
 * @param {any} record
 * @returns {{ entry: any, templateObj: any } | null}
 */
function getBestTemplateForRecord(record) {
  if (!record || typeof record !== 'object') return null;
  if (!state.templates.length) return null;

  let best = null;
  let bestScore = -1;

  for (const entry of state.templates) {
    const tpl = entry.template;

    // Must pass match rules first
    if (!templateMatchesRecord(tpl, record)) continue;

    // Must actually have useful fields on this record
    const hits = countTemplateFieldHits(tpl, record);
    if (hits <= 0) continue;

    const m = tpl && typeof tpl === 'object' ? tpl.match : null;
    const requiredKeysCount =
      m && Array.isArray(m.requiredKeys)
        ? m.requiredKeys.filter(Boolean).length
        : 0;
    const hasTypeField = Boolean(
      m && typeof m.typeField === 'string' && m.typeField.trim()
    );

    // Score: hits dominate, then specificity
    const score =
      hits * 1000 + requiredKeysCount * 10 + (hasTypeField ? 100 : 0);

    if (score > bestScore) {
      bestScore = score;
      best = { entry, templateObj: tpl };
    }
  }

  return best;
}

/**
 * Resolve the template to use for a given record, based on the template dropdown.
 * - None: null
 * - Explicit template: only if it matches the record
 * - Auto: best match for this record
 *
 * @param {any} record
 * @returns {{ entry: any, templateObj: any } | null}
 */
function getTemplateForRecord(record) {
  const sel = state.activeTemplateId;

  // None selected
  if (!sel) return null;

  // Auto
  if (sel === TEMPLATE_AUTO_ID) {
    return getBestTemplateForRecord(record);
  }

  // Explicit
  const explicit = getExplicitActiveTemplate();
  if (!explicit) return null;

  const tplObj = explicit.template;
  if (!templateMatchesRecord(tplObj, record)) return null;

  // Even for explicit selection, we keep your existing behavior:
  // if it matches but has 0 hits, the renderer will show the friendly hint + fallback.
  return { entry: explicit, templateObj: tplObj };
}

/**
 * Returns true if a template "matches" a record.
 * v1 rules (simple + predictable):
 * - requiredKeys: every key must exist on the record (top-level keys)
 * - typeField/typeValue: if both are set, record[typeField] must equal typeValue
 *
 * @param {any} tpl
 * @param {any} record
 */
function templateMatchesRecord(tpl, record) {
  if (!tpl || typeof tpl !== 'object') return false;
  if (!record || typeof record !== 'object') return false;

  const m = tpl.match;
  if (!m || typeof m !== 'object') return true; // no match block means "apply broadly"

  // requiredKeys: top-level keys only (by design for v1)
  if (Array.isArray(m.requiredKeys) && m.requiredKeys.length) {
    for (const k of m.requiredKeys) {
      if (typeof k !== 'string' || !k.trim()) continue;
      if (!Object.prototype.hasOwnProperty.call(record, k)) return false;
    }
  }

  // typeField/typeValue: optional
  if (
    typeof m.typeField === 'string' &&
    m.typeField.trim() &&
    m.typeValue != null
  ) {
    const field = m.typeField.trim();
    const expected = String(m.typeValue).trim();
    const actual = record[field];

    if (actual == null) return false;
    if (String(actual).trim() !== expected) return false;
  }

  return true;
}

// ===============================
// Session 10 – Templates (Step 1)
// Default starter template download
// ===============================

/**
 * Default starter template.
 * Intent:
 * - Plain JSON
 * - Declarative layout only
 * - Safe if fields are missing (renderer will treat missing as empty later)
 *
 * Note: We are not applying templates yet in Step 1.
 * This is just the "download a starter file" capability.
 */
const DEFAULT_STARTER_TEMPLATE = {
  templateVersion: 1,
  templateName: 'Starter Template (Edit Me)',
  description:
    'Copy this file, edit paths/labels, then upload it back to JTF in a later step.',

  // Optional matching hints (for later). Leave broad by default.
  // Users can tighten this once they know their data shapes.
  match: {
    // Example: typeField/typeValue matching (leave null if you do not have a type field)
    typeField: null,
    typeValue: null,

    // Example: require these keys to exist in the record for a match
    requiredKeys: [],
  },

  // Optional record label override (for later).
  // When enabled, JTF can build the dropdown label from these fields in order.
  // JTF will fall back safely if a field is missing.
  recordLabel: {
    fields: [
      // Examples (edit/remove as needed):
      // { path: 'Number', prefix: '#', maxLen: 40 },
      // { path: 'Title', maxLen: 80 },
      // { path: 'Status.Name', prefix: '(', suffix: ')', maxLen: 22 },
    ],
    fallback: 'Record {n}',
  },

  // Layout is a simple list of sections, each with ordered fields.
  // Each field uses a dot-path. No logic, no conditions.
  layout: [
    {
      section: 'Header',
      fields: [
        { path: 'Title', label: 'Title', format: 'text' },
        { path: 'Status.Name', label: 'Status', format: 'badge' },
        { path: 'Number', label: 'Number', format: 'text' },
      ],
    },
    {
      section: 'Details',
      fields: [
        { path: 'Description', label: 'Description', format: 'multiline' },
        { path: 'Priority.Name', label: 'Priority', format: 'badge' },
        { path: 'DueDate', label: 'Due date', format: 'date' },
        { path: 'ViewerUrl', label: 'Viewer URL', format: 'link' },
      ],
    },
    {
      section: 'Everything else',
      fields: [
        // This is a safety net idea for later: users can point to a big subtree.
        // Example: { path: 'CustomAttributes', label: 'Custom attributes', format: 'json' }
      ],
    },
  ],
};

/**
 * Download a JSON file from an object.
 * Uses a Blob + temporary <a> click.
 * Safe, offline-friendly, GitHub Pages friendly.
 * @param {string} filename
 * @param {any} data
 */
function downloadJsonFile(filename, data) {
  const jsonText = JSON.stringify(data, null, 2) + '\n';
  const blob = new Blob([jsonText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;

  // Some browsers require the node to be in the DOM
  document.body.appendChild(a);
  a.click();
  a.remove();

  // Clean up
  URL.revokeObjectURL(url);
}

/** Trigger download of the default starter template. */
function downloadDefaultStarterTemplate() {
  const filename = 'jtf-template-starter.json';
  downloadJsonFile(filename, DEFAULT_STARTER_TEMPLATE);
}

init();
