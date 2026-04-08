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
import { Roles } from '../common/auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { ExportsService } from './exports.service';

@Controller('exports')
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Get(':erpSource/current.xlsx')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
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

  @Get(':erpSource/backup.xlsx')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  async getBackupXlsx(
    @Param('erpSource', new ParseEnumPipe(ErpSource))
    erpSource: ErpSource,
    @Res() res: Response,
  ) {
    const buffer = await this.exportsService.buildBackupWorkbook(erpSource);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${erpSource.toLowerCase()}-backup.xlsx"`,
    );
    res.send(buffer);
  }
}
