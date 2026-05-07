import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { CreateCcCurrentDto } from './dto/create-cc-current.dto';
import { UpdateCcCurrentDto } from './dto/update-cc-current.dto';
import { CcCurrent } from './entities/cc-current.entity';
import { DocumentNotesAudit } from '../document-notes-audit/entities/document-notes-audit.entity';
import { UpdateDocumentNotesDto } from './dto/update-document-notes.dto';
import { User } from '../users/entities/user.entity';
import { ErpSource } from '../consolidations/entities/consolidation.entity';
import {
  buildDocumentKeyFromParts,
  canonicalizeCeosNumeroForKey,
} from '../consolidations/consolidation-parser.util';
import { isFacturaPendienteSaldoNoAzul } from '../exports/document-pending.util';
import { atrasoDiasDesdeFechaDocumento } from '../common/utils/atraso-dias-doc.util';
import type {
  BotCurrentDocumentDto,
  BotDeudasClienteGroupDto,
} from './dto/bot-current-document.dto';

/** Caracteres especiales de `LIKE` de MySQL. */
const escapeMysqlLikePattern = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');

const normalizeSearchText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const canonicalizeTotvsNumeroForKey = (numeroDocumento: string): string => {
  const t = numeroDocumento.trim().toUpperCase();
  const m = t.match(/^([A-Z]\d{2}-)(\d+)$/);
  if (!m) return t;
  const [, prefix, digits] = m;
  const normalizedDigits = digits.replace(/^0+/, '') || '0';
  return `${prefix}${normalizedDigits}`;
};

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
      const like = `%${escapeMysqlLikePattern(q)}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('cc.numeroDocumento LIKE :q ESCAPE :esc', {
            q: like,
            esc: '\\',
          })
            .orWhere('cc.observaciones LIKE :q ESCAPE :esc', {
              q: like,
              esc: '\\',
            })
            .orWhere('cc.motivoDeuda LIKE :q ESCAPE :esc', {
              q: like,
              esc: '\\',
            })
            .orWhere(
              "JSON_UNQUOTE(JSON_EXTRACT(CAST(cc.rawRowJson AS JSON), '$.nombreCliente')) LIKE :q ESCAPE :esc",
              { q: like, esc: '\\' },
            )
            .orWhere(
              "JSON_UNQUOTE(JSON_EXTRACT(CAST(cc.rawRowJson AS JSON), '$.localidad')) LIKE :q ESCAPE :esc",
              { q: like, esc: '\\' },
            );
        }),
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
    let parts = decoded.split('|');
    if (parts[0] === 'CEOS' || parts[0] === 'TOTVS') {
      parts = parts.slice(1);
    }
    const [clienteId, tienda, tipoDocumento, ...numeroParts] = parts;
    const numeroDocumento = numeroParts.join('|');
    if (!clienteId || !tienda || !tipoDocumento || !numeroDocumento) {
      throw new NotFoundException(
        'documentKey invalido. Formato esperado: [CEOS|]clienteId|tienda|tipoDocumento|numeroDocumento',
      );
    }
    return { clienteId, tienda, tipoDocumento, numeroDocumento };
  }

  private nombreClienteFromRow(row: CcCurrent): string {
    const raw = row.rawRowJson ?? {};
    return String(raw['nombreCliente'] ?? raw['clienteNombre'] ?? '').trim();
  }

  private localidadFromRow(row: CcCurrent): string {
    const raw = row.rawRowJson ?? {};
    return String(raw['localidad'] ?? '').trim();
  }

  private toBotDocumentDto(row: CcCurrent): BotCurrentDocumentDto {
    const erp = row.erpSource as ErpSource;
    const documentKey = buildDocumentKeyFromParts(
      erp,
      row.clienteId,
      row.tienda,
      row.tipoDocumento,
      row.numeroDocumento,
    );
    return {
      id: row.id,
      clienteId: row.clienteId,
      tienda: row.tienda,
      nombreCliente: this.nombreClienteFromRow(row),
      localidad: this.localidadFromRow(row),
      tipoDocumento: row.tipoDocumento,
      numeroDocumento: row.numeroDocumento,
      fechaDoc: row.fechaDoc,
      saldo: row.saldo,
      observaciones: row.observaciones,
      atrasoDiasCalculado: atrasoDiasDesdeFechaDocumento(row.fechaDoc),
      documentKey,
    };
  }

  /**
   * Facturas / ND según reglas de Saldo (pendiente), opcionalmente por cliente o texto.
   * TOTVS: facturas/NF/ND/YD1…; CEOS cuenta “remito”: mismas reglas (F/D).
   */
  async findBotPendientesFactura(
    erpSource: ErpSource,
    clienteId?: string,
    q?: string,
  ): Promise<BotCurrentDocumentDto[]> {
    const maxRows = 12000;
    const qb = this.ccCurrentRepository
      .createQueryBuilder('cc')
      .where('cc.erpSource = :erpSource', { erpSource })
      .orderBy('cc.clienteId', 'ASC')
      .addOrderBy('cc.tienda', 'ASC')
      .addOrderBy('cc.fechaDoc', 'ASC')
      .addOrderBy('cc.id', 'ASC')
      .take(maxRows);

    if (clienteId?.trim()) {
      qb.andWhere('cc.clienteId = :clienteId', { clienteId: clienteId.trim() });
    }
    const rows = await qb.getMany();
    const out: BotCurrentDocumentDto[] = [];
    const qNorm = q?.trim() ? normalizeSearchText(q) : '';
    for (const row of rows) {
      if (!isFacturaPendienteSaldoNoAzul(row)) continue;
      if (qNorm) {
        const nombre = normalizeSearchText(this.nombreClienteFromRow(row));
        const loc = normalizeSearchText(this.localidadFromRow(row));
        const cliente = normalizeSearchText(row.clienteId);
        if (
          !nombre.includes(qNorm) &&
          !loc.includes(qNorm) &&
          !cliente.includes(qNorm)
        ) {
          continue;
        }
      }
      out.push(this.toBotDocumentDto(row));
    }
    return out;
  }

  /**
   * Clientes con al menos un documento pendiente, atraso >= umbral (fecha doc → hoy),
   * sin observaciones cargadas; un grupo por cliente/tienda.
   */
  async findBotDeudasSinObservaciones(
    erpSource: ErpSource,
    minAtrasoDias: number,
  ): Promise<{ clientes: BotDeudasClienteGroupDto[] }> {
    const safeMin = Number.isFinite(minAtrasoDias)
      ? Math.max(0, Math.floor(minAtrasoDias))
      : 0;

    const rows = await this.ccCurrentRepository.find({
      where: { erpSource },
      order: {
        clienteId: 'ASC',
        tienda: 'ASC',
        id: 'ASC',
      },
      take: 12000,
    });

    const map = new Map<string, CcCurrent[]>();
    for (const row of rows) {
      if (!isFacturaPendienteSaldoNoAzul(row)) continue;
      if (row.observaciones?.trim()) continue;
      const dias = atrasoDiasDesdeFechaDocumento(row.fechaDoc);
      if (dias < safeMin) continue;
      const ck = `${row.clienteId}|${row.tienda}`;
      const list = map.get(ck) ?? [];
      list.push(row);
      map.set(ck, list);
    }

    const clientes: BotDeudasClienteGroupDto[] = [];
    for (const [, docs] of map) {
      if (docs.length === 0) continue;
      const first = docs[0];
      const nombreCliente =
        docs.map((r) => this.nombreClienteFromRow(r)).find((n) => n.length > 0) ??
        '';
      const localidad =
        docs.map((r) => this.localidadFromRow(r)).find((l) => l.length > 0) ?? '';
      clientes.push({
        clienteId: first.clienteId,
        tienda: first.tienda,
        nombreCliente,
        localidad,
        documentos: docs.map((d) => this.toBotDocumentDto(d)),
      });
    }

    clientes.sort((a, b) =>
      a.nombreCliente.localeCompare(b.nombreCliente, 'es', {
        sensitivity: 'base',
      }),
    );

    return { clientes };
  }

  async updateDocumentNotes(
    erpSource: string,
    documentKey: string,
    updateDto: UpdateDocumentNotesDto,
  ) {
    const key = this.parseDocumentKey(documentKey);
    let row = await this.ccCurrentRepository.findOne({
      where: {
        erpSource,
        clienteId: key.clienteId,
        tienda: key.tienda,
        tipoDocumento: key.tipoDocumento,
        numeroDocumento: key.numeroDocumento,
      },
    });

    // TOTVS / CEOS: el documentKey usa número canonizado para cruzar listados; en DB puede quedar el texto del archivo.
    if (!row && erpSource.toUpperCase() === ErpSource.TOTVS) {
      const candidates = await this.ccCurrentRepository.find({
        where: {
          erpSource,
          clienteId: key.clienteId,
          tienda: key.tienda,
          tipoDocumento: key.tipoDocumento,
        },
      });
      const wanted = canonicalizeTotvsNumeroForKey(key.numeroDocumento);
      row =
        candidates.find(
          (c) => canonicalizeTotvsNumeroForKey(c.numeroDocumento) === wanted,
        ) ?? null;
    }

    if (!row && erpSource.toUpperCase() === ErpSource.CEOS) {
      const candidates = await this.ccCurrentRepository.find({
        where: {
          erpSource,
          clienteId: key.clienteId,
          tienda: key.tienda,
          tipoDocumento: key.tipoDocumento,
        },
      });
      const wanted = canonicalizeCeosNumeroForKey(key.numeroDocumento);
      row =
        candidates.find(
          (c) => canonicalizeCeosNumeroForKey(c.numeroDocumento) === wanted,
        ) ?? null;
    }

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
