/** Respuesta del bot: documento con atraso calculado y clave para PATCH de observaciones. */
export type BotCurrentDocumentDto = {
  id: number;
  clienteId: string;
  tienda: string;
  nombreCliente: string;
  /** Desde listado ERP / base CEOS (rawRowJson.localidad), si está disponible. */
  localidad: string;
  tipoDocumento: string;
  numeroDocumento: string;
  fechaDoc: string | null;
  saldo: string | null;
  observaciones: string | null;
  atrasoDiasCalculado: number;
  /** Para `PATCH /api/current/:erpSource/documents/:documentKey/notes` (URL-encoded). */
  documentKey: string;
};

export type BotDeudasClienteGroupDto = {
  clienteId: string;
  tienda: string;
  nombreCliente: string;
  localidad: string;
  documentos: BotCurrentDocumentDto[];
};
