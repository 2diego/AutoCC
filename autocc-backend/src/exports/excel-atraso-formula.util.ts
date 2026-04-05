import type { CcCurrent } from '../cc-current/entities/cc-current.entity';
import { ErpSource } from '../consolidations/entities/consolidation.entity';

/** Layout replay: col A vacío implícito en parts[0], B=comprobante, C=fecha, D-E montos, F=atraso (fórmula). */
export const EXCEL_COL_FECHA = 3;
export const EXCEL_COL_ATRASO = 6;

/**
 * Facturas / notas a las que aplica días de atraso desde fecha documento.
 * CEOS recibo = R; TOTVS recibo = RA.
 */
export function shouldApplyAtrasoFormula(cc: CcCurrent): boolean {
  if (cc.fechaDoc == null) return false;
  const t = cc.tipoDocumento.toUpperCase();
  const erp = cc.erpSource.toUpperCase() as ErpSource;
  if (erp === ErpSource.CEOS) {
    return t !== 'R';
  }
  if (erp === ErpSource.TOTVS) {
    return t !== 'RA';
  }
  return false;
}

export function fechaDocToExcelLocalDate(
  fechaDoc: CcCurrent['fechaDoc'],
): Date | null {
  if (fechaDoc == null) return null;
  const d = fechaDoc instanceof Date ? fechaDoc : new Date(fechaDoc as string);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Días de atraso desde fecha del documento hasta hoy (no negativo).
 * Referencia columna fecha en la misma fila (C).
 */
export function buildAtrasoFormulaExcel(rowNumber: number): string {
  const c = `C${rowNumber}`;
  return `IF(ISBLANK(${c}),"",MAX(0,INT(TODAY())-INT(${c})))`;
}
