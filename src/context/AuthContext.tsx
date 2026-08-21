import React, { createContext, useEffect, useState } from 'react';
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
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingEmail, setPendingEmail] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const requestOTP = async (email: string): Promise<void> => {
    const otp = generateOTP();
    await saveOTP(email, otp);
    await sendOTPEmail(email, otp);
    setPendingEmail(email);
  };

  const confirmOTP = async (otp: string): Promise<boolean> => {
    const valid = await verifyOTP(pendingEmail, otp);
    if (!valid) return false;
    await signInAnonymously(auth);
    return true;
  };

  const logout = async (): Promise<void> => {
    await signOut(auth);
    setPendingEmail('');
  };

  return (
    <AuthContext.Provider value={{ user, loading, pendingEmail, requestOTP, confirmOTP, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
