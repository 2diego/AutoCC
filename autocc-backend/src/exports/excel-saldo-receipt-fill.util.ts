import type { Worksheet } from 'exceljs';
import type { CcCurrent } from '../cc-current/entities/cc-current.entity';
import { parseMoneyArStringToNumber } from '../common/utils/format-money-ar-display.util';

/** Misma grilla que el replay: A vacío, B comprobante, C fecha, D importe, E saldo, F atraso, G recibo, H importe(s) recibo. */
const COL_IMPORTE_DOC = 4;
const COL_SALDO = 5;
const COL_RECIBO = 7;
const COL_IMPORTE_RECIBO = 8;

/** Tolerancia en moneda local (misma unidad que importes del layout). */
const TOLERANCIA_PAGO_COMPLETO = 2000;

/** #0000FF */
const FONT_AZUL = 'FF0000FF';
/** #A20000 */
const FONT_ROJO_PARCIAL = 'FFA20000';

function isFacturaONotaDebito(cc: CcCurrent): boolean {
  const t = cc.tipoDocumento.toUpperCase();
  const erp = String(cc.erpSource).toUpperCase();
  if (erp === 'CEOS') {
    return t === 'F' || t === 'D';
  }
  if (t === 'NF' || t === 'ND') {
    return true;
  }
  // En `consolidation-parser` los comprobantes YD1 (nota de débito TOTVS) se guardan como tipo NCE.
  const num = cc.numeroDocumento.trim().toUpperCase();
  return t === 'NCE' && num.startsWith('YD1');
}

/** Columna D si tiene texto; si no, valor numérico de E (misma regla que el negocio en Excel). */
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

type SaldoColorDecision = 'azul' | 'rojo' | null;

function computeSaldoColor(
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

/**
 * Color de **fuente** del monto en **Saldo** (columna E) según recibo(s) e importe(s) en G/H.
 * Solo facturas / notas de débito (CEOS F/D, TOTVS NF/ND y YD1… como NCE); no altera consolidación ni datos.
 */
export function applySaldoReceiptPaymentColors(
  ws: Worksheet,
  dataRows: string[][],
  docRowKeys: (string | null)[],
  byDocKey: Map<string, CcCurrent>,
): void {
  for (let i = 0; i < dataRows.length; i++) {
    const dk = docRowKeys[i];
    if (!dk) continue;

    const cc = byDocKey.get(dk);
    if (!cc || !isFacturaONotaDebito(cc)) continue;

    const cells = dataRows[i];
    if (cells.length < COL_IMPORTE_RECIBO) continue;

    const colD = cells[COL_IMPORTE_DOC - 1] ?? '';
    const colE = cells[COL_SALDO - 1] ?? '';
    const colG = cells[COL_RECIBO - 1] ?? '';
    const colH = cells[COL_IMPORTE_RECIBO - 1] ?? '';

    const decision = computeSaldoColor(colD, colE, colG, colH);
    if (!decision) continue;

    const excelRow = ws.getRow(i + 1);
    const cellSaldo = excelRow.getCell(COL_SALDO);

    cellSaldo.font = {
      ...cellSaldo.font,
      color: {
        argb: decision === 'azul' ? FONT_AZUL : FONT_ROJO_PARCIAL,
      },
    };
  }
}
