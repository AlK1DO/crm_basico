import { useRef, useState, type DragEvent } from 'react';
import { toast } from 'react-toastify';
import { useDatasetContext } from '../../context/DatasetContext';
import styles from './Dashboard.module.css';

const PREVIEW_ROWS = 10;

export default function Datasets() {
  const { datasets, loading, addDatasets, removeDataset } = useDatasetContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFiles = async (files: FileList | File[]) => {
    const csvFiles = Array.from(files).filter((f) => f.name.endsWith('.csv') || f.type === 'text/csv');
    if (!csvFiles.length) { toast.warning('Solo se aceptan archivos .csv'); return; }
    await addDatasets(csvFiles);
    toast.success(`${csvFiles.length} dataset(s) cargado(s) correctamente.`);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) await handleFiles(e.dataTransfer.files);
  };

  const togglePreview = (id: string) => setPreview((prev) => (prev === id ? null : id));

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Datasets</h1>
          <p className={styles.pageDesc}>Carga uno o varios archivos CSV. Los datasets se acumulan sin borrarse.</p>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Cargar archivos</h2>
        <div
          className={`${styles.dropzone} ${dragging ? styles.dropzoneActive : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          role="button" tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          aria-label="Zona de carga de archivos CSV"
        >
          <svg className={styles.dropzoneIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          {loading ? (
            <p className={styles.dropzoneText}>Procesando archivos...</p>
          ) : (
            <>
              <p className={styles.dropzoneText}><strong>Arrastra tus archivos aquí</strong> o haz clic para seleccionar</p>
              <p className={styles.dropzoneHint}>Solo archivos .csv — puedes subir varios a la vez</p>
            </>
          )}
        </div>
        <input ref={inputRef} type="file" accept=".csv,text/csv" multiple style={{ display: 'none' }}
          onChange={(e) => e.target.files && handleFiles(e.target.files)} />
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Datasets cargados ({datasets.length})</h2>
        {datasets.length === 0 ? (
          <div className={styles.empty}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" />
            </svg>
            <p className={styles.emptyText}>Aún no has cargado ningún dataset</p>
          </div>
        ) : (
          <div className={styles.datasetList}>
            {datasets.map((ds) => (
              <div key={ds.id}>
                <div className={styles.datasetItem}>
                  <div className={styles.datasetInfo}>
                    <div className={styles.datasetIcon}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>
                    <div className={styles.datasetMeta}>
                      <span className={styles.datasetName}>{ds.name}</span>
                      <span className={styles.datasetDetails}>
                        {ds.rows.length.toLocaleString()} filas · {ds.columns.length} columnas · {ds.size} · {ds.uploadedAt.toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                  <div className={styles.datasetActions}>
                    <span className={styles.badge}>CSV</span>
                    <button className={styles.btnIcon} onClick={() => togglePreview(ds.id)}
                      title={preview === ds.id ? 'Cerrar vista previa' : 'Ver vista previa'}
                      style={preview === ds.id ? { background: '#eef2ff', borderColor: '#a5b4fc', color: '#6366f1' } : {}}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                    <button className={styles.btnIcon}
                      onClick={() => { removeDataset(ds.id); if (preview === ds.id) setPreview(null); toast.info(`Dataset "${ds.name}" eliminado.`); }}
                      title="Eliminar dataset">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>

                {preview === ds.id && (
                  <div style={{ margin: '0 0 4px', background: '#f9fafb', borderRadius: '0 0 10px 10px', border: '1px solid #e5e7eb', borderTop: 'none' }}>
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>
                        Mostrando {Math.min(PREVIEW_ROWS, ds.rows.length)} de {ds.rows.length} filas
                      </span>
                    </div>
                    <div className={styles.tableWrapper} style={{ maxHeight: 260, overflow: 'auto' }}>
                      <table className={styles.table}>
                        <thead><tr>{ds.columns.map((col) => <th key={col}>{col}</th>)}</tr></thead>
                        <tbody>
                          {ds.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                            <tr key={i}>{ds.columns.map((col) => <td key={col}>{row[col] ?? ''}</td>)}</tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
