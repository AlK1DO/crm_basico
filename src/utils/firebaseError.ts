const FIREBASE_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/user-not-found': 'No existe una cuenta con ese correo.',
  'auth/wrong-password': 'Contraseña incorrecta.',
  'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde.',
  'auth/user-disabled': 'Esta cuenta ha sido deshabilitada.',
};

export function getFirebaseError(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    return FIREBASE_MESSAGES[(err as { code: string }).code] ?? 'Ocurrió un error. Intenta de nuevo.';
  }
  return 'Ocurrió un error inesperado.';
}
