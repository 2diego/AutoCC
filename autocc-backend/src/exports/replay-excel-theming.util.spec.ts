import { Workbook } from 'exceljs';
import { ErpSource } from '../consolidations/entities/consolidation.entity';
import {
  applyReplayExtendedHeaderColumnsMN,
  applyReplayFirstFourRowStyles,
} from './replay-excel-theming.util';

describe('applyReplayExtendedHeaderColumnsMN', () => {
  it('styles TOTVS column M on row 3 like sibling headers and sets Observaciones in N3', () => {
    const wb = new Workbook();
    const ws = wb.addWorksheet('TOTVS_CURRENT');
    ws.getRow(3).getCell(13).value = 'NC';

    applyReplayFirstFourRowStyles(ws, ErpSource.TOTVS, 14);
    applyReplayExtendedHeaderColumnsMN(ws, ErpSource.TOTVS);

    expect(ws.getRow(3).getCell(13).value).toBe('NC');
    expect(ws.getRow(3).getCell(14).value).toBe('Observaciones');
    const fillM = ws.getRow(3).getCell(13).fill as { pattern?: string };
    expect(fillM.pattern).toBe('solid');
  });

  it('sets Observaciones in N2 for CEOS (column headers on row 2)', () => {
    const wb = new Workbook();
    const ws = wb.addWorksheet('CEOS_CURRENT');
    ws.getRow(3).getCell(13).value = 'NC';

    applyReplayFirstFourRowStyles(ws, ErpSource.CEOS, 14);
    applyReplayExtendedHeaderColumnsMN(ws, ErpSource.CEOS);

    expect(ws.getRow(2).getCell(14).value).toBe('Observaciones');
    expect(ws.getRow(3).getCell(13).value).toBe('NC');
    expect(ws.getRow(3).getCell(14).value).not.toBe('Observaciones');
  });
});
