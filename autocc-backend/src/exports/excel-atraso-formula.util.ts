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

/**
 * Serial Excel (día) calculado sin timezone para evitar corrimientos de fecha.
 */
export function fechaDocToExcelSerial(
  fechaDoc: CcCurrent['fechaDoc'],
): number | null {
  if (fechaDoc == null) return null;
  const text = String(fechaDoc).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    const utc = Date.UTC(Number(y), Number(m) - 1, Number(d));
    return utc / 86400000 + 25569;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  const utc = Date.UTC(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate(),
  );
  return utc / 86400000 + 25569;
}

/**
 * Días de atraso desde fecha del documento hasta hoy (no negativo).
 * Referencia columna fecha en la misma fila (C).
 */
export function buildAtrasoFormulaExcel(rowNumber: number): string {
  const c = `C${rowNumber}`;
  return `IF(ISBLANK(${c}),"",MAX(0,INT(TODAY())-INT(${c})))`;
}
