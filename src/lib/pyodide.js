// In-browser Python (Pyodide). Loads CPython + pandas/matplotlib/openpyxl in WASM.
// Runs entirely on-device — the DataFrame is built locally; nothing is uploaded.
const PYODIDE_VERSION = 'v0.26.4'
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`

let _pyodide = null
let _loading = null
const _loadedPkgs = new Set()

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve()
    const s = document.createElement('script')
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Failed to load Pyodide script'))
    document.head.appendChild(s)
  })
}

export async function ensurePyodide(onStatus) {
  if (_pyodide) return _pyodide
  if (_loading) return _loading
  _loading = (async () => {
    onStatus?.('Loading Python runtime…')
    await loadScript(`${INDEX_URL}pyodide.js`)
    _pyodide = await globalThis.loadPyodide({ indexURL: INDEX_URL })
    onStatus?.('Loading pandas…')
    await _pyodide.loadPackage(['pandas', 'numpy'])
    ;['pandas', 'numpy'].forEach((p) => _loadedPkgs.add(p))
    return _pyodide
  })()
  return _loading
}

// compiled packages (numpy/pandas/matplotlib/Pillow) come via loadPackage
async function ensureLoad(pkgs, onStatus) {
  const need = pkgs.filter((p) => !_loadedPkgs.has(p))
  if (!need.length) return
  onStatus?.(`Loading ${need.join(', ')}…`)
  await _pyodide.loadPackage(need)
  need.forEach((p) => _loadedPkgs.add(p))
}
// pure-python packages (openpyxl/python-docx) come via micropip
let _micropip = null
async function ensurePip(pkgs, onStatus) {
  const need = pkgs.filter((p) => !_loadedPkgs.has(p))
  if (!need.length) return
  if (!_micropip) { await ensureLoad(['micropip'], onStatus); _micropip = await _pyodide.pyimport('micropip') }
  onStatus?.(`Installing ${need.join(', ')}…`)
  for (const p of need) { await _micropip.install(p); _loadedPkgs.add(p) }
}

const EXT = { excel: 'xlsx', word: 'docx', chart_png: 'png', chart_jpeg: 'jpg', csv: 'csv' }
const MIME = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png', jpg: 'image/jpeg', csv: 'text/csv',
}

// Run model code with df / df_ledgers preloaded; return the produced file bytes.
export async function runPython({ code, records, ledgers, groupsMap, format }, onStatus) {
  const py = await ensurePyodide(onStatus)

  const load = [], pip = []
  if (format === 'excel') pip.push('openpyxl')
  if (format === 'chart_png' || format === 'chart_jpeg') load.push('matplotlib')
  if (format === 'chart_jpeg') load.push('Pillow')
  if (format === 'word') pip.push('python-docx')
  await ensureLoad(load, onStatus)
  await ensurePip(pip, onStatus)

  const ext = EXT[format] || 'xlsx'
  const outPath = `/out.${ext}`
  py.globals.set('records_json', JSON.stringify(records))
  py.globals.set('ledgers_json', JSON.stringify(ledgers || []))
  py.globals.set('groups_json', JSON.stringify(groupsMap || {}))

  const preamble = `
import json, pandas as pd, numpy as np
df = pd.DataFrame(json.loads(records_json))
df_ledgers = pd.DataFrame(json.loads(ledgers_json))
GROUPS = json.loads(groups_json)  # {name: [ledger_name, ...]} — defined locally, never sent
if 'amount' in df.columns:
    df['amount'] = pd.to_numeric(df['amount'], errors='coerce').fillna(0.0)
for _c in ['opening','closing']:
    if _c in df_ledgers.columns:
        df_ledgers[_c] = pd.to_numeric(df_ledgers[_c].astype(str).str.replace(',',''), errors='coerce').fillna(0.0)
OUTPUT_PATH = ${JSON.stringify(outPath)}
${load.includes('matplotlib') ? "import matplotlib\nmatplotlib.use('Agg')\nimport matplotlib.pyplot as plt" : ''}
`
  onStatus?.('Running Python…')
  let stdout = ''
  py.setStdout({ batched: (s) => { stdout += s + '\n' } })
  try {
    // clear any prior output file
    try { py.FS.unlink(outPath) } catch { /* none */ }
    await py.runPythonAsync(preamble + '\n' + code)
  } catch (e) {
    return { error: String(e.message || e).split('\n').slice(-6).join('\n'), stdout }
  }
  let bytes
  try { bytes = py.FS.readFile(outPath) } catch {
    return { error: `Code ran but did not write to OUTPUT_PATH (${outPath}). Make sure it saves the file there.`, stdout }
  }
  return { bytes, mime: MIME[ext], filename: `ledgerlens.${ext}`, ext, stdout }
}

export const FORMATS = [
  { key: 'excel', label: 'Excel (.xlsx)' },
  { key: 'chart_png', label: 'Chart (PNG)' },
  { key: 'word', label: 'Word (.docx)' },
  { key: 'csv', label: 'CSV' },
  { key: 'chart_jpeg', label: 'Chart (JPEG)' },
]
