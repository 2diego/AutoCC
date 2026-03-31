export class CreateCcCurrentDto {
  erpSource: string;
  clienteId: string;
  tienda: string;
  tipoDocumento: string;
  numeroDocumento: string;
  fechaDoc?: Date | null;
  valor?: string | null;
  saldo?: string | null;
  rawRowJson?: Record<string, unknown> | null;
  observaciones?: string | null;
  motivoDeuda?: string | null;
  lastConsolidation?: { id: number } | null;
}
