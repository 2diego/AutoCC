import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ConsolidationsService } from './consolidations.service';
import { CreateConsolidationDto } from './dto/create-consolidation.dto';
import { UpdateConsolidationDto } from './dto/update-consolidation.dto';
import { RunConsolidationDto } from './dto/run-consolidation.dto';

@Controller('consolidations')
export class ConsolidationsController {
  constructor(private readonly consolidationsService: ConsolidationsService) {}

  @Post('run')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'baseFile', maxCount: 1 },
      { name: 'erpFile', maxCount: 1 },
    ]),
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

    const isCsv = (file: Express.Multer.File) =>
      file.originalname.toLowerCase().endsWith('.csv');

    if (!isCsv(baseFile) || !isCsv(erpFile)) {
      throw new BadRequestException('Solo se soportan archivos CSV');
    }

    return this.consolidationsService.runConsolidation(
      runConsolidationDto,
      baseFile,
      erpFile,
    );
  }

  @Post()
  create(@Body() createConsolidationDto: CreateConsolidationDto) {
    return this.consolidationsService.create(createConsolidationDto);
  }

  @Get()
  findAll() {
    return this.consolidationsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.consolidationsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateConsolidationDto: UpdateConsolidationDto,
  ) {
    return this.consolidationsService.update(id, updateConsolidationDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.consolidationsService.remove(id);
  }
}
