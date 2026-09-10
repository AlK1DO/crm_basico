/**
 * firestoreService.ts
 *
 * Operaciones de Firestore para usuarios, códigos de acceso y auditoría.
 *
 * NOTA DE SEGURIDAD:
 * Firebase Anonymous Auth genera UIDs que persisten mientras no se limpie
 * el almacenamiento del navegador. Para el proyecto académico esto es aceptable.
 * En producción se requeriría Firebase Auth con email/password o proveedor OAuth
 * para UIDs estables y Firestore Security Rules por identidad verificada.
 *
 * Actualmente los Security Rules deberían configurarse en Firebase Console:
 *   - users/{userId}: lectura solo al propio usuario o admins
 *   - access_codes/{id}: escritura solo desde admin (verificar role en perfil)
 *   - audit_logs: solo escritura
 */

import {
  collection, doc, getDoc, setDoc, updateDoc,
  query, where, getDocs, addDoc, serverTimestamp,
  onSnapshot, type Unsubscribe, Timestamp,
  orderBy, limit,
} from 'firebase/firestore';
import { db } from './config';
import { sha256 } from '../utils/hashUtils';
import type { UserProfile, AccessCode, AuditLog, UserPermissions } from '../types';

// ─── Colecciones ──────────────────────────────────────────────────────────────

const USERS_COL = 'users';
const ACCESS_CODES_COL = 'access_codes';
const AUDIT_LOGS_COL = 'audit_logs';

// ─── USUARIOS ─────────────────────────────────────────────────────────────────

/** Crea o actualiza el perfil del administrador al hacer login. */
export async function upsertAdminProfile(uid: string, email: string): Promise<void> {
  const ref = doc(db, USERS_COL, uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const profile: Omit<UserProfile, 'createdAt' | 'updatedAt'> & {
      createdAt: ReturnType<typeof serverTimestamp>;
      updatedAt: ReturnType<typeof serverTimestamp>;
    } = {
      email,
      displayName: email.split('@')[0],
      role: 'admin',
      active: true,
      permissions: {
        modules: ['dashboard', 'datasets', 'limpieza', 'ventas', 'ofertas', 'reportes', 'administracion'],
        datasets: [],
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, profile);
  }
}

/** Obtiene el perfil de usuario por UID. */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, USERS_COL, uid));
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}

/** Suscripción en tiempo real al perfil de usuario. */
export function subscribeToUserProfile(
  uid: string,
  callback: (profile: UserProfile | null) => void,
): Unsubscribe {
  return onSnapshot(doc(db, USERS_COL, uid), (snap) => {
    callback(snap.exists() ? (snap.data() as UserProfile) : null);
  });
}

/** Lista todos los analistas (role = analyst). */
export async function listAnalysts(): Promise<Array<UserProfile & { uid: string }>> {
  const q = query(collection(db, USERS_COL), where('role', '==', 'analyst'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ uid: d.id, ...(d.data() as UserProfile) }));
}

/** Actualiza permisos de un analista. */
export async function updateAnalystPermissions(
  uid: string,
  permissions: UserPermissions,
): Promise<void> {
  await updateDoc(doc(db, USERS_COL, uid), {
    permissions,
    updatedAt: serverTimestamp(),
  });
}

/** Activa o desactiva un analista. */
export async function setAnalystActive(uid: string, active: boolean): Promise<void> {
  await updateDoc(doc(db, USERS_COL, uid), {
    active,
    updatedAt: serverTimestamp(),
  });
}

// ─── CÓDIGOS DE ACCESO ────────────────────────────────────────────────────────

const CODE_EXPIRY_HOURS = 48;

/** Genera un código legible con formato A7K9-P2X4. */
export function generateAccessCodeString(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const seg = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${seg(4)}-${seg(4)}`;
}

/** Crea un nuevo código de acceso para un analista. Retorna el código en texto plano (mostrarlo una sola vez). */
export async function createAccessCode(
  adminUid: string,
  email: string,
  permissions: UserPermissions,
): Promise<{ codeId: string; plainCode: string }> {
  const plainCode = generateAccessCodeString();
  const codeHash = await sha256(plainCode);

  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + CODE_EXPIRY_HOURS * 60 * 60 * 1000)
  );

  const data: Omit<AccessCode, 'createdAt' | 'expiresAt'> & {
    createdAt: ReturnType<typeof serverTimestamp>;
    expiresAt: Timestamp;
  } = {
    codeHash,
    email: email.toLowerCase().trim(),
    role: 'analyst',
    permissions,
    status: 'active',
    used: false,
    createdBy: adminUid,
    createdAt: serverTimestamp(),
    expiresAt,
    usedAt: null,
  };

  const ref = await addDoc(collection(db, ACCESS_CODES_COL), data);
  return { codeId: ref.id, plainCode };
}

/** Lista los códigos de acceso creados por un admin. */
export async function listAccessCodes(
  adminUid?: string,
): Promise<Array<AccessCode & { id: string }>> {
  const col = collection(db, ACCESS_CODES_COL);
  const q = adminUid
    ? query(col, where('createdBy', '==', adminUid))
    : col;
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as AccessCode) }));
}

/** Revoca un código de acceso. */
export async function revokeAccessCode(codeId: string): Promise<void> {
  await updateDoc(doc(db, ACCESS_CODES_COL, codeId), {
    status: 'revoked',
  });
}

// ─── VALIDACIÓN DEL CÓDIGO DEL ANALISTA ──────────────────────────────────────

export type CodeValidationResult =
  | { ok: true; permissions: UserPermissions; email: string; codeId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' | 'revoked' | 'email_mismatch' | 'inactive_user' };

/**
 * Valida el código de acceso del analista.
 * Proceso:
 * 1. Hashear el código ingresado.
 * 2. Buscar en Firestore por email.
 * 3. Comparar hashes.
 * 4. Verificar estado, expiración y uso único.
 * 5. Marcar como usado si es válido.
 */
export async function validateAnalystCode(
  email: string,
  plainCode: string,
): Promise<CodeValidationResult> {
  const normalizedEmail = email.toLowerCase().trim();
  const inputHash = await sha256(plainCode.trim().toUpperCase());

  // Buscar códigos activos para ese email
  const q = query(
    collection(db, ACCESS_CODES_COL),
    where('email', '==', normalizedEmail),
    where('status', '==', 'active'),
    where('used', '==', false),
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    return { ok: false, reason: 'invalid' };
  }

  // Buscar el código cuyo hash coincida
  const now = Date.now();
  let matchedDoc: (typeof snap.docs)[0] | null = null;

  for (const d of snap.docs) {
    const data = d.data() as AccessCode;

    // Verificar hash
    if (data.codeHash !== inputHash) continue;

    // Verificar expiración
    if (data.expiresAt.toMillis() < now) {
      // Marcar como expirado
      await updateDoc(d.ref, { status: 'revoked' });
      return { ok: false, reason: 'expired' };
    }

    matchedDoc = d;
    break;
  }

  if (!matchedDoc) {
    return { ok: false, reason: 'invalid' };
  }

  const codeData = matchedDoc.data() as AccessCode;

  // Verificar que el email coincida exactamente
  if (codeData.email !== normalizedEmail) {
    return { ok: false, reason: 'email_mismatch' };
  }

  // Marcar como usado y crear/actualizar perfil del analista
  const usedAt = serverTimestamp();
  await updateDoc(matchedDoc.ref, { used: true, usedAt });

  // Crear perfil del analista en Firestore usando el email como identificador
  // (no hay UID aún — se asignará después del signInAnonymously)
  return {
    ok: true,
    permissions: codeData.permissions,
    email: codeData.email,
    codeId: matchedDoc.id,
  };
}

/** Crea el perfil del analista en Firestore después de su autenticación anónima. */
export async function createOrUpdateAnalystProfile(
  uid: string,
  email: string,
  permissions: UserPermissions,
): Promise<void> {
  const ref = doc(db, USERS_COL, uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    // Ya existe: actualizar permisos
    await updateDoc(ref, {
      permissions,
      active: true,
      updatedAt: serverTimestamp(),
    });
  } else {
    // Crear nuevo perfil
    await setDoc(ref, {
      email,
      displayName: email.split('@')[0],
      role: 'analyst',
      active: true,
      permissions,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

// ─── AUDITORÍA ────────────────────────────────────────────────────────────────

export async function logAuditEvent(
  entry: Omit<AuditLog, 'createdAt'>,
): Promise<void> {
  try {
    await addDoc(collection(db, AUDIT_LOGS_COL), {
      ...entry,
      createdAt: serverTimestamp(),
    });
  } catch {
    // La auditoría nunca debe romper el flujo principal
    console.warn('[audit] No se pudo registrar el evento:', entry.action);
  }
}

/** Lista los últimos N eventos de auditoría, ordenados por fecha descendente. */
export async function listAuditLogs(limitCount = 50): Promise<Array<AuditLog & { id: string }>> {
  const q = query(
    collection(db, AUDIT_LOGS_COL),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as AuditLog) }));
}

// ─── ADMINISTRADOR AUTORIZADO ─────────────────────────────────────────────────

/**
 * Email del administrador autorizado.
 * En producción esto vendría de una variable de entorno o lista en Firestore.
 * Para el proyecto académico se usa la variable VITE_ADMIN_EMAIL.
 */
export function isAdminEmail(email: string): boolean {
  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL as string | undefined;
  if (!adminEmail) {
    // Si no está configurado, cualquier email que complete OTP es admin (comportamiento anterior)
    return true;
  }
  return email.toLowerCase().trim() === adminEmail.toLowerCase().trim();
}
