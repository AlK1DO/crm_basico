/**
 * DataCleaning.tsx
 *
 * Módulo de limpieza de datos mejorado.
 * - Detecta todos los valores ausentes reales (null, "", "N/A", "-", etc.)
 * - No convierte vacíos a 0 automáticamente.
 * - Persiste los datos limpios de vuelta al contexto (no solo descarga).
 * - Muestra comparación ANTES vs DESPUÉS.
 * - Muestra calidad de datos antes y después.
 */

import { useState, useMemo } from 'react';
import { toast } from 'react-toastify';
import { useDatasetContext } from '../../context/DatasetContext';
import { cleanDataset, DEFAULT_CLEANING_OPTIONS } from '../../engine/dataCleaner';
import type { DataCleaningOptions } from '../../engine/index';
import type { CleaningReport } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { logAuditEvent } from '../../firebase/firestoreService';
import styles from './Dashboard.module.css';

// ─── Componentes auxiliares ───────────────────────────────────────────────────

function CheckOption({
  label, description, checked, onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 15, height: 15, accentColor: '#6366f1', cursor: 'pointer', marginTop: 2, flexShrink: 0 }}
      />
      <span>
        <span style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>{label}</span>
        {description && (
          <span style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

function QualityBadge({ value }: { value: number }) {
  const color = value >= 90 ? '#10b981' : value >= 70 ? '#f59e0b' : '#ef4444';
  const label = value >= 90 ? 'Buena' : value >= 70 ? 'Regular' : 'Baja';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      background: `${color}15`, color,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
      {value.toFixed(0)}% {label}
    </span>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function DataCleaning() {
  const { datasets, saveCleanedData } = useDatasetContext();
  const { user, profile } = useAuth();

  const [selectedId, setSelectedId] = useState('');
  const [options, setOptions] = useState<DataCleaningOptions>({
    ...DEFAULT_CLEANING_OPTIONS,
  });
  const [result, setResult] = useState<{
    cleanedRows: Record<string, string>[];
    report: CleaningReport;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<'options' | 'result' | 'preview'>('options');
  const [saved, setSaved] = useState(false);

  const selectedDataset = datasets.find((d) => d.id === selectedId);

  // Pre-seleccionar columnas clave disponibles
  const keyColumnOptions = useMemo(() => {
    if (!selectedDataset) return [];
    return selectedDataset.columnInfo
      .filter((c) => c.type === 'monetary' || c.type === 'temporal')
      .map((c) => c.name);
  }, [selectedDataset]);

  const handleClean = () => {
    if (!selectedDataset) { toast.warning('Selecciona un dataset primero.'); return; }

    try {
      const cleaningResult = cleanDataset(
        selectedDataset.rows,
        selectedDataset.columns,
        selectedDataset.columnInfo,
        options,
      );

      setResult(cleaningResult);
      setActiveTab('result');
      setSaved(false);
      toast.success('Limpieza completada.');
    } catch (err) {
      console.error(err);
      toast.error('Error al ejecutar la limpieza.');
    }
  };

  const handleSaveToContext = () => {
    if (!result || !selectedDataset) return;
    saveCleanedData(selectedDataset.id, result.cleanedRows, result.report);
    setSaved(true);
    toast.success('Datos limpios guardados. Ventas, Ofertas y Reportes los usarán automáticamente.');
    // Auditoría
    if (user && profile) {
      void logAuditEvent({
        action: 'cleaning_executed',
        actor: user.uid,
        actorRole: profile.role,
        details: {
          dataset: selectedDataset.name,
          originalRows: result.report.originalRows,
          cleanedRows: result.report.cleanedRows,
          qualityBefore: result.report.dataQualityBefore,
          qualityAfter: result.report.dataQualityAfter,
        },
      });
    }
  };

  const handleDownload = () => {
    if (!result || !selectedDataset) return;
    const headers = selectedDataset.columns.join(',');
    const body = result.cleanedRows.map((row) =>
      selectedDataset.columns.map((col) =>
        `"${(row[col] ?? '').replace(/"/g, '""')}"`
      ).join(',')
    );
    const blob = new Blob([[headers, ...body].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `${selectedDataset.name.replace('.csv', '')}_limpio.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDatasetChange = (id: string) => {
    setSelectedId(id);
    setResult(null);
    setSaved(false);
    setActiveTab('options');
    // Resetear columnas clave al cambiar dataset
    setOptions((o) => ({ ...o, keyColumns: [] }));
  };

  const toggleKeyColumn = (col: string) => {
    setOptions((o) => ({
      ...o,
      keyColumns: o.keyColumns.includes(col)
        ? o.keyColumns.filter((c) => c !== col)
        : [...o.keyColumns, col],
    }));
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Limpieza de datos</h1>
          <p className={styles.pageDesc}>
            Detecta y corrige valores faltantes, duplicados y formatos incorrectos.
            Los datos limpios se aplican automáticamente en Ventas, Ofertas y Reportes.
          </p>
        </div>
      </div>

      {/* Selector de dataset */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Seleccionar dataset</h2>
        {datasets.length === 0 ? (
          <div className={styles.empty}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" />
            </svg>
            <p className={styles.emptyText}>
              No hay datasets. Ve a <strong>Datasets</strong> para cargar uno.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <select
              className={styles.select}
              value={selectedId}
              onChange={(e) => handleDatasetChange(e.target.value)}
            >
              <option value="">— Selecciona un dataset —</option>
              {datasets.map((ds) => (
                <option key={ds.id} value={ds.id}>
                  {ds.name} ({ds.rowCount.toLocaleString()} filas){ds.isCleaned ? ' ✓ limpio' : ''}
                </option>
              ))}
            </select>

            {/* Info del dataset seleccionado */}
            {selectedDataset && (
              <div style={{
                display: 'flex', gap: 16, flexWrap: 'wrap', padding: '12px 16px',
                background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb',
                fontSize: 13, color: '#6b7280',
              }}>
                <span><strong style={{ color: '#111827' }}>{selectedDataset.rowCount.toLocaleString()}</strong> filas</span>
                <span><strong style={{ color: '#111827' }}>{selectedDataset.columns.length}</strong> columnas</span>
                <span>Calidad actual: <QualityBadge value={estimateQuality(selectedDataset.rows, selectedDataset.columnInfo)} /></span>
                {selectedDataset.isCleaned && (
                  <span style={{ color: '#10b981', fontWeight: 600 }}>✓ Ya tiene datos limpios guardados</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Columnas detectadas */}
      {selectedDataset && selectedDataset.columnInfo.length > 0 && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Columnas detectadas</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {selectedDataset.columnInfo.map((col) => (
              <span key={col.name} style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                background: typeColors[col.type]?.bg ?? '#f0f2f5',
                color: typeColors[col.type]?.text ?? '#374151',
                border: `1px solid ${typeColors[col.type]?.border ?? '#e5e7eb'}`,
              }}>
                {col.friendlyName}
                <span style={{ opacity: 0.6, fontSize: 11, marginLeft: 5 }}>({col.type})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Panel de opciones + resultado */}
      {selectedDataset && (
        <div className={styles.card}>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === 'options' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('options')}
            >
              Opciones de limpieza
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'result' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('result')}
              disabled={!result}
            >
              Resultado{result ? ` (${result.report.cleanedRows.toLocaleString()} filas)` : ''}
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'preview' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('preview')}
              disabled={!result}
            >
              Vista previa
            </button>
          </div>

          {/* ── Opciones ── */}
          {activeTab === 'options' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 20 }}>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>

                {/* Opciones básicas */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', margin: 0 }}>
                    Estructura
                  </p>
                  <CheckOption
                    label="Eliminar filas duplicadas"
                    description="Filas idénticas en todas sus columnas."
                    checked={options.removeDuplicates}
                    onChange={(v) => setOptions((o) => ({ ...o, removeDuplicates: v }))}
                  />
                  <CheckOption
                    label="Eliminar filas completamente vacías"
                    description="Filas donde todos los campos están vacíos."
                    checked={options.removeEmptyRows}
                    onChange={(v) => setOptions((o) => ({ ...o, removeEmptyRows: v }))}
                  />
                  <CheckOption
                    label="Eliminar filas incompletas en columnas clave"
                    description="Filas donde las columnas importantes están vacías."
                    checked={options.removeIncompleteRows}
                    onChange={(v) => setOptions((o) => ({ ...o, removeIncompleteRows: v }))}
                  />
                </div>

                {/* Opciones de texto */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', margin: 0 }}>
                    Texto y formato
                  </p>
                  <CheckOption
                    label="Normalizar espacios en blanco"
                    description="Elimina espacios al inicio/final y múltiples espacios intermedios."
                    checked={options.trimWhitespace}
                    onChange={(v) => setOptions((o) => ({ ...o, trimWhitespace: v }))}
                  />
                  <CheckOption
                    label="Normalizar fechas (DD/MM/YYYY → YYYY-MM-DD)"
                    description="Solo afecta columnas de tipo temporal detectadas."
                    checked={options.fixDates}
                    onChange={(v) => setOptions((o) => ({ ...o, fixDates: v }))}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>
                      Normalizar texto de categorías
                    </label>
                    <select
                      className={styles.select}
                      value={options.normalizeCase}
                      onChange={(e) =>
                        setOptions((o) => ({ ...o, normalizeCase: e.target.value as DataCleaningOptions['normalizeCase'] }))
                      }
                    >
                      <option value="none">Sin cambios</option>
                      <option value="lower">Convertir a minúsculas</option>
                      <option value="upper">Convertir a mayúsculas</option>
                    </select>
                  </div>
                </div>

                {/* Imputación */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', margin: 0 }}>
                    Valores faltantes numéricos
                  </p>
                  <div style={{
                    padding: '10px 14px', background: '#fef9c3', borderRadius: 8,
                    border: '1px solid #fde68a', fontSize: 12, color: '#92400e',
                  }}>
                    ⚠️ <strong>Importante:</strong> Un valor vacío no es igual a cero.
                    La imputación solo debe usarse si el contexto lo justifica.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>
                      Estrategia de imputación
                    </label>
                    <select
                      className={styles.select}
                      value={options.imputeNumericStrategy}
                      onChange={(e) =>
                        setOptions((o) => ({ ...o, imputeNumericStrategy: e.target.value as DataCleaningOptions['imputeNumericStrategy'] }))
                      }
                    >
                      <option value="none">Sin imputación (recomendado)</option>
                      <option value="mean">Reemplazar con promedio</option>
                      <option value="median">Reemplazar con mediana</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Columnas clave */}
              {options.removeIncompleteRows && keyColumnOptions.length > 0 && (
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', margin: '0 0 8px' }}>
                    Columnas clave para verificar incompletos:
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {keyColumnOptions.map((col) => (
                      <label key={col} style={{
                        display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                        padding: '4px 10px', borderRadius: 6, fontSize: 13,
                        border: options.keyColumns.includes(col) ? '1px solid #6366f1' : '1px solid #e5e7eb',
                        background: options.keyColumns.includes(col) ? '#eef2ff' : '#fff',
                        color: options.keyColumns.includes(col) ? '#6366f1' : '#374151',
                      }}>
                        <input
                          type="checkbox"
                          checked={options.keyColumns.includes(col)}
                          onChange={() => toggleKeyColumn(col)}
                          style={{ accentColor: '#6366f1' }}
                        />
                        {col}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Detectar valores ausentes — informativo */}
              <div style={{
                padding: '12px 16px', background: '#f9fafb', borderRadius: 8,
                border: '1px solid #e5e7eb', fontSize: 12, color: '#6b7280',
              }}>
                <strong style={{ color: '#374151' }}>Valores detectados como ausentes:</strong>{' '}
                <code>""</code>, <code>" "</code>, <code>N/A</code>, <code>NA</code>,{' '}
                <code>null</code>, <code>NULL</code>, <code>undefined</code>, <code>-</code>,{' '}
                <code>none</code>, <code>nan</code>
              </div>

              <div className={styles.toolbar} style={{ paddingTop: 4 }}>
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

          {/* ── Resultado ── */}
          {activeTab === 'result' && result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 20 }}>

              {/* ANTES vs DESPUÉS */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center',
              }}>
                <div style={{
                  padding: '16px 20px', background: '#fff7ed', borderRadius: 10,
                  border: '1px solid #fed7aa',
                }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#c2410c', textTransform: 'uppercase', margin: '0 0 8px' }}>
                    Antes
                  </p>
                  <p style={{ fontSize: 28, fontWeight: 700, color: '#111827', margin: 0 }}>
                    {result.report.originalRows.toLocaleString()}
                  </p>
                  <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 8px' }}>filas originales</p>
                  <QualityBadge value={result.report.dataQualityBefore} />
                </div>

                <div style={{ textAlign: 'center', color: '#6b7280', fontSize: 20 }}>→</div>

                <div style={{
                  padding: '16px 20px', background: '#f0fdf4', borderRadius: 10,
                  border: '1px solid #bbf7d0',
                }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', margin: '0 0 8px' }}>
                    Después
                  </p>
                  <p style={{ fontSize: 28, fontWeight: 700, color: '#111827', margin: 0 }}>
                    {result.report.cleanedRows.toLocaleString()}
                  </p>
                  <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 8px' }}>filas limpias</p>
                  <QualityBadge value={result.report.dataQualityAfter} />
                </div>
              </div>

              {/* Métricas de limpieza */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                {[
                  {
                    label: 'Duplicados eliminados',
                    value: result.report.duplicatesRemoved,
                    color: '#ef4444',
                  },
                  {
                    label: 'Filas vacías eliminadas',
                    value: result.report.emptyRowsRemoved,
                    color: '#f59e0b',
                  },
                  {
                    label: 'Valores imputados',
                    value: result.report.invalidValuesFixed,
                    color: '#6366f1',
                  },
                  {
                    label: 'Celdas normalizadas',
                    value: result.report.trimmedCells,
                    color: '#3b82f6',
                  },
                ].map((m) => (
                  <div key={m.label} className={styles.statCard}>
                    <div className={styles.statBody}>
                      <p className={styles.statLabel}>{m.label}</p>
                      <p className={styles.statValue} style={{ fontSize: 22, color: m.value > 0 ? m.color : '#9ca3af' }}>
                        {m.value.toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Reporte por campo */}
              {result.report.fieldReports.some((f) => f.missingCount > 0 || f.invalidCount > 0) && (
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', margin: '0 0 10px' }}>
                    Detalle por columna con problemas:
                  </p>
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Columna</th>
                          <th>Tipo</th>
                          <th>Vacíos</th>
                          <th>Inválidos</th>
                          <th>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.report.fieldReports
                          .filter((f) => f.missingCount > 0 || f.invalidCount > 0)
                          .map((f) => (
                            <tr key={f.column}>
                              <td><strong>{f.column}</strong></td>
                              <td>
                                <span style={{
                                  padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                                  background: typeColors[f.type]?.bg ?? '#f0f2f5',
                                  color: typeColors[f.type]?.text ?? '#374151',
                                }}>
                                  {f.type}
                                </span>
                              </td>
                              <td style={{ color: f.missingCount > 0 ? '#ef4444' : '#6b7280' }}>
                                {f.missingCount}
                              </td>
                              <td style={{ color: f.invalidCount > 0 ? '#f59e0b' : '#6b7280' }}>
                                {f.invalidCount}
                              </td>
                              <td style={{ color: '#6b7280', fontSize: 12 }}>{f.action}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Acciones */}
              <div className={styles.toolbar}>
                <button
                  className={styles.btnPrimary}
                  onClick={handleSaveToContext}
                  disabled={saved}
                  style={saved ? { background: '#10b981' } : {}}
                >
                  {saved ? (
                    <>✓ Datos limpios guardados</>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                      Guardar datos limpios (usar en Ventas/Ofertas)
                    </>
                  )}
                </button>
                <button className={styles.btnOutline} onClick={handleDownload}>
                  Descargar CSV limpio
                </button>
              </div>

              {saved && (
                <div style={{
                  padding: '12px 16px', background: '#f0fdf4', borderRadius: 8,
                  border: '1px solid #bbf7d0', fontSize: 13, color: '#15803d',
                }}>
                  ✓ Los módulos de <strong>Ventas</strong>, <strong>Ofertas</strong> y{' '}
                  <strong>Reportes</strong> ahora usarán los datos limpios de{' '}
                  <strong>{selectedDataset?.name}</strong>.
                </div>
              )}
            </div>
          )}

          {/* ── Vista previa ── */}
          {activeTab === 'preview' && result && selectedDataset && (
            <div style={{ paddingTop: 20 }}>
              <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                Primeras 10 filas del resultado limpio:
              </p>
              <div className={styles.tableWrapper} style={{ maxHeight: 320, overflow: 'auto' }}>
                <table className={styles.table}>
                  <thead>
                    <tr>{selectedDataset.columns.map((col) => <th key={col}>{col}</th>)}</tr>
                  </thead>
                  <tbody>
                    {result.cleanedRows.slice(0, 10).map((row, i) => (
                      <tr key={i}>
                        {selectedDataset.columns.map((col) => (
                          <td key={col} style={{ color: !row[col] || row[col].trim() === '' ? '#d1d5db' : undefined }}>
                            {row[col] || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const typeColors: Record<string, { bg: string; text: string; border: string }> = {
  monetary:    { bg: '#dcfce7', text: '#15803d', border: '#bbf7d0' },
  quantity:    { bg: '#dbeafe', text: '#1d4ed8', border: '#bfdbfe' },
  temporal:    { bg: '#fef3c7', text: '#d97706', border: '#fde68a' },
  categorical: { bg: '#f3e8ff', text: '#7c3aed', border: '#e9d5ff' },
  identifier:  { bg: '#f0f2f5', text: '#374151', border: '#e5e7eb' },
  unknown:     { bg: '#f0f2f5', text: '#9ca3af', border: '#e5e7eb' },
};

import { isMissing } from '../../engine/metricsCalculator';
import type { ColumnInfo } from '../../types';

function estimateQuality(
  rows: Record<string, string>[],
  columnInfo: ColumnInfo[],
): number {
  if (rows.length === 0) return 100;
  const importantCols = columnInfo.filter(
    (c) => c.type === 'monetary' || c.type === 'quantity' || c.type === 'temporal'
  );
  if (importantCols.length === 0) return 90;

  let missingCells = 0;
  const totalCells = rows.length * importantCols.length;

  for (const row of rows) {
    for (const col of importantCols) {
      if (isMissing(row[col.name])) missingCells++;
    }
  }

  return Math.max(0, 100 - (missingCells / totalCells) * 100);
}
