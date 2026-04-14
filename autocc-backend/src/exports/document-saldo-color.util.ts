import type { CcCurrent } from '../cc-current/entities/cc-current.entity';
import { parseMoneyArStringToNumber } from '../common/utils/format-money-ar-display.util';

/** Tolerancia en moneda local (misma unidad que importes del layout). */
export const TOLERANCIA_PAGO_COMPLETO = 999;

export function isFacturaONotaDebito(cc: CcCurrent): boolean {
  const t = cc.tipoDocumento.toUpperCase();
  const erp = String(cc.erpSource).toUpperCase();
  if (erp === 'CEOS') {
    return t === 'F' || t === 'D';
  }
  if (t === 'NF' || t === 'ND') {
    return true;
  }
  const num = cc.numeroDocumento.trim().toUpperCase();
  return t === 'NCE' && num.startsWith('YD1');
}

function referenceImporteOSaldo(colD: string, colE: string): number | null {
  if (colD.trim() !== '') {
    const desdeD = parseMoneyArStringToNumber(colD);
    if (desdeD != null) {
      return desdeD;
    }
  }
  return parseMoneyArStringToNumber(colE);
}

function sumImportesColumnaH(colH: string): number | null {
  const raw = colH.trim();
  if (!raw) return null;
  const parts = raw
    .split('+')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  let sum = 0;
  for (const p of parts) {
    const n = parseMoneyArStringToNumber(p);
    if (n === null) return null;
    sum += n;
  }
  return sum;
}

export type SaldoColorDecision = 'azul' | 'rojo' | null;

/** Misma regla que `excel-saldo-receipt-fill`: azul = cancelado / pago total según G/H. */
export function computeSaldoColor(
  colD: string,
  colE: string,
  colG: string,
  colH: string,
): SaldoColorDecision {
  const g = colG.trim();
  if (!g) return null;

  if (g.toLowerCase().includes('anulada')) {
    return 'azul';
  }

  if (!/\d/.test(g)) {
    return null;
  }

  const hTrim = colH.trim();
  if (!hTrim) {
    return 'azul';
  }

  const sumaRecibos = sumImportesColumnaH(colH);
  if (sumaRecibos === null) {
    return null;
  }

  const referencia = referenceImporteOSaldo(colD, colE);
  if (referencia == null) {
    return null;
  }

  const umbral = referencia - TOLERANCIA_PAGO_COMPLETO;
  if (sumaRecibos >= umbral) {
    return 'azul';
  }
  return 'rojo';
}
