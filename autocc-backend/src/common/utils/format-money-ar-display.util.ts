/**
 * Salida tipo base AR (TOTVS/CEOS en fixtures): miles con `.`, decimales con `,`.
 * Ej.: 1076622.32 → "1.076.622,32"
 */
export function formatMoneyArDisplay(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim().replace(/\s/g, '');
  if (raw === '') return '';

  const num = parseMoneyArStringToNumber(raw);
  if (num === null) return String(value);

  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const intWithSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${intWithSep},${decPart}`;
}

/** Texto de celda tipo moneda AR o número simple → número o null. */
export function parseMoneyArStringToNumber(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, '');
  if (!t) return null;
  // Ya en forma AR: 1.076.622,32
  if (/^-?\d{1,3}(\.\d{3})*,\d{1,4}$/.test(t)) {
    const normalized = t.replace(/\./g, '').replace(',', '.');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  // Entero AR solo con separadores de miles: 2.528.600 o 12.345.678 (sin ",xx")
  if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    const normalized = t.replace(/\./g, '');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  // Desde MySQL / API: 1076622.32 o -430.65; o miles sin todos los puntos: 5567908,11
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Días de atraso (-27, 14) o códigos cortos: no formatear como moneda. */
export function looksLikeDiasAtrasoTotvs(s: string): boolean {
  return /^-?\d{1,4}$/.test(s.trim());
}
