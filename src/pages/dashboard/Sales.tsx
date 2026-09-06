import { useState, useMemo, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useDatasetContext } from '../../context/DatasetContext';
import type { Dataset } from '../../hooks/useDatasets';
import { analyzeDataset, findCompatibleColumns } from '../../utils/insights';
import styles from './Dashboard.module.css';

const SALES_COLORS = ['#93c5fd', '#6ee7b7', '#fcd34d', '#f9a8d4', '#a5b4fc', '#86efac', '#fdba74', '#c4b5fd', '#fca5a5', '#67e8f9'];

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

function topByLabel(dataset: Dataset, labelCol: string, valueCol: string, n = 10) {
  const map = new Map<string, number>();
  dataset.rows.forEach((row) => {
    const key = String(row[labelCol] ?? '—').trim();
    const value = parseFloat(row[valueCol]) || 0;
    map.set(key, (map.get(key) ?? 0) + value);
  });
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

function isSalesRelevantColumn(name: string): boolean {
  const normalized = String(name).toLowerCase();
  const relevantPattern = /(venta|ventas|precio|descuento|cantidad|monto|subtotal|total|ingreso|ingresos|recaud|valor|ticket)/i;
  const excludedPattern = /(id_|codigo|cliente|nombre|producto|categoria|descripcion|fecha|email|telefono|direccion)/i;

  return relevantPattern.test(normalized) && !excludedPattern.test(normalized);
}

function generateImprovementSuggestions(pair: { left: string; right: string; leftStats: { mean: number } | null; rightStats: { mean: number } | null; delta: number | null }) {
  const leftMean = pair.leftStats?.mean ?? 0;
  const rightMean = pair.rightStats?.mean ?? 0;
  const leftName = pair.left.toLowerCase();
  const rightName = pair.right.toLowerCase();
  const combined = `${leftName} ${rightName}`;

  if (combined.includes('precio')) {
    if (rightMean > leftMean) {
      return ['Aumenta el precio promedio con mejor posicionamiento del producto y mayor valor percibido por el cliente.'];
    }
    return ['Revisa la estrategia de precios: puedes mejorar margen ajustando promociones y valor percibido.'];
  }

  if (combined.includes('descuento')) {
    if (rightMean > leftMean) {
      return ['Reduce descuentos agresivos y prioriza promociones más segmentadas para proteger margen.'];
    }
    return ['Usa descuentos más específicos por segmento para mantener rentabilidad sin sacrificar volumen.'];
  }

  if (combined.includes('cantidad') || combined.includes('venta') || combined.includes('total')) {
    if (rightMean > leftMean) {
      return ['Mantén la tendencia de volumen y refuerza campañas para sostener crecimiento en ventas.'];
    }
    return ['Busca aumentar volumen de ventas con mejores promociones, más cross-sell y mayor retención.'];
  }

  if (pair.delta !== null && pair.delta > 0) {
    return ['Sigue reforzando esa línea, pero valida si el crecimiento está acompañado de rentabilidad y eficiencia.'];
  }

  if (pair.delta !== null && pair.delta < 0) {
    return ['Hay espacio para mejorar el rendimiento: revisa descuentos, costo o canal de venta para recuperar oportunidad.'];
  }

  return ['Mantén el foco en los KPIs de ventas y revisa pequeños ajustes en precio y descuentos para mejorar rentabilidad.'];
}

function DatasetModule({ title, accentColor, emptyMsg }: {
  title: string; accentColor: string; emptyMsg: string;
}) {
  const { datasets } = useDatasetContext();
  const [selectedId, setSelectedId] = useState('');
  const [labelCol, setLabelCol] = useState('');
  const [valueCol, setValueCol] = useState('');

  const dataset = datasets.find((d) => d.id === selectedId);
  const handleDataset = (id: string) => {
    setSelectedId(id);
    setLabelCol('');
    setValueCol('');
  };

  const numericCols = useMemo(() => {
    if (!dataset) return [];
    return dataset.columns.filter((col) => {
      const sample = dataset.rows.slice(0, 20).map((row) => row[col]).filter(Boolean);
      if (!sample.length) return false;
      const numRatio = sample.filter((value) => !isNaN(Number(value))).length / sample.length;
      const avgLen = sample.reduce((sum, value) => sum + String(value).replace(/\D/g, '').length, 0) / sample.length;
      return numRatio >= 0.8 && avgLen <= 7;
    });
  }, [dataset]);

  const barData = useMemo(() => {
    if (!dataset || !labelCol || !valueCol) return [];
    return topByLabel(dataset, labelCol, valueCol, 10);
  }, [dataset, labelCol, valueCol]);

  const lineData = useMemo(() => {
    if (!dataset || !labelCol || !valueCol) return [];
    return dataset.rows.slice(0, 25).map((row) => ({
      name: String(row[labelCol] ?? '').slice(0, 12),
      value: parseFloat(row[valueCol]) || 0,
    }));
  }, [dataset, labelCol, valueCol]);

  const kpis = useMemo(() => {
    if (!dataset || !valueCol) return null;
    const values = dataset.rows.map((row) => parseFloat(row[valueCol])).filter((value) => !isNaN(value));
    if (!values.length) return null;
    const sum = values.reduce((a, b) => a + b, 0);
    const sorted = [...values].sort((a, b) => a - b);
    return {
      total: sum.toLocaleString('es-MX', { maximumFractionDigits: 2 }),
      promedio: (sum / values.length).toFixed(2),
      maximo: sorted[sorted.length - 1].toFixed(2),
      registros: values.length.toLocaleString(),
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
                  {dataset.columns.map((col) => <option key={col} value={col}>{col}</option>)}
                </SelectField>
                <SelectField label="VALOR" value={valueCol} onChange={setValueCol}>
                  <option value="">— Numérica —</option>
                  {numericCols.map((col) => <option key={col} value={col}>{col}</option>)}
                </SelectField>
              </>
            )}
          </div>
        )}
      </div>

      {kpis && (
        <div className={styles.statsGrid}>
          {[
            { label: 'Total', value: kpis.total },
            { label: 'Promedio', value: kpis.promedio },
            { label: 'Máximo', value: kpis.maximo },
            { label: 'Registros', value: kpis.registros },
          ].map((item) => (
            <div key={item.label} className={styles.statCard}>
              <div className={styles.statBody}>
                <p className={styles.statLabel}>{item.label}</p>
                <p className={styles.statValue} style={{ fontSize: 20, color: accentColor }}>{item.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {barData.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Top 10 — {valueCol}</h2>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '-8px 0 12px' }}>Los 10 valores más altos por categoría</p>
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 4, right: 12, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(value) => String(value).slice(0, 10)} interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} formatter={(value) => [Number(value).toLocaleString('es-MX'), valueCol]} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {barData.map((_, index) => <Cell key={index} fill={SALES_COLORS[index % SALES_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Tendencia — {valueCol}</h2>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '-8px 0 12px' }}>Primeros 25 registros en orden de entrada</p>
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData} margin={{ top: 4, right: 12, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(value) => String(value).slice(0, 8)} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value) => [Number(value).toLocaleString('es-MX'), valueCol]} />
                  <Line type="monotone" dataKey="value" stroke={accentColor} strokeWidth={2.5} dot={{ r: 3, fill: accentColor }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
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

function InsightsModule() {
  const { datasets } = useDatasetContext();
  const [mode, setMode] = useState<'single' | 'compare'>('single');
  const [singleId, setSingleId] = useState('');
  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('');
  const [expandedComparison, setExpandedComparison] = useState<number | null>(null);

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === singleId) ?? datasets[0] ?? null,
    [datasets, singleId]
  );

  const leftDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === leftId) ?? datasets[0] ?? null,
    [datasets, leftId]
  );

  const rightDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === rightId) ?? datasets[1] ?? null,
    [datasets, rightId]
  );

  useEffect(() => {
    setExpandedComparison(null);
  }, [leftId, rightId, mode]);

  const autoAnalysis = useMemo(() => {
    if (!selectedDataset) return null;
    return analyzeDataset(selectedDataset);
  }, [selectedDataset]);

  const comparison = useMemo(() => {
    if (!leftDataset || !rightDataset) return null;
    return findCompatibleColumns(leftDataset, rightDataset);
  }, [leftDataset, rightDataset]);

  const relevantPairs = useMemo(() => {
    if (!comparison) return [];
    return comparison.compatiblePairs.filter((pair) => isSalesRelevantColumn(pair.left) && isSalesRelevantColumn(pair.right));
  }, [comparison]);

  const chartData = useMemo(() => {
    if (!autoAnalysis) return [];
    return autoAnalysis.categoryData.length ? autoAnalysis.categoryData : autoAnalysis.trendData.map((point) => ({ name: point.date, value: point.value }));
  }, [autoAnalysis]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Insights automáticos</h2>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '-6px 0 16px' }}>
          El sistema detecta columnas, estadísticas y compatibilidad sin requerir seleccionar etiqueta ni valor manualmente.
        </p>

        {datasets.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>Carga uno o varios CSV en Datasets para que el análisis automático se genere.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`${styles.tab} ${mode === 'single' ? styles.tabActive : ''}`}
                onClick={() => setMode('single')}
                style={{ minWidth: 180 }}
              >
                Analizar un CSV
              </button>
              <button
                type="button"
                className={`${styles.tab} ${mode === 'compare' ? styles.tabActive : ''}`}
                onClick={() => setMode('compare')}
                style={{ minWidth: 180 }}
              >
                Comparar dos CSV
              </button>
            </div>

            {mode === 'single' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {datasets.length > 1 && (
                  <SelectField label="Archivo a analizar" value={singleId} onChange={setSingleId}>
                    <option value="">— Selecciona un CSV —</option>
                    {datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}
                  </SelectField>
                )}
              </div>
            )}

            {mode === 'compare' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                <SelectField label="CSV A" value={leftId} onChange={setLeftId}>
                  <option value="">— Selecciona —</option>
                  {datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}
                </SelectField>
                <SelectField label="CSV B" value={rightId} onChange={setRightId}>
                  <option value="">— Selecciona —</option>
                  {datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}
                </SelectField>
              </div>
            )}
          </div>
        )}
      </div>

      {mode === 'single' && autoAnalysis && (
        <>
          <div className={styles.statsGrid}>
            {autoAnalysis.summaryCards.map((card) => (
              <div key={card.key} className={styles.statCard}>
                <div className={styles.statBody}>
                  <p className={styles.statLabel}>{card.label}</p>
                  <p className={styles.statValue} style={{ fontSize: 20, color: '#3b82f6' }}>{card.value}</p>
                </div>
              </div>
            ))}
          </div>

          {autoAnalysis.trendData.length > 0 && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Tendencia temporal</h2>
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={autoAnalysis.trendData} margin={{ top: 8, right: 12, bottom: 20, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {chartData.length > 0 && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Distribución automática</h2>
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 20, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} interval={0} />
                    <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {chartData.map((_, index) => <Cell key={index} fill={SALES_COLORS[index % SALES_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Alertas detectadas</h2>
            <ul style={{ paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 8, color: '#374151' }}>
              {autoAnalysis.alerts.map((alert, index) => <li key={index}>{alert}</li>)}
            </ul>
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Conclusiones automáticas</h2>
            <ul style={{ paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 8, color: '#374151' }}>
              {autoAnalysis.conclusions.map((conclusion, index) => <li key={index}>{conclusion}</li>)}
            </ul>
          </div>
        </>
      )}

      {mode === 'compare' && leftDataset && rightDataset && comparison && (
        <>
          <div className={styles.statsGrid}>
            {[{ label: 'Compatibles', value: relevantPairs.length.toString(), color: '#3b82f6' }, { label: 'Sin equivalencia A', value: comparison.unmatchedLeft.filter((column) => isSalesRelevantColumn(column)).length.toString(), color: '#f59e0b' }, { label: 'Sin equivalencia B', value: comparison.unmatchedRight.filter((column) => isSalesRelevantColumn(column)).length.toString(), color: '#ef4444' }].map((item) => (
              <div key={item.label} className={styles.statCard}>
                <div className={styles.statBody}>
                  <p className={styles.statLabel}>{item.label}</p>
                  <p className={styles.statValue} style={{ fontSize: 20, color: item.color }}>{item.value}</p>
                </div>
              </div>
            ))}
          </div>

          {relevantPairs.length > 0 ? (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Comparación automática</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {relevantPairs.map((pair, index) => {
                  const isExpanded = expandedComparison === index;
                  const chartValues = [
                    { name: 'CSV A', value: pair.leftStats?.mean ?? 0 },
                    { name: 'CSV B', value: pair.rightStats?.mean ?? 0 },
                  ];
                  const suggestions = generateImprovementSuggestions(pair);

                  return (
                    <div key={`${pair.left}-${pair.right}`} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#f8fafc' }}>
                      <button
                        type="button"
                        onClick={() => setExpandedComparison(isExpanded ? null : index)}
                        style={{
                          width: '100%',
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          textAlign: 'left',
                          cursor: 'pointer',
                          color: '#111827',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <strong style={{ fontSize: 18, fontWeight: 700 }}>{pair.left} → {pair.right}</strong>
                          <div style={{ fontSize: 13, color: '#374151' }}>
                            {pair.leftStats && pair.rightStats ? (
                              <>
                                Promedio A: <strong>{pair.leftStats.mean.toFixed(2)}</strong> · Promedio B: <strong>{pair.rightStats.mean.toFixed(2)}</strong>
                                {pair.delta !== null && <span> · Diferencia: <strong>{pair.delta.toFixed(2)}</strong></span>}
                              </>
                            ) : (
                              <span>Se comparó la columna sin datos numéricos suficientes para resumir.</span>
                            )}
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div style={{ marginTop: 16 }}>
                          <div style={{ height: 220 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={chartValues} margin={{ top: 8, right: 16, bottom: 20, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} />
                                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
                                <Tooltip formatter={(value) => Number(value).toFixed(2)} />
                                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                                  <Cell fill="#3b82f6" />
                                  <Cell fill="#10b981" />
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>

                          <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, background: '#eef2ff', border: '1px solid #c7d2fe' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#3730a3', marginBottom: 8 }}>Sugerencias para mejorar</div>
                            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8, color: '#374151', fontSize: 13 }}>
                              {suggestions.map((suggestion, suggestionIndex) => (
                                <li key={suggestionIndex}>{suggestion}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Comparación automática</h2>
              <p style={{ color: '#374151', margin: 0 }}>No hay columnas de ventas, precios o descuentos relevantes para comparar entre los CSV seleccionados.</p>
            </div>
          )}

          {(comparison.unmatchedLeft.filter((column) => isSalesRelevantColumn(column)).length > 0 || comparison.unmatchedRight.filter((column) => isSalesRelevantColumn(column)).length > 0) && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Columnas no comparables</h2>
              <ul style={{ paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 8, color: '#374151' }}>
                {comparison.unmatchedLeft.filter((column) => isSalesRelevantColumn(column)).map((column, index) => <li key={`left-${index}`}>La columna {column} no pudo compararse: no existe una columna equivalente en el otro archivo.</li>)}
                {comparison.unmatchedRight.filter((column) => isSalesRelevantColumn(column)).map((column, index) => <li key={`right-${index}`}>La columna {column} no pudo compararse: no existe una columna equivalente en el archivo original.</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

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
        {(['ventas', 'compras', 'insights'] as SalesTab[]).map((tabName) => (
          <button key={tabName} className={`${styles.tab} ${tab === tabName ? styles.tabActive : ''}`} onClick={() => setTab(tabName)}>
            {tabName === 'ventas' ? 'Ventas CSV' : tabName === 'compras' ? 'Compras CSV' : ' Insights'}
          </button>
        ))}
      </div>

      {tab === 'ventas' && <DatasetModule title="Módulo de Ventas" accentColor="#3b82f6" emptyMsg="Ve a Datasets para cargar un CSV de ventas." />}
      {tab === 'compras' && <DatasetModule title="Módulo de Compras" accentColor="#10b981" emptyMsg="Ve a Datasets para cargar un CSV de compras." />}
      {tab === 'insights' && <InsightsModule />}
    </div>
  );
}
