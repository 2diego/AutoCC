import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { DocumentNotesAuditService } from './document-notes-audit.service';
import { CreateDocumentNotesAuditDto } from './dto/create-document-notes-audit.dto';
import { UpdateDocumentNotesAuditDto } from './dto/update-document-notes-audit.dto';

@Controller('document-notes-audit')
export class DocumentNotesAuditController {
  constructor(private readonly documentNotesAuditService: DocumentNotesAuditService) {}

  @Post()
  create(@Body() createDocumentNotesAuditDto: CreateDocumentNotesAuditDto) {
    return this.documentNotesAuditService.create(createDocumentNotesAuditDto);
  }

  @Get()
  findAll() {
    return this.documentNotesAuditService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.documentNotesAuditService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDocumentNotesAuditDto: UpdateDocumentNotesAuditDto,
  ) {
    return this.documentNotesAuditService.update(id, updateDocumentNotesAuditDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.documentNotesAuditService.remove(id);
  }
}
