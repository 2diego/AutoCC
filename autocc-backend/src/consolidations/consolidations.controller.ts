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
import { AddDocumentsFromErpDto } from './dto/add-documents-from-erp.dto';
import { RemoveDocumentsFromErpDto } from './dto/remove-documents-from-erp.dto';
import { Roles } from '../common/auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('consolidations')
export class ConsolidationsController {
  constructor(private readonly consolidationsService: ConsolidationsService) {}

  @Post('add-documents-from-erp')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'baseFile', maxCount: 1 },
        { name: 'erpFile', maxCount: 1 },
      ],
      {
        limits: {
          files: 2,
          fileSize: appConfig.uploadMaxFileSizeBytes,
        },
      },
    ),
  )
  addDocumentsFromErp(
    @Body() addDocumentsFromErpDto: AddDocumentsFromErpDto,
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

    return this.consolidationsService.addDocumentsFromErp(
      addDocumentsFromErpDto,
      baseFile,
      erpFile,
    );
  }

  @Post('remove-documents-from-erp')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'baseFile', maxCount: 1 },
        { name: 'erpFile', maxCount: 1 },
      ],
      {
        limits: {
          files: 2,
          fileSize: appConfig.uploadMaxFileSizeBytes,
        },
      },
    ),
  )
  removeDocumentsFromErp(
    @Body() removeDocumentsFromErpDto: RemoveDocumentsFromErpDto,
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

    return this.consolidationsService.removeDocumentsFromErp(
      removeDocumentsFromErpDto,
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
