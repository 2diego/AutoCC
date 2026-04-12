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
      const styleCol =
        c < rowStyles.length ? rowStyles[c] : rowStyles[rowStyles.length - 1];
      if (!styleCol || Object.keys(styleCol).length === 0) continue;
      assignCellStyleFromSnapshot(excelRow.getCell(c + 1), styleCol);
    }
  }
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
