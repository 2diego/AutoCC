import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { appConfig } from '../config/app.config';
import { ConsolidationsService } from './consolidations.service';
import { RunConsolidationDto } from './dto/run-consolidation.dto';
import { Roles } from '../common/auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('consolidations')
export class ConsolidationsController {
  constructor(private readonly consolidationsService: ConsolidationsService) {}

  @Post('run')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'baseFile', maxCount: 1 },
      { name: 'erpFile', maxCount: 1 },
    ], {
      limits: {
        files: 2,
        fileSize: appConfig.uploadMaxFileSizeBytes,
      },
    }),
  )
  run(
    @Body() runConsolidationDto: RunConsolidationDto,
    @UploadedFiles()
    files: {
      baseFile?: Express.Multer.File[];
      erpFile?: Express.Multer.File[];
    },
  ) {
    const baseFile = files?.baseFile?.[0];
    const erpFile = files?.erpFile?.[0];

    if (!baseFile || !erpFile) {
      throw new BadRequestException('baseFile y erpFile son obligatorios');
    }

    const isCsv = (file: Express.Multer.File) => {
      const nameOk = file.originalname.toLowerCase().endsWith('.csv');
      const mimeOk =
        !file.mimetype ||
        file.mimetype === 'text/csv' ||
        file.mimetype === 'application/vnd.ms-excel' ||
        file.mimetype === 'application/octet-stream';
      return nameOk && mimeOk;
    };

    if (!isCsv(baseFile) || !isCsv(erpFile)) {
      throw new BadRequestException('Solo se soportan archivos CSV');
    }

    return this.consolidationsService.runConsolidation(
      runConsolidationDto,
      baseFile,
      erpFile,
    );
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  findAll() {
    return this.consolidationsService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.consolidationsService.findOne(id);
  }

  @Get(':id/errors')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  findErrors(@Param('id', ParseIntPipe) id: number) {
    return this.consolidationsService.findErrorsByConsolidation(id);
  }
}
