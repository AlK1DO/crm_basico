import { useState, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useDatasetContext } from '../../context/DatasetContext';
import type { Dataset } from '../../hooks/useDatasets';
import styles from './Dashboard.module.css';

const SALES_COLORS  = ['#93c5fd', '#6ee7b7', '#fcd34d', '#f9a8d4', '#a5b4fc', '#86efac', '#fdba74', '#c4b5fd', '#fca5a5', '#67e8f9'];
const COMPARE_COLORS = ['#3b82f6', '#10b981'];

type SalesTab = 'ventas' | 'compras' | 'insights';

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

// Agrupa filas por etiqueta sumando el valor, devuelve top 10
function topByLabel(dataset: Dataset, labelCol: string, valueCol: string, n = 10) {
  const map = new Map<string, number>();
  dataset.rows.forEach((r) => {
    const key = String(r[labelCol] ?? '—').trim();
    const val = parseFloat(r[valueCol]) || 0;
    map.set(key, (map.get(key) ?? 0) + val);
  });
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

// ─── Módulo individual Ventas / Compras ───────────────────────────────────────

function DatasetModule({ title, accentColor, emptyMsg }: {
  title: string; accentColor: string; emptyMsg: string;
}) {
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

  const barData = useMemo(() => {
    if (!dataset || !labelCol || !valueCol) return [];
    return topByLabel(dataset, labelCol, valueCol, 10);
  }, [dataset, labelCol, valueCol]);

  const lineData = useMemo(() => {
    if (!dataset || !labelCol || !valueCol) return [];
    return dataset.rows.slice(0, 25).map((r) => ({
      name:  String(r[labelCol] ?? '').slice(0, 12),
      value: parseFloat(r[valueCol]) || 0,
    }));
  }, [dataset, labelCol, valueCol]);

  const kpis = useMemo(() => {
    if (!dataset || !valueCol) return null;
    const vals = dataset.rows.map((r) => parseFloat(r[valueCol])).filter((v) => !isNaN(v));
    if (!vals.length) return null;
    const sum    = vals.reduce((a, b) => a + b, 0);
    const sorted = [...vals].sort((a, b) => a - b);
    return {
      total:     sum.toLocaleString('es-MX', { maximumFractionDigits: 2 }),
      promedio:  (sum / vals.length).toFixed(2),
      maximo:    sorted[sorted.length - 1].toFixed(2),
      registros: vals.length.toLocaleString(),
    };
  }, [dataset, valueCol]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>{title}</h2>
        {datasets.length === 0 ? (
          <div className={styles.empty}><p className={styles.emptyText}>{emptyMsg}</p></div>
        ) : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <SelectField label="DATASET CSV" value={selectedId} onChange={handleDataset}>
              <option value="">— Selecciona —</option>
              {datasets.map((ds) => <option key={ds.id} value={ds.id}>{ds.name}</option>)}
            </SelectField>
            {dataset && (
              <>
                <SelectField label="ETIQUETA" value={labelCol} onChange={setLabelCol}>
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

      {kpis && (
        <div className={styles.statsGrid}>
          {[
            { label: 'Total',     value: kpis.total },
            { label: 'Promedio',  value: kpis.promedio },
            { label: 'Máximo',    value: kpis.maximo },
            { label: 'Registros', value: kpis.registros },
          ].map((k) => (
            <div key={k.label} className={styles.statCard}>
              <div className={styles.statBody}>
                <p className={styles.statLabel}>{k.label}</p>
                <p className={styles.statValue} style={{ fontSize: 20, color: accentColor }}>{k.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {barData.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
          {/* Barras top 10 con colores */}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Top 10 — {valueCol}</h2>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '-8px 0 12px' }}>Los 10 valores más altos por categoría</p>
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 4, right: 12, bottom: 20, left: 0 }}>
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
                    formatter={(v: number) => [v.toLocaleString('es-MX'), valueCol]}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {barData.map((_, i) => <Cell key={i} fill={SALES_COLORS[i % SALES_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Leyenda */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 10 }}>
              {barData.map((d, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#374151' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: SALES_COLORS[i % SALES_COLORS.length], flexShrink: 0 }} />
                  {String(d.name).slice(0, 16)}
                </span>
              ))}
            </div>
          </div>

          {/* Línea de tendencia */}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Tendencia — {valueCol}</h2>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '-8px 0 12px' }}>Primeros 25 registros en orden de entrada</p>
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData} margin={{ top: 4, right: 12, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v) => String(v).slice(0, 8)} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: number) => [v.toLocaleString('es-MX'), valueCol]} />
                  <Line type="monotone" dataKey="value" stroke={accentColor} strokeWidth={2.5} dot={{ r: 3, fill: accentColor }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* Leyenda */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <span style={{ width: 24, height: 3, borderRadius: 2, background: accentColor, display: 'inline-block' }} />
              <span style={{ fontSize: 12, color: '#374151' }}>{valueCol}</span>
            </div>
          </div>
        </div>
      )}

      {dataset && (!labelCol || !valueCol) && (
        <div className={styles.card}>
          <div className={styles.empty}>
            <p className={styles.emptyText}>Selecciona la columna de etiqueta y la de valor para ver las gráficas</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Insights: compara dos datasets ───────────────────────────────────────────

function InsightsModule() {
  const { datasets } = useDatasetContext();

  const [idA, setIdA]         = useState('');
  const [idB, setIdB]         = useState('');
  const [colA, setColA]       = useState('');
  const [colB, setColB]       = useState('');
  const [labelA, setLabelA]   = useState('');
  const [labelB, setLabelB]   = useState('');

  const dsA = datasets.find((d) => d.id === idA);
  const dsB = datasets.find((d) => d.id === idB);

  const numCols = (ds?: Dataset) => {
    if (!ds) return [];
    return ds.columns.filter((col) => {
      const sample = ds.rows.slice(0, 20).map((r) => r[col]).filter(Boolean);
      if (!sample.length) return false;
      const numRatio = sample.filter((v) => !isNaN(Number(v))).length / sample.length;
      const avgLen   = sample.reduce((a, v) => a + String(v).replace(/\D/g, '').length, 0) / sample.length;
      return numRatio >= 0.8 && avgLen <= 7;
    });
  };

  const handleDsA = (id: string) => { setIdA(id); setColA(''); setLabelA(''); };
  const handleDsB = (id: string) => { setIdB(id); setColB(''); setLabelB(''); };

  // KPIs comparativos
  const kpisA = useMemo(() => {
    if (!dsA || !colA) return null;
    const vals = dsA.rows.map((r) => parseFloat(r[colA])).filter((v) => !isNaN(v));
    if (!vals.length) return null;
    const sum = vals.reduce((a, b) => a + b, 0);
    return { sum, avg: sum / vals.length, count: vals.length };
  }, [dsA, colA]);

  const kpisB = useMemo(() => {
    if (!dsB || !colB) return null;
    const vals = dsB.rows.map((r) => parseFloat(r[colB])).filter((v) => !isNaN(v));
    if (!vals.length) return null;
    const sum = vals.reduce((a, b) => a + b, 0);
    return { sum, avg: sum / vals.length, count: vals.length };
  }, [dsB, colB]);

  // Barras lado a lado: top 8 de cada uno normalizados para comparar
  const compareData = useMemo(() => {
    if (!dsA || !dsB || !colA || !colB || !labelA || !labelB) return [];
    const topA = topByLabel(dsA, labelA, colA, 8);
    const topB = topByLabel(dsB, labelB, colB, 8);
    const keys = Array.from(new Set([...topA.map((d) => d.name), ...topB.map((d) => d.name)])).slice(0, 8);
    const mapA = new Map(topA.map((d) => [d.name, d.value]));
    const mapB = new Map(topB.map((d) => [d.name, d.value]));
    return keys.map((k) => ({ name: String(k).slice(0, 10), A: mapA.get(k) ?? 0, B: mapB.get(k) ?? 0 }));
  }, [dsA, dsB, colA, colB, labelA, labelB]);

  const ready = kpisA && kpisB;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Selectors */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Comparar dos CSV</h2>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '-6px 0 16px' }}>
          Selecciona dos datasets y la columna numérica de cada uno para ver el análisis comparativo.
        </p>

        {datasets.length < 2 ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>Necesitas al menos <strong>2 datasets</strong> cargados en Datasets para comparar.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {/* CSV A */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 18px', borderRadius: 10, border: `2px solid ${COMPARE_COLORS[0]}22`, background: `${COMPARE_COLORS[0]}08` }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: COMPARE_COLORS[0], textTransform: 'uppercase' }}>CSV A</span>
              <SelectField label="DATASET" value={idA} onChange={handleDsA}>
                <option value="">— Selecciona —</option>
                {datasets.map((ds) => <option key={ds.id} value={ds.id}>{ds.name}</option>)}
              </SelectField>
              {dsA && (
                <>
                  <SelectField label="ETIQUETA" value={labelA} onChange={setLabelA}>
                    <option value="">— Columna —</option>
                    {dsA.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </SelectField>
                  <SelectField label="VALOR" value={colA} onChange={setColA}>
                    <option value="">— Numérica —</option>
                    {numCols(dsA).map((c) => <option key={c} value={c}>{c}</option>)}
                  </SelectField>
                </>
              )}
            </div>

            {/* CSV B */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 18px', borderRadius: 10, border: `2px solid ${COMPARE_COLORS[1]}22`, background: `${COMPARE_COLORS[1]}08` }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: COMPARE_COLORS[1], textTransform: 'uppercase' }}>CSV B</span>
              <SelectField label="DATASET" value={idB} onChange={handleDsB}>
                <option value="">— Selecciona —</option>
                {datasets.map((ds) => <option key={ds.id} value={ds.id}>{ds.name}</option>)}
              </SelectField>
              {dsB && (
                <>
                  <SelectField label="ETIQUETA" value={labelB} onChange={setLabelB}>
                    <option value="">— Columna —</option>
                    {dsB.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </SelectField>
                  <SelectField label="VALOR" value={colB} onChange={setColB}>
                    <option value="">— Numérica —</option>
                    {numCols(dsB).map((c) => <option key={c} value={c}>{c}</option>)}
                  </SelectField>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* KPIs comparativos */}
      {ready && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {[
            { label: 'Total A', value: kpisA.sum.toLocaleString('es-MX', { maximumFractionDigits: 2 }), color: COMPARE_COLORS[0] },
            { label: 'Total B', value: kpisB.sum.toLocaleString('es-MX', { maximumFractionDigits: 2 }), color: COMPARE_COLORS[1] },
            { label: 'Promedio A', value: kpisA.avg.toFixed(2), color: COMPARE_COLORS[0] },
            { label: 'Promedio B', value: kpisB.avg.toFixed(2), color: COMPARE_COLORS[1] },
            { label: 'Registros A', value: kpisA.count.toLocaleString(), color: COMPARE_COLORS[0] },
            { label: 'Registros B', value: kpisB.count.toLocaleString(), color: COMPARE_COLORS[1] },
          ].map((k) => (
            <div key={k.label} className={styles.statCard}>
              <div className={styles.statBody}>
                <p className={styles.statLabel}>{k.label}</p>
                <p className={styles.statValue} style={{ fontSize: 20, color: k.color }}>{k.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Diferencia rápida */}
      {ready && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Análisis rápido</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(() => {
              const diffTotal = kpisB.sum - kpisA.sum;
              const diffPct   = kpisA.sum !== 0 ? ((diffTotal / kpisA.sum) * 100).toFixed(1) : '—';
              const diffAvg   = kpisB.avg - kpisA.avg;
              const up = diffTotal >= 0;
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: up ? '#f0fdf4' : '#fff7ed', border: `1px solid ${up ? '#bbf7d0' : '#fed7aa'}` }}>
                    <span style={{ fontSize: 18 }}>{up ? '↑' : '↓'}</span>
                    <span style={{ fontSize: 13, color: '#374151' }}>
                      <strong>Total B</strong> es <strong style={{ color: up ? '#10b981' : '#f97316' }}>{up ? '+' : ''}{diffTotal.toLocaleString('es-MX', { maximumFractionDigits: 2 })} ({diffPct}%)</strong> respecto a A
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                    <span style={{ fontSize: 18 }}>≈</span>
                    <span style={{ fontSize: 13, color: '#374151' }}>
                      Diferencia de promedio: <strong style={{ color: '#6366f1' }}>{diffAvg >= 0 ? '+' : ''}{diffAvg.toFixed(2)}</strong> por registro
                    </span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Barras comparativas lado a lado */}
      {compareData.length > 0 && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Comparativa por categoría</h2>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: '-8px 0 12px' }}>Top 8 categorías · A vs B</p>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compareData} margin={{ top: 4, right: 16, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} interval={0} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number, n: string) => [v.toLocaleString('es-MX'), n === 'A' ? `CSV A · ${colA}` : `CSV B · ${colB}`]} />
                <Bar dataKey="A" fill={COMPARE_COLORS[0]} radius={[4, 4, 0, 0]} name="A" />
                <Bar dataKey="B" fill={COMPARE_COLORS[1]} radius={[4, 4, 0, 0]} name="B" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Leyenda */}
          <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
            {[{ label: `CSV A — ${dsA?.name ?? ''}`, color: COMPARE_COLORS[0] }, { label: `CSV B — ${dsB?.name ?? ''}`, color: COMPARE_COLORS[1] }].map((l) => (
              <span key={l.color} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
                <span style={{ width: 14, height: 10, borderRadius: 3, background: l.color, display: 'inline-block' }} />
                {l.label.slice(0, 30)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Hint si no está completo */}
      {datasets.length >= 2 && (!ready || compareData.length === 0) && (
        <div className={styles.card}>
          <div className={styles.empty}>
            <p className={styles.emptyText}>Selecciona los dos datasets con sus etiquetas y valores para ver el análisis comparativo</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Página principal Ventas ──────────────────────────────────────────────────

export default function Sales() {
  const [tab, setTab] = useState<SalesTab>('ventas');

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Ventas</h1>
          <p className={styles.pageDesc}>Analiza tus CSV de ventas, compras y compara datasets en tiempo real.</p>
        </div>
      </div>

      <div className={styles.tabs}>
        {(['ventas', 'compras', 'insights'] as SalesTab[]).map((t) => (
          <button key={t} className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`} onClick={() => setTab(t)}>
            {t === 'ventas' ? 'Ventas CSV' : t === 'compras' ? 'Compras CSV' : ' Insights'}
          </button>
        ))}
      </div>

      {tab === 'ventas'   && <DatasetModule title="Módulo de Ventas"   accentColor="#3b82f6" emptyMsg="Ve a Datasets para cargar un CSV de ventas."   />}
      {tab === 'compras'  && <DatasetModule title="Módulo de Compras"  accentColor="#10b981" emptyMsg="Ve a Datasets para cargar un CSV de compras."  />}
      {tab === 'insights' && <InsightsModule />}
    </div>
  );
}
