/**
 * AuthContext.tsx
 *
 * Contexto de autenticación ampliado con:
 * - Rol del usuario (admin / analyst)
 * - Perfil completo desde Firestore
 * - Permisos en tiempo real (listener de Firestore)
 * - Flujo de admin: email → OTP EmailJS → Firebase Anonymous → perfil Firestore
 * - Flujo de analista: email + código → validación hash → Firebase Anonymous → perfil
 *
 * LIMITACIÓN DOCUMENTADA:
 * Firebase Anonymous Auth no garantiza UIDs estables entre sesiones distintas
 * en el mismo dispositivo si el usuario limpia el storage del navegador.
 * Para producción se requeriría auth con email/password u OAuth.
 * Para el proyecto académico el UID anónimo persiste mientras no se limpie
 * el almacenamiento local, lo que es aceptable.
 */

import React, {
  createContext, useCallback, useEffect, useRef, useState,
} from 'react';
import {
  signInAnonymously, signOut, onAuthStateChanged, type User,
} from 'firebase/auth';
import { auth } from '../firebase/config';
import { generateOTP, saveOTP, verifyOTP } from '../firebase/otpService';
import { sendOTPEmail } from '../firebase/emailService';
import {
  upsertAdminProfile,
  subscribeToUserProfile,
  validateAnalystCode,
  createOrUpdateAnalystProfile,
  logAuditEvent,
  isAdminEmail,
} from '../firebase/firestoreService';
import type { UserProfile, ModuleKey } from '../types';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  /** Usuario Firebase (anónimo si está autenticado). */
  user: User | null;
  /** true mientras Firebase verifica el estado inicial. */
  loading: boolean;
  /** Perfil completo del usuario desde Firestore. null si no está cargado. */
  profile: UserProfile | null;
  /** true mientras se carga el perfil de Firestore por primera vez. */
  profileLoading: boolean;
  /** Email pendiente de verificación OTP (solo flujo admin). */
  pendingEmail: string;

  // Flujo Admin
  requestOTP: (email: string) => Promise<void>;
  confirmOTP: (otp: string) => Promise<boolean>;

  // Flujo Analista
  loginAnalyst: (email: string, code: string) => Promise<AnalystLoginResult>;

  logout: () => Promise<void>;
  onLogout: (cb: () => void) => () => void;

  // Helpers de permisos (derivados del perfil)
  canAccessModule: (module: ModuleKey) => boolean;
  canAccessDataset: (datasetId: string) => boolean;
  isAdmin: boolean;
  isAnalyst: boolean;
  authorizedDatasetIds: string[]; // vacío = todos
}

export type AnalystLoginResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' | 'revoked' | 'email_mismatch' | 'inactive_user' | 'error' };

export const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const logoutCallbacks = useRef<Set<() => void>>(new Set());

  // ── Escucha de auth + carga de perfil en tiempo real ─────────────────────

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      // Limpiar listener anterior
      if (unsubProfile) { unsubProfile(); unsubProfile = null; }

      if (firebaseUser) {
        setProfileLoading(true);
        // Suscripción en tiempo real al perfil (detecta cambios de permisos)
        unsubProfile = subscribeToUserProfile(firebaseUser.uid, (p) => {
          setProfile(p);
          setProfileLoading(false);
        });
      } else {
        setProfile(null);
        setProfileLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  // ── Pub/sub de logout ─────────────────────────────────────────────────────

  const onLogout = useCallback((cb: () => void) => {
    logoutCallbacks.current.add(cb);
    return () => logoutCallbacks.current.delete(cb);
  }, []);

  // ── Flujo Admin: OTP ──────────────────────────────────────────────────────

  const requestOTP = async (email: string): Promise<void> => {
    // Validar que sea el email del administrador autorizado antes de enviar
    if (!isAdminEmail(email)) {
      throw new Error('not_admin');
    }
    const otp = generateOTP();
    saveOTP(email, otp);
    await sendOTPEmail(email, otp);
    setPendingEmail(email);
  };

  const confirmOTP = async (otp: string): Promise<boolean> => {
    const valid = verifyOTP(pendingEmail, otp);
    console.log('[confirmOTP] verifyOTP:', valid, '| email:', pendingEmail, '| otp:', otp);
    if (!valid) return false;

    console.log('[confirmOTP] signing in anonymously...');
    try {
      const cred = await signInAnonymously(auth);
      console.log('[confirmOTP] signed in uid:', cred.user.uid);

      await upsertAdminProfile(cred.user.uid, pendingEmail);
      console.log('[confirmOTP] profile upserted');

      await logAuditEvent({
        action: 'login_admin',
        actor: cred.user.uid,
        actorRole: 'admin',
        details: { email: pendingEmail },
      });
      console.log('[confirmOTP] done');
    } catch (err) {
      console.error('[confirmOTP] ERROR:', err);
      throw err;
    }

    return true;
  };

  // ── Flujo Analista: código de acceso ──────────────────────────────────────

  const loginAnalyst = async (email: string, code: string): Promise<AnalystLoginResult> => {
    try {
      const result = await validateAnalystCode(email, code);

      if (!result.ok) {
        return { ok: false, reason: result.reason };
      }

      // Autenticar de forma anónima en Firebase
      const cred = await signInAnonymously(auth);

      // Crear/actualizar perfil en Firestore con los permisos del código
      await createOrUpdateAnalystProfile(cred.user.uid, result.email, result.permissions);

      await logAuditEvent({
        action: 'login_analyst',
        actor: cred.user.uid,
        actorRole: 'analyst',
        details: { email: result.email, codeId: result.codeId },
      });

      return { ok: true };
    } catch (err) {
      console.error('[AuthContext] Error en loginAnalyst:', err);
      return { ok: false, reason: 'error' };
    }
  };

  // ── Logout ────────────────────────────────────────────────────────────────

  const logout = async (): Promise<void> => {
    logoutCallbacks.current.forEach((cb) => cb());
    await signOut(auth);
    setPendingEmail('');
    setProfile(null);
  };

  // ── Helpers de permisos (derivados del perfil) ────────────────────────────

  const isAdmin = profile?.role === 'admin';
  const isAnalyst = profile?.role === 'analyst';

  const canAccessModule = useCallback(
    (module: ModuleKey): boolean => {
      if (!profile) return false;
      if (!profile.active) return false;
      if (profile.role === 'admin') return true;
      return profile.permissions.modules.includes(module);
    },
    [profile],
  );

  const canAccessDataset = useCallback(
    (datasetId: string): boolean => {
      if (!profile) return false;
      if (!profile.active) return false;
      if (profile.role === 'admin') return true;
      // Vacío = todos los datasets autorizados explícitamente
      if (profile.permissions.datasets.length === 0) return false;
      return profile.permissions.datasets.includes(datasetId);
    },
    [profile],
  );

  const authorizedDatasetIds = isAdmin
    ? []                                        // admin ve todos
    : (profile?.permissions.datasets ?? []);    // analista ve solo los asignados

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        profile,
        profileLoading,
        pendingEmail,
        requestOTP,
        confirmOTP,
        loginAnalyst,
        logout,
        onLogout,
        canAccessModule,
        canAccessDataset,
        isAdmin,
        isAnalyst,
        authorizedDatasetIds,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
