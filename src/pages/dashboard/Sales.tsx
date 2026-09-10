/**
 * Sales.tsx
 *
 * Módulo de Ventas refactorizado.
 * Estructura:
 *   KPIs → Gráficos → Comparaciones → INSIGHTS → Problemas → Sugerencias → Análisis personalizado
 *
 * - Usa el motor analítico central (analyzeDataset).
 * - Usa datos limpios si están disponibles.
 * - No calcula nada por su cuenta.
 * - No inventa causas ni datos falsos.
 * - Máximo 4 gráficos principales.
 */

import { useState, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  ScatterChart, Scatter, ZAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useDatasetContext } from '../../context/DatasetContext';
import { useAuth } from '../../hooks/useAuth';
import { analyzeDataset } from '../../engine/analysisEngine';
import type { AnalysisFilters } from '../../engine/analysisEngine';
import { compareDatasets } from '../../engine/comparisonEngine';
import type { ComparisonResult } from '../../engine/comparisonEngine';
import { fmtNum } from '../../engine/insightEngine';
import { CATEGORY_COLORS, CHART_PALETTE, directionColor, formatTooltipValue } from '../../engine/chartSelector';
import { groupByCategory } from '../../engine/metricsCalculator';
import type { Insight, InsightPriority, Dataset } from '../../types';
import styles from './Dashboard.module.css';

// ─── Colores semánticos de prioridad ─────────────────────────────────────────

const PRIORITY_CONFIG: Record<InsightPriority, { label: string; bg: string; color: string; border: string }> = {
  critical:    { label: 'Crítico',     bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  important:   { label: 'Importante',  bg: '#fff7ed', color: '#d97706', border: '#fed7aa' },
  opportunity: { label: 'Oportunidad', bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  informative: { label: 'Informativo', bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
};

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function InsightCard({ insight, expanded, onToggle }: {
  insight: Insight;
  expanded: boolean;
  onToggle: () => void;
}) {
  const cfg = PRIORITY_CONFIG[insight.priority];
  return (
    <div style={{
      borderRadius: 10, border: `1px solid ${cfg.border}`,
      background: cfg.bg, overflow: 'hidden',
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', textAlign: 'left', padding: '12px 16px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1 }}>
          <span style={{
            padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
            background: cfg.color, color: '#fff', whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {cfg.label}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{insight.title}</span>
        </div>
        <span style={{ color: '#6b7280', fontSize: 16, flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Row label="HECHO" value={insight.fact} />
          <Row label="EVIDENCIA" value={insight.evidence} />
          {insight.problem && <Row label="PROBLEMA" value={insight.problem} color="#dc2626" />}
          <Row label={insight.isHypothesis ? 'HIPÓTESIS' : 'SUGERENCIA'} value={insight.suggestion} color="#2563eb" />
          {insight.isHypothesis && (
            <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>
              * Esta causa es inferida, no está probada con los datos disponibles.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, color = '#374151' }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', margin: '0 0 3px' }}>{label}</p>
      <p style={{ fontSize: 13, color, margin: 0 }}>{value}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className={styles.empty}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75" />
      </svg>
      <p className={styles.emptyText}>{message}</p>
    </div>
  );
}

// ─── Panel de Análisis Personalizado ─────────────────────────────────────────

function CustomAnalysis({ dataset }: { dataset: Dataset }) {
  const [varA, setVarA] = useState('');
  const [varB, setVarB] = useState('');
  const [filterCol, setFilterCol] = useState('');
  const [filterVal, setFilterVal] = useState('');

  const catCols = dataset.columnInfo.filter((c) => c.type === 'categorical').map((c) => c.name);
  const numCols = dataset.columnInfo.filter((c) => c.type === 'monetary' || c.type === 'quantity').map((c) => c.name);

  const filterValues = useMemo(() => {
    if (!filterCol) return [];
    const vals = new Set(dataset.rows.map((r) => String(r[filterCol] ?? '').trim()).filter(Boolean));
    return [...vals].sort().slice(0, 50);
  }, [dataset, filterCol]);

  const chartData = useMemo(() => {
    if (!varA || !varB) return [];
    const rows = filterCol && filterVal
      ? dataset.rows.filter((r) => String(r[filterCol] ?? '').trim() === filterVal)
      : dataset.rows;

    // Agrupar por varA sumando varB
    return groupByCategory(rows, varA, varB, null)
      .slice(0, 12)
      .map((d) => ({ name: d.name, value: d.total }));
  }, [dataset, varA, varB, filterCol, filterVal]);

  const colAInfo = dataset.columnInfo.find((c) => c.name === varA);
  const colBInfo = dataset.columnInfo.find((c) => c.name === varB);
  const isScatter = colAInfo?.type === 'quantity' && colBInfo?.type === 'monetary';

  return (
    <div className={styles.card}>
      <h2 className={styles.cardTitle}>Análisis personalizado</h2>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '-8px 0 16px' }}>
        Selecciona las variables y el sistema recomendará el gráfico apropiado.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>VARIABLE X (categoría)</label>
          <select className={styles.select} value={varA} onChange={(e) => setVarA(e.target.value)}>
            <option value="">— Columna —</option>
            {catCols.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>VARIABLE Y (valor)</label>
          <select className={styles.select} value={varB} onChange={(e) => setVarB(e.target.value)}>
            <option value="">— Columna numérica —</option>
            {numCols.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>FILTRAR POR</label>
          <select className={styles.select} value={filterCol} onChange={(e) => { setFilterCol(e.target.value); setFilterVal(''); }}>
            <option value="">— Sin filtro —</option>
            {catCols.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {filterCol && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>VALOR</label>
            <select className={styles.select} value={filterVal} onChange={(e) => setFilterVal(e.target.value)}>
              <option value="">— Todos —</option>
              {filterValues.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        )}
      </div>

      {varA && varB && chartData.length > 0 && (
        <>
          <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>
            Gráfico recomendado: <strong style={{ color: '#374151' }}>
              {isScatter ? 'Dispersión (relación entre variables)' : 'Barras (comparación por categoría)'}
            </strong>
          </p>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              {isScatter ? (
                <ScatterChart margin={{ top: 4, right: 20, bottom: 24, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="discount" name={varA} tick={{ fontSize: 11 }} label={{ value: varA, position: 'insideBottom', offset: -12, fontSize: 11 }} />
                  <YAxis dataKey="quantity" name={varB} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <ZAxis range={[40, 40]} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v, name) => [Number(v).toLocaleString('es-PE'), name === 'discount' ? varA : varB]} />
                  <Scatter
                    data={chartData.map((d) => ({ discount: d.name, quantity: d.value }))}
                    fill={CATEGORY_COLORS[0]}
                    fillOpacity={0.7}
                  />
                </ScatterChart>
              ) : (
                <BarChart data={chartData} margin={{ top: 4, right: 12, bottom: 24, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} tickFormatter={(v) => String(v).slice(0, 10)} interval={0} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => [Number(v).toLocaleString('es-PE'), varB]} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {chartData.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </>
      )}

      {varA && varB && chartData.length === 0 && (
        <EmptyState message="No hay datos para las variables y filtros seleccionados." />
      )}

      {(!varA || !varB) && (
        <div style={{ padding: '24px 0', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
          Selecciona Variable X y Variable Y para visualizar el análisis.
        </div>
      )}
    </div>
  );
}

// ─── Panel de Comparación entre datasets ─────────────────────────────────────

function ComparisonTab({ datasets }: { datasets: Dataset[] }) {
  const [idA, setIdA] = useState('');
  const [idB, setIdB] = useState('');
  const [useClean, setUseClean] = useState(true);
  const [showAllInsights, setShowAllInsights] = useState(false);
  const [expandedInsights, setExpandedInsights] = useState<Set<string>>(new Set());

  const dsA = datasets.find((d) => d.id === idA) ?? null;
  const dsB = datasets.find((d) => d.id === idB) ?? null;

  const result = useMemo<ComparisonResult | null>(() => {
    if (!dsA || !dsB || dsA.id === dsB.id) return null;
    return compareDatasets(dsA, dsB, useClean);
  }, [dsA, dsB, useClean]);

  const toggleInsight = (id: string) => {
    setExpandedInsights((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const displayedInsights = showAllInsights
    ? (result?.insights ?? [])
    : (result?.insights ?? []).slice(0, 4);

  // Datos para gráfico de barras agrupadas (top 10 por cambio absoluto)
  const barData = useMemo(() => {
    if (!result) return [];
    return result.categoryComparisons
      .filter((c) => !c.onlyInA && !c.onlyInB && (c.totalA > 0 || c.totalB > 0))
      .slice(0, 10)
      .map((c) => ({
        name: c.name.slice(0, 14),
        [result.datasetAName.replace('.csv', '').slice(0, 12)]: c.totalA,
        [result.datasetBName.replace('.csv', '').slice(0, 12)]: c.totalB,
      }));
  }, [result]);

  const keyA = result ? result.datasetAName.replace('.csv', '').slice(0, 12) : 'A';
  const keyB = result ? result.datasetBName.replace('.csv', '').slice(0, 12) : 'B';

  // Datos para gráfico de ganadores/perdedores
  const gainersData = result?.topGainers.map((c) => ({
    name: c.name.slice(0, 14),
    cambio: Number(c.diffPct.toFixed(1)),
  })) ?? [];

  const losersData = result?.topLosers.map((c) => ({
    name: c.name.slice(0, 14),
    cambio: Number(c.diffPct.toFixed(1)),
  })) ?? [];

  if (datasets.length < 2) {
    return (
      <div className={styles.card}>
        <EmptyState message="Necesitas al menos 2 datasets cargados para comparar." />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Selector */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Seleccionar datasets a comparar</h2>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>DATASET A</label>
            <select className={styles.select} value={idA}
              onChange={(e) => { setIdA(e.target.value); if (e.target.value === idB) setIdB(''); }}>
              <option value="">— Selecciona —</option>
              {datasets.map((ds) => (
                <option key={ds.id} value={ds.id} disabled={ds.id === idB}>
                  {ds.name}{ds.isCleaned ? ' ✓' : ''} ({ds.rowCount.toLocaleString()} filas)
                </option>
              ))}
            </select>
          </div>

          <div style={{ fontSize: 20, color: '#9ca3af', paddingBottom: 6 }}>⇄</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>DATASET B</label>
            <select className={styles.select} value={idB}
              onChange={(e) => setIdB(e.target.value)}>
              <option value="">— Selecciona —</option>
              {datasets.map((ds) => (
                <option key={ds.id} value={ds.id} disabled={ds.id === idA}>
                  {ds.name}{ds.isCleaned ? ' ✓' : ''} ({ds.rowCount.toLocaleString()} filas)
                </option>
              ))}
            </select>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', paddingBottom: 2 }}>
            <input type="checkbox" checked={useClean}
              onChange={(e) => setUseClean(e.target.checked)}
              style={{ accentColor: '#6366f1' }} />
            Usar datos limpios si disponibles
          </label>
        </div>

        {dsA && dsB && dsA.id === dsB.id && (
          <p style={{ marginTop: 10, fontSize: 13, color: '#dc2626' }}>
            Selecciona dos datasets distintos.
          </p>
        )}
      </div>

      {!result && dsA && dsB && (
        <div className={styles.card}>
          <EmptyState message="Selecciona dos datasets distintos para iniciar la comparación." />
        </div>
      )}

      {result && (
        <>
          {/* Advertencias */}
          {result.warnings.map((w, i) => (
            <div key={i} style={{ padding: '10px 16px', background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a', fontSize: 13, color: '#92400e' }}>
              ℹ️ {w}
            </div>
          ))}

          {/* KPIs lado a lado */}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>KPIs comparados</h2>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Métrica</th>
                    <th style={{ color: CHART_PALETTE.primary }}>{result.datasetAName.replace('.csv','').slice(0,20)}</th>
                    <th style={{ color: CHART_PALETTE.success }}>{result.datasetBName.replace('.csv','').slice(0,20)}</th>
                    <th>Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {result.kpiDiffs.map((k) => (
                    <tr key={k.label}>
                      <td style={{ fontWeight: 600 }}>{k.label}</td>
                      <td>{String(k.valueA)}</td>
                      <td>{String(k.valueB)}</td>
                      <td>
                        {k.diffPct !== null ? (
                          <span style={{
                            fontWeight: 700,
                            color: k.direction === 'up' ? '#16a34a' : k.direction === 'down' ? '#dc2626' : '#6b7280',
                          }}>
                            {k.direction === 'up' ? '↑' : k.direction === 'down' ? '↓' : '→'}{' '}
                            {k.direction !== 'flat' ? `${k.diffPct > 0 ? '+' : ''}${k.diffPct.toFixed(1)}%` : 'sin cambio'}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Gráfico 1: Barras agrupadas top productos comunes */}
          {barData.length > 0 && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Ventas por producto — A vs B</h2>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: '-8px 0 12px' }}>
                Top 10 productos comunes en ambos datasets
              </p>
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 4, right: 16, bottom: 24, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtNum(v)} />
                    <Tooltip formatter={(v, name) => [formatTooltipValue(Number(v)), name]} />
                    <Legend />
                    <Bar dataKey={keyA} fill={CHART_PALETTE.primary} radius={[4, 4, 0, 0]} />
                    <Bar dataKey={keyB} fill={CHART_PALETTE.success} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Gráfico 2 y 3: Ganadores y perdedores */}
          {(gainersData.length > 0 || losersData.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
              {gainersData.length > 0 && (
                <div className={styles.card}>
                  <h2 className={styles.cardTitle}>Mayores crecimientos ↑</h2>
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: '-8px 0 12px' }}>
                    Productos con mayor aumento de A a B
                  </p>
                  <div style={{ height: 240 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={gainersData} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `+${v}%`} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                        <Tooltip formatter={(v) => [`+${v}%`, 'Crecimiento']} />
                        <Bar dataKey="cambio" radius={[0, 6, 6, 0]} fill={CHART_PALETTE.success} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {losersData.length > 0 && (
                <div className={styles.card}>
                  <h2 className={styles.cardTitle}>Mayores caídas ↓</h2>
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: '-8px 0 12px' }}>
                    Productos con mayor reducción de A a B
                  </p>
                  <div style={{ height: 240 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={losersData} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                        <Tooltip formatter={(v) => [`${v}%`, 'Caída']} />
                        <Bar dataKey="cambio" radius={[0, 6, 6, 0]} fill={CHART_PALETTE.danger ?? '#ef4444'} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tabla de comparación completa */}
          {result.categoryComparisons.length > 0 && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Comparación detallada por producto/categoría</h2>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Dataset A</th>
                      <th>Participación A</th>
                      <th>Dataset B</th>
                      <th>Participación B</th>
                      <th>Variación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.categoryComparisons.map((c) => (
                      <tr key={c.name}>
                        <td style={{ fontWeight: 600 }}>
                          {c.onlyInA && <span style={{ fontSize: 10, background: '#dbeafe', color: '#1d4ed8', borderRadius: 4, padding: '1px 5px', marginRight: 4 }}>solo A</span>}
                          {c.onlyInB && <span style={{ fontSize: 10, background: '#dcfce7', color: '#15803d', borderRadius: 4, padding: '1px 5px', marginRight: 4 }}>solo B</span>}
                          {c.name}
                        </td>
                        <td>{c.totalA > 0 ? formatTooltipValue(c.totalA) : '—'}</td>
                        <td style={{ color: '#6b7280' }}>{c.totalA > 0 ? `${c.shareA.toFixed(1)}%` : '—'}</td>
                        <td>{c.totalB > 0 ? formatTooltipValue(c.totalB) : '—'}</td>
                        <td style={{ color: '#6b7280' }}>{c.totalB > 0 ? `${c.shareB.toFixed(1)}%` : '—'}</td>
                        <td>
                          {!c.onlyInA && !c.onlyInB ? (
                            <span style={{
                              fontWeight: 700,
                              color: c.direction === 'up' ? '#16a34a' : c.direction === 'down' ? '#dc2626' : '#6b7280',
                            }}>
                              {c.direction === 'up' ? '↑' : c.direction === 'down' ? '↓' : '→'}{' '}
                              {c.diffPct > 0 ? '+' : ''}{c.diffPct.toFixed(1)}%
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Insights automáticos */}
          {result.insights.length > 0 && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Insights de la comparación</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {displayedInsights.map((insight) => (
                  <InsightCard
                    key={insight.id}
                    insight={insight}
                    expanded={expandedInsights.has(insight.id)}
                    onToggle={() => toggleInsight(insight.id)}
                  />
                ))}
              </div>
              {result.insights.length > 4 && (
                <button
                  className={styles.btnOutline}
                  onClick={() => setShowAllInsights((p) => !p)}
                  style={{ marginTop: 12, alignSelf: 'flex-start' }}
                >
                  {showAllInsights ? 'Ver menos' : `Ver todos (${result.insights.length - 4} más)`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Módulo principal de Ventas ───────────────────────────────────────────────

type SalesTab = 'analisis' | 'insights' | 'comparacion' | 'personalizado';

export default function Sales() {
  const { getAuthorizedDatasets } = useDatasetContext();
  const { authorizedDatasetIds } = useAuth();
  const datasets = useMemo(
    () => getAuthorizedDatasets(authorizedDatasetIds),
    [getAuthorizedDatasets, authorizedDatasetIds],
  );
  const [selectedId, setSelectedId] = useState('');
  const [tab, setTab] = useState<SalesTab>('analisis');
  const [filters, setFilters] = useState<AnalysisFilters>({ useCleanRows: true });
  const [categoryFilter, setCategoryFilter] = useState('');
  const [expandedInsights, setExpandedInsights] = useState<Set<string>>(new Set());
  const [showAllInsights, setShowAllInsights] = useState(false);

  const selectedDataset = datasets.find((d) => d.id === selectedId) ?? null;

  // Recalcular análisis cuando cambie dataset, filtros o datos
  const analysis = useMemo(() => {
    if (!selectedDataset) return null;
    return analyzeDataset(selectedDataset, {
      ...filters,
      categoryFilter: categoryFilter || undefined,
    });
  }, [selectedDataset, filters, categoryFilter]);

  // Categorías únicas para el filtro
  const categoryOptions = useMemo(() => {
    if (!selectedDataset || !analysis?.detectedColumns.category) return [];
    const col = analysis.detectedColumns.category;
    const vals = new Set(selectedDataset.rows.map((r) => String(r[col] ?? '').trim()).filter(Boolean));
    return [...vals].sort().slice(0, 50);
  }, [selectedDataset, analysis]);

  const toggleInsight = (id: string) => {
    setExpandedInsights((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const displayedInsights = showAllInsights
    ? (analysis?.insights ?? [])
    : (analysis?.insights ?? []).slice(0, 5);

  const usingCleanData = selectedDataset?.isCleaned && filters.useCleanRows;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Ventas</h1>
          <p className={styles.pageDesc}>
            Análisis automático de ventas: KPIs, tendencias, comparaciones, insights y sugerencias.
          </p>
        </div>
      </div>

      {/* Selector de dataset + filtros */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Configurar análisis</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>DATASET</label>
            <select className={styles.select} value={selectedId}
              onChange={(e) => { setSelectedId(e.target.value); setCategoryFilter(''); }}>
              <option value="">— Selecciona un dataset —</option>
              {datasets.map((ds) => (
                <option key={ds.id} value={ds.id}>
                  {ds.name} ({ds.rowCount.toLocaleString()} filas){ds.isCleaned ? ' ✓ limpio' : ''}
                </option>
              ))}
            </select>
          </div>

          {categoryOptions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>FILTRAR CATEGORÍA</label>
              <select className={styles.select} value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="">— Todas —</option>
                {categoryOptions.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          )}

          {selectedDataset?.isCleaned && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={filters.useCleanRows !== false}
                onChange={(e) => setFilters((f) => ({ ...f, useCleanRows: e.target.checked }))}
                style={{ accentColor: '#6366f1' }}
              />
              Usar datos limpios
            </label>
          )}
        </div>

        {usingCleanData && (
          <div style={{ marginTop: 12, padding: '8px 14px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', fontSize: 12, color: '#15803d' }}>
            ✓ Analizando datos limpios de <strong>{selectedDataset?.name}</strong>
          </div>
        )}
      </div>

      {!selectedDataset && (
        <div className={styles.card}>
          <EmptyState message="Selecciona un dataset para iniciar el análisis de ventas." />
        </div>
      )}

      {selectedDataset && !analysis?.detectedColumns.monetary && (
        <div className={styles.card} style={{ borderLeft: '3px solid #f59e0b' }}>
          <p style={{ margin: 0, fontSize: 14, color: '#92400e' }}>
            ⚠️ No se identificó una columna compatible con ventas/montos en este dataset.
            Columnas esperadas: <code>monto</code>, <code>total</code>, <code>precio</code>, <code>importe</code>, <code>amount</code>, etc.
          </p>
        </div>
      )}

      {/* Advertencias del motor */}
      {analysis?.warnings.filter((w) => !w.includes('monetaria')).map((w, i) => (
        <div key={i} style={{ padding: '10px 16px', background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a', fontSize: 13, color: '#92400e' }}>
          ℹ️ {w}
        </div>
      ))}

      {/* Tabs */}
      {selectedDataset && analysis?.detectedColumns.monetary && (
        <>
          <div className={styles.tabs}>
            {(['analisis', 'insights', 'comparacion', 'personalizado'] as SalesTab[]).map((t) => (
              <button key={t} className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`} onClick={() => setTab(t)}>
                {t === 'analisis' ? 'Análisis'
                  : t === 'insights' ? `Insights (${analysis.insights.length})`
                  : t === 'comparacion' ? 'Comparación'
                  : 'Análisis personalizado'}
              </button>
            ))}
          </div>

          {/* ── TAB ANÁLISIS ── */}
          {tab === 'analisis' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* KPIs */}
              {analysis.metrics && (
                <div className={styles.statsGrid}>
                  {[
                    {
                      label: 'Total de ventas',
                      value: `${analysis.metrics.currency} ${fmtNum(analysis.metrics.totalAmount)}`,
                      detail: `${analysis.metrics.transactionCount.toLocaleString()} transacciones`,
                      color: CHART_PALETTE.primary,
                    },
                    {
                      label: 'Unidades vendidas',
                      value: analysis.metrics.totalUnits > 0 ? analysis.metrics.totalUnits.toLocaleString() : '—',
                      detail: analysis.metrics.totalUnits > 0 ? 'unidades totales' : 'Sin columna de cantidad',
                      color: CHART_PALETTE.success,
                    },
                    {
                      label: 'Ticket promedio',
                      value: `${analysis.metrics.currency} ${fmtNum(analysis.metrics.avgTicket)}`,
                      detail: 'por transacción',
                      color: CHART_PALETTE.purple,
                    },
                    {
                      label: 'Producto destacado',
                      value: analysis.metrics.topProduct ?? '—',
                      detail: analysis.metrics.topCategory ? `Categoría: ${analysis.metrics.topCategory}` : 'Mayor volumen de ventas',
                      color: CHART_PALETTE.warning,
                    },
                  ].map((k) => (
                    <div key={k.label} className={styles.statCard}>
                      <div className={styles.statBody}>
                        <p className={styles.statLabel}>{k.label}</p>
                        <p className={styles.statValue} style={{ fontSize: k.value.length > 12 ? 16 : 20, color: k.color }}>
                          {k.value}
                        </p>
                        <p className={styles.statChange}>{k.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Comparación del último período */}
              {analysis.periodComparisons.length > 0 && (() => {
                const comp = analysis.periodComparisons[0];
                const color = directionColor(comp.direction);
                return (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
                    borderRadius: 10, background: comp.direction === 'up' ? '#f0fdf4' : comp.direction === 'down' ? '#fef2f2' : '#f9fafb',
                    border: `1px solid ${comp.direction === 'up' ? '#bbf7d0' : comp.direction === 'down' ? '#fecaca' : '#e5e7eb'}`,
                  }}>
                    <span style={{ fontSize: 28 }}>{comp.direction === 'up' ? '↑' : comp.direction === 'down' ? '↓' : '→'}</span>
                    <div>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111827' }}>
                        {comp.periodB}: <span style={{ color }}>{comp.direction !== 'flat' ? (comp.changePct > 0 ? '+' : '') + comp.changePct.toFixed(1) + '%' : 'sin cambio'}</span> vs {comp.periodA}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>
                        {comp.periodA}: {fmtNum(comp.totalA)} → {comp.periodB}: {fmtNum(comp.totalB)} (Δ {fmtNum(comp.change)})
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* Gráfico 1: Evolución temporal (línea) */}
              {analysis.trends.length >= 3 && (
                <div className={styles.card}>
                  <h2 className={styles.cardTitle}>Evolución de ventas</h2>
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: '-8px 0 12px' }}>
                    ¿Cómo evolucionan las ventas en el tiempo?
                  </p>
                  <div style={{ height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={analysis.trends} margin={{ top: 4, right: 16, bottom: 20, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false}
                          tickFormatter={(v) => fmtNum(v)} />
                        <Tooltip
                          formatter={(v, name) => [
                            formatTooltipValue(Number(v), analysis.metrics?.currency),
                            name === 'value' ? 'Ventas' : 'Media móvil',
                          ]}
                        />
                        <Legend formatter={(v) => v === 'value' ? 'Ventas' : 'Media móvil (3 períodos)'} />
                        <Line type="monotone" dataKey="value" name="value"
                          stroke={CHART_PALETTE.primary} strokeWidth={2.5}
                          dot={{ r: 3, fill: CHART_PALETTE.primary }} activeDot={{ r: 5 }} />
                        {analysis.trends.some((t) => t.movingAvg !== undefined) && (
                          <Line type="monotone" dataKey="movingAvg" name="movingAvg"
                            stroke={CHART_PALETTE.gray} strokeWidth={1.5} strokeDasharray="5 3"
                            dot={false} />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Gráfico 2 + 3: Top productos y Ventas por categoría */}
              {analysis.categoryBreakdown.length > 0 && (() => {
                const top10 = analysis.categoryBreakdown.slice(0, 10);
                const top6Pie = analysis.categoryBreakdown.slice(0, 6);
                const otherTotal = analysis.categoryBreakdown.slice(6).reduce((acc, c) => acc + c.total, 0);
                const pieData = otherTotal > 0
                  ? [...top6Pie, { name: 'Otros', total: otherTotal, units: 0, share: 0, count: 0 }]
                  : top6Pie;

                const hasTwoCategoryLevels = analysis.detectedColumns.product &&
                  analysis.detectedColumns.category &&
                  analysis.detectedColumns.product !== analysis.detectedColumns.category;

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
                    {/* Barras: Top productos */}
                    <div className={styles.card}>
                      <h2 className={styles.cardTitle}>
                        Top {top10.length} — {analysis.detectedColumns.product ?? analysis.detectedColumns.category}
                      </h2>
                      <p style={{ fontSize: 12, color: '#9ca3af', margin: '-8px 0 12px' }}>
                        ¿Cuáles generan más ventas?
                      </p>
                      <div style={{ height: 280 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={top10} layout="vertical"
                            margin={{ top: 4, right: 40, bottom: 4, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtNum(v)} />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }}
                              width={90} tickFormatter={(v) => String(v).slice(0, 12)} />
                            <Tooltip
                              formatter={(v) => [formatTooltipValue(Number(v), analysis.metrics?.currency), 'Ventas']}
                            />
                            <Bar dataKey="total" name="Ventas" radius={[0, 6, 6, 0]}>
                              {top10.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Pie: distribución por categoría (solo si hay columna categórica distinta) */}
                    {hasTwoCategoryLevels && (
                      <div className={styles.card}>
                        <h2 className={styles.cardTitle}>Ventas por categoría</h2>
                        <p style={{ fontSize: 12, color: '#9ca3af', margin: '-8px 0 12px' }}>
                          ¿Qué proporción representa cada categoría?
                        </p>
                        <div style={{ height: 280 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={pieData} dataKey="total" nameKey="name"
                                cx="50%" cy="48%" outerRadius={100} innerRadius={40} paddingAngle={3}>
                                {pieData.map((_, i) => (
                                  <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} stroke="none" />
                                ))}
                              </Pie>
                              <Tooltip formatter={(v) => [formatTooltipValue(Number(v), analysis.metrics?.currency), 'Ventas']} />
                              <Legend iconType="circle" iconSize={10}
                                formatter={(v) => <span style={{ color: '#374151', fontSize: 12 }}>{String(v).slice(0, 18)}</span>} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* No hay gráficos temporales ni de categoría */}
              {analysis.trends.length < 3 && analysis.categoryBreakdown.length === 0 && (
                <div className={styles.card}>
                  <EmptyState message="No hay suficientes datos para generar gráficos. Verifica que el dataset tenga columnas de fecha y/o categoría." />
                </div>
              )}
            </div>
          )}

          {/* ── TAB INSIGHTS ── */}
          {tab === 'insights' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {analysis.insights.length === 0 ? (
                <div className={styles.card}>
                  <EmptyState message="No se encontraron insights con los datos actuales. Verifica las columnas detectadas." />
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {displayedInsights.map((insight) => (
                      <InsightCard
                        key={insight.id}
                        insight={insight}
                        expanded={expandedInsights.has(insight.id)}
                        onToggle={() => toggleInsight(insight.id)}
                      />
                    ))}
                  </div>

                  {analysis.insights.length > 5 && (
                    <button
                      className={styles.btnOutline}
                      onClick={() => setShowAllInsights((p) => !p)}
                      style={{ alignSelf: 'flex-start' }}
                    >
                      {showAllInsights
                        ? 'Ver menos'
                        : `Ver todos (${analysis.insights.length - 5} más)`}
                    </button>
                  )}

                  {/* Problemas detectados */}
                  {analysis.anomalies.length > 0 && (
                    <div className={styles.card}>
                      <h2 className={styles.cardTitle}>Anomalías detectadas</h2>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {analysis.anomalies.map((a, i) => (
                          <div key={i} style={{
                            display: 'flex', gap: 12, padding: '10px 14px', borderRadius: 8,
                            background: a.severity === 'high' ? '#fef2f2' : a.severity === 'medium' ? '#fff7ed' : '#fffbeb',
                            border: `1px solid ${a.severity === 'high' ? '#fecaca' : '#fed7aa'}`,
                          }}>
                            <span style={{ fontSize: 18, flexShrink: 0 }}>
                              {a.type === 'spike' ? '📈' : a.type === 'drop' ? '📉' : '⚠️'}
                            </span>
                            <div>
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111827' }}>
                                {a.type === 'spike' ? 'Pico inusual' : a.type === 'drop' ? 'Caída inusual' : 'Valor atípico'} — {a.label}
                              </p>
                              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>
                                Valor: {fmtNum(a.value)} | Rango esperado: [{fmtNum(a.expectedRange[0])} – {fmtNum(a.expectedRange[1])}]
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── TAB ANÁLISIS PERSONALIZADO ── */}
          {tab === 'personalizado' && <CustomAnalysis dataset={selectedDataset} />}
        </>
      )}
    </div>
  );
}
