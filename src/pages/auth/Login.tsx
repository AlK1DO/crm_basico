import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'react-toastify';
import { useAuth } from '../../hooks/useAuth';
import styles from './Auth.module.css';

export default function Login() {
  const { requestOTP } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email) { toast.warning('Por favor ingresa tu correo.'); return; }
    setLoading(true);
    try {
      await requestOTP(email);
      toast.success('Código OTP enviado a tu correo.');
      navigate('/verificar-otp');
    } catch {
      toast.error('No se pudo enviar el código. Inténtalo nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1 className={styles.title}>Bienvenido</h1>
        <p className={styles.subtitle}>Ingresa tu correo para recibir tu código de acceso</p>

        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          <div className={styles.field}>
            <label htmlFor="email" className={styles.label}>Email</label>
            <div className={styles.inputWrapper}>
              <svg className={styles.inputIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                />
              </svg>
              <input
                id="email"
                type="email"
                className={styles.input}
                placeholder="tucorreo@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
          </div>

          <button type="submit" className={styles.btnPrimary} disabled={loading}>
            {loading ? 'Enviando código...' : 'Continuar'}
          </button>
        </form>

        <p className={styles.footer}>
          Revisa tu correo{' '}
          <span className={styles.footerBold}>PARA PODER VER TU CODIGO</span>
        </p>
      </div>
    </div>
  );
}
