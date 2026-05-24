import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Cell, Style, Worksheet } from 'exceljs';
import { ErpSource } from '../consolidations/entities/consolidation.entity';

type CellStyleBag = Partial<Style>;

interface HeaderBlock {
  heights: (number | null)[];
  rows: CellStyleBag[][];
}

interface StylesFile {
  totvs: HeaderBlock;
  ceos: HeaderBlock;
}

let cached: StylesFile | null = null;

function loadSnapshots(): StylesFile {
  if (!cached) {
    const path = join(__dirname, 'replay-header-styles.json');
    cached = JSON.parse(readFileSync(path, 'utf-8')) as StylesFile;
  }
  return cached;
}

/** Excel a veces guarda `theme` en lugar de ARGB; ExcelJS en export no resuelve temas del libro de referencia. */
function sanitizeStyle(style: CellStyleBag): CellStyleBag {
  const s = JSON.parse(JSON.stringify(style)) as CellStyleBag;
  if (s.font?.color && typeof s.font.color === 'object') {
    const c = s.font.color as Record<string, unknown>;
    if ('theme' in c) {
      s.font = { ...s.font, color: { argb: 'FF000000' } };
    }
  }
  if (
    s.fill?.type === 'pattern' &&
    s.fill.fgColor &&
    typeof s.fill.fgColor === 'object'
  ) {
    const fg = s.fill.fgColor as Record<string, unknown>;
    if ('theme' in fg) {
      s.fill = {
        ...s.fill,
        fgColor: { argb: 'FFF2F2F2' },
        bgColor:
          s.fill.bgColor &&
          typeof s.fill.bgColor === 'object' &&
          'theme' in (s.fill.bgColor as object)
            ? { argb: 'FFF2F2F2' }
            : s.fill.bgColor,
      };
    }
  }
  return s;
}

function assignCellStyleFromSnapshot(cell: Cell, snap: CellStyleBag): void {
  const st = sanitizeStyle(snap);
  if (st.font) cell.font = { ...cell.font, ...st.font } as Cell['font'];
  if (st.fill) cell.fill = st.fill;
  if (st.alignment)
    cell.alignment = {
      ...cell.alignment,
      ...st.alignment,
    } as Cell['alignment'];
  if (st.border) cell.border = st.border;
  if (st.numFmt) cell.numFmt = st.numFmt;
}

function isNonEmptyStyle(snap: CellStyleBag | undefined): snap is CellStyleBag {
  return Boolean(snap && Object.keys(snap).length > 0);
}

/** Evita que celdas `{}` del snapshot dejen M/N sin estilo; usa la última columna con estilo real. */
function resolveRowStyleForColumn(
  rowStyles: CellStyleBag[],
  colIndex: number,
): CellStyleBag | null {
  if (colIndex < rowStyles.length && isNonEmptyStyle(rowStyles[colIndex])) {
    return rowStyles[colIndex];
  }
  const upTo = Math.min(colIndex, rowStyles.length - 1);
  for (let i = upTo; i >= 0; i -= 1) {
    if (isNonEmptyStyle(rowStyles[i])) return rowStyles[i];
  }
  for (let i = rowStyles.length - 1; i >= 0; i -= 1) {
    if (isNonEmptyStyle(rowStyles[i])) return rowStyles[i];
  }
  return null;
}

/** Columnas M y N (1-based) en filas de encabezado del layout base. */
const EXCEL_HEADER_COL_M = 13;
const EXCEL_HEADER_COL_N = 14;

/** Filas Excel donde aplicar estilos de encabezado en M/N (layout distinto por ERP). */
function headerLabelRowsFor(erpSource: ErpSource): readonly number[] {
  return erpSource === ErpSource.CEOS ? [2, 3, 4] : [3, 4];
}

/** Fila del rótulo "Observaciones" en columna N. */
function observacionesHeaderRowFor(erpSource: ErpSource): number {
  return erpSource === ErpSource.CEOS ? 2 : 3;
}

/**
 * Primeras 4 filas del replay: mismos estilos que las plantillas SAMSENG (hoja CTA.CORRIENTE).
 */
export function applyReplayFirstFourRowStyles(
  ws: Worksheet,
  erpSource: ErpSource,
  maxCols: number,
): void {
  const file = loadSnapshots();
  const block: HeaderBlock =
    erpSource === ErpSource.CEOS ? file.ceos : file.totvs;

  for (let r = 0; r < 4; r++) {
    const excelRow = ws.getRow(r + 1);
    const h = block.heights[r];
    if (h != null && h > 0) {
      excelRow.height = h;
    }
    const rowStyles = block.rows[r] ?? [];
    if (rowStyles.length === 0) continue;

    for (let c = 0; c < maxCols; c++) {
      const styleCol = resolveRowStyleForColumn(rowStyles, c);
      if (!styleCol) continue;
      assignCellStyleFromSnapshot(excelRow.getCell(c + 1), styleCol);
    }
  }
}

/**
 * Estilos en M/N en filas de encabezado; rótulo "Observaciones" en N2 (CEOS) o N3 (TOTVS).
 */
export function applyReplayExtendedHeaderColumnsMN(
  ws: Worksheet,
  erpSource: ErpSource,
): void {
  const block: HeaderBlock =
    erpSource === ErpSource.CEOS
      ? loadSnapshots().ceos
      : loadSnapshots().totvs;

  for (const rowNum of headerLabelRowsFor(erpSource)) {
    const snapRow = block.rows[rowNum - 1] ?? [];
    const excelRow = ws.getRow(rowNum);
    for (const col of [EXCEL_HEADER_COL_M, EXCEL_HEADER_COL_N]) {
      const style = resolveRowStyleForColumn(snapRow, col - 1);
      if (style) {
        assignCellStyleFromSnapshot(excelRow.getCell(col), style);
      }
    }
  }

  const obsRow = observacionesHeaderRowFor(erpSource);
  const nObs = ws.getCell(obsRow, EXCEL_HEADER_COL_N);
  nObs.value = 'Observaciones';
  const snapObsRow = block.rows[obsRow - 1] ?? [];
  const nObsStyle = resolveRowStyleForColumn(
    snapObsRow,
    EXCEL_HEADER_COL_N - 1,
  );
  if (nObsStyle) {
    assignCellStyleFromSnapshot(nObs, nObsStyle);
  }
}

function mergeAndCenter(ws: Worksheet, range: string): void {
  ws.mergeCells(range);
  const firstCell = ws.getCell(range.split(':')[0]);
  firstCell.alignment = {
    ...firstCell.alignment,
    horizontal: 'center',
    vertical: 'middle',
  };
}

/**
 * Ajustes de layout para encabezado del replay descargable.
 * - TOTVS: combinar y centrar C1:J1, congelar filas 1 a 4, poner fecha actual en A1
 * - CEOS: combinar y centrar A1:D1, congelar filas 1 a 3, poner fecha actual en A2, fondo negro en A3 y B3
 */
export function applyReplayHeaderLayoutTweaks(
  ws: Worksheet,
  erpSource: ErpSource,
): void {
  if (erpSource === ErpSource.CEOS) {
    ws.views = [{ state: 'frozen', ySplit: 3 }];
    ws.getCell('A2').value = { formula: 'TODAY()' };
    mergeAndCenter(ws, 'A1:D1');
    ws.getCell('A3').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF000000' },
    };
    ws.getCell('B3').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF000000' },
    };
    return;
  }

  ws.views = [{ state: 'frozen', ySplit: 4 }];
  ws.getCell('A1').value = { formula: 'TODAY()' };
  mergeAndCenter(ws, 'C1:J1');
}

/** Fila "Cliente :…" (cabecera de cliente, no comprobantes). */
export function applyClientHeaderRowBold(
  ws: Worksheet,
  excelRowNum: number,
  maxCols: number,
): void {
  const row = ws.getRow(excelRowNum);
  for (let c = 1; c <= maxCols; c++) {
    const cell = row.getCell(c);
    const f = cell.font ?? {};
    cell.font = { ...f, bold: true };
  }
}
