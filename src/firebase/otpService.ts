import { db } from './config';
import { doc, setDoc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

const OTP_COLLECTION = 'otp_codes';
const OTP_EXPIRY_MS = 10 * 60 * 1000;

const otpRef = (email: string) => doc(db, OTP_COLLECTION, email);

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function saveOTP(email: string, otp: string): Promise<void> {
  await setDoc(otpRef(email), {
    otp,
    createdAt: serverTimestamp(),
    expiresAt: Date.now() + OTP_EXPIRY_MS,
  });
}

export async function verifyOTP(email: string, inputOtp: string): Promise<boolean> {
  const snapshot = await getDoc(otpRef(email));
  if (!snapshot.exists()) return false;
  const data = snapshot.data();
  const isValid = data.otp === inputOtp && Date.now() <= data.expiresAt;
  if (isValid) await deleteDoc(otpRef(email));
  return isValid;
}

export async function deleteOTP(email: string): Promise<void> {
  await deleteDoc(otpRef(email));
}
