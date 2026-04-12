/**
 * Convierte el buffer de un CSV subido a string Unicode.
 * Muchos extractos (Excel/ERP en Windows) están en Windows-1252; `buffer.toString('utf-8')`
 * deja secuencias inválidas (p. ej. ñ = 0xF1) y luego aparecen � / pérdida de caracteres en Excel.
 */
export function decodeUploadBufferToUtf8String(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}
