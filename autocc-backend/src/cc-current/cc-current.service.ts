import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCcCurrentDto } from './dto/create-cc-current.dto';
import { UpdateCcCurrentDto } from './dto/update-cc-current.dto';
import { CcCurrent } from './entities/cc-current.entity';
import { DocumentNotesAudit } from '../document-notes-audit/entities/document-notes-audit.entity';
import { UpdateDocumentNotesDto } from './dto/update-document-notes.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class CcCurrentService {
  constructor(
    @InjectRepository(CcCurrent)
    private readonly ccCurrentRepository: Repository<CcCurrent>,
    @InjectRepository(DocumentNotesAudit)
    private readonly notesAuditRepository: Repository<DocumentNotesAudit>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  create(createCcCurrentDto: CreateCcCurrentDto) {
    const entity = this.ccCurrentRepository.create(createCcCurrentDto);
    return this.ccCurrentRepository.save(entity);
  }

  findAll() {
    return this.ccCurrentRepository.find({ order: { id: 'DESC' } });
  }

  findByErpSource(
    erpSource: string,
    clienteId?: string,
    tipoDocumento?: string,
    q?: string,
    limit?: number,
    offset?: number,
  ) {
    const safeLimit = Number.isFinite(limit)
      ? Math.min(Math.max(Number(limit), 1), 500)
      : 100;
    const safeOffset = Number.isFinite(offset)
      ? Math.max(Number(offset), 0)
      : 0;

    const qb = this.ccCurrentRepository
      .createQueryBuilder('cc')
      .where('cc.erpSource = :erpSource', { erpSource })
      .orderBy('cc.id', 'DESC')
      .take(safeLimit)
      .skip(safeOffset);

    if (clienteId) {
      qb.andWhere('cc.clienteId = :clienteId', { clienteId });
    }
    if (tipoDocumento) {
      qb.andWhere('cc.tipoDocumento = :tipoDocumento', { tipoDocumento });
    }
    if (q) {
      qb.andWhere(
        '(cc.numeroDocumento LIKE :q OR cc.observaciones LIKE :q OR cc.motivoDeuda LIKE :q)',
        { q: `%${q}%` },
      );
    }

    return qb.getMany();
  }

  findOne(id: number) {
    return this.ccCurrentRepository.findOneBy({ id });
  }

  update(id: number, updateCcCurrentDto: UpdateCcCurrentDto) {
    return this.ccCurrentRepository.save({
      id,
      ...updateCcCurrentDto,
    });
  }

  remove(id: number) {
    return this.ccCurrentRepository.delete(id);
  }

  private parseDocumentKey(documentKey: string) {
    const decoded = decodeURIComponent(documentKey);
    const [clienteId, tienda, tipoDocumento, ...numeroParts] =
      decoded.split('|');
    const numeroDocumento = numeroParts.join('|');
    if (!clienteId || !tienda || !tipoDocumento || !numeroDocumento) {
      throw new NotFoundException(
        'documentKey invalido. Formato esperado: clienteId|tienda|tipoDocumento|numeroDocumento',
      );
    }
    return { clienteId, tienda, tipoDocumento, numeroDocumento };
  }

  async updateDocumentNotes(
    erpSource: string,
    documentKey: string,
    updateDto: UpdateDocumentNotesDto,
  ) {
    const key = this.parseDocumentKey(documentKey);
    const row = await this.ccCurrentRepository.findOne({
      where: {
        erpSource,
        clienteId: key.clienteId,
        tienda: key.tienda,
        tipoDocumento: key.tipoDocumento,
        numeroDocumento: key.numeroDocumento,
      },
    });

    if (!row) {
      throw new NotFoundException(
        `No existe documento ${documentKey} en ${erpSource}`,
      );
    }

    const oldObservaciones = row.observaciones;
    const oldMotivoDeuda = row.motivoDeuda;

    row.observaciones =
      updateDto.observaciones === undefined
        ? row.observaciones
        : updateDto.observaciones;
    row.motivoDeuda =
      updateDto.motivoDeuda === undefined
        ? row.motivoDeuda
        : updateDto.motivoDeuda;

    const savedRow = await this.ccCurrentRepository.save(row);

    let changedByUser: User | null = null;
    if (updateDto.changedByUserId) {
      changedByUser =
        (await this.usersRepository.findOneBy({
          id: updateDto.changedByUserId,
        })) ?? null;
      if (!changedByUser) {
        throw new BadRequestException(
          `changedByUserId ${updateDto.changedByUserId} no existe`,
        );
      }
    }

    await this.notesAuditRepository.save(
      this.notesAuditRepository.create({
        erpSource,
        documentKey: decodeURIComponent(documentKey),
        oldObservaciones,
        newObservaciones: savedRow.observaciones,
        oldMotivoDeuda,
        newMotivoDeuda: savedRow.motivoDeuda,
        changedByUser,
      }),
    );

    return {
      documentKey: decodeURIComponent(documentKey),
      erpSource,
      observaciones: savedRow.observaciones,
      motivoDeuda: savedRow.motivoDeuda,
    };
  }
}
