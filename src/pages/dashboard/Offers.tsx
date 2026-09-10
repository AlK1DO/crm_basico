/**
 * Offers.tsx
 *
 * Módulo de análisis de ofertas/promociones refactorizado.
 * - Detecta automáticamente columnas de oferta y descuento.
 * - Analiza ventas con oferta vs sin oferta.
 * - Muestra insights reales, no inventados.
 * - Si no hay datos de ofertas, lo indica claramente.
 * - Usa datos limpios si están disponibles.
 */

import { useState, useMemo } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ZAxis,
} from 'recharts';
import { useDatasetContext } from '../../context/DatasetContext';
import { useAuth } from '../../hooks/useAuth';
import { analyzeOffers } from '../../engine/offerAnalyzer';
import { analyzeDataset } from '../../engine/analysisEngine';
import { CATEGORY_COLORS, CHART_PALETTE, formatTooltipValue } from '../../engine/chartSelector';
import { fmtNum } from '../../engine/insightEngine';
import type { Insight, InsightPriority } from '../../types';
import styles from './Dashboard.module.css';

const PRIORITY_CONFIG: Record<InsightPriority, { label: string; bg: string; color: string; border: string }> = {
  critical:    { label: 'Crítico',     bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  important:   { label: 'Importante',  bg: '#fff7ed', color: '#d97706', border: '#fed7aa' },
  opportunity: { label: 'Oportunidad', bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  informative: { label: 'Informativo', bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
};

function InsightCard({ insight }: { insight: Insight }) {
  const [open, setOpen] = useState(false);
  const cfg = PRIORITY_CONFIG[insight.priority];
  return (
    <div style={{ borderRadius: 10, border: `1px solid ${cfg.border}`, background: cfg.bg }}>
      <button onClick={() => setOpen((p) => !p)} style={{
        width: '100%', textAlign: 'left', padding: '12px 16px', background: 'transparent',
        border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: cfg.color, color: '#fff', whiteSpace: 'nowrap' }}>
            {cfg.label}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{insight.title}</span>
        </div>
        <span style={{ color: '#6b7280', fontSize: 16 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ margin: 0, fontSize: 13, color: '#374151' }}>{insight.fact}</p>
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}><strong>Evidencia:</strong> {insight.evidence}</p>
          {insight.problem && <p style={{ margin: 0, fontSize: 13, color: '#dc2626' }}><strong>Problema:</strong> {insight.problem}</p>}
          <p style={{ margin: 0, fontSize: 13, color: '#2563eb' }}>
            <strong>{insight.isHypothesis ? 'Hipótesis' : 'Sugerencia'}:</strong> {insight.suggestion}
          </p>
          {insight.isHypothesis && (
            <p style={{ margin: 0, fontSize: 11, color: '#9ca3af' }}>* Causa inferida, no probada con los datos.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function Offers() {
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

  const offerAnalysis = useMemo(() => {
    if (!selectedDataset) return null;
    const rows = (useCleanRows && selectedDataset.cleanRows) ? selectedDataset.cleanRows : selectedDataset.rows;
    return analyzeOffers(
      rows,
      selectedDataset.columns,
      analysis?.detectedColumns.monetary ?? null,
      analysis?.detectedColumns.product ?? null,
      analysis?.detectedColumns.category ?? null,
    );
  }, [selectedDataset, useCleanRows, analysis]);

  const usingCleanData = selectedDataset?.isCleaned && useCleanRows;

  // Pie donut: con oferta vs sin oferta
  const splitData = offerAnalysis?.hasOfferData ? [
    { name: 'Con oferta', value: offerAnalysis.withOffer.count },
    { name: 'Sin oferta', value: offerAnalysis.withoutOffer.count },
  ] : [];

  // Barras: ticket promedio con/sin oferta
  const ticketData = offerAnalysis?.hasOfferData && (offerAnalysis.withOffer.total > 0 || offerAnalysis.withoutOffer.total > 0)
    ? [
        {
          name: 'Con oferta',
          ticket: offerAnalysis.withOffer.count > 0
            ? offerAnalysis.withOffer.total / offerAnalysis.withOffer.count
            : 0,
        },
        {
          name: 'Sin oferta',
          ticket: offerAnalysis.withoutOffer.count > 0
            ? offerAnalysis.withoutOffer.total / offerAnalysis.withoutOffer.count
            : 0,
        },
      ]
    : [];

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Ofertas</h1>
          <p className={styles.pageDesc}>
            ¿Las promociones están generando mejores resultados?
          </p>
        </div>
      </div>

      {/* Selector */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Seleccionar dataset</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>DATASET</label>
            <select className={styles.select} value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">— Selecciona —</option>
              {datasets.map((ds) => (
                <option key={ds.id} value={ds.id}>
                  {ds.name}{ds.isCleaned ? ' ✓ limpio' : ''}
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

        {usingCleanData && (
          <div style={{ marginTop: 12, padding: '8px 14px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', fontSize: 12, color: '#15803d' }}>
            ✓ Analizando datos limpios
          </div>
        )}
      </div>

      {!selectedDataset && datasets.length === 0 && (
        <div className={styles.card}>
          <div className={styles.empty}>
            <p className={styles.emptyText}>Ve a <strong>Datasets</strong> para cargar un CSV.</p>
          </div>
        </div>
      )}

      {!selectedDataset && datasets.length > 0 && (
        <div className={styles.card}>
          <div className={styles.empty}>
            <p className={styles.emptyText}>Selecciona un dataset para analizar ofertas.</p>
          </div>
        </div>
      )}

      {/* Sin datos de oferta */}
      {offerAnalysis && !offerAnalysis.hasOfferData && (
        <div className={styles.card}>
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth={1} style={{ width: 48, height: 48, margin: '0 auto 12px', display: 'block' }}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
            </svg>
            {offerAnalysis.warnings.map((w, i) => (
              <p key={i} style={{ fontSize: 14, color: '#6b7280', margin: '4px 0' }}>{w}</p>
            ))}
            <p style={{ fontSize: 13, color: '#9ca3af', margin: '12px 0 0' }}>
              Columnas esperadas: <code>oferta</code>, <code>descuento</code>, <code>promo</code>, <code>en_oferta</code>, <code>discount</code>, <code>is_offer</code>
            </p>
          </div>
        </div>
      )}

      {/* Contenido con datos de oferta */}
      {offerAnalysis?.hasOfferData && (
        <>
          {/* Columnas detectadas */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {offerAnalysis.offerColumn && (
              <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, background: '#f3e8ff', color: '#7c3aed', fontWeight: 500 }}>
                Columna de oferta: <strong>{offerAnalysis.offerColumn}</strong>
              </span>
            )}
            {offerAnalysis.discountColumn && (
              <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, background: '#dbeafe', color: '#1d4ed8', fontWeight: 500 }}>
                Columna de descuento: <strong>{offerAnalysis.discountColumn}</strong>
              </span>
            )}
          </div>

          {/* KPIs */}
          <div className={styles.statsGrid}>
            {[
              {
                label: 'Transacciones con oferta',
                value: offerAnalysis.withOffer.count.toLocaleString(),
                detail: `${((offerAnalysis.withOffer.count / (offerAnalysis.withOffer.count + offerAnalysis.withoutOffer.count)) * 100).toFixed(1)}% del total`,
                color: CHART_PALETTE.success,
              },
              {
                label: 'Ventas con oferta',
                value: fmtNum(offerAnalysis.withOffer.total),
                detail: 'monto total',
                color: CHART_PALETTE.primary,
              },
              {
                label: 'Ventas sin oferta',
                value: fmtNum(offerAnalysis.withoutOffer.total),
                detail: 'monto total',
                color: CHART_PALETTE.gray,
              },
              {
                label: 'Descuento promedio',
                value: offerAnalysis.withOffer.avgDiscount > 0
                  ? `${offerAnalysis.withOffer.avgDiscount.toFixed(1)}%`
                  : '—',
                detail: offerAnalysis.discountColumn ?? 'No detectado',
                color: CHART_PALETTE.warning,
              },
            ].map((k) => (
              <div key={k.label} className={styles.statCard}>
                <div className={styles.statBody}>
                  <p className={styles.statLabel}>{k.label}</p>
                  <p className={styles.statValue} style={{ fontSize: 20, color: k.color }}>{k.value}</p>
                  <p className={styles.statChange}>{k.detail}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Gráficos */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>

            {/* Pie: distribución con/sin oferta */}
            {splitData.length > 0 && (
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>Distribución de transacciones</h2>
                <p style={{ fontSize: 12, color: '#9ca3af', margin: '-8px 0 12px' }}>
                  ¿Qué proporción de ventas incluye oferta?
                </p>
                <div style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={splitData} dataKey="value" nameKey="name"
                        cx="50%" cy="48%" outerRadius={100} innerRadius={40} paddingAngle={4}>
                        <Cell fill={CHART_PALETTE.success} stroke="none" />
                        <Cell fill={CHART_PALETTE.gray} stroke="none" />
                      </Pie>
                      <Tooltip formatter={(v) => [Number(v).toLocaleString(), 'Transacciones']} />
                      <Legend iconType="circle" iconSize={10}
                        formatter={(v) => <span style={{ color: '#374151', fontSize: 12 }}>{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Barras: ticket promedio con/sin oferta */}
            {ticketData.length > 0 && ticketData.some((d) => d.ticket > 0) && (
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>Ticket promedio</h2>
                <p style={{ fontSize: 12, color: '#9ca3af', margin: '-8px 0 12px' }}>
                  ¿Las ofertas aumentan el valor de la transacción?
                </p>
                <div style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ticketData} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false}
                        tickFormatter={(v) => fmtNum(v)} />
                      <Tooltip formatter={(v) => [formatTooltipValue(Number(v), analysis?.metrics?.currency), 'Ticket promedio']} />
                      <Bar dataKey="ticket" name="Ticket promedio" radius={[6, 6, 0, 0]}>
                        <Cell fill={CHART_PALETTE.success} />
                        <Cell fill={CHART_PALETTE.gray} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Barras: top productos en oferta */}
            {offerAnalysis.topPromotedProducts.length > 0 && (
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>Productos más vendidos con oferta</h2>
                <p style={{ fontSize: 12, color: '#9ca3af', margin: '-8px 0 12px' }}>
                  ¿Cuáles lideran las ventas en promoción?
                </p>
                <div style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={offerAnalysis.topPromotedProducts.slice(0, 8)}
                      margin={{ top: 4, right: 12, bottom: 20, left: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }}
                        tickFormatter={(v) => String(v).slice(0, 10)} interval={0} />
                      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false}
                        tickFormatter={(v) => fmtNum(v)} />
                      <Tooltip formatter={(v) => [formatTooltipValue(Number(v), analysis?.metrics?.currency), 'Ventas con oferta']} />
                      <Bar dataKey="total" name="Ventas con oferta" radius={[6, 6, 0, 0]}>
                        {offerAnalysis.topPromotedProducts.slice(0, 8).map((_, i) => (
                          <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Scatter: descuento vs cantidad */}
            {offerAnalysis.discountVsQuantity.length > 0 && (
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>Descuento vs Cantidad vendida</h2>
                <p style={{ fontSize: 12, color: '#9ca3af', margin: '-8px 0 12px' }}>
                  ¿Mayor descuento implica mayor volumen?
                </p>
                <div style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 4, right: 12, bottom: 20, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="discount" name="Descuento (%)" tick={{ fontSize: 11 }}
                        label={{ value: 'Descuento (%)', position: 'insideBottom', offset: -10, fontSize: 11 }} />
                      <YAxis dataKey="quantity" name="Cantidad" tick={{ fontSize: 11 }} />
                      <ZAxis range={[40, 40]} />
                      <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as { discount: number; quantity: number; product: string };
                          return (
                            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                              {d.product && <p style={{ margin: 0, fontWeight: 600 }}>{d.product}</p>}
                              <p style={{ margin: '2px 0 0' }}>Descuento: {d.discount}%</p>
                              <p style={{ margin: '2px 0 0' }}>Cantidad: {d.quantity}</p>
                            </div>
                          );
                        }}
                      />
                      <Scatter
                        data={offerAnalysis.discountVsQuantity}
                        fill={CHART_PALETTE.primary}
                        fillOpacity={0.6}
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* Productos con bajo rendimiento en oferta */}
          {offerAnalysis.lowPerformingOffers.length > 0 && (
            <div className={styles.card} style={{ borderLeft: `3px solid ${CHART_PALETTE.warning}` }}>
              <h2 className={styles.cardTitle}>Ofertas con bajo rendimiento</h2>
              <p style={{ fontSize: 13, color: '#6b7280', margin: '-8px 0 12px' }}>
                Productos en oferta que generan poco volumen de ventas.
              </p>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Ventas con oferta</th>
                      <th>Participación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offerAnalysis.lowPerformingOffers.map((p) => (
                      <tr key={p.name}>
                        <td><strong>{p.name}</strong></td>
                        <td>{formatTooltipValue(p.total, analysis?.metrics?.currency)}</td>
                        <td style={{ color: '#9ca3af' }}>{p.share.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Insights de oferta */}
          {offerAnalysis.insights.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>Insights de ofertas</h3>
              {offerAnalysis.insights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} />
              ))}
            </div>
          )}

          {/* Advertencias */}
          {offerAnalysis.warnings.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {offerAnalysis.warnings.map((w, i) => (
                <div key={i} style={{ padding: '8px 14px', background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a', fontSize: 13, color: '#92400e' }}>
                  ℹ️ {w}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
