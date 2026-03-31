import {
  Controller,
  Get,
  Header,
  Param,
  ParseEnumPipe,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ErpSource } from '../consolidations/entities/consolidation.entity';
import { ExportsService } from './exports.service';

@Controller('exports')
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Get(':erpSource/current.xlsx')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  async getCurrentXlsx(
    @Param('erpSource', new ParseEnumPipe(ErpSource))
    erpSource: ErpSource,
    @Res() res: Response,
  ) {
    const buffer = await this.exportsService.buildCurrentWorkbook(erpSource);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${erpSource.toLowerCase()}-current.xlsx"`,
    );
    res.send(buffer);
  }
}
