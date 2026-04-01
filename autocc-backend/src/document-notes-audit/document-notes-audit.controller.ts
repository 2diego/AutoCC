import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { DocumentNotesAuditService } from './document-notes-audit.service';
import { Roles } from '../common/auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('document-notes-audit')
@Roles(UserRole.ADMIN)
export class DocumentNotesAuditController {
  constructor(private readonly documentNotesAuditService: DocumentNotesAuditService) {}

  @Get()
  findAll() {
    return this.documentNotesAuditService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.documentNotesAuditService.findOne(id);
  }
}
