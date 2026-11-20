import { BadRequestException, Injectable } from '@nestjs/common';
import { decodeUploadBufferToUtf8String } from '../common/utils/decode-upload-buffer.util';
import { ErpSource } from '../consolidations/entities/consolidation.entity';
import { FacturasSamsengDto } from './dto/facturas-samseng.dto';
import { applyFacturasSamsengToBaseCeos } from './rendicion-cc-ceos-parser.util';
import {
  buildRendicionWorkbookBuffer,
  buildRendicionWorkbookBufferCeos,
  RENDICION_EXCEL_MIME,
} from './rendicion-cc-excel.util';
import { detectRendicionCasaCentralFormat } from './rendicion-cc-format.util';
import { applyFacturasSamsengToBase } from './rendicion-cc-parser.util';

export type FacturasSamsengResponse = {
  erpSource: ErpSource;
  stats: {
    baseDocs: number;
    facturasDocs: number;
    matchedDocs: number;
    updatedRows: number;
  };
  previewMatched: Array<{
    comprobante: string;
    observaciones: string;
    paymentColor: 'azul' | 'rojo' | null;
  }>;
  fileName: string;
  fileBase64: string;
  mimeType: string;
};

@Injectable()
export class RendicionCcService {
  /**
   * Entrada: CSV.
   * - TOTVS: match col B ↔ B (FC).
   * - CEOS: match nrofac (E) ↔ comprobante NV (B sin prefijo F/D/…).
   * El formato se valida/elige también por el encabezado del base para no
   * devolver un Excel vacío si el desplegable no coincide con el archivo.
   */
  async facturasSamseng(
    dto: FacturasSamsengDto,
    casaCentralFile: Express.Multer.File,
    planillaFacturasFile: Express.Multer.File,
  ): Promise<FacturasSamsengResponse> {
    const baseText = decodeUploadBufferToUtf8String(casaCentralFile.buffer);
    const facturasText = decodeUploadBufferToUtf8String(
      planillaFacturasFile.buffer,
    );

    const detected = detectRendicionCasaCentralFormat(baseText);
    if (detected === 'CEOS' && dto.erpSource !== ErpSource.CEOS) {
      throw new BadRequestException(
        'El archivo casa central es formato CEOS (NV / nrofac). Seleccioná CEOS en el desplegable.',
      );
    }
    if (detected === 'TOTVS' && dto.erpSource !== ErpSource.TOTVS) {
      throw new BadRequestException(
        'El archivo casa central es formato TOTVS (FC / Comprobante). Seleccioná TOTVS en el desplegable.',
      );
    }

    // Si el header identifica el layout, ese manda; si no, usa el desplegable.
    const isCeos =
      detected === 'CEOS' ||
      (detected == null && dto.erpSource === ErpSource.CEOS);

    const result = isCeos
      ? applyFacturasSamsengToBaseCeos(baseText, facturasText)
      : applyFacturasSamsengToBase(baseText, facturasText);

    const buffer = isCeos
      ? await buildRendicionWorkbookBufferCeos(
          result.csvText,
          result.rowPaymentColors,
        )
      : await buildRendicionWorkbookBuffer(
          result.csvText,
          result.rowPaymentColors,
        );

    const effectiveErp = isCeos ? ErpSource.CEOS : ErpSource.TOTVS;
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `rendicion-cc-facturas-samseng-${effectiveErp.toLowerCase()}-${stamp}.xlsx`;

    return {
      erpSource: effectiveErp,
      stats: {
        baseDocs: result.baseDocs,
        facturasDocs: result.facturasDocs,
        matchedDocs: result.matchedDocs,
        updatedRows: result.updatedRows,
      },
      previewMatched: result.previewMatched,
      fileName,
      fileBase64: buffer.toString('base64'),
      mimeType: RENDICION_EXCEL_MIME,
    };
  }
}
