import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  ParseEnumPipe,
  Query,
} from '@nestjs/common';
import { CcCurrentService } from './cc-current.service';
import { UpdateDocumentNotesDto } from './dto/update-document-notes.dto';
import { Roles } from '../common/auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { ErpSource } from '../consolidations/entities/consolidation.entity';

@Controller('current')
export class CcCurrentController {
  constructor(private readonly ccCurrentService: CcCurrentService) {}

  /** Bot / UI: facturas y ND “pendientes”, con filtro opcional por cliente o texto. */
  @Get(':erpSource/bot/pendientes')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  botPendientes(
    @Param('erpSource', new ParseEnumPipe(ErpSource)) erpSource: ErpSource,
    @Query('clienteId') clienteId?: string,
    @Query('q') q?: string,
  ) {
    return this.ccCurrentService.findBotPendientesFactura(
      erpSource,
      clienteId,
      q,
    );
  }

  /** Bot flujo “deudas”: grupos por cliente con documentos sin observación, atraso ≥ umbral (fecha doc → hoy). */
  @Get(':erpSource/bot/deudas-sin-observaciones')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  botDeudasSinObservaciones(
    @Param('erpSource', new ParseEnumPipe(ErpSource)) erpSource: ErpSource,
    @Query('minAtrasoDias') minAtrasoDias?: string,
  ) {
    const n =
      minAtrasoDias != null && minAtrasoDias !== ''
        ? Number(minAtrasoDias)
        : 0;
    return this.ccCurrentService.findBotDeudasSinObservaciones(erpSource, n);
  }

  @Get(':erpSource')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  findByErpSource(
    @Param('erpSource', new ParseEnumPipe(ErpSource)) erpSource: ErpSource,
    @Query('clienteId') clienteId?: string,
    @Query('tipoDocumento') tipoDocumento?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.ccCurrentService.findByErpSource(
      erpSource,
      clienteId,
      tipoDocumento,
      q,
      limit ? Number(limit) : undefined,
      offset ? Number(offset) : undefined,
    );
  }

  @Patch(':erpSource/documents/:documentKey/notes')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  updateNotes(
    @Param('erpSource', new ParseEnumPipe(ErpSource)) erpSource: ErpSource,
    @Param('documentKey') documentKey: string,
    @Body() updateDocumentNotesDto: UpdateDocumentNotesDto,
  ) {
    return this.ccCurrentService.updateDocumentNotes(
      erpSource,
      documentKey,
      updateDocumentNotesDto,
    );
  }
}
