export const parseMoneyERP = (rawValue: string): number => {
  const value = rawValue.trim();
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
