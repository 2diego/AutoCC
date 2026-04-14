import { Workbook } from 'exceljs';
import { formatFechaDocUtcDmy } from '../common/utils/format-fecha-doc-utc-dmy.util';
import { CcCurrent } from '../cc-current/entities/cc-current.entity';
import { ErpSource } from '../consolidations/entities/consolidation.entity';
import {
  formatMoneyArDisplay,
  looksLikeDiasAtrasoTotvs,
} from '../common/utils/format-money-ar-display.util';
import {
  buildAtrasoFormulaExcel,
  EXCEL_COL_ATRASO,
  EXCEL_COL_FECHA,
  fechaDocToExcelSerial,
  shouldApplyAtrasoFormula,
} from './excel-atraso-formula.util';
import {
  buildDocumentKeyFromParts,
  initialCeosReplayState,
  initialTotvsReplayState,
  stepCeosBaseLine,
  stepTotvsBaseLine,
  type CeosBaseStepResult,
  type TotvsBaseStepResult,
} from '../consolidations/consolidation-parser.util';
import { applySaldoReceiptPaymentColors } from './excel-saldo-receipt-fill.util';
import {
  applyClientHeaderRowBold,
  applyReplayFirstFourRowStyles,
  applyReplayHeaderLayoutTweaks,
} from './replay-excel-theming.util';

const LINE_SPLIT_REGEX = /\r\n|\n|\r/;

const buildCcRowDocKey = (row: CcCurrent): string =>
  buildDocumentKeyFromParts(
    row.erpSource as ErpSource,
    row.clienteId,
    row.tienda,
    row.tipoDocumento,
    row.numeroDocumento,
  );

const stripErpQuotes = (raw: string): string =>
  raw.replace(/^"+|"+$/g, '').trim();

function splitCsvCommaAware(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((v) => v.replace(/^"+|"+$/g, '').trim());
}

function splitBaseLine(rawLine: string): string[] {
  if (rawLine.includes(';')) {
    return rawLine.split(';');
  }
  if (rawLine.includes(',')) {
    return splitCsvCommaAware(rawLine);
  }
  return [rawLine];
}

const sanitizeCellText = (value: string): string =>
  value
    // Reemplazos por codificación inválida (aparecen como "?" / "�" en Excel).
    .replace(/\uFFFD/g, '')
    // NUL heredado de fuentes defectuosas.
    .replaceAll('\u0000', '');

/** Fila vacía o solo separadores `;` / espacios (no cuenta como “última anotación”). */
function isBlankOrSeparatorLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^[\s;]+$/.test(t)) return true;
  const cols = splitBaseLine(line).map((c) => c.trim());
  return cols.length > 0 && cols.every((c) => c.length === 0);
}

function appendObservacionesColumn(
  rawLine: string,
  observaciones: string | null,
): string[] {
  const parts = splitBaseLine(rawLine).map(sanitizeCellText);
  while (parts.length < 13) {
    parts.push('');
  }
  // Columna M (1-based): índice 12.
  parts[12] = sanitizeCellText(observaciones ?? '');
  return parts;
}

function appendObservacionesToCells(
  parts: string[],
  observaciones: string | null,
): string[] {
  const out = parts.map(sanitizeCellText);
  while (out.length < 13) {
    out.push('');
  }
  // Columna M (1-based): índice 12.
  out[12] = sanitizeCellText(observaciones ?? '');
  return out;
}

/**
 * Fila de export para un registro en `cc_current`: si el documento provino del **archivo base**
 * (consolidación guardó `rawRowJson.raw`), reproducir **todas** las columnas (Recibo, notas, etc.).
 * Solo si viene solo del listado ERP o no hay raw, sintetizar la fila mínima como antes.
 */
/** Expuesto para bot / API: mismas celdas que el replay (D–H) para reglas de Saldo azul. */
export function buildExportCellsFromCcRow(row: CcCurrent): string[] {
  const rawJson = row.rawRowJson;
  if (
    rawJson &&
    rawJson['sourceFile'] === 'BASE' &&
    typeof rawJson['raw'] === 'string'
  ) {
    const raw = rawJson['raw'].trim();
    if (raw.length > 0) {
      return splitBaseLine(rawJson['raw']).map(sanitizeCellText);
    }
  }
  const synthetic =
    row.erpSource.toUpperCase() === 'CEOS'
      ? formatCeosCcRowAsBaseCsvLine(row)
      : formatTotvsCcRowAsBaseCsvLine(row);
  return splitBaseLine(synthetic).map(sanitizeCellText);
}

function groupCcRows(rows: CcCurrent[]): {
  byDocKey: Map<string, CcCurrent>;
  byClientKey: Map<string, CcCurrent[]>;
} {
  const byDocKey = new Map<string, CcCurrent>();
  const byClientKey = new Map<string, CcCurrent[]>();
  for (const row of rows) {
    const dk = buildCcRowDocKey(row);
    byDocKey.set(dk, row);
    const ck = `${row.clienteId}|${row.tienda}`;
    const list = byClientKey.get(ck) ?? [];
    list.push(row);
    byClientKey.set(ck, list);
  }
  return { byDocKey, byClientKey };
}

function getSortLabelForClient(rows: CcCurrent[]): string {
  const r = rows[0];
  if (!r) return '';
  const raw = r.rawRowJson ?? {};
  const n =
    (raw['nombreCliente'] as string | undefined) ??
    (raw['clienteNombre'] as string | undefined) ??
    '';
  return n.trim();
}

function buildSyntheticClientHeaderLine(rows: CcCurrent[]): string {
  const first = rows[0];
  const raw = first.rawRowJson ?? {};
  const nombre = (
    (raw['nombreCliente'] as string | undefined) ??
    (raw['clienteNombre'] as string | undefined) ??
    ''
  ).trim();
  const loc = ((raw['localidad'] as string | undefined) ?? '').trim();
  return `Cliente :${first.clienteId} - ${first.tienda} - ${nombre};;;${loc}`;
}

const getClientSortLabelFromHeaderLine = (line: string): string => {
  const normalized = line.replace(/\u2013|\u2014/g, '-');
  const m = normalized.match(/cliente[^-]*-\s*\d{1,2}\s*-\s*([^;]+)/i);
  return m?.[1]?.trim() ?? '';
};

/**
 * `parseCeosBase`: `parts[2]` fecha, `parts[3]` valor, `parts[4]` saldo.
 * No usar `;;` tras la fecha ni `;;` entre montos: desplaza todo y “Valor” queda vacío,
 * el monto cae en Saldo y se repite en columnas siguientes (Recibo).
 */
function formatCeosCcRowAsBaseCsvLine(row: CcCurrent): string {
  const comprobante = `${row.tipoDocumento} ${row.numeroDocumento}`.trim();
  const fecha = formatFechaDocUtcDmy(row.fechaDoc);
  const v = row.valor;
  const s = row.saldo;
  const hasV = v != null && String(v).trim() !== '';
  const hasS = s != null && String(s).trim() !== '';
  const valorFmt = hasV || hasS ? formatMoneyArDisplay(hasV ? v : s) : '';
  const saldoFmt = hasS || hasV ? formatMoneyArDisplay(hasS ? s : v) : '';
  return `;${comprobante};${fecha};${valorFmt};${saldoFmt};;;;;;;;;`;
}

/**
 * En el listado ERP TOTVS, tras los dos importes suele ir el atraso en días (ej. `-27`, `2`).
 * En el base CSV, la columna tras el importe suele ser ese días / atraso, no un segundo saldo igual.
 */
function extractTotvsDiasAtrasoFromRaw(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const t = stripErpQuotes(raw).trimEnd();
  const m = t.match(/\s(-?\d{1,4})\s*$/);
  return m?.[1] ?? '';
}

/**
 * TOTVS `parseTotvsBase`: `parts[2]` fecha, `parts[3]` valor (importe), `parts[4]` saldo.
 * No usar `;;` tras la fecha: deja `parts[3]` vacío y Excel muestra Importe vacío, el monto
 * cae en Saldo y el siguiente en Atraso.
 * Columna extra `parts[5]`: días de atraso del ERP (el parser no la lee).
 */
function formatTotvsCcRowAsBaseCsvLine(row: CcCurrent): string {
  const fecha = formatFechaDocUtcDmy(row.fechaDoc);
  const token =
    row.tipoDocumento === 'RA'
      ? `REC-${row.numeroDocumento}`.replace(/^REC-REC-/, 'REC-')
      : row.numeroDocumento;
  const rawJson = row.rawRowJson ?? {};
  const diasPersistidos =
    (rawJson['diasAtraso'] as string | undefined) ??
    (rawJson['atrasoDias'] as string | undefined);
  const diasStr =
    diasPersistidos ?? extractTotvsDiasAtrasoFromRaw(rawJson['raw']);

  const v = row.valor;
  const s = row.saldo;
  const hasV = v != null && String(v).trim() !== '';
  const hasS = s != null && String(s).trim() !== '';

  const importeFmt = hasV || hasS ? formatMoneyArDisplay(hasV ? v : s) : '';
  const saldoFmt = hasS || hasV ? formatMoneyArDisplay(hasS ? s : v) : '';

  /** En recibos RA el número final suele ser otro concepto; no mezclar con atraso NF. */
  const esRecibo = row.tipoDocumento === 'RA';
  const atrasoFmt =
    !esRecibo && diasStr !== '' && looksLikeDiasAtrasoTotvs(diasStr)
      ? diasStr.trim()
      : '';

  return `;${token};${fecha};${importeFmt};${saldoFmt};${atrasoFmt};;;;;;;;;`;
}

function buildSyntheticDocLineFromCcRow(row: CcCurrent): string {
  const isCeos = row.erpSource.toUpperCase() === 'CEOS';
  return isCeos
    ? formatCeosCcRowAsBaseCsvLine(row)
    : formatTotvsCcRowAsBaseCsvLine(row);
}

function formatDocLineForExport(row: CcCurrent): string {
  // Siempre formatear desde estado consolidado para evitar
  // arrastrar fechas ambiguas (p.ej. MM/DD) desde raw BASE/ERP.
  return buildSyntheticDocLineFromCcRow(row);
}

/** TypeORM/MySQL puede hidratar `date` como string; no asumir instancia de Date. */
function fechaDocToMs(fechaDoc: CcCurrent['fechaDoc']): number {
  if (fechaDoc == null) return 0;
  const t = new Date(fechaDoc).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function sortCcRowsForExport(a: CcCurrent, b: CcCurrent): number {
  const fa = fechaDocToMs(a.fechaDoc);
  const fb = fechaDocToMs(b.fechaDoc);
  if (fa !== fb) return fa - fb;
  const ta = `${a.tipoDocumento}|${a.numeroDocumento}`;
  const tb = `${b.tipoDocumento}|${b.numeroDocumento}`;
  return ta.localeCompare(tb, 'es');
}

/**
 * Export replay con fórmula de atraso en columna F (facturas).
 * Consumidores API / bots: calcular atraso desde `fechaDoc` en JSON, no leer la celda Excel
 * (es fórmula y depende del cliente que abre el archivo).
 */
export async function buildReplayWorkbook(
  erpSource: ErpSource,
  baseText: string,
  ccRows: CcCurrent[],
): Promise<Buffer> {
  const { byDocKey, byClientKey } = groupCcRows(ccRows);
  const lines = baseText.split(LINE_SPLIT_REGEX);

  const dataRows: string[][] = [];
  /** Alineado con `dataRows`: clave documento para filas de comprobante, null en el resto. */
  const docRowKeys: (string | null)[] = [];
  /** Fila "Cliente :…" (cabecera de cliente), para negrita en export. */
  const clientHeaderRowFlags: boolean[] = [];
  /** Clave cliente/tienda para cabeceras de cliente (null en otras filas). */
  const clientHeaderKeys: (string | null)[] = [];
  /** Etiqueta de orden tomada del encabezado del base (para clientes sin docs en cc_current). */
  const baseHeaderSortLabelByClientKey = new Map<string, string>();
  const baseClientKeysSet = new Set<string>();

  let activeClientKey: string | null = null;
  let baseDocsSeenForClient = new Set<string>();
  /** Última fila “sustantiva” del cliente activo (cabecera, documento o línea con texto); no avanza en filas vacías del base. */
  let segmentAnchorIndex: number | null = null;

  const pushDataRow = (
    cells: string[],
    docKey: string | null,
    isClientHeaderRow = false,
    clientHeaderKey: string | null = null,
  ) => {
    dataRows.push(cells);
    docRowKeys.push(docKey);
    clientHeaderRowFlags.push(isClientHeaderRow);
    clientHeaderKeys.push(isClientHeaderRow ? clientHeaderKey : null);
  };

  const isRowBlank = (cells: string[]): boolean =>
    cells.length === 0 || cells.every((c) => c.trim().length === 0);

  const flushMissingForClient = (clientKey: string | null) => {
    if (!clientKey) return;
    const clientRows = byClientKey.get(clientKey) ?? [];
    const missing = clientRows
      .filter((r) => !baseDocsSeenForClient.has(buildCcRowDocKey(r)))
      .sort(sortCcRowsForExport);
    if (missing.length === 0) return;

    const injections = missing.map((r) =>
      appendObservacionesColumn(
        formatDocLineForExport(r),
        r.observaciones ?? null,
      ),
    );
    const injKeys = missing.map((r) => buildCcRowDocKey(r));

    if (segmentAnchorIndex === null) {
      injections.forEach((row, i) => pushDataRow(row, injKeys[i]));
      if (dataRows.length === 0 || !isRowBlank(dataRows[dataRows.length - 1])) {
        pushDataRow([], null);
      }
      return;
    }

    const tail = dataRows.slice(segmentAnchorIndex + 1);
    const tailKeys = docRowKeys.slice(segmentAnchorIndex + 1);
    const tailClientFlags = clientHeaderRowFlags.slice(segmentAnchorIndex + 1);
    const tailHeaderKeys = clientHeaderKeys.slice(segmentAnchorIndex + 1);
    dataRows.length = segmentAnchorIndex + 1;
    docRowKeys.length = segmentAnchorIndex + 1;
    clientHeaderRowFlags.length = segmentAnchorIndex + 1;
    clientHeaderKeys.length = segmentAnchorIndex + 1;
    injections.forEach((row, i) => pushDataRow(row, injKeys[i]));
    if (tail.length === 0 || !isRowBlank(tail[0])) {
      pushDataRow([], null);
    }
    tail.forEach((row, i) =>
      pushDataRow(
        row,
        tailKeys[i],
        tailClientFlags[i] ?? false,
        tailHeaderKeys[i] ?? null,
      ),
    );
  };

  const compareClientKeys = (a: string, b: string): number => {
    const la = (
      getSortLabelForClient(byClientKey.get(a) ?? []) ||
      baseHeaderSortLabelByClientKey.get(a) ||
      ''
    ).toUpperCase();
    const lb = (
      getSortLabelForClient(byClientKey.get(b) ?? []) ||
      baseHeaderSortLabelByClientKey.get(b) ||
      ''
    ).toUpperCase();
    if (la && lb && la !== lb) return la.localeCompare(lb, 'es');
    if (la && !lb) return -1;
    if (!la && lb) return 1;
    return a.localeCompare(b, 'es');
  };

  const processLine = (result: CeosBaseStepResult | TotvsBaseStepResult) => {
    if (result.kind === 'header' && result.clientKey) {
      flushMissingForClient(activeClientKey);
      activeClientKey = result.clientKey;
      baseDocsSeenForClient = new Set();
      if (!baseClientKeysSet.has(result.clientKey)) {
        baseClientKeysSet.add(result.clientKey);
      }
    }
  };

  const emitLineAfterProcess = (
    line: string,
    result: CeosBaseStepResult | TotvsBaseStepResult,
  ) => {
    if (result.kind === 'header') {
      if (result.clientKey) {
        baseHeaderSortLabelByClientKey.set(
          result.clientKey,
          getClientSortLabelFromHeaderLine(line),
        );
      }
      pushDataRow(
        appendObservacionesColumn(line, null),
        null,
        true,
        result.clientKey ?? null,
      );
      segmentAnchorIndex = dataRows.length - 1;
      return;
    }
    if (result.kind === 'doc' && result.docKey) {
      baseDocsSeenForClient.add(result.docKey);
      const cc = byDocKey.get(result.docKey);
      // Si el documento del base ya no existe en `cc_current`, no debe salir en el export replay.
      if (!cc) {
        return;
      }
      pushDataRow(
        appendObservacionesToCells(
          buildExportCellsFromCcRow(cc),
          cc.observaciones ?? null,
        ),
        result.docKey,
      );
      segmentAnchorIndex = dataRows.length - 1;
      return;
    }
    pushDataRow(appendObservacionesColumn(line, null), null);
    if (result.kind === 'other' && !isBlankOrSeparatorLine(line)) {
      segmentAnchorIndex = dataRows.length - 1;
    }
  };

  if (erpSource === ErpSource.CEOS) {
    let state = initialCeosReplayState();
    for (const line of lines) {
      const result = stepCeosBaseLine(line, state);
      state = result.next;
      processLine(result);
      emitLineAfterProcess(line, result);
    }
  } else {
    let state = initialTotvsReplayState();
    for (const line of lines) {
      const result = stepTotvsBaseLine(line, state);
      state = result.next;
      processLine(result);
      emitLineAfterProcess(line, result);
    }
  }

  flushMissingForClient(activeClientKey);

  const ccClientKeys = [...byClientKey.keys()];
  const erpOnlyClientKeys = ccClientKeys.filter(
    (ck) => !baseClientKeysSet.has(ck),
  );
  erpOnlyClientKeys.sort(compareClientKeys);

  for (const ck of erpOnlyClientKeys) {
    const rows = (byClientKey.get(ck) ?? []).sort(sortCcRowsForExport);
    if (rows.length === 0) continue;
    const blockRows: string[][] = [];
    const blockDocKeys: (string | null)[] = [];
    const blockHeaderFlags: boolean[] = [];
    const blockHeaderKeys: (string | null)[] = [];

    blockRows.push(
      appendObservacionesColumn(buildSyntheticClientHeaderLine(rows), null),
    );
    blockDocKeys.push(null);
    blockHeaderFlags.push(true);
    blockHeaderKeys.push(ck);
    for (const r of rows) {
      const line = formatDocLineForExport(r);
      blockRows.push(appendObservacionesColumn(line, r.observaciones ?? null));
      blockDocKeys.push(buildCcRowDocKey(r));
      blockHeaderFlags.push(false);
      blockHeaderKeys.push(null);
    }
    blockRows.push([]);
    blockDocKeys.push(null);
    blockHeaderFlags.push(false);
    blockHeaderKeys.push(null);

    let insertAt = dataRows.length;
    for (let i = 0; i < clientHeaderKeys.length; i++) {
      const existingKey = clientHeaderKeys[i];
      if (!existingKey) continue;
      if (compareClientKeys(ck, existingKey) < 0) {
        insertAt = i;
        break;
      }
    }

    dataRows.splice(insertAt, 0, ...blockRows);
    docRowKeys.splice(insertAt, 0, ...blockDocKeys);
    clientHeaderRowFlags.splice(insertAt, 0, ...blockHeaderFlags);
    clientHeaderKeys.splice(insertAt, 0, ...blockHeaderKeys);
  }

  let maxCols = 0;
  for (const r of dataRows) {
    maxCols = Math.max(maxCols, r.length);
  }
  for (const r of dataRows) {
    while (r.length < maxCols) {
      r.push('');
    }
  }

  const workbook = new Workbook();
  const ws = workbook.addWorksheet(`${erpSource}_CURRENT`);

  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i];
    const dk = docRowKeys[i];
    const excelRowNum = i + 1;
    const row = ws.getRow(excelRowNum);
    for (let c = 0; c < cells.length; c++) {
      row.getCell(c + 1).value = cells[c];
    }
    if (dk) {
      const cc = byDocKey.get(dk);
      if (cc) {
        const serial = fechaDocToExcelSerial(cc.fechaDoc);
        if (serial != null) {
          row.getCell(EXCEL_COL_FECHA).value = serial;
          row.getCell(EXCEL_COL_FECHA).numFmt = 'dd/mm/yyyy';
        }
      }
      if (cc && shouldApplyAtrasoFormula(cc)) {
        row.getCell(EXCEL_COL_ATRASO).value = {
          formula: buildAtrasoFormulaExcel(excelRowNum),
        };
      }
    }
  }

  applyReplayFirstFourRowStyles(ws, erpSource, maxCols);
  applyReplayHeaderLayoutTweaks(ws, erpSource);
  for (let i = 0; i < clientHeaderRowFlags.length; i++) {
    if (clientHeaderRowFlags[i]) {
      applyClientHeaderRowBold(ws, i + 1, maxCols);
    }
  }

  applySaldoReceiptPaymentColors(ws, dataRows, docRowKeys, byDocKey);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
