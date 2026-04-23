import type { Worksheet } from 'exceljs';
import type { CcCurrent } from '../cc-current/entities/cc-current.entity';
import {
  computeSaldoColor,
  computeSaldoColorReciboSaldoAFavor,
  isFacturaONotaDebito,
  isReciboDocument,
  type SaldoColorDecision,
} from './document-saldo-color.util';

/** Misma grilla que el replay: A vacío, B comprobante, C fecha, D importe, E saldo, F atraso, G recibo, H importe(s) recibo. */
const COL_IMPORTE_DOC = 4;
const COL_SALDO = 5;
const COL_RECIBO = 7;
const COL_IMPORTE_RECIBO = 8;

/** #0000FF */
const FONT_AZUL = 'FF0000FF';
/** #A20000 */
const FONT_ROJO_PARCIAL = 'FFA20000';

/** Fondo canela: saldo ERP menor que saldo archivo base en consolidación. */
const FILL_CANELA_SALDO_DISCREPANCIA = 'FFE8E5D8';

const RAW_JSON_SALDO_ERP_MENOR_QUE_ARCHIVO_BASE = 'saldoErpMenorQueArchivoBase';

function saldoErpMenorQueArchivoBase(cc: CcCurrent): boolean {
  const raw = cc.rawRowJson;
  if (!raw || typeof raw !== 'object') {
    return false;
  }
  return Boolean(
    (raw as Record<string, unknown>)[RAW_JSON_SALDO_ERP_MENOR_QUE_ARCHIVO_BASE],
  );
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
    if (!cc) continue;

    const cells = dataRows[i];
    if (cells.length < COL_IMPORTE_RECIBO) continue;

    const colD = cells[COL_IMPORTE_DOC - 1] ?? '';
    const colE = cells[COL_SALDO - 1] ?? '';
    const colG = cells[COL_RECIBO - 1] ?? '';
    const colH = cells[COL_IMPORTE_RECIBO - 1] ?? '';

    let decision: SaldoColorDecision = null;
    if (isFacturaONotaDebito(cc)) {
      decision = computeSaldoColor(colD, colE, colG, colH);
    } else if (isReciboDocument(cc)) {
      decision = computeSaldoColorReciboSaldoAFavor(colE, colG, colH);
    }
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

/**
 * Fondo canela en columna Saldo cuando en consolidación el saldo del ERP era
 * menor que el del archivo base (no altera color de fuente; ejecutar después de
 * {@link applySaldoReceiptPaymentColors}).
 */
export function applySaldoErpMenorQueArchivoBaseBackground(
  ws: Worksheet,
  docRowKeys: (string | null)[],
  byDocKey: Map<string, CcCurrent>,
): void {
  for (let i = 0; i < docRowKeys.length; i++) {
    const dk = docRowKeys[i];
    if (!dk) continue;

    const cc = byDocKey.get(dk);
    if (!cc || !saldoErpMenorQueArchivoBase(cc)) continue;

    const excelRow = ws.getRow(i + 1);
    const cellSaldo = excelRow.getCell(COL_SALDO);
    cellSaldo.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: FILL_CANELA_SALDO_DISCREPANCIA },
    };
  }
}
