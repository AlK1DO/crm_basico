/**
 * AnalystLogin.tsx
 *
 * Pantalla de acceso para analistas.
 * Campos: correo electrónico + código de acceso (no llamado OTP).
 * Muestra mensajes claros según el resultado de la validación.
 */

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'react-toastify';
import { useAuth } from '../../hooks/useAuth';
import type { AnalystLoginResult } from '../../context/AuthContext';
import styles from './Auth.module.css';

const ERROR_MESSAGES: Record<NonNullable<Extract<AnalystLoginResult, { ok: false }>['reason']>, string> = {
  invalid:        'Código incorrecto. Verifica el código e inténtalo de nuevo.',
  expired:        'El código ha expirado. Solicita uno nuevo al Administrador.',
  used:           'El código ya fue utilizado. Cada código es de un solo uso.',
  revoked:        'El código fue revocado. Contacta al Administrador.',
  email_mismatch: 'El código no pertenece a este correo electrónico.',
  inactive_user:  'Tu acceso está deshabilitado. Contacta al Administrador.',
  error:          'Error al validar el acceso. Inténtalo nuevamente.',
};

export default function AnalystLogin() {
  const { loginAnalyst } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Formatear código automáticamente: insertar guion al 4to carácter
  const handleCodeChange = (raw: string) => {
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (cleaned.length > 4) {
      setCode(`${cleaned.slice(0, 4)}-${cleaned.slice(4)}`);
    } else {
      setCode(cleaned);
    }
    setErrorMsg('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email.trim()) { setErrorMsg('Ingresa tu correo electrónico.'); return; }
    if (code.replace('-', '').length < 8) { setErrorMsg('El código debe tener 8 caracteres (ej: A7K9-P2X4).'); return; }

    setLoading(true);
    try {
      const result = await loginAnalyst(email.trim(), code);
      if (result.ok) {
        toast.success('Acceso concedido.');
        navigate('/dashboard', { replace: true });
      } else {
        setErrorMsg(ERROR_MESSAGES[result.reason] ?? 'Error desconocido.');
      }
    } catch {
      setErrorMsg(ERROR_MESSAGES.error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        {/* Ícono */}
        <div className={styles.iconBox}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>

        <h1 className={styles.title}>Acceso de Analista</h1>
        <p className={styles.subtitle}>
          Ingresa tu correo y el código de acceso proporcionado por el Administrador
        </p>

        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          {/* Email */}
          <div className={styles.field}>
            <label htmlFor="analyst-email" className={styles.label}>Correo electrónico</label>
            <div className={styles.inputWrapper}>
              <svg className={styles.inputIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
              <input
                id="analyst-email"
                type="email"
                className={styles.input}
                placeholder="analista@empresa.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErrorMsg(''); }}
                autoComplete="email"
                required
              />
            </div>
          </div>

          {/* Código de acceso */}
          <div className={styles.field}>
            <label htmlFor="analyst-code" className={styles.label}>Código de acceso</label>
            <div className={styles.inputWrapper}>
              <svg className={styles.inputIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
              <input
                id="analyst-code"
                type="text"
                className={styles.input}
                placeholder="A7K9-P2X4"
                value={code}
                onChange={(e) => handleCodeChange(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                maxLength={9}
                style={{ textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}
              />
            </div>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>
              Formato: XXXX-XXXX · Mayúsculas y números
            </p>
          </div>

          {/* Error */}
          {errorMsg && (
            <div style={{
              padding: '10px 14px', background: '#fef2f2', borderRadius: 8,
              border: '1px solid #fecaca', fontSize: 13, color: '#dc2626',
            }}>
              {errorMsg}
            </div>
          )}

          <button type="submit" className={styles.btnPrimary} disabled={loading}>
            {loading ? 'Validando acceso...' : 'INGRESAR'}
          </button>
        </form>

        {/* Volver */}
        <button
          className={styles.backLink}
          onClick={() => navigate('/login')}
          style={{ marginTop: 8, alignSelf: 'center' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Acceso de Administrador
        </button>
      </div>
    </div>
  );
}
