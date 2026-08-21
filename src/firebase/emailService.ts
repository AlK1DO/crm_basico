import emailjs from '@emailjs/browser';

export async function sendOTPEmail(email: string, otp: string): Promise<void> {
  const serviceId  = import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
  const publicKey  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

  if (!serviceId || !templateId || !publicKey) {
    console.info(`[DEV] OTP para ${email}: ${otp}`);
    return;
  }

  await emailjs.send(serviceId, templateId, { to_email: email, otp_code: otp, expiry_minutes: '10' }, publicKey);
}
