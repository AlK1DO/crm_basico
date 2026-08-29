import { useState, useMemo } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useDatasetContext } from '../../context/DatasetContext';
import styles from './Dashboard.module.css';

const OFFER_COLORS = ['#fca5a5', '#fdba74', '#fde68a', '#a7f3d0', '#c4b5fd', '#fbcfe8', '#d1d5db'];

function SelectField({ label, value, onChange, children }: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{label}</label>
      <select className={styles.select} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  );
}

// Agrupa datos en top N + "Otros" para no saturar el pie
function groupTopN(data: { name: string; value: number }[], n: number) {
  if (data.length <= n) return data;
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const top    = sorted.slice(0, n);
  const rest   = sorted.slice(n).reduce((s, d) => s + d.value, 0);
  return [...top, { name: 'Otros', value: parseFloat(rest.toFixed(2)) }];
}

export default function Offers() {
  const { datasets } = useDatasetContext();

  const [selectedId, setSelectedId] = useState('');
  const [labelCol, setLabelCol]     = useState('');
  const [valueCol, setValueCol]     = useState('');

  const dataset = datasets.find((d) => d.id === selectedId);
  const handleDataset = (id: string) => { setSelectedId(id); setLabelCol(''); setValueCol(''); };

  const numericCols = useMemo(() => {
    if (!dataset) return [];
    return dataset.columns.filter((col) => {
      const sample = dataset.rows.slice(0, 20).map((r) => r[col]).filter(Boolean);
      if (!sample.length) return false;
      const numRatio = sample.filter((v) => !isNaN(Number(v))).length / sample.length;
      const avgLen   = sample.reduce((a, v) => a + String(v).replace(/\D/g, '').length, 0) / sample.length;
      return numRatio >= 0.8 && avgLen <= 7;
    });
  }, [dataset]);

  // Para el pie: agrupa por etiqueta sumando valores, top 6 + Otros
  const pieData = useMemo(() => {
    if (!dataset || !labelCol || !valueCol) return [];
    const map = new Map<string, number>();
    dataset.rows.forEach((r) => {
      const key = String(r[labelCol] ?? '—').trim();
      const val = parseFloat(r[valueCol]) || 0;
      map.set(key, (map.get(key) ?? 0) + val);
    });
    const flat = Array.from(map.entries()).map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }));
    return groupTopN(flat, 6);
  }, [dataset, labelCol, valueCol]);

  // Para barras: top 10 por valor
  const barData = useMemo(() => {
    if (!dataset || !labelCol || !valueCol) return [];
    const map = new Map<string, number>();
    dataset.rows.forEach((r) => {
      const key = String(r[labelCol] ?? '—').trim();
      const val = parseFloat(r[valueCol]) || 0;
      map.set(key, (map.get(key) ?? 0) + val);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [dataset, labelCol, valueCol]);

  const kpis = useMemo(() => {
    if (!dataset || !valueCol) return null;
    const vals = dataset.rows.map((r) => parseFloat(r[valueCol])).filter((v) => !isNaN(v));
    if (!vals.length) return null;
    const sum    = vals.reduce((a, b) => a + b, 0);
    const sorted = [...vals].sort((a, b) => a - b);
    return {
      total:    sum.toLocaleString('es-MX', { maximumFractionDigits: 2 }),
      promedio: (sum / vals.length).toFixed(2),
      maximo:   sorted[sorted.length - 1].toFixed(2),
      minimo:   sorted[0].toFixed(2),
    };
  }, [dataset, valueCol]);

  // Tooltip personalizado para el pie
  const PieTooltip = ({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: { name: string } }[] }) => {
    if (!active || !payload?.length) return null;
    const { name, value } = payload[0];
    return (
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
        <p style={{ margin: 0, fontWeight: 600, color: '#111827' }}>{name}</p>
        <p style={{ margin: '2px 0 0', color: '#f97316' }}>{value.toLocaleString('es-MX')}</p>
      </div>
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Ofertas</h1>
          <p className={styles.pageDesc}>Visualiza la distribución de tus ofertas cargadas desde un CSV.</p>
        </div>
      </div>

      {/* Configuración */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Configurar visualización</h2>
        {datasets.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>Ve a <strong>Datasets</strong> para cargar un CSV de ofertas.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <SelectField label="DATASET CSV" value={selectedId} onChange={handleDataset}>
              <option value="">— Selecciona —</option>
              {datasets.map((ds) => <option key={ds.id} value={ds.id}>{ds.name}</option>)}
            </SelectField>
            {dataset && (
              <>
                <SelectField label="CATEGORÍA" value={labelCol} onChange={setLabelCol}>
                  <option value="">— Columna —</option>
                  {dataset.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                </SelectField>
                <SelectField label="VALOR" value={valueCol} onChange={setValueCol}>
                  <option value="">— Numérica —</option>
                  {numericCols.map((c) => <option key={c} value={c}>{c}</option>)}
                </SelectField>
              </>
            )}
          </div>
        )}
      </div>

      {/* KPIs */}
      {kpis && (
        <div className={styles.statsGrid}>
          {[
            { label: 'Total',       value: kpis.total },
            { label: 'Promedio',    value: kpis.promedio },
            { label: 'Mayor valor', value: kpis.maximo },
            { label: 'Menor valor', value: kpis.minimo },
          ].map((k) => (
            <div key={k.label} className={styles.statCard}>
              <div className={styles.statBody}>
                <p className={styles.statLabel}>{k.label}</p>
                <p className={styles.statValue} style={{ fontSize: 20, color: '#f97316' }}>{k.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Gráficas */}
      {pieData.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>

          {/* Pie limpio — sin etiquetas encima, solo leyenda + tooltip */}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Distribución por categoría</h2>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '-8px 0 12px' }}>Top categorías + Otros · pasa el cursor para ver el valor</p>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%" cy="48%"
                    outerRadius={105}
                    innerRadius={42}
                    paddingAngle={3}
                    label={false}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={OFFER_COLORS[i % OFFER_COLORS.length]} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={10}
                    wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                    formatter={(value) => <span style={{ color: '#374151' }}>{String(value).slice(0, 18)}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Barras top 10 — cada barra con su color */}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Top 10 — {valueCol}</h2>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '-8px 0 12px' }}>Categorías con mayor valor acumulado</p>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 4, right: 12, bottom: 24, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    tickFormatter={(v) => String(v).slice(0, 10)}
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                    formatter={(v) => [Number(v).toLocaleString('es-MX'), valueCol]}
                  />
                  <Bar dataKey="value" name={valueCol} radius={[6, 6, 0, 0]}>
                    {barData.map((_, i) => (
                      <Cell key={i} fill={OFFER_COLORS[i % OFFER_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Leyenda manual para barras */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 10 }}>
              {barData.map((d, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#374151' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: OFFER_COLORS[i % OFFER_COLORS.length], flexShrink: 0 }} />
                  {String(d.name).slice(0, 16)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Placeholder */}
      {dataset && (!labelCol || !valueCol) && (
        <div className={styles.card}>
          <div className={styles.empty}>
            <p className={styles.emptyText}>Selecciona la columna de categoría y la columna de valor para ver las gráficas</p>
          </div>
        </div>
      )}
    </div>
  );
}
