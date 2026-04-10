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

  const num = parseMoneyLikeToNumber(raw);
  if (num === null) return String(value);

  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const intWithSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${intWithSep},${decPart}`;
}

function parseMoneyLikeToNumber(raw: string): number | null {
  // Ya en forma AR: 1.076.622,32
  if (/^-?\d{1,3}(\.\d{3})*,\d{1,4}$/.test(raw)) {
    const normalized = raw.replace(/\./g, '').replace(',', '.');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  // Desde MySQL / API: 1076622.32 o -430.65
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Días de atraso (-27, 14) o códigos cortos: no formatear como moneda. */
export function looksLikeDiasAtrasoTotvs(s: string): boolean {
  return /^-?\d{1,4}$/.test(s.trim());
}
