import {
  computeSaldoColor,
  type SaldoColorDecision,
} from '../exports/document-saldo-color.util';

const CSV_DELIMITER = ';';
const COL_COMPROBANTE = 1; // B
const COL_IMPORTE = 3; // D (planilla facturas)
const COL_SALDO = 4; // E (planilla facturas)
const COL_RECIBO = 6; // G
const COL_IMPORTE_RECIBO = 7; // H (planilla facturas)
const COL_FECHA_I = 8; // I
const COL_FECHA_J = 9; // J
const COL_FECHA_K = 10; // K
const COL_OBSERVACIONES = 7; // H (archivo casa central)

/** Comprobante típico ERP (p. ej. A06-002200028682). */
const COMPROBANTE_RE = /^[A-Za-z0-9]+-[A-Za-z0-9\-\/]+$/;

export type FacturaReciboInfo = {
  recibo: string;
  fechas: string[];
  /** Columna D planilla facturas (importe doc). */
  importe: string;
  /** Columna E planilla facturas (saldo). */
  saldo: string;
  /** Columna H planilla facturas (importe(s) de recibo). */
  importeRecibo: string;
};

export type MatchedRendicionPreview = {
  comprobante: string;
  observaciones: string;
  paymentColor: SaldoColorDecision;
};

export type RendicionRowPaymentColor = {
  /** Índice 0-based de la línea en el CSV de salida (= fila Excel − 1). */
  lineIndex: number;
  comprobante: string;
  decision: Exclude<SaldoColorDecision, null>;
};

export type ApplyFacturasSamsengResult = {
  csvText: string;
  baseDocs: number;
  facturasDocs: number;
  matchedDocs: number;
  updatedRows: number;
  previewMatched: MatchedRendicionPreview[];
  /** Filas del base actualizadas con decisión azul/rojo para colorear columna I. */
  rowPaymentColors: RendicionRowPaymentColor[];
};

export function splitCsvLine(line: string): string[] {
  return line.split(CSV_DELIMITER);
}

export function joinCsvLine(cells: string[]): string {
  return cells.join(CSV_DELIMITER);
}

export function normalizeComprobanteKey(value: string): string {
  return value.trim().toUpperCase();
}

export function isComprobanteValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.toLowerCase() === 'comprobante') return false;
  return COMPROBANTE_RE.test(trimmed);
}

export function buildObservacionesFromFactura(
  info: FacturaReciboInfo,
): string {
  const fechas = info.fechas
    .map((f) => f.trim())
    .filter((f) => f.length > 0)
    .join(', ');
  return `Recibos: ${info.recibo.trim()} De fecha: ${fechas}`;
}

/**
 * Misma verificación que consolidación (`computeSaldoColor` sobre D/E/G/H
 * de la planilla facturas).
 */
export function computePaymentColorFromFactura(
  info: FacturaReciboInfo,
): SaldoColorDecision {
  return computeSaldoColor(
    info.importe,
    info.saldo,
    info.recibo,
    info.importeRecibo,
  );
}

/**
 * Indexa la planilla de facturas por columna B (comprobante).
 * Si un comprobante aparece más de una vez, prevalece la última fila con datos.
 */
export function indexFacturasByComprobante(
  csvText: string,
): Map<string, FacturaReciboInfo> {
  const map = new Map<string, FacturaReciboInfo>();
  const lines = csvText.split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = splitCsvLine(line);
    const rawKey = cells[COL_COMPROBANTE] ?? '';
    if (!isComprobanteValue(rawKey)) continue;

    const key = normalizeComprobanteKey(rawKey);
    const recibo = (cells[COL_RECIBO] ?? '').trim();
    const fechas = [
      cells[COL_FECHA_I] ?? '',
      cells[COL_FECHA_J] ?? '',
      cells[COL_FECHA_K] ?? '',
    ];

    map.set(key, {
      recibo,
      fechas,
      importe: (cells[COL_IMPORTE] ?? '').trim(),
      saldo: (cells[COL_SALDO] ?? '').trim(),
      importeRecibo: (cells[COL_IMPORTE_RECIBO] ?? '').trim(),
    });
  }

  return map;
}

/**
 * Cruza columna B del archivo casa central (base) con columna B de planilla facturas.
 * En coincidencias escribe en columna H: `Recibos: {G} De fecha: {I, J, K}`.
 * Además calcula azul/rojo (pago total / parcial) para colorear columna I en el Excel.
 */
export function applyFacturasSamsengToBase(
  baseCsvText: string,
  facturasCsvText: string,
): ApplyFacturasSamsengResult {
  const facturasIndex = indexFacturasByComprobante(facturasCsvText);
  const lines = baseCsvText.split(/\r?\n/);
  const outLines: string[] = [];
  const previewMatched: MatchedRendicionPreview[] = [];
  const rowPaymentColors: RendicionRowPaymentColor[] = [];
  let baseDocs = 0;
  let matchedDocs = 0;
  let updatedRows = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!line.trim()) {
      outLines.push(line);
      continue;
    }

    const cells = splitCsvLine(line);
    const rawKey = cells[COL_COMPROBANTE] ?? '';

    if (!isComprobanteValue(rawKey)) {
      outLines.push(line);
      continue;
    }

    baseDocs += 1;
    const key = normalizeComprobanteKey(rawKey);
    const factura = facturasIndex.get(key);

    if (!factura) {
      outLines.push(line);
      continue;
    }

    matchedDocs += 1;

    const hasRecibo = factura.recibo.trim().length > 0;
    const hasFecha = factura.fechas.some((f) => f.trim().length > 0);

    // Solo escribe si hay recibo y/o fechas; evita "Recibos:  De fecha: " vacío.
    if (!hasRecibo && !hasFecha) {
      outLines.push(line);
      continue;
    }

    const observaciones = buildObservacionesFromFactura(factura);
    const paymentColor = computePaymentColorFromFactura(factura);

    while (cells.length <= COL_OBSERVACIONES) {
      cells.push('');
    }
    cells[COL_OBSERVACIONES] = observaciones;
    updatedRows += 1;

    if (paymentColor) {
      rowPaymentColors.push({
        lineIndex: outLines.length,
        comprobante: rawKey.trim(),
        decision: paymentColor,
      });
    }

    if (previewMatched.length < 50) {
      previewMatched.push({
        comprobante: rawKey.trim(),
        observaciones,
        paymentColor,
      });
    }

    outLines.push(joinCsvLine(cells));
  }

  // Conservar el salto de línea final si el original lo tenía.
  let csvText = outLines.join('\n');
  if (baseCsvText.endsWith('\n') && !csvText.endsWith('\n')) {
    csvText += '\n';
  }

  return {
    csvText,
    baseDocs,
    facturasDocs: facturasIndex.size,
    matchedDocs,
    updatedRows,
    previewMatched,
    rowPaymentColors,
  };
}
