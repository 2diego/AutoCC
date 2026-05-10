import type { CcCurrent } from '../cc-current/entities/cc-current.entity';
import { ErpSource } from '../consolidations/entities/consolidation.entity';
import {
  computeSaldoColor,
  computeSaldoColorReciboSaldoAFavor,
  isFacturaCanceladaSinAtrasoEnExport,
} from './document-saldo-color.util';

describe('computeSaldoColorReciboSaldoAFavor', () => {
  it('returns null when saldo is not negative', () => {
    expect(
      computeSaldoColorReciboSaldoAFavor('1.000,00', 'REC-1', '500,00'),
    ).toBeNull();
  });

  it('returns azul when abs(saldo) is covered by importes en H', () => {
    expect(
      computeSaldoColorReciboSaldoAFavor(
        '-10.000,00',
        'REC-123',
        '10.000,00',
      ),
    ).toBe('azul');
  });

  it('returns rojo when cobertura parcial en H', () => {
    expect(
      computeSaldoColorReciboSaldoAFavor(
        '-10.000,00',
        'REC-123',
        '1.000,00',
      ),
    ).toBe('rojo');
  });
});

describe('isFacturaCanceladaSinAtrasoEnExport', () => {
  const totvsFactura = {
    erpSource: ErpSource.TOTVS,
    tipoDocumento: 'NF',
    numeroDocumento: 'X',
  } as unknown as CcCurrent;

  it('returns true when G/H indican cancelado (azul)', () => {
    const cells = Array(8).fill('');
    cells[3] = '10.000,00';
    cells[4] = '10.000,00';
    cells[6] = 'REC-1';
    cells[7] = '';
    expect(isFacturaCanceladaSinAtrasoEnExport(totvsFactura, cells)).toBe(true);
  });

  it('returns false when hay pago parcial (rojo)', () => {
    const cells = Array(8).fill('');
    cells[3] = '10.000,00';
    cells[4] = '10.000,00';
    cells[6] = 'REC-1';
    cells[7] = '1.000,00';
    expect(isFacturaCanceladaSinAtrasoEnExport(totvsFactura, cells)).toBe(false);
  });
});

describe('computeSaldoColor with mixed separators in H', () => {
  it('returns rojo for parcial payments with mixed amount formats (TOTVS case)', () => {
    expect(
      computeSaldoColor(
        '7.733.620,78',
        '1.511.304,17',
        'RA-1+RA-2+RA-3',
        '3.141.916,61+2.030.400+1,050.000',
      ),
    ).toBe('rojo');
  });

  it('returns rojo for parcial payments with mixed amount formats (CEOS case)', () => {
    expect(
      computeSaldoColor(
        '7.733.620,78',
        '1.511.304,17',
        'REC-1+REC-2+REC-3',
        '3.141.916,61+2.030.400+1,050.000',
      ),
    ).toBe('rojo');
  });
});
