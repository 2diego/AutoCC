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

/** Recibo en layout base: CEOS `R`, TOTVS `RA`. */
export function isReciboDocument(cc: CcCurrent): boolean {
  const t = cc.tipoDocumento.toUpperCase();
  const erp = String(cc.erpSource).toUpperCase();
  if (erp === 'CEOS') {
    return t === 'R';
  }
  if (erp === 'TOTVS') {
    return t === 'RA';
  }
  return false;
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

/**
 * Cobertura por recibo en G e importe(s) en H vs un importe de referencia **positivo**
 * (misma tolerancia que facturas).
 */
function saldoAzulRojoFromGxH(
  referenciaPos: number,
  colG: string,
  colH: string,
): SaldoColorDecision | null {
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

  const umbral = referenciaPos - TOLERANCIA_PAGO_COMPLETO;
  if (sumaRecibos >= umbral) {
    return 'azul';
  }
  return 'rojo';
}

/** Misma regla que `excel-saldo-receipt-fill`: azul = cancelado / pago total según G/H. */
export function computeSaldoColor(
  colD: string,
  colE: string,
  colG: string,
  colH: string,
): SaldoColorDecision | null {
  const referencia = referenceImporteOSaldo(colD, colE);
  if (referencia == null) {
    return null;
  }
  return saldoAzulRojoFromGxH(referencia, colG, colH);
}

/**
 * Recibo (col. B) con **saldo a favor** (E negativo): misma lógica que factura sobre G/H,
 * comparando la magnitud del crédito con los importes aplicados en H.
 */
export function computeSaldoColorReciboSaldoAFavor(
  colE: string,
  colG: string,
  colH: string,
): SaldoColorDecision | null {
  const saldoN = parseMoneyArStringToNumber(colE);
  if (saldoN === null || saldoN >= 0) {
    return null;
  }
  return saldoAzulRojoFromGxH(Math.abs(saldoN), colG, colH);
}

/** Misma grilla replay que `excel-saldo-receipt-fill` (1-based D–H). */
const EXCEL_COL_IMPORTE_DOC = 4;
const EXCEL_COL_SALDO = 5;
const EXCEL_COL_RECIBO = 7;
const EXCEL_COL_IMPORTE_RECIBO = 8;

/**
 * Factura / ND (y NCE YD1…) marcada como cancelada / pago total según G–H
 * (`computeSaldoColor` → azul): no debe calcularse atraso en columna F del Excel.
 */
export function isFacturaCanceladaSinAtrasoEnExport(
  cc: CcCurrent,
  cells: string[],
): boolean {
  if (!isFacturaONotaDebito(cc)) {
    return false;
  }
  if (cells.length < EXCEL_COL_IMPORTE_RECIBO) {
    return false;
  }
  const colD = cells[EXCEL_COL_IMPORTE_DOC - 1] ?? '';
  const colE = cells[EXCEL_COL_SALDO - 1] ?? '';
  const colG = cells[EXCEL_COL_RECIBO - 1] ?? '';
  const colH = cells[EXCEL_COL_IMPORTE_RECIBO - 1] ?? '';
  return computeSaldoColor(colD, colE, colG, colH) === 'azul';
}
