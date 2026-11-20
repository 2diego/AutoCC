import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { appConfig } from '../config/app.config';
import { Roles } from '../common/auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { FacturasSamsengDto } from './dto/facturas-samseng.dto';
import { RendicionCcService } from './rendicion-cc.service';

@Controller('rendicion-cc')
export class RendicionCcController {
  constructor(private readonly rendicionCcService: RendicionCcService) {}

  @Post('facturas-samseng')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'casaCentralFile', maxCount: 1 },
        { name: 'planillaFacturasFile', maxCount: 1 },
      ],
      {
        limits: {
          files: 2,
          fileSize: appConfig.uploadMaxFileSizeBytes,
        },
      },
    ),
  )
  facturasSamseng(
    @Body() dto: FacturasSamsengDto,
    @UploadedFiles()
    files: {
      casaCentralFile?: Express.Multer.File[];
      planillaFacturasFile?: Express.Multer.File[];
    },
  ) {
    const casaCentralFile = files?.casaCentralFile?.[0];
    const planillaFacturasFile = files?.planillaFacturasFile?.[0];

    if (!casaCentralFile || !planillaFacturasFile) {
      throw new BadRequestException(
        'casaCentralFile y planillaFacturasFile son obligatorios',
      );
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

    if (!isCsv(casaCentralFile) || !isCsv(planillaFacturasFile)) {
      throw new BadRequestException('Solo se soportan archivos CSV');
    }

    return this.rendicionCcService.facturasSamseng(
      dto,
      casaCentralFile,
      planillaFacturasFile,
    );
  }
}
