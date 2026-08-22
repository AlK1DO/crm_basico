import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
import {
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth } from '../firebase/config';
import { generateOTP, saveOTP, verifyOTP } from '../firebase/otpService';
import { sendOTPEmail } from '../firebase/emailService';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  pendingEmail: string;
  requestOTP: (email: string) => Promise<void>;
  confirmOTP: (otp: string) => Promise<boolean>;
  logout: () => Promise<void>;
  /** Registra un callback que se ejecuta justo antes del logout. Retorna una función para desregistrarlo. */
  onLogout: (cb: () => void) => () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingEmail, setPendingEmail] = useState('');
  const logoutCallbacks = useRef<Set<() => void>>(new Set());

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  /** Permite a otros módulos suscribirse al evento de logout. */
  const onLogout = useCallback((cb: () => void) => {
    logoutCallbacks.current.add(cb);
    return () => logoutCallbacks.current.delete(cb);
  }, []);

  /**
   * Genera un OTP, lo guarda en memoria y lo envía por EmailJS.
   * Un nuevo llamado invalida cualquier OTP anterior para ese correo.
   */
  const requestOTP = async (email: string): Promise<void> => {
    const otp = generateOTP();
    saveOTP(email, otp); // síncrono, en memoria
    await sendOTPEmail(email, otp);
    setPendingEmail(email);
  };

  /**
   * Verifica el OTP ingresado contra el almacenado en memoria.
   * Si es válido, autentica al usuario con signInAnonymously.
   */
  const confirmOTP = async (otp: string): Promise<boolean> => {
    const valid = verifyOTP(pendingEmail, otp); // síncrono, en memoria
    if (!valid) return false;
    await signInAnonymously(auth);
    return true;
  };

  const logout = async (): Promise<void> => {
    // Notifica a todos los suscriptores antes de cerrar sesión (ej: limpiar datasets)
    logoutCallbacks.current.forEach((cb) => cb());
    await signOut(auth);
    setPendingEmail('');
  };

  return (
    <AuthContext.Provider value={{ user, loading, pendingEmail, requestOTP, confirmOTP, logout, onLogout }}>
      {children}
    </AuthContext.Provider>
  );
}
