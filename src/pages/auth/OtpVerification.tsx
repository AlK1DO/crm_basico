import { useState, useRef, useEffect, type KeyboardEvent, type ClipboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'react-toastify';
import { useAuth } from '../../hooks/useAuth';
import styles from './Auth.module.css';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

export default function OtpVerification() {
  const { confirmOTP, requestOTP, pendingEmail } = useAuth();
  const navigate = useNavigate();

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!pendingEmail) navigate('/login', { replace: true });
  }, [pendingEmail, navigate]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const updated = [...digits];
    updated[index] = value;
    setDigits(updated);
    if (value && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus();
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    const updated = [...digits];
    pasted.split('').forEach((char, i) => { updated[i] = char; });
    setDigits(updated);
    inputRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  };

  const handleSubmit = async () => {
    const otp = digits.join('');
    if (otp.length < OTP_LENGTH) { toast.warning('Ingresa los 6 dígitos del código.'); return; }
    setLoading(true);
    try {
      const valid = await confirmOTP(otp);
      if (valid) {
        toast.success('¡Acceso concedido!');
        navigate('/dashboard', { replace: true });
      } else {
        toast.error('Código incorrecto o expirado.');
        setDigits(Array(OTP_LENGTH).fill(''));
        inputRefs.current[0]?.focus();
      }
    } catch {
      toast.error('Error al verificar el código.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    try {
      await requestOTP(pendingEmail);
      toast.success('Código reenviado a tu correo.');
      setCountdown(RESEND_SECONDS);
      setDigits(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } catch {
      toast.error('No se pudo reenviar el código.');
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.iconBox}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a7.464 7.464 0 01-1.15 3.993m1.989 3.559A11.209 11.209 0 008.25 10.5a3.75 3.75 0 117.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 01-3.6 9.75m6.633-4.596a18.666 18.666 0 01-2.485 5.33"
            />
          </svg>
        </div>

        <h1 className={styles.title}>Verificación OTP</h1>
        <p className={styles.subtitle}>Ingresa el código de 6 dígitos enviado a tu correo</p>
        <div className={styles.infoBox}><strong>{pendingEmail}</strong></div>

        <div className={styles.otpGrid}>
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              className={styles.otpInput}
              aria-label={`Dígito ${i + 1}`}
              autoFocus={i === 0}
            />
          ))}
        </div>

        <p className={styles.timer}>
          {countdown > 0 ? (
            <>¿No recibiste el código? Reenviar en <strong>{countdown}s</strong></>
          ) : (
            <>¿No recibiste el código?{' '}
              <button className={styles.timerLink} onClick={handleResend}>Reenviar</button>
            </>
          )}
        </p>

        <button className={styles.btnPrimary} onClick={handleSubmit}
          disabled={loading || digits.join('').length < OTP_LENGTH}>
          {loading ? 'Verificando...' : 'Verificar código'}
        </button>

        <button className={styles.backLink} onClick={() => navigate('/login')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Volver al login
        </button>
      </div>
    </div>
  );
}
