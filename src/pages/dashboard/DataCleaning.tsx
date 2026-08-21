import { useState } from 'react';
import { toast } from 'react-toastify';
import { useDatasetContext } from '../../context/DatasetContext';
import type { Dataset } from '../../hooks/useDatasets';
import styles from './Dashboard.module.css';

interface CleaningOptions {
  removeDuplicates: boolean;
  removeEmptyRows: boolean;
  trimWhitespace: boolean;
  normalizeCase: 'none' | 'lower' | 'upper';
}

interface CleaningResult {
  originalRows: number;
  cleanedRows: number;
  duplicatesRemoved: number;
  emptyRemoved: number;
  data: Record<string, string>[];
}

const DEFAULT_OPTIONS: CleaningOptions = {
  removeDuplicates: true,
  removeEmptyRows: true,
  trimWhitespace: true,
  normalizeCase: 'none',
};

export default function DataCleaning() {
  const { datasets } = useDatasetContext();

  const [selectedId, setSelectedId] = useState('');
  const [options, setOptions] = useState<CleaningOptions>(DEFAULT_OPTIONS);
  const [result, setResult] = useState<CleaningResult | null>(null);
  const [activeTab, setActiveTab] = useState<'options' | 'result'>('options');

  const selectedDataset: Dataset | undefined = datasets.find((d) => d.id === selectedId);

  const handleClean = () => {
    if (!selectedDataset) { toast.warning('Selecciona un dataset primero.'); return; }

    let rows = selectedDataset.rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => {
          const trimmedKey = options.trimWhitespace ? k.trim() : k;
          let val = typeof v === 'string' && options.trimWhitespace ? v.trim() : v;
          if (typeof val === 'string' && options.normalizeCase !== 'none') {
            val = options.normalizeCase === 'lower' ? val.toLowerCase() : val.toUpperCase();
          }
          return [trimmedKey, val];
        })
      )
    );

    const original = selectedDataset.rows.length;
    let emptyRemoved = 0;
    let duplicatesRemoved = 0;

    if (options.removeEmptyRows) {
      const before = rows.length;
      rows = rows.filter((row) => Object.values(row).some((v) => v !== '' && v != null));
      emptyRemoved = before - rows.length;
    }

    if (options.removeDuplicates) {
      const seen = new Set<string>();
      const before = rows.length;
      rows = rows.filter((row) => { const key = JSON.stringify(row); return seen.has(key) ? false : (seen.add(key), true); });
      duplicatesRemoved = before - rows.length;
    }

    setResult({ originalRows: original, cleanedRows: rows.length, duplicatesRemoved, emptyRemoved, data: rows });
    setActiveTab('result');
    toast.success('Limpieza completada.');
  };

  const handleDownload = () => {
    if (!result || !selectedDataset) return;
    const headers = selectedDataset.columns.join(',');
    const body = result.data.map((row) =>
      selectedDataset.columns.map((col) => `"${(row[col] ?? '').replace(/"/g, '""')}"`).join(',')
    );
    const blob = new Blob([[headers, ...body].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `${selectedDataset.name.replace('.csv', '')}_clean.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Limpieza de datos</h1>
          <p className={styles.pageDesc}>Selecciona un dataset, configura las opciones y aplica la limpieza.</p>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Seleccionar dataset</h2>
        {datasets.length === 0 ? (
          <div className={styles.empty}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" />
            </svg>
            <p className={styles.emptyText}>No hay datasets. Ve a <strong>Datasets</strong> para cargar uno.</p>
          </div>
        ) : (
          <select className={styles.select} value={selectedId}
            onChange={(e) => { setSelectedId(e.target.value); setResult(null); setActiveTab('options'); }}>
            <option value="">— Selecciona un dataset —</option>
            {datasets.map((ds) => (
              <option key={ds.id} value={ds.id}>{ds.name} ({ds.rows.length.toLocaleString()} filas)</option>
            ))}
          </select>
        )}
      </div>

      {selectedDataset && (
        <div className={styles.card}>
          <div className={styles.tabs}>
            <button className={`${styles.tab} ${activeTab === 'options' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('options')}>Opciones de limpieza</button>
            <button className={`${styles.tab} ${activeTab === 'result' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('result')} disabled={!result}>Resultado</button>
          </div>

          {activeTab === 'options' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16 }}>
              <CheckOption label="Eliminar filas duplicadas" checked={options.removeDuplicates}
                onChange={(v) => setOptions((o) => ({ ...o, removeDuplicates: v }))} />
              <CheckOption label="Eliminar filas vacías" checked={options.removeEmptyRows}
                onChange={(v) => setOptions((o) => ({ ...o, removeEmptyRows: v }))} />
              <CheckOption label="Eliminar espacios en blanco extra" checked={options.trimWhitespace}
                onChange={(v) => setOptions((o) => ({ ...o, trimWhitespace: v }))} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Normalizar texto</label>
                <select className={styles.select} value={options.normalizeCase}
                  onChange={(e) => setOptions((o) => ({ ...o, normalizeCase: e.target.value as CleaningOptions['normalizeCase'] }))}>
                  <option value="none">Sin cambios</option>
                  <option value="lower">Convertir a minúsculas</option>
                  <option value="upper">Convertir a mayúsculas</option>
                </select>
              </div>
              <div className={styles.toolbar} style={{ paddingTop: 8 }}>
                <button className={styles.btnPrimary} onClick={handleClean}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
                  </svg>
                  Aplicar limpieza
                </button>
              </div>
            </div>
          )}

          {activeTab === 'result' && result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16 }}>
              <div className={styles.resultBox}>
                <p className={styles.resultTitle}>Resumen de limpieza</p>
                <ul className={styles.resultList}>
                  <li>Filas originales: <strong>{result.originalRows.toLocaleString()}</strong></li>
                  <li>Filas limpias: <strong>{result.cleanedRows.toLocaleString()}</strong></li>
                  <li>Duplicados eliminados: <strong>{result.duplicatesRemoved}</strong></li>
                  <li>Filas vacías eliminadas: <strong>{result.emptyRemoved}</strong></li>
                  <li>Reducción: <strong>{(((result.originalRows - result.cleanedRows) / result.originalRows) * 100).toFixed(1)}%</strong></li>
                </ul>
              </div>
              <div className={styles.toolbar}>
                <button className={styles.btnPrimary} onClick={handleDownload}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Descargar CSV limpio
                </button>
              </div>
              <div>
                <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Primeras 10 filas del resultado:</p>
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead><tr>{selectedDataset.columns.map((col) => <th key={col}>{col}</th>)}</tr></thead>
                    <tbody>
                      {result.data.slice(0, 10).map((row, i) => (
                        <tr key={i}>{selectedDataset.columns.map((col) => <td key={col}>{row[col] ?? ''}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CheckOption({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, color: '#374151' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        style={{ width: 15, height: 15, accentColor: '#6366f1', cursor: 'pointer' }} />
      {label}
    </label>
  );
}
