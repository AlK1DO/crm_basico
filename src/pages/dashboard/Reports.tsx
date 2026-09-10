/**
 * Reports.tsx
 *
 * Módulo de Reportes refactorizado.
 * Consolida resultados del motor analítico sin duplicar cálculos de Ventas.
 * Muestra: Dataset, fecha, calidad, KPIs, comparaciones, gráfico principal, insights.
 * No inventa datos — si no hay información suficiente lo indica.
 */

import { useState, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useDatasetContext } from '../../context/DatasetContext';
import { useAuth } from '../../hooks/useAuth';
import { analyzeDataset } from '../../engine/analysisEngine';
import { CATEGORY_COLORS, CHART_PALETTE, formatTooltipValue } from '../../engine/chartSelector';
import { fmtNum } from '../../engine/insightEngine';
import type { AnalysisResult, InsightPriority } from '../../types';
import styles from './Dashboard.module.css';

const PRIORITY_CONFIG: Record<InsightPriority, { label: string; color: string }> = {
  critical:    { label: 'Crítico',     color: '#dc2626' },
  important:   { label: 'Importante',  color: '#d97706' },
  opportunity: { label: 'Oportunidad', color: '#16a34a' },
  informative: { label: 'Informativo', color: '#2563eb' },
};

// ─── Vista de reporte generado ────────────────────────────────────────────────

function ReportView({ analysis, datasetName, isCleaned }: {
  analysis: AnalysisResult;
  datasetName: string;
  isCleaned: boolean;
}) {
  const { metrics, categoryBreakdown, trends, periodComparisons, insights } = analysis;
  const top8 = categoryBreakdown.slice(0, 8);
  const top5Pie = categoryBreakdown.slice(0, 5);
  const otherPie = categoryBreakdown.slice(5).reduce((acc, c) => acc + c.total, 0);
  const pieData = otherPie > 0
    ? [...top5Pie, { name: 'Otros', total: otherPie, units: 0, share: 0, count: 0 }]
    : top5Pie;

  const currency = metrics?.currency ?? '';
  const genDate = analysis.generatedAt.toLocaleDateString('es-PE', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Encabezado del reporte */}
      <div style={{
        padding: '20px 24px', background: '#111827', borderRadius: 12, color: '#fff',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <p style={{ margin: 0, fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Reporte analítico
          </p>
          <h2 style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 700 }}>{datasetName}</h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#9ca3af' }}>Generado: {genDate}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontSize: 13, color: isCleaned ? '#6ee7b7' : '#fcd34d', fontWeight: 600 }}>
            {isCleaned ? '✓ Datos limpios' : '⚠ Datos originales'}
          </p>
          {analysis.warnings.length > 0 && (
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#fca5a5' }}>
              {analysis.warnings.length} advertencia(s) de calidad
            </p>
          )}
        </div>
      </div>

      {/* Advertencias */}
      {analysis.warnings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {analysis.warnings.map((w, i) => (
            <div key={i} style={{
              padding: '8px 14px', background: '#fffbeb', borderRadius: 8,
              border: '1px solid #fde68a', fontSize: 13, color: '#92400e',
            }}>
              ℹ️ {w}
            </div>
          ))}
        </div>
      )}

      {/* KPIs principales */}
      {metrics && (
        <>
          <div className={styles.statsGrid}>
            {[
              {
                label: 'Total de ventas',
                value: `${currency} ${fmtNum(metrics.totalAmount)}`,
                color: CHART_PALETTE.primary,
              },
              {
                label: 'Transacciones',
                value: metrics.transactionCount.toLocaleString(),
                color: CHART_PALETTE.dark,
              },
              {
                label: 'Ticket promedio',
                value: `${currency} ${fmtNum(metrics.avgTicket)}`,
                color: CHART_PALETTE.purple,
              },
              {
                label: 'Unidades vendidas',
                value: metrics.totalUnits > 0 ? metrics.totalUnits.toLocaleString() : '—',
                color: CHART_PALETTE.success,
              },
            ].map((k) => (
              <div key={k.label} className={styles.statCard}>
                <div className={styles.statBody}>
                  <p className={styles.statLabel}>{k.label}</p>
                  <p className={styles.statValue} style={{ fontSize: 20, color: k.color }}>{k.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Producto y categoría top */}
          {(metrics.topProduct || metrics.topCategory) && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {metrics.topProduct && (
                <div style={{
                  flex: 1, minWidth: 200, padding: '14px 18px', borderRadius: 10,
                  background: '#eff6ff', border: '1px solid #bfdbfe',
                }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase' }}>
                    Producto destacado
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 700, color: '#111827' }}>
                    {metrics.topProduct}
                  </p>
                </div>
              )}
              {metrics.topCategory && metrics.topCategory !== metrics.topProduct && (
                <div style={{
                  flex: 1, minWidth: 200, padding: '14px 18px', borderRadius: 10,
                  background: '#f5f3ff', border: '1px solid #e9d5ff',
                }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>
                    Categoría destacada
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 700, color: '#111827' }}>
                    {metrics.topCategory}
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Comparaciones de período */}
      {periodComparisons.length > 0 && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Comparaciones de período</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {periodComparisons.map((comp, i) => {
              const isUp = comp.direction === 'up';
              const isDown = comp.direction === 'down';
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
                  borderRadius: 8,
                  background: isUp ? '#f0fdf4' : isDown ? '#fef2f2' : '#f9fafb',
                  border: `1px solid ${isUp ? '#bbf7d0' : isDown ? '#fecaca' : '#e5e7eb'}`,
                }}>
                  <span style={{ fontSize: 20 }}>
                    {isUp ? '↑' : isDown ? '↓' : '→'}
                  </span>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111827' }}>
                      {comp.periodA} → {comp.periodB}:
                      {' '}
                      <span style={{ color: isUp ? '#16a34a' : isDown ? '#dc2626' : '#6b7280' }}>
                        {comp.changePct > 0 ? '+' : ''}{comp.changePct.toFixed(1)}%
                      </span>
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>
                      {fmtNum(comp.totalA)} → {fmtNum(comp.totalB)} (Δ {fmtNum(comp.change)})
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Gráfico principal: tendencia o barras según disponibilidad */}
      {trends.length >= 3 ? (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Evolución de ventas en el período</h2>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trends} margin={{ top: 4, right: 16, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => fmtNum(v)} />
                <Tooltip formatter={(v) => [formatTooltipValue(Number(v), currency), 'Ventas']} />
                <Legend formatter={() => 'Ventas por período'} />
                <Line type="monotone" dataKey="value" name="value"
                  stroke={CHART_PALETTE.primary} strokeWidth={2.5}
                  dot={{ r: 3, fill: CHART_PALETTE.primary }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : top8.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          {/* Barras top categorías */}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Top categorías / productos</h2>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top8} margin={{ top: 4, right: 12, bottom: 24, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }}
                    tickFormatter={(v) => String(v).slice(0, 10)} interval={0} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => fmtNum(v)} />
                  <Tooltip formatter={(v) => [formatTooltipValue(Number(v), currency), 'Ventas']} />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                    {top8.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Pie distribución */}
          {pieData.length > 1 && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Distribución de ventas</h2>
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="total" nameKey="name"
                      cx="50%" cy="48%" outerRadius={95} innerRadius={36} paddingAngle={3}>
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => [formatTooltipValue(Number(v), currency), 'Ventas']} />
                    <Legend iconType="circle" iconSize={10}
                      formatter={(v) => <span style={{ color: '#374151', fontSize: 12 }}>{String(v).slice(0, 16)}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Tabla resumen de categorías */}
      {categoryBreakdown.length > 0 && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Resumen por {analysis.detectedColumns.category ?? 'categoría'}</h2>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Ventas</th>
                  <th>Participación</th>
                  {categoryBreakdown.some((c) => c.units > 0) && <th>Unidades</th>}
                  <th>Transacciones</th>
                </tr>
              </thead>
              <tbody>
                {categoryBreakdown.slice(0, 15).map((c, i) => (
                  <tr key={c.name}>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}>
                        <span style={{
                          width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                          background: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                        }} />
                        <strong>{c.name}</strong>
                      </span>
                    </td>
                    <td>{formatTooltipValue(c.total, currency)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 60, height: 6, borderRadius: 3, background: '#f0f2f5', overflow: 'hidden',
                        }}>
                          <div style={{
                            width: `${Math.min(c.share, 100)}%`, height: '100%',
                            background: CATEGORY_COLORS[i % CATEGORY_COLORS.length], borderRadius: 3,
                          }} />
                        </div>
                        <span>{c.share.toFixed(1)}%</span>
                      </div>
                    </td>
                    {categoryBreakdown.some((cat) => cat.units > 0) && (
                      <td>{c.units > 0 ? c.units.toLocaleString() : '—'}</td>
                    )}
                    <td style={{ color: '#6b7280' }}>{c.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {categoryBreakdown.length > 15 && (
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '12px 0 0' }}>
              Mostrando 15 de {categoryBreakdown.length} categorías
            </p>
          )}
        </div>
      )}

      {/* Insights consolidados */}
      {insights.length > 0 && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Insights del análisis</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {insights.slice(0, 6).map((insight) => {
              const cfg = PRIORITY_CONFIG[insight.priority];
              return (
                <div key={insight.id} style={{
                  padding: '12px 16px', borderRadius: 8,
                  borderLeft: `3px solid ${cfg.color}`,
                  background: '#fafafa', border: `1px solid #e5e7eb`,
                  borderLeftColor: cfg.color, borderLeftWidth: 3,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{
                      padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                      background: cfg.color, color: '#fff',
                    }}>
                      {cfg.label}
                    </span>
                    <strong style={{ fontSize: 13, color: '#111827' }}>{insight.title}</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: '#374151' }}>{insight.fact}</p>
                  {insight.suggestion && (
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>
                      → {insight.suggestion}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Página principal de Reportes ─────────────────────────────────────────────

export default function Reports() {
  const { getAuthorizedDatasets } = useDatasetContext();
  const { authorizedDatasetIds } = useAuth();
  const datasets = useMemo(
    () => getAuthorizedDatasets(authorizedDatasetIds),
    [getAuthorizedDatasets, authorizedDatasetIds],
  );
  const [selectedId, setSelectedId] = useState('');
  const [useCleanRows, setUseCleanRows] = useState(true);

  const selectedDataset = datasets.find((d) => d.id === selectedId) ?? null;

  const analysis = useMemo(() => {
    if (!selectedDataset) return null;
    return analyzeDataset(selectedDataset, { useCleanRows });
  }, [selectedDataset, useCleanRows]);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Reportes</h1>
          <p className={styles.pageDesc}>
            Consolidación de KPIs, comparaciones, gráficos e insights del dataset seleccionado.
          </p>
        </div>
      </div>

      {/* Configuración */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Configurar reporte</h2>
        {datasets.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>
              Ve a <strong>Datasets</strong> para cargar un CSV.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>DATASET</label>
              <select className={styles.select} value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}>
                <option value="">— Selecciona un dataset —</option>
                {datasets.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.name} ({ds.rowCount.toLocaleString()} filas){ds.isCleaned ? ' ✓ limpio' : ''}
                  </option>
                ))}
              </select>
            </div>
            {selectedDataset?.isCleaned && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={useCleanRows}
                  onChange={(e) => setUseCleanRows(e.target.checked)}
                  style={{ accentColor: '#6366f1' }} />
                Usar datos limpios
              </label>
            )}
          </div>
        )}
      </div>

      {/* Reporte */}
      {!selectedDataset && datasets.length > 0 && (
        <div className={styles.card}>
          <div className={styles.empty}>
            <p className={styles.emptyText}>Selecciona un dataset para generar el reporte.</p>
          </div>
        </div>
      )}

      {analysis && selectedDataset && (
        <ReportView
          analysis={analysis}
          datasetName={selectedDataset.name}
          isCleaned={selectedDataset.isCleaned && useCleanRows}
        />
      )}
    </div>
  );
}
