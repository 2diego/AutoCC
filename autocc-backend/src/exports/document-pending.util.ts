import type { CcCurrent } from '../cc-current/entities/cc-current.entity';
import { buildExportCellsFromCcRow } from './base-export-replay.util';
import {
  computeSaldoColor,
  isFacturaONotaDebito,
} from './document-saldo-color.util';

/** Columnas alineadas al replay Excel (1-based): D importe, E saldo, G recibo, H importe recibo. */
const COL_D = 4;
const COL_E = 5;
const COL_G = 7;
const COL_H = 8;

/**
 * Documento “pendiente” para el bot: factura/ND según reglas de export, y Saldo pendiente
 * (misma lógica que colorear: cancelado/anulado/pago total → azul → excluido).
 */
export function isFacturaPendienteSaldoNoAzul(cc: CcCurrent): boolean {
  if (!isFacturaONotaDebito(cc)) return false;
  const cells = buildExportCellsFromCcRow(cc);
  const d = cells[COL_D - 1] ?? '';
  const e = cells[COL_E - 1] ?? '';
  const g = cells[COL_G - 1] ?? '';
  const h = cells[COL_H - 1] ?? '';
  const decision = computeSaldoColor(d, e, g, h);
  return decision !== 'azul';
}
