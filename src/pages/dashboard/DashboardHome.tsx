/**
 * DashboardHome.tsx
 *
 * Dashboard principal con KPIs reales según el rol del usuario.
 *
 * Administrador ve: datasets cargados, registros analizados, calidad promedio, analistas.
 * Analista ve: datasets autorizados, registros disponibles, módulos activos.
 *
 * No muestra valores fijos ("—") para métricas que existen realmente.
 */

import { useMemo } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import { useDatasetContext } from '../../context/DatasetContext';
import { isMissing } from '../../engine/metricsCalculator';
import styles from './Dashboard.module.css';

export default function DashboardHome() {
  const { profile, isAdmin, authorizedDatasetIds } = useAuth();
  const { datasets, getAuthorizedDatasets } = useDatasetContext();

  const displayName = profile?.displayName ?? profile?.email?.split('@')[0] ?? 'Usuario';

  // Datasets visibles para este usuario
  const visibleDatasets = useMemo(
    () => getAuthorizedDatasets(authorizedDatasetIds),
    [getAuthorizedDatasets, authorizedDatasetIds]
  );

  // Métricas reales
  const totalRows = visibleDatasets.reduce((acc, d) => acc + d.rowCount, 0);
  const cleanedCount = visibleDatasets.filter((d) => d.isCleaned).length;

  // Calidad promedio: porcentaje de filas sin valores faltantes en columnas monetarias
  const avgQuality = useMemo(() => {
    const datasetsWithQuality = visibleDatasets.filter((d) => d.columnInfo.length > 0);
    if (datasetsWithQuality.length === 0) return null;

    const qualities = datasetsWithQuality.map((ds) => {
      const monetaryCol = ds.columnInfo.find((c) => c.type === 'monetary');
      if (!monetaryCol) return null;
      const rows = (ds.cleanRows ?? ds.rows);
      const missing = rows.filter((r) => isMissing(r[monetaryCol.name])).length;
      return rows.length > 0 ? ((rows.length - missing) / rows.length) * 100 : 100;
    }).filter((q): q is number => q !== null);

    if (qualities.length === 0) return null;
    return qualities.reduce((a, b) => a + b, 0) / qualities.length;
  }, [visibleDatasets]);

  // Módulos autorizados del analista
  const authorizedModules = profile?.role === 'analyst'
    ? profile.permissions.modules
    : null;

  const adminStats = [
    {
      label: 'Datasets cargados',
      value: datasets.length.toString(),
      detail: datasets.length === 0 ? 'Ve a Datasets para cargar CSV' : `${cleanedCount} con datos limpios`,
      icon: dbIcon,
      link: '/dashboard/datasets',
    },
    {
      label: 'Registros analizados',
      value: totalRows > 0 ? totalRows.toLocaleString() : '—',
      detail: totalRows > 0 ? `${visibleDatasets.length} dataset(s)` : 'Sin datos cargados',
      icon: tableIcon,
      link: '/dashboard/ventas',
    },
    {
      label: 'Calidad de datos',
      value: avgQuality !== null ? `${avgQuality.toFixed(0)}%` : '—',
      detail: avgQuality !== null
        ? (avgQuality >= 90 ? 'Buena calidad' : avgQuality >= 70 ? 'Calidad regular' : 'Baja calidad — revisar')
        : 'Carga un dataset para ver',
      icon: checkIcon,
      color: avgQuality !== null ? (avgQuality >= 90 ? '#10b981' : avgQuality >= 70 ? '#f59e0b' : '#ef4444') : undefined,
      link: '/dashboard/limpieza',
    },
    {
      label: 'Módulo de limpieza',
      value: cleanedCount > 0 ? `${cleanedCount}` : '—',
      detail: cleanedCount > 0 ? `dataset(s) limpio(s)` : 'Sin limpiezas ejecutadas',
      icon: filterIcon,
      link: '/dashboard/limpieza',
    },
  ];

  const analystStats = [
    {
      label: 'Datasets disponibles',
      value: visibleDatasets.length.toString(),
      detail: visibleDatasets.length === 0 ? 'Sin datasets asignados' : `${visibleDatasets.map((d) => d.name).slice(0, 2).join(', ')}${visibleDatasets.length > 2 ? '...' : ''}`,
      icon: dbIcon,
      link: null,
    },
    {
      label: 'Registros autorizados',
      value: totalRows > 0 ? totalRows.toLocaleString() : '—',
      detail: totalRows > 0 ? 'registros disponibles' : 'Sin datos disponibles',
      icon: tableIcon,
      link: '/dashboard/ventas',
    },
    {
      label: 'Módulos activos',
      value: authorizedModules?.length.toString() ?? '—',
      detail: authorizedModules ? authorizedModules.join(', ') : '—',
      icon: moduleIcon,
      link: null,
    },
    {
      label: 'Calidad de datos',
      value: avgQuality !== null ? `${avgQuality.toFixed(0)}%` : '—',
      detail: avgQuality !== null
        ? (avgQuality >= 90 ? 'Buena calidad' : avgQuality >= 70 ? 'Calidad regular' : 'Datos con problemas')
        : 'Sin datos disponibles',
      icon: checkIcon,
      color: avgQuality !== null ? (avgQuality >= 90 ? '#10b981' : avgQuality >= 70 ? '#f59e0b' : '#ef4444') : undefined,
      link: null,
    },
  ];

  const stats = isAdmin ? adminStats : analystStats;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>
            Bienvenido, {displayName}
          </h1>
          <p className={styles.pageDesc}>
            {isAdmin ? 'Panel de Administrador — acceso completo al sistema.' : 'Panel de Analista — acceso a los módulos y datos autorizados.'}
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className={styles.statsGrid}>
        {stats.map((card) => (
          <div key={card.label} className={styles.statCard}>
            <div className={styles.statIcon}>{card.icon}</div>
            <div className={styles.statBody}>
              <p className={styles.statLabel}>{card.label}</p>
              <p className={styles.statValue} style={card.color ? { color: card.color } : {}}>
                {card.value}
              </p>
              <p className={styles.statChange}>{card.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Accesos rápidos para admin */}
      {isAdmin && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Accesos rápidos</h2>
          <div className={styles.quickGrid}>
            {[
              { to: '/dashboard/datasets',      label: 'Cargar CSV',        icon: uploadIcon },
              { to: '/dashboard/limpieza',       label: 'Limpiar datos',     icon: filterIcon },
              { to: '/dashboard/ventas',         label: 'Analizar ventas',   icon: chartIcon },
              { to: '/dashboard/administracion', label: 'Crear analista',    icon: userIcon },
            ].map((q) => (
              <Link key={q.to} to={q.to} className={styles.quickCard}>
                {q.icon}
                {q.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Datasets recientes para admin */}
      {isAdmin && datasets.length > 0 && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Datasets cargados</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {datasets.slice(0, 5).map((ds) => (
              <div key={ds.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', borderRadius: 8, background: '#f9fafb',
                border: '1px solid #e5e7eb',
              }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{ds.name}</span>
                  <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 10 }}>
                    {ds.rowCount.toLocaleString()} filas · {ds.columns.length} columnas
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {ds.isCleaned && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#dcfce7', color: '#15803d', fontWeight: 600 }}>
                      limpio
                    </span>
                  )}
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#f0f2f5', color: '#374151', fontWeight: 600 }}>
                    CSV
                  </span>
                </div>
              </div>
            ))}
            {datasets.length > 5 && (
              <Link to="/dashboard/datasets" style={{ fontSize: 13, color: '#6366f1', textDecoration: 'none', padding: '4px 0' }}>
                Ver todos ({datasets.length}) →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Estado vacío para analista sin datos */}
      {!isAdmin && visibleDatasets.length === 0 && (
        <div className={styles.card}>
          <div className={styles.empty}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} style={{ width: 48, height: 48, margin: '0 auto 12px', display: 'block', color: '#d1d5db' }}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" />
            </svg>
            <p className={styles.emptyText}>
              No tienes datasets asignados todavía. Contacta al Administrador para que te asigne acceso.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Iconos ───────────────────────────────────────────────────────────────────

const dbIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" />
  </svg>
);

const tableIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25" />
  </svg>
);

const checkIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const filterIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
  </svg>
);

const moduleIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
  </svg>
);

const uploadIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 18, height: 18 }}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </svg>
);

const chartIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 18, height: 18 }}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
  </svg>
);

const userIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 18, height: 18 }}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
  </svg>
);
