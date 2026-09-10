/**
 * hashUtils.ts
 *
 * Utilidades de hashing para deduplicación de CSV.
 * Usa SubtleCrypto (Web Crypto API, disponible en todos los navegadores modernos).
 *
 * Por qué no guardar el código de acceso en texto plano:
 * SHA-256 es one-way hash — no se puede revertir al original.
 * Sirve para comparar sin exponer el valor real.
 */

/**
 * Calcula el hash SHA-256 de un string.
 * Retorna el hash en formato hexadecimal (64 caracteres).
 */
export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Calcula el hash SHA-256 del contenido de un archivo File.
 * Se usa para detectar CSV duplicados independientemente del nombre.
 */
export async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Versión síncrona simple usando djb2 para casos donde
 * no se necesita criptografía (ej: comparar strings cortos).
 * NO usar para hashing de códigos de acceso.
 */
export function djb2Hash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}
