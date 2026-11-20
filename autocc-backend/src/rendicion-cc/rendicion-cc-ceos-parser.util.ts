import { canonicalizeCeosNumeroForKey } from '../consolidations/consolidation-parser.util';
import {
  buildObservacionesFromFactura,
  computePaymentColorFromFactura,
  joinCsvLine,
  splitCsvLine,
  type ApplyFacturasSamsengResult,
  type FacturaReciboInfo,
  type MatchedRendicionPreview,
  type RendicionRowPaymentColor,
} from './rendicion-cc-parser.util';

/** Base CEOS: E = nrofac. */
const COL_BASE_NROFAC = 4;
/** Base CEOS: H = observaciones. */
const COL_BASE_OBSERVACIONES = 7;

/** Planilla facturas CEOS (mismo layout SAMSENG NV): B comprobante. */
const COL_FACT_COMPROBANTE = 1;
const COL_FACT_IMPORTE = 3;
const COL_FACT_SALDO = 4;
const COL_FACT_RECIBO = 6;
const COL_FACT_IMPORTE_RECIBO = 7;
const COL_FACT_FECHA_I = 8;
const COL_FACT_FECHA_J = 9;
const COL_FACT_FECHA_K = 10;

/** nrofac típico CEOS: 6A053400 */
const CEOS_NROFAC_RE = /^\d[A-Z]\d+$/i;

/** Comprobante en planilla NV: "F 6A053400", "D …", etc. */
const CEOS_FACTURA_COMPROBANTE_RE = /^([FCDR])\s+([A-Z0-9.-]+)$/i;

export function isCeosNrofacValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.toLowerCase() === 'nrofac') return false;
  return CEOS_NROFAC_RE.test(trimmed);
}

/**
 * Extrae clave canónica CEOS desde planilla facturas (col B: "F 6A053400").
 */
export function extractCeosFacturaMatchKey(rawComprobante: string): string | null {
  const trimmed = rawComprobante.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === 'comprobante') return null;

  const typed = CEOS_FACTURA_COMPROBANTE_RE.exec(trimmed);
  if (typed) {
    return canonicalizeCeosNumeroForKey(typed[2]);
  }

  // Fallback: a veces viene solo el nrofac.
  if (isCeosNrofacValue(trimmed)) {
    return canonicalizeCeosNumeroForKey(trimmed);
  }
  return null;
}

export function indexCeosFacturasByNrofac(
  csvText: string,
): Map<string, FacturaReciboInfo> {
  const map = new Map<string, FacturaReciboInfo>();
  const lines = csvText.split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = splitCsvLine(line);
    const key = extractCeosFacturaMatchKey(cells[COL_FACT_COMPROBANTE] ?? '');
    if (!key) continue;

    map.set(key, {
      recibo: (cells[COL_FACT_RECIBO] ?? '').trim(),
      fechas: [
        cells[COL_FACT_FECHA_I] ?? '',
        cells[COL_FACT_FECHA_J] ?? '',
        cells[COL_FACT_FECHA_K] ?? '',
      ],
      importe: (cells[COL_FACT_IMPORTE] ?? '').trim(),
      saldo: (cells[COL_FACT_SALDO] ?? '').trim(),
      importeRecibo: (cells[COL_FACT_IMPORTE_RECIBO] ?? '').trim(),
    });
  }

  return map;
}

/**
 * Rendición CEOS: cruza base.nrofac (col E) con planilla facturas (col B sin prefijo F/D/…).
 * Escribe observaciones en col H. No altera el flujo TOTVS.
 */
export function applyFacturasSamsengToBaseCeos(
  baseCsvText: string,
  facturasCsvText: string,
): ApplyFacturasSamsengResult {
  const facturasIndex = indexCeosFacturasByNrofac(facturasCsvText);
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
    const rawNrofac = cells[COL_BASE_NROFAC] ?? '';

    if (!isCeosNrofacValue(rawNrofac)) {
      outLines.push(line);
      continue;
    }

    baseDocs += 1;
    const key = canonicalizeCeosNumeroForKey(rawNrofac);
    const factura = facturasIndex.get(key);

    if (!factura) {
      outLines.push(line);
      continue;
    }

    matchedDocs += 1;

    const hasRecibo = factura.recibo.trim().length > 0;
    const hasFecha = factura.fechas.some((f) => f.trim().length > 0);
    if (!hasRecibo && !hasFecha) {
      outLines.push(line);
      continue;
    }

    const observaciones = buildObservacionesFromFactura(factura);
    const paymentColor = computePaymentColorFromFactura(factura);

    while (cells.length <= COL_BASE_OBSERVACIONES) {
      cells.push('');
    }
    cells[COL_BASE_OBSERVACIONES] = observaciones;
    updatedRows += 1;

    if (paymentColor) {
      rowPaymentColors.push({
        lineIndex: outLines.length,
        comprobante: rawNrofac.trim(),
        decision: paymentColor,
      });
    }

    if (previewMatched.length < 50) {
      previewMatched.push({
        comprobante: rawNrofac.trim(),
        observaciones,
        paymentColor,
      });
    }

    outLines.push(joinCsvLine(cells));
  }

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
