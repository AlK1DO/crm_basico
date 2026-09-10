/**
 * ProtectedRoute.tsx
 *
 * Protección de rutas con soporte de roles y permisos por módulo.
 *
 * Uso:
 *   <ProtectedRoute>                          → solo verifica auth
 *   <ProtectedRoute requiredModule="ventas">  → verifica auth + permiso de módulo
 *   <ProtectedRoute adminOnly>                → solo admins
 */

import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import type { ModuleKey } from '../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredModule?: ModuleKey;
  adminOnly?: boolean;
}

export default function ProtectedRoute({
  children,
  requiredModule,
  adminOnly = false,
}: ProtectedRouteProps) {
  const { user, loading, profile, profileLoading, canAccessModule, isAdmin } = useAuth();
  const location = useLocation();

  // Mientras Firebase verifica estado inicial
  if (loading || (user && profileLoading)) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#f0f2f5',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40, height: 40, border: '3px solid #e5e7eb',
            borderTopColor: '#6366f1', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
          }} />
          <p style={{ fontSize: 14, color: '#6b7280' }}>Cargando...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Sin autenticación → login
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Con auth pero sin perfil aún (Firestore puede tardar) → mostrar spinner
  if (!profile) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#f0f2f5',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40, height: 40, border: '3px solid #e5e7eb',
            borderTopColor: '#6366f1', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
          }} />
          <p style={{ fontSize: 14, color: '#6b7280' }}>Cargando perfil...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Usuario deshabilitado
  if (!profile.active) {
    return <Navigate to="/login" replace />;
  }

  // Solo admins
  if (adminOnly && !isAdmin) {
    return <AccessDenied message="Solo el Administrador puede acceder a esta sección." />;
  }

  // Verificar permiso de módulo
  if (requiredModule && !canAccessModule(requiredModule)) {
    return <AccessDenied message={`No tienes permisos para acceder al módulo "${requiredModule}".`} />;
  }

  return <>{children}</>;
}

// ─── Pantalla de acceso denegado ──────────────────────────────────────────────

function AccessDenied({ message }: { message: string }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#f0f2f5', padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '48px 40px',
        maxWidth: 420, textAlign: 'center',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', background: '#fef2f2',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth={1.5}
            style={{ width: 28, height: 28 }}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>
          Acceso restringido
        </h2>
        <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px' }}>{message}</p>
        <p style={{ fontSize: 13, color: '#9ca3af' }}>
          Contacta al Administrador para solicitar acceso.
        </p>
      </div>
    </div>
  );
}
