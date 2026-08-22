/**
 * otpService.ts
 *
 * OTP completamente en memoria del frontend.
 * NO utiliza Firestore, LocalStorage ni SessionStorage.
 * Un OTP nuevo invalida el anterior.
 * Expira a los 10 minutos.
 * Es de un solo uso: se elimina al verificarse correctamente.
 */

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutos

interface OtpRecord {
  otp: string;
  expiresAt: number;
  used: boolean;
}

// Mapa en memoria: email → OtpRecord
// Se limpia automáticamente al verificar o al generar uno nuevo.
const otpStore = new Map<string, OtpRecord>();

/** Genera un OTP aleatorio de exactamente 6 dígitos. */
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Guarda el OTP en memoria asociado al correo.
 * Si ya existía uno anterior, lo sobreescribe (lo invalida).
 */
export function saveOTP(email: string, otp: string): void {
  otpStore.set(email, {
    otp,
    expiresAt: Date.now() + OTP_EXPIRY_MS,
    used: false,
  });
}

/**
 * Verifica el OTP ingresado contra el almacenado en memoria.
 * - Retorna false si no existe, ya fue usado o está vencido.
 * - Si es válido, lo marca como usado y lo elimina.
 */
export function verifyOTP(email: string, inputOtp: string): boolean {
  const record = otpStore.get(email);

  if (!record) return false;

  // Expirado
  if (Date.now() > record.expiresAt) {
    otpStore.delete(email);
    return false;
  }

  // Ya usado
  if (record.used) {
    otpStore.delete(email);
    return false;
  }

  // Incorrecto
  if (record.otp !== inputOtp) return false;

  // Válido: eliminar inmediatamente (un solo uso)
  otpStore.delete(email);
  return true;
}

/** Elimina el OTP de memoria (por ejemplo al cancelar el flujo). */
export function deleteOTP(email: string): void {
  otpStore.delete(email);
}
