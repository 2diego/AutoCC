/**
 * Fecha `date` / ISO almacenada como día-only en UTC (misma convención que export legacy).
 */
export function formatFechaDocUtcDmy(
  fechaDoc: Date | string | null | undefined,
): string {
  if (fechaDoc == null) return '';
  const d = fechaDoc instanceof Date ? fechaDoc : new Date(fechaDoc);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
