import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { CcCurrentService } from './cc-current.service';
import { CreateCcCurrentDto } from './dto/create-cc-current.dto';
import { UpdateCcCurrentDto } from './dto/update-cc-current.dto';
import { UpdateDocumentNotesDto } from './dto/update-document-notes.dto';

@Controller('current')
export class CcCurrentController {
  constructor(private readonly ccCurrentService: CcCurrentService) {}

  @Post()
  create(@Body() createCcCurrentDto: CreateCcCurrentDto) {
    return this.ccCurrentService.create(createCcCurrentDto);
  }

  @Get()
  findAll() {
    return this.ccCurrentService.findAll();
  }

  @Get(':erpSource')
  findByErpSource(
    @Param('erpSource') erpSource: string,
    @Query('clienteId') clienteId?: string,
    @Query('tipoDocumento') tipoDocumento?: string,
    @Query('q') q?: string,
  ) {
    return this.ccCurrentService.findByErpSource(
      erpSource,
      clienteId,
      tipoDocumento,
      q,
    );
  }

  @Patch(':erpSource/documents/:documentKey/notes')
  updateNotes(
    @Param('erpSource') erpSource: string,
    @Param('documentKey') documentKey: string,
    @Body() updateDocumentNotesDto: UpdateDocumentNotesDto,
  ) {
    return this.ccCurrentService.updateDocumentNotes(
      erpSource,
      documentKey,
      updateDocumentNotesDto,
    );
  }

  @Get('row/:id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ccCurrentService.findOne(id);
  }

  @Patch('row/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCcCurrentDto: UpdateCcCurrentDto,
  ) {
    return this.ccCurrentService.update(id, updateCcCurrentDto);
  }

  @Delete('row/:id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.ccCurrentService.remove(id);
  }
}
