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

  // Admitir solo signos/numéricos y separadores monetarios.
  if (!/^-?[\d.,]+$/.test(t)) return null;

  const sign = t.startsWith('-') ? '-' : '';
  const unsigned = sign ? t.slice(1) : t;
  if (!unsigned) return null;

  const lastDot = unsigned.lastIndexOf('.');
  const lastComma = unsigned.lastIndexOf(',');
  const lastSep = Math.max(lastDot, lastComma);

  let normalized = unsigned;
  if (lastSep >= 0) {
    const decDigits = unsigned.length - lastSep - 1;
    const hasDecimalPart = decDigits >= 1 && decDigits <= 2;
    if (hasDecimalPart) {
      const intPart = unsigned.slice(0, lastSep).replace(/[.,]/g, '');
      const decPart = unsigned.slice(lastSep + 1).replace(/[.,]/g, '');
      if (!intPart && !decPart) return null;
      normalized = `${intPart || '0'}.${decPart}`;
    } else {
      // Formatos tipo "2.030.400" o mixtos "1,050.000": tratar como miles.
      normalized = unsigned.replace(/[.,]/g, '');
    }
  }

  const n = Number(`${sign}${normalized}`);
  return Number.isFinite(n) ? n : null;
}

/** Días de atraso (-27, 14) o códigos cortos: no formatear como moneda. */
export function looksLikeDiasAtrasoTotvs(s: string): boolean {
  return /^-?\d{1,4}$/.test(s.trim());
}
