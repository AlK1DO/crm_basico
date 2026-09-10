/**
 * Administration.tsx
 *
 * Módulo de administración — solo visible para el rol 'admin'.
 *
 * Tabs:
 * 1. Usuarios/Analistas: lista, edita permisos, activa/desactiva.
 * 2. Crear acceso: genera código para nuevo analista.
 * 3. Códigos: lista de códigos generados con estado.
 * 4. Auditoría: historial de eventos.
 */

import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../../hooks/useAuth';
import { useDatasetContext } from '../../context/DatasetContext';
import {
  listAnalysts, updateAnalystPermissions, setAnalystActive,
  createAccessCode, listAccessCodes, revokeAccessCode, listAuditLogs,
} from '../../firebase/firestoreService';
import type { UserProfile, UserPermissions, ModuleKey, AccessCode } from '../../types';
import type { Timestamp } from 'firebase/firestore';
import styles from './Dashboard.module.css';

// ─── Módulos disponibles ──────────────────────────────────────────────────────

const ALL_MODULES: { key: ModuleKey; label: string }[] = [
  { key: 'dashboard',      label: 'Inicio' },
  { key: 'datasets',       label: 'Datasets' },
  { key: 'limpieza',       label: 'Limpieza' },
  { key: 'ventas',         label: 'Ventas' },
  { key: 'ofertas',        label: 'Ofertas' },
  { key: 'reportes',       label: 'Reportes' },
];
// 'administracion' nunca se asigna a analistas

// ─── Tab: Lista de Analistas ──────────────────────────────────────────────────

function AnalystList() {
  const { datasets } = useDatasetContext();
  const [analysts, setAnalysts] = useState<Array<UserProfile & { uid: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState<UserPermissions>({ modules: [], datasets: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listAnalysts()
      .then(setAnalysts)
      .catch(() => toast.error('Error al cargar analistas.'))
      .finally(() => setLoading(false));
  }, []);

  const openEdit = (analyst: UserProfile & { uid: string }) => {
    setEditingUid(analyst.uid);
    setEditPerms({ ...analyst.permissions });
  };

  const toggleModule = (key: ModuleKey) => {
    setEditPerms((p) => ({
      ...p,
      modules: p.modules.includes(key) ? p.modules.filter((m) => m !== key) : [...p.modules, key],
    }));
  };

  const toggleDataset = (id: string) => {
    setEditPerms((p) => ({
      ...p,
      datasets: p.datasets.includes(id) ? p.datasets.filter((d) => d !== id) : [...p.datasets, id],
    }));
  };

  const savePermissions = async () => {
    if (!editingUid) return;
    setSaving(true);
    try {
      await updateAnalystPermissions(editingUid, editPerms);
      setAnalysts((prev) => prev.map((a) => a.uid === editingUid ? { ...a, permissions: editPerms } : a));
      toast.success('Permisos actualizados.');
      setEditingUid(null);
    } catch {
      toast.error('Error al guardar permisos.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (analyst: UserProfile & { uid: string }) => {
    const newActive = !analyst.active;
    try {
      await setAnalystActive(analyst.uid, newActive);
      setAnalysts((prev) => prev.map((a) => a.uid === analyst.uid ? { ...a, active: newActive } : a));
      toast.success(`Analista ${newActive ? 'activado' : 'desactivado'}.`);
    } catch {
      toast.error('Error al cambiar estado.');
    }
  };

  if (loading) return <div className={styles.empty}><p className={styles.emptyText}>Cargando analistas...</p></div>;

  if (analysts.length === 0) return (
    <div className={styles.empty}>
      <p className={styles.emptyText}>No hay analistas registrados todavía. Crea un código de acceso en la pestaña <strong>Crear acceso</strong>.</p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {analysts.map((analyst) => (
        <div key={analyst.uid} className={styles.card} style={{ padding: 20 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' }}>{analyst.email}</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>
                {analyst.permissions.modules.length} módulos · {analyst.permissions.datasets.length === 0 ? 'sin datasets asignados' : `${analyst.permissions.datasets.length} dataset(s)`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{
                padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                background: analyst.active ? '#dcfce7' : '#fef2f2',
                color: analyst.active ? '#15803d' : '#dc2626',
              }}>
                {analyst.active ? 'Activo' : 'Inactivo'}
              </span>
              <button className={styles.btnOutline} style={{ padding: '4px 12px', fontSize: 12 }}
                onClick={() => openEdit(analyst)}>
                Editar permisos
              </button>
              <button className={styles.btnOutline} style={{ padding: '4px 12px', fontSize: 12 }}
                onClick={() => toggleActive(analyst)}>
                {analyst.active ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </div>

          {/* Panel de edición */}
          {editingUid === analyst.uid && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                {/* Módulos */}
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', margin: '0 0 10px' }}>
                    Módulos permitidos
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {ALL_MODULES.map((m) => (
                      <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                        <input type="checkbox"
                          checked={editPerms.modules.includes(m.key)}
                          onChange={() => toggleModule(m.key)}
                          style={{ accentColor: '#6366f1' }} />
                        {m.label}
                      </label>
                    ))}
                  </div>
                </div>
                {/* Datasets */}
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', margin: '0 0 10px' }}>
                    Datasets permitidos
                  </p>
                  {datasets.length === 0 ? (
                    <p style={{ fontSize: 13, color: '#9ca3af' }}>No hay datasets cargados.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {datasets.map((ds) => (
                        <label key={ds.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                          <input type="checkbox"
                            checked={editPerms.datasets.includes(ds.id)}
                            onChange={() => toggleDataset(ds.id)}
                            style={{ accentColor: '#6366f1' }} />
                          {ds.name} <span style={{ fontSize: 11, color: '#9ca3af' }}>({ds.rowCount.toLocaleString()} filas)</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className={styles.toolbar}>
                <button className={styles.btnPrimary} onClick={savePermissions} disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar permisos'}
                </button>
                <button className={styles.btnOutline} onClick={() => setEditingUid(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Tab: Crear Acceso ────────────────────────────────────────────────────────

function CreateAccess() {
  const { user } = useAuth();
  const { datasets } = useDatasetContext();

  const [email, setEmail] = useState('');
  const [selectedModules, setSelectedModules] = useState<ModuleKey[]>(['dashboard', 'ventas', 'reportes']);
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<{ code: string; expiresAt: string } | null>(null);

  const toggleModule = (key: ModuleKey) => {
    setSelectedModules((prev) => prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]);
  };

  const toggleDataset = (id: string) => {
    setSelectedDatasets((prev) => prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]);
  };

  const handleGenerate = async () => {
    if (!email.trim() || !email.includes('@')) { toast.warning('Ingresa un correo válido.'); return; }
    if (selectedModules.length === 0) { toast.warning('Selecciona al menos un módulo.'); return; }
    if (!user) { toast.error('Sin sesión activa.'); return; }

    setGenerating(true);
    try {
      const permissions: UserPermissions = {
        modules: selectedModules,
        datasets: selectedDatasets,
      };

      const { plainCode } = await createAccessCode(user.uid, email, permissions);

      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toLocaleString('es-PE', {
        day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });

      setGeneratedCode({ code: plainCode, expiresAt });
      toast.success('Código generado correctamente.');
    } catch {
      toast.error('Error al generar el código.');
    } finally {
      setGenerating(false);
    }
  };

  const copyCode = () => {
    if (!generatedCode) return;
    navigator.clipboard.writeText(generatedCode.code).then(() => toast.success('Código copiado.'));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Formulario */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Crear acceso de Analista</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Email */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Correo del analista</label>
            <input
              type="email"
              className={styles.select}
              placeholder="analista@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ maxWidth: 360 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
            {/* Módulos */}
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', margin: '0 0 10px' }}>
                Módulos permitidos
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ALL_MODULES.map((m) => (
                  <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                    <input type="checkbox"
                      checked={selectedModules.includes(m.key)}
                      onChange={() => toggleModule(m.key)}
                      style={{ accentColor: '#6366f1' }} />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Datasets */}
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', margin: '0 0 10px' }}>
                Datasets permitidos
              </p>
              {datasets.length === 0 ? (
                <p style={{ fontSize: 13, color: '#9ca3af' }}>No hay datasets cargados aún.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {datasets.map((ds) => (
                    <label key={ds.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                      <input type="checkbox"
                        checked={selectedDatasets.includes(ds.id)}
                        onChange={() => toggleDataset(ds.id)}
                        style={{ accentColor: '#6366f1' }} />
                      {ds.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={styles.toolbar}>
            <button className={styles.btnPrimary} onClick={handleGenerate} disabled={generating}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
              {generating ? 'Generando...' : 'GENERAR CÓDIGO'}
            </button>
          </div>
        </div>
      </div>

      {/* Código generado */}
      {generatedCode && (
        <div className={styles.card} style={{ border: '2px solid #6366f1' }}>
          <h2 className={styles.cardTitle} style={{ color: '#6366f1' }}>Código generado</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{
                fontSize: 28, fontWeight: 800, letterSpacing: '0.15em',
                color: '#111827', fontFamily: 'monospace', background: '#f0f2f5',
                padding: '10px 20px', borderRadius: 10, border: '2px dashed #6366f1',
              }}>
                {generatedCode.code}
              </span>
              <button className={styles.btnOutline} onClick={copyCode}>Copiar</button>
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13, color: '#6b7280' }}>
              <span>📧 <strong>{email}</strong></span>
              <span>⏰ Expira: <strong>{generatedCode.expiresAt}</strong></span>
              <span>🔑 Uso único</span>
            </div>
            <div style={{ padding: '10px 14px', background: '#fef9c3', borderRadius: 8, border: '1px solid #fde68a', fontSize: 13, color: '#92400e' }}>
              ⚠️ <strong>Muestra este código una sola vez.</strong> Compártelo directamente con el analista.
              No se puede recuperar después de cerrar este mensaje.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Códigos de Acceso ───────────────────────────────────────────────────

function AccessCodesList() {
  const { user } = useAuth();
  const [codes, setCodes] = useState<Array<AccessCode & { id: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    listAccessCodes(user.uid)
      .then(setCodes)
      .catch(() => toast.error('Error al cargar códigos.'))
      .finally(() => setLoading(false));
  }, [user]);

  const handleRevoke = async (codeId: string) => {
    try {
      await revokeAccessCode(codeId);
      setCodes((prev) => prev.map((c) => c.id === codeId ? { ...c, status: 'revoked' } : c));
      toast.success('Código revocado.');
    } catch {
      toast.error('Error al revocar el código.');
    }
  };

  const fmtTimestamp = (ts: Timestamp | null) => {
    if (!ts) return '—';
    try {
      return ts.toDate().toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return '—'; }
  };

  if (loading) return <div className={styles.empty}><p className={styles.emptyText}>Cargando códigos...</p></div>;
  if (codes.length === 0) return <div className={styles.empty}><p className={styles.emptyText}>No has generado códigos todavía.</p></div>;

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Correo</th>
            <th>Estado</th>
            <th>Usado</th>
            <th>Creado</th>
            <th>Expira</th>
            <th>Módulos</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          {codes.map((c) => {
            const isExpired = c.expiresAt?.toMillis?.() < Date.now();
            const statusLabel = c.status === 'revoked' ? 'Revocado'
              : c.used ? 'Usado'
              : isExpired ? 'Expirado'
              : 'Activo';
            const statusColor = c.status === 'revoked' || c.used || isExpired ? '#dc2626' : '#16a34a';

            return (
              <tr key={c.id}>
                <td>{c.email}</td>
                <td>
                  <span style={{ fontSize: 12, fontWeight: 600, color: statusColor }}>
                    {statusLabel}
                  </span>
                </td>
                <td style={{ color: '#6b7280' }}>{c.used ? fmtTimestamp(c.usedAt as Timestamp) : '—'}</td>
                <td style={{ color: '#6b7280' }}>{fmtTimestamp(c.createdAt as Timestamp)}</td>
                <td style={{ color: isExpired ? '#dc2626' : '#6b7280' }}>
                  {fmtTimestamp(c.expiresAt as Timestamp)}
                </td>
                <td style={{ fontSize: 12, color: '#6b7280' }}>
                  {c.permissions.modules.length} módulos
                </td>
                <td>
                  {c.status === 'active' && !c.used && !isExpired && (
                    <button className={styles.btnOutline}
                      style={{ padding: '3px 10px', fontSize: 12, color: '#dc2626', borderColor: '#fecaca' }}
                      onClick={() => handleRevoke(c.id)}>
                      Revocar
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Tab: Auditoría ───────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  dataset_uploaded:    'Dataset cargado',
  dataset_deleted:     'Dataset eliminado',
  cleaning_executed:   'Limpieza ejecutada',
  analyst_created:     'Analista creado',
  code_generated:      'Código generado',
  code_used:           'Código usado',
  permissions_updated: 'Permisos actualizados',
  access_revoked:      'Acceso revocado',
  login_admin:         'Login Administrador',
  login_analyst:       'Login Analista',
};

function AuditTab() {
  const [logs, setLogs] = useState<Array<{ id: string; action: string; actor: string; createdAt: Timestamp | null; details?: Record<string, unknown> }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listAuditLogs(100)
      .then((l) => setLogs(l as typeof logs))
      .catch(() => toast.error('Error al cargar auditoría.'))
      .finally(() => setLoading(false));
  }, []);

  const fmtTs = (ts: Timestamp | null) => {
    if (!ts) return '—';
    try {
      return ts.toDate().toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return '—'; }
  };

  if (loading) return <div className={styles.empty}><p className={styles.emptyText}>Cargando auditoría...</p></div>;
  if (logs.length === 0) return <div className={styles.empty}><p className={styles.emptyText}>No hay eventos registrados.</p></div>;

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Evento</th>
            <th>Actor</th>
            <th>Detalles</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td style={{ color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtTs(log.createdAt)}</td>
              <td><strong>{ACTION_LABELS[log.action] ?? log.action}</strong></td>
              <td style={{ fontSize: 12, color: '#6b7280' }}>{String(log.actor).slice(0, 20)}</td>
              <td style={{ fontSize: 12, color: '#9ca3af' }}>
                {log.details ? Object.entries(log.details).map(([k, v]) => `${k}: ${v}`).join(' · ') : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

type AdminTab = 'analistas' | 'crear' | 'codigos' | 'auditoria';

export default function Administration() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<AdminTab>('analistas');

  if (!isAdmin) {
    return (
      <div className={styles.page}>
        <div className={styles.card} style={{ textAlign: 'center', padding: '48px 24px' }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: '#dc2626' }}>Acceso restringido</p>
          <p style={{ fontSize: 14, color: '#6b7280' }}>Solo el Administrador puede acceder a este módulo.</p>
        </div>
      </div>
    );
  }

  const tabs: { key: AdminTab; label: string }[] = [
    { key: 'analistas', label: 'Usuarios / Analistas' },
    { key: 'crear',     label: 'Crear acceso' },
    { key: 'codigos',   label: 'Códigos generados' },
    { key: 'auditoria', label: 'Auditoría' },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Administración</h1>
          <p className={styles.pageDesc}>
            Gestiona analistas, permisos, códigos de acceso y auditoría del sistema.
          </p>
        </div>
      </div>

      <div className={styles.tabs}>
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'analistas' && <AnalystList />}
      {tab === 'crear'     && <CreateAccess />}
      {tab === 'codigos'   && <AccessCodesList />}
      {tab === 'auditoria' && <AuditTab />}
    </div>
  );
}
