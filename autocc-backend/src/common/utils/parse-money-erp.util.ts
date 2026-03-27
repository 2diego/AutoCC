export const parseMoneyERP = (rawValue: string): number => {
  // Este utilitario parsea un solo formato de monto desde valores en formato CEOS/TOTVS.
  // Ejemplos soportados:
  // - 325,074.81
  // - 540.119,47
  // - -430.651,10
  const value = rawValue.trim().replace(/\s+/g, '');
  if (!value) {
    throw new Error('Empty money value');
  }

  const lastDot = value.lastIndexOf('.');
  const lastComma = value.lastIndexOf(',');
  const decimalSeparator = lastDot > lastComma ? '.' : ',';
  const thousandsSeparator = decimalSeparator === '.' ? ',' : '.';

  const normalized = value
    .split(thousandsSeparator)
    .join('')
    .replace(decimalSeparator, '.');

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid money value: ${rawValue}`);
  }

  return parsed;
};
