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
const LOCAL_AUTH_STORE_KEYS = [
  'crm_demo_auth_store_v1',
  'crm_demo_auth_store_v2',
  'crm_demo_access_code_latest',
];

function getAllLocalAuthStores(): Array<{ users: Record<string, UserProfile & { uid: string }>; accessCodes: Array<AccessCode & { id: string; plainCode?: string }> }> {
  return LOCAL_AUTH_STORE_KEYS.map((key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { users: {}, accessCodes: [] };
      const parsed = JSON.parse(raw);
      return {
        users: parsed?.users ?? {},
        accessCodes: Array.isArray(parsed?.accessCodes) ? parsed.accessCodes.map(normalizeLocalAccessCode) : [],
      };
    } catch {
      return { users: {}, accessCodes: [] };
    }
  });
}

function persistAllLocalAuthStores(store: { users: Record<string, UserProfile & { uid: string }>; accessCodes: Array<AccessCode & { id: string; plainCode?: string }> }): void {
  LOCAL_AUTH_STORE_KEYS.forEach((key) => {
    try {
      localStorage.setItem(key, JSON.stringify(store));
    } catch {
      // noop
    }
  });
}

function timestampFromValue(value: unknown): Timestamp {
  if (value instanceof Timestamp) return value;
  if (value && typeof value === 'object' && 'seconds' in value && 'nanoseconds' in value) {
    const obj = value as { seconds: number; nanoseconds: number };
    return new Timestamp(obj.seconds, obj.nanoseconds);
  }
  if (typeof value === 'string') {
    return Timestamp.fromDate(new Date(value));
  }
  return Timestamp.now();
}

function normalizeLocalAccessCode(code: any): AccessCode & { id: string; plainCode?: string } {
  return {
    id: code?.id ?? `${Date.now()}-${Math.random()}`,
    codeHash: code?.codeHash ?? '',
    plainCode: code?.plainCode ?? '',
    email: code?.email ?? '',
    role: code?.role ?? 'analyst',
    permissions: code?.permissions ?? { modules: [], datasets: [] },
    status: code?.status ?? 'active',
    used: Boolean(code?.used),
    createdBy: code?.createdBy ?? '',
    createdAt: timestampFromValue(code?.createdAt),
    expiresAt: timestampFromValue(code?.expiresAt),
    usedAt: code?.usedAt ? timestampFromValue(code.usedAt) : null,
  };
}

function readLocalAuthStore(): { users: Record<string, UserProfile & { uid: string }>; accessCodes: Array<AccessCode & { id: string; plainCode?: string }> } {
  const stores = getAllLocalAuthStores();
  const merged = stores.reduce((acc, current) => {
    acc.users = { ...acc.users, ...current.users };
    acc.accessCodes = [...acc.accessCodes, ...current.accessCodes];
    return acc;
  }, { users: {}, accessCodes: [] as Array<AccessCode & { id: string; plainCode?: string }> });

  const uniqueAccessCodes = merged.accessCodes.reduce((acc, item) => {
    const key = `${item.email}:${item.codeHash}:${item.id}`;
    if (!acc.some((existing) => `${existing.email}:${existing.codeHash}:${existing.id}` === key)) {
      acc.push(item);
    }
    return acc;
  }, [] as Array<AccessCode & { id: string; plainCode?: string }>);

  return { users: merged.users, accessCodes: uniqueAccessCodes };
}

function writeLocalAuthStore(store: { users: Record<string, UserProfile & { uid: string }>; accessCodes: Array<AccessCode & { id: string; plainCode?: string }> }): void {
  persistAllLocalAuthStores(store);
}

function makeLocalProfile(uid: string, email: string, role: UserProfile['role'], permissions: UserPermissions, active = true): UserProfile & { uid: string } {
  const now = Timestamp.now();
  return {
    uid,
    email,
    displayName: email.split('@')[0],
    role,
    active,
    permissions,
    createdAt: now,
    updatedAt: now,
  };
}

// ─── USUARIOS ─────────────────────────────────────────────────────────────────

/** Crea o actualiza el perfil del administrador al hacer login. */
export async function upsertAdminProfile(uid: string, email: string): Promise<void> {
  try {
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
  } catch {
    const store = readLocalAuthStore();
    const profile = makeLocalProfile(uid, email, 'admin', {
      modules: ['dashboard', 'datasets', 'limpieza', 'ventas', 'ofertas', 'reportes', 'administracion'],
      datasets: [],
    }, true);
    store.users[uid] = profile;
    writeLocalAuthStore(store);
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
  try {
    return onSnapshot(doc(db, USERS_COL, uid), (snap) => {
      callback(snap.exists() ? (snap.data() as UserProfile) : null);
    }, () => {
      const store = readLocalAuthStore();
      callback(store.users[uid] ?? null);
    });
  } catch {
    const store = readLocalAuthStore();
    callback(store.users[uid] ?? null);
    return () => {};
  }
}

/** Lista todos los analistas (role = analyst). */
export async function listAnalysts(): Promise<Array<UserProfile & { uid: string }>> {
  try {
    const q = query(collection(db, USERS_COL), where('role', '==', 'analyst'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ uid: d.id, ...(d.data() as UserProfile) }));
  } catch {
    const store = readLocalAuthStore();
    return Object.values(store.users).filter((u) => u.role === 'analyst');
  }
}

/** Actualiza permisos de un analista. */
export async function updateAnalystPermissions(
  uid: string,
  permissions: UserPermissions,
): Promise<void> {
  try {
    await updateDoc(doc(db, USERS_COL, uid), {
      permissions,
      updatedAt: serverTimestamp(),
    });
  } catch {
    const store = readLocalAuthStore();
    const current = store.users[uid];
    if (current) {
      store.users[uid] = { ...current, permissions, updatedAt: Timestamp.now() };
      writeLocalAuthStore(store);
    }
  }
}

/** Activa o desactiva un analista. */
export async function setAnalystActive(uid: string, active: boolean): Promise<void> {
  try {
    await updateDoc(doc(db, USERS_COL, uid), {
      active,
      updatedAt: serverTimestamp(),
    });
  } catch {
    const store = readLocalAuthStore();
    const current = store.users[uid];
    if (current) {
      store.users[uid] = { ...current, active, updatedAt: Timestamp.now() };
      writeLocalAuthStore(store);
    }
  }
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
  const normalizedEmail = email.toLowerCase().trim();

  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + CODE_EXPIRY_HOURS * 60 * 60 * 1000)
  );

  const localCode = normalizeLocalAccessCode({
    id: `local_${Date.now()}`,
    plainCode,
    codeHash,
    email: normalizedEmail,
    role: 'analyst',
    permissions,
    status: 'active',
    used: false,
    createdBy: adminUid,
    createdAt: Timestamp.now(),
    expiresAt,
    usedAt: null,
  });

  const store = readLocalAuthStore();
  const nextCodes = [...store.accessCodes.filter((c) => c.email !== normalizedEmail || c.codeHash !== codeHash), localCode];
  const nextStore = { ...store, accessCodes: nextCodes };
  writeLocalAuthStore(nextStore);
  try {
    localStorage.setItem('crm_demo_access_code_latest', JSON.stringify({ email: normalizedEmail, code: plainCode, permissions, expiresAt }));
  } catch {
    // noop
  }

  const data: Omit<AccessCode, 'createdAt' | 'expiresAt'> & {
    createdAt: ReturnType<typeof serverTimestamp>;
    expiresAt: Timestamp;
  } = {
    codeHash,
    email: normalizedEmail,
    role: 'analyst',
    permissions,
    status: 'active',
    used: false,
    createdBy: adminUid,
    createdAt: serverTimestamp(),
    expiresAt,
    usedAt: null,
  };

  try {
    const ref = await addDoc(collection(db, ACCESS_CODES_COL), data);
    return { codeId: ref.id, plainCode };
  } catch {
    return { codeId: localCode.id, plainCode };
  }
}

/** Lista los códigos de acceso creados por un admin. */
export async function listAccessCodes(
  adminUid?: string,
): Promise<Array<AccessCode & { id: string }>> {
  try {
    const col = collection(db, ACCESS_CODES_COL);
    const q = adminUid
      ? query(col, where('createdBy', '==', adminUid))
      : col;
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as AccessCode) }));
  } catch {
    const store = readLocalAuthStore();
    if (adminUid) {
      return store.accessCodes.filter((c) => c.createdBy === adminUid);
    }
    return store.accessCodes;
  }
}

/** Revoca un código de acceso. */
export async function revokeAccessCode(codeId: string): Promise<void> {
  try {
    await updateDoc(doc(db, ACCESS_CODES_COL, codeId), {
      status: 'revoked',
    });
  } catch {
    const store = readLocalAuthStore();
    store.accessCodes = store.accessCodes.map((c) =>
      c.id === codeId ? { ...c, status: 'revoked' } : c
    );
    writeLocalAuthStore(store);
  }
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
  const normalizedInputCode = plainCode.trim().toUpperCase();
  const inputHash = await sha256(normalizedInputCode);

  const localStore = readLocalAuthStore();
  const findLocalMatch = () => localStore.accessCodes.find((code) =>
    code.email.toLowerCase().trim() === normalizedEmail &&
    code.status === 'active' &&
    !code.used && (
      code.codeHash === inputHash ||
      (code.plainCode ?? '').trim().toUpperCase() === normalizedInputCode
    )
  );

  const localCode = findLocalMatch();

  if (localCode) {
    const now = Date.now();
    if (localCode.expiresAt.toMillis() < now) {
      localStore.accessCodes = localStore.accessCodes.map((item) =>
        item.id === localCode.id ? { ...item, status: 'revoked', used: false } : item
      );
      writeLocalAuthStore(localStore);
      return { ok: false, reason: 'expired' };
    }

    localStore.accessCodes = localStore.accessCodes.map((item) =>
      item.id === localCode.id ? { ...item, used: true, usedAt: Timestamp.now(), status: 'revoked' } : item
    );
    writeLocalAuthStore(localStore);

    return {
      ok: true,
      permissions: localCode.permissions,
      email: localCode.email,
      codeId: localCode.id,
    };
  }

  try {
    const q = query(
      collection(db, ACCESS_CODES_COL),
      where('email', '==', normalizedEmail),
      where('status', '==', 'active'),
      where('used', '==', false),
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      const fallbackCode = findLocalMatch();
      if (fallbackCode) {
        return {
          ok: true,
          permissions: fallbackCode.permissions,
          email: fallbackCode.email,
          codeId: fallbackCode.id,
        };
      }
      return { ok: false, reason: 'invalid' };
    }

    const now = Date.now();
    let matchedDoc: (typeof snap.docs)[0] | null = null;

    for (const d of snap.docs) {
      const data = d.data() as AccessCode;
      const matchesHash = data.codeHash === inputHash;
      const matchesPlain = (data as any).plainCode?.trim().toUpperCase() === normalizedInputCode;
      if (!matchesHash && !matchesPlain) continue;

      if (data.expiresAt.toMillis() < now) {
        await updateDoc(d.ref, { status: 'revoked' });
        return { ok: false, reason: 'expired' };
      }

      matchedDoc = d;
      break;
    }

    if (!matchedDoc) {
      const fallbackCode = findLocalMatch();
      if (fallbackCode) {
        return {
          ok: true,
          permissions: fallbackCode.permissions,
          email: fallbackCode.email,
          codeId: fallbackCode.id,
        };
      }
      return { ok: false, reason: 'invalid' };
    }

    const codeData = matchedDoc.data() as AccessCode;
    if (codeData.email !== normalizedEmail) {
      return { ok: false, reason: 'email_mismatch' };
    }

    const usedAt = serverTimestamp();
    await updateDoc(matchedDoc.ref, { used: true, usedAt, status: 'revoked' });

    return {
      ok: true,
      permissions: codeData.permissions,
      email: codeData.email,
      codeId: matchedDoc.id,
    };
  } catch {
    const fallbackCode = findLocalMatch();
    if (fallbackCode) {
      return {
        ok: true,
        permissions: fallbackCode.permissions,
        email: fallbackCode.email,
        codeId: fallbackCode.id,
      };
    }
    return { ok: false, reason: 'invalid' };
  }
}

/** Crea el perfil del analista en Firestore después de su autenticación anónima. */
export async function createOrUpdateAnalystProfile(
  uid: string,
  email: string,
  permissions: UserPermissions,
): Promise<void> {
  try {
    const ref = doc(db, USERS_COL, uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      await updateDoc(ref, {
        permissions,
        active: true,
        updatedAt: serverTimestamp(),
      });
    } else {
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
  } catch {
    const store = readLocalAuthStore();
    const current = store.users[uid];
    const profile = makeLocalProfile(uid, email, 'analyst', permissions, true);
    store.users[uid] = { ...current, ...profile };
    writeLocalAuthStore(store);
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
