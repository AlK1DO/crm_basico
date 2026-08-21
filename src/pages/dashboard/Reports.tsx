import { useState, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useDatasetContext } from '../../context/DatasetContext';
import type { Dataset } from '../../hooks/useDatasets';
import styles from './Dashboard.module.css';

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];
const CHART_LABELS: Record<string, string> = { bar: 'Gráfica de barras', line: 'Gráfica de líneas', pie: 'Gráfica de pastel' };

type ChartType = 'bar' | 'line' | 'pie';

function SelectField({ label, value, onChange, children }: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{label}</label>
      <select className={styles.select} value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>
    </div>
  );
}

export default function Reports() {
  const { datasets } = useDatasetContext();

  const [selectedId, setSelectedId] = useState('');
  const [labelCol, setLabelCol] = useState('');
  const [valueCol, setValueCol] = useState('');
  const [chartType, setChartType] = useState<ChartType>('bar');

  const selectedDataset: Dataset | undefined = datasets.find((d) => d.id === selectedId);

  const handleDatasetChange = (id: string) => { setSelectedId(id); setLabelCol(''); setValueCol(''); };

  const numericColumns = useMemo(() => {
    if (!selectedDataset) return [];
    return selectedDataset.columns.filter((col) =>
      selectedDataset.rows.slice(0, 20).some((r) => r[col] !== '' && !isNaN(Number(r[col])))
    );
  }, [selectedDataset]);

  const chartData = useMemo(() => {
    if (!selectedDataset || !labelCol || !valueCol) return [];
    return selectedDataset.rows.slice(0, 30).map((row) => ({ name: row[labelCol] ?? '', value: parseFloat(row[valueCol]) || 0 }));
  }, [selectedDataset, labelCol, valueCol]);

  const stats = useMemo(() => {
    if (!selectedDataset || !valueCol) return null;
    const values = selectedDataset.rows.map((r) => parseFloat(r[valueCol])).filter((v) => !isNaN(v));
    if (!values.length) return null;
    const sum = values.reduce((a, b) => a + b, 0);
    const sorted = [...values].sort((a, b) => a - b);
    return {
      count: values.length,
      sum: sum.toFixed(2),
      avg: (sum / values.length).toFixed(2),
      min: sorted[0].toFixed(2),
      max: sorted[sorted.length - 1].toFixed(2),
      median: sorted[Math.floor(sorted.length / 2)].toFixed(2),
    };
  }, [selectedDataset, valueCol]);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Reportes</h1>
          <p className={styles.pageDesc}>Visualiza tus datasets con gráficas interactivas y estadísticas.</p>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Configurar reporte</h2>
        {datasets.length === 0 ? (
          <div className={styles.empty}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
            <p className={styles.emptyText}>No hay datasets. Ve a <strong>Datasets</strong> para cargar uno.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <SelectField label="DATASET" value={selectedId} onChange={handleDatasetChange}>
              <option value="">— Selecciona —</option>
              {datasets.map((ds) => <option key={ds.id} value={ds.id}>{ds.name}</option>)}
            </SelectField>
            {selectedDataset && (
              <>
                <SelectField label="EJE ETIQUETAS" value={labelCol} onChange={setLabelCol}>
                  <option value="">— Columna —</option>
                  {selectedDataset.columns.map((col) => <option key={col} value={col}>{col}</option>)}
                </SelectField>
                <SelectField label="EJE VALORES" value={valueCol} onChange={setValueCol}>
                  <option value="">— Columna numérica —</option>
                  {numericColumns.map((col) => <option key={col} value={col}>{col}</option>)}
                </SelectField>
                <SelectField label="TIPO DE GRÁFICA" value={chartType} onChange={(v) => setChartType(v as ChartType)}>
                  <option value="bar">Barras</option>
                  <option value="line">Líneas</option>
                  <option value="pie">Pastel</option>
                </SelectField>
              </>
            )}
          </div>
        )}
      </div>

      {stats && (
        <div className={styles.statsGrid}>
          {[
            { label: 'Registros', value: stats.count.toLocaleString() },
            { label: 'Suma', value: stats.sum },
            { label: 'Promedio', value: stats.avg },
            { label: 'Mínimo', value: stats.min },
            { label: 'Máximo', value: stats.max },
            { label: 'Mediana', value: stats.median },
          ].map((s) => (
            <div key={s.label} className={styles.statCard}>
              <div className={styles.statBody}>
                <p className={styles.statLabel}>{s.label}</p>
                <p className={styles.statValue} style={{ fontSize: 18 }}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {chartData.length > 0 && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{CHART_LABELS[chartType]} — {valueCol} por {labelCol}</h2>
          <div className={styles.chartBox}>
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar' ? (
                <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 40, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip /><Legend />
                  <Bar dataKey="value" name={valueCol} fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              ) : chartType === 'line' ? (
                <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 40, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip /><Legend />
                  <Line type="monotone" dataKey="value" name={valueCol} stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              ) : (
                <PieChart>
                  <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                    {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip /><Legend />
                </PieChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {selectedDataset && (!labelCol || !valueCol) && (
        <div className={styles.card}>
          <div className={styles.empty}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
            <p className={styles.emptyText}>Selecciona la columna de etiquetas y la columna de valores para ver la gráfica</p>
          </div>
        </div>
      )}
    </div>
  );
}
