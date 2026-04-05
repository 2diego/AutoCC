import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateDocumentNotesAuditDto } from './dto/create-document-notes-audit.dto';
import { UpdateDocumentNotesAuditDto } from './dto/update-document-notes-audit.dto';
import { DocumentNotesAudit } from './entities/document-notes-audit.entity';

@Injectable()
export class DocumentNotesAuditService {
  constructor(
    @InjectRepository(DocumentNotesAudit)
    private readonly documentNotesAuditRepository: Repository<DocumentNotesAudit>,
  ) {}

  create(createDocumentNotesAuditDto: CreateDocumentNotesAuditDto) {
    const entity = this.documentNotesAuditRepository.create(
      createDocumentNotesAuditDto,
    );
    return this.documentNotesAuditRepository.save(entity);
  }

  findAll() {
    return this.documentNotesAuditRepository.find({
      relations: ['changedByUser'],
      order: { changedAt: 'DESC' },
    });
  }

  findOne(id: number) {
    return this.documentNotesAuditRepository.findOne({
      where: { id },
      relations: ['changedByUser'],
    });
  }

  update(id: number, updateDocumentNotesAuditDto: UpdateDocumentNotesAuditDto) {
    return this.documentNotesAuditRepository.update(
      id,
      updateDocumentNotesAuditDto,
    );
  }

  remove(id: number) {
    return this.documentNotesAuditRepository.delete(id);
  }
}
