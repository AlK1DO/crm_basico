import { useAuth } from '../../hooks/useAuth';
import { useDatasetContext } from '../../context/DatasetContext';
import styles from './Dashboard.module.css';

export default function DashboardHome() {
  const { user } = useAuth();
  const { datasets } = useDatasetContext();
  const displayName = user?.displayName ?? user?.email?.split('@')[0] ?? 'Usuario';
  const totalRows = datasets.reduce((acc, d) => acc + d.rows.length, 0);

  const stats = [
    {
      label: 'Datasets cargados',
      value: datasets.length.toString(),
      detail: datasets.length > 0 ? `${datasets.length} archivo(s) cargado(s)` : 'Ve a Datasets para cargar',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" />
        </svg>
      ),
    },
    {
      label: 'Registros totales',
      value: totalRows > 0 ? totalRows.toLocaleString() : '—',
      detail: totalRows > 0 ? `${totalRows.toLocaleString()} registros en total` : 'Disponible al cargar un dataset',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25" />
        </svg>
      ),
    },
    {
      label: 'Reportes',
      value: '—',
      detail: 'Ve a Reportes para ver',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      ),
    },
    {
      label: 'Limpieza de datos',
      value: '—',
      detail: 'Usa el módulo de Limpieza',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Bienvenido, {displayName}</h1>
          <p className={styles.pageDesc}>Resumen general de tu plataforma</p>
        </div>
      </div>

      <div className={styles.statsGrid}>
        {stats.map((card) => (
          <div key={card.label} className={styles.statCard}>
            <div className={styles.statIcon}>{card.icon}</div>
            <div className={styles.statBody}>
              <p className={styles.statLabel}>{card.label}</p>
              <p className={styles.statValue}>{card.value}</p>
              <p className={styles.statChange}>{card.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
