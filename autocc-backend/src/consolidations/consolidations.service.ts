import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateConsolidationDto } from './dto/create-consolidation.dto';
import { UpdateConsolidationDto } from './dto/update-consolidation.dto';
import {
  Consolidation,
  ConsolidationStatus,
  ErpSource,
} from './entities/consolidation.entity';
import { CcCurrent } from '../cc-current/entities/cc-current.entity';
import { CcBackup } from '../cc-backup/entities/cc-backup.entity';
import { ConsolidationError } from '../consolidation-errors/entities/consolidation-error.entity';
import {
  buildDocumentKey,
  ParsedDocument,
  parseBaseFile,
  parseErpListingForDocumentAdd,
  parseErpListingForDocumentRemoval,
  tryExtractDeclaredEmisionDateFromErpCsv,
} from './consolidation-parser.util';
import { AddDocumentsFromErpDto } from './dto/add-documents-from-erp.dto';
import { RemoveDocumentsFromErpDto } from './dto/remove-documents-from-erp.dto';

@Injectable()
export class ConsolidationsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Consolidation)
    private readonly consolidationsRepository: Repository<Consolidation>,
    @InjectRepository(CcCurrent)
    private readonly ccCurrentRepository: Repository<CcCurrent>,
    @InjectRepository(CcBackup)
    private readonly ccBackupRepository: Repository<CcBackup>,
    @InjectRepository(ConsolidationError)
    private readonly consolidationErrorsRepository: Repository<ConsolidationError>,
  ) {}

  private normalizeDocument(doc: ParsedDocument): ParsedDocument {
    return {
      ...doc,
      clienteId: doc.clienteId.trim(),
      tienda: doc.tienda.trim(),
      tipoDocumento: doc.tipoDocumento.trim().toUpperCase(),
      // Las comparaciones unicas en MySQL ignoran los espacios al final de la cadena.
      numeroDocumento: doc.numeroDocumento.trim().toUpperCase(),
    };
  }

  private toDateOnly(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  private parseUserIsoDateToUtcMidnight(value: string): Date {
    const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) {
      throw new BadRequestException('Fecha inválida (se esperaba YYYY-MM-DD)');
    }
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (
      Number.isNaN(dt.getTime()) ||
      dt.getUTCFullYear() !== y ||
      dt.getUTCMonth() !== mo - 1 ||
      dt.getUTCDate() !== d
    ) {
      throw new BadRequestException('Fecha inválida (se esperaba YYYY-MM-DD)');
    }
    return dt;
  }

  /**
   * Si el CSV declara una fecha de emisión y difiere de la del usuario, exige confirmación explícita.
   */
  private assertErpDeclaredDateMatchesUserOrConfirmed(
    erpSource: ErpSource,
    erpContent: string,
    userEmisionIso: string,
    confirmMismatch: boolean,
  ): void {
    const parsed = tryExtractDeclaredEmisionDateFromErpCsv(
      erpSource,
      erpContent,
    );
    if (!parsed) return;
    const parsedSlice = parsed.toISOString().slice(0, 10);
    if (parsedSlice === userEmisionIso) return;
    if (confirmMismatch) return;
    throw new HttpException(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        code: 'ERP_FILE_DATE_MISMATCH',
        message:
          'La fecha de emisión indicada no coincide con la fecha declarada en el archivo ERP.',
        userDate: userEmisionIso,
        parsedDateFromFile: parsedSlice,
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  /**
   * Importe (valor) y saldo: si el archivo solo trae uno (típico base solo “saldo”),
   * replica en el otro hasta tener lógica de pagos parciales. Así el Excel puede
   * mostrar Importe y Saldo coherentes.
   */
  private normalizeDocumentAmounts(doc: ParsedDocument): ParsedDocument {
    let { valor, saldo } = doc;
    const vMissing = valor == null || String(valor).trim() === '';
    const sMissing = saldo == null || String(saldo).trim() === '';

    if (vMissing && !sMissing) {
      valor = saldo;
    } else if (!vMissing && sMissing) {
      saldo = valor;
    }

    return { ...doc, valor, saldo };
  }

  create(createConsolidationDto: CreateConsolidationDto) {
    const entity = this.consolidationsRepository.create(createConsolidationDto);
    return this.consolidationsRepository.save(entity);
  }

  findAll() {
    return this.consolidationsRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  findOne(id: number) {
    return this.consolidationsRepository.findOneBy({ id });
  }

  update(id: number, updateConsolidationDto: UpdateConsolidationDto) {
    return this.consolidationsRepository.update(id, updateConsolidationDto);
  }

  remove(id: number) {
    return this.consolidationsRepository.delete(id);
  }

  async getByIdOrThrow(id: number): Promise<Consolidation> {
    const consolidation = await this.findOne(id);
    if (!consolidation) {
      throw new NotFoundException(`Consolidation ${id} not found`);
    }
    return consolidation;
  }

  async addDocumentsFromErp(
    dto: AddDocumentsFromErpDto,
    baseFile: Express.Multer.File,
    erpFile: Express.Multer.File,
  ) {
    const consolidation = await this.consolidationsRepository.save(
      this.consolidationsRepository.create({
        erpSource: dto.erpSource,
        baseFileName: baseFile.originalname,
        erpFileName: erpFile.originalname,
        status: ConsolidationStatus.PROCESSING,
      }),
    );

    try {
      const baseContent = baseFile.buffer.toString('utf-8');
      const erpContent = erpFile.buffer.toString('utf-8');

      this.parseUserIsoDateToUtcMidnight(dto.baseActualizacionDate);
      this.parseUserIsoDateToUtcMidnight(dto.erpEmisionDate);
      this.assertErpDeclaredDateMatchesUserOrConfirmed(
        dto.erpSource,
        erpContent,
        dto.erpEmisionDate,
        dto.confirmFileDateMismatch === true,
      );

      const baseParsed = parseBaseFile(dto.erpSource, baseContent);
      const erpParsed = parseErpListingForDocumentAdd(
        dto.erpSource,
        erpContent,
      );
      const normalizedBaseDocs = baseParsed.documents.map((doc) =>
        this.normalizeDocumentAmounts(this.normalizeDocument(doc)),
      );
      const normalizedErpDocs = erpParsed.documents.map((doc) =>
        this.normalizeDocumentAmounts(this.normalizeDocument(doc)),
      );

      const baseMap = new Map<string, (typeof normalizedBaseDocs)[number]>();
      normalizedBaseDocs.forEach((doc) =>
        baseMap.set(buildDocumentKey(doc), doc),
      );

      const addedDocuments = normalizedErpDocs.filter(
        (doc) => !baseMap.has(buildDocumentKey(doc)),
      );
      const finalDocumentsRaw = [...normalizedBaseDocs, ...addedDocuments];
      const finalDocumentsMap = new Map<
        string,
        (typeof finalDocumentsRaw)[number]
      >();
      finalDocumentsRaw.forEach((doc) => {
        const key = buildDocumentKey(doc);
        if (!finalDocumentsMap.has(key)) {
          finalDocumentsMap.set(key, doc);
        }
      });
      const finalDocuments = [...finalDocumentsMap.values()];
      const allErrors = [...baseParsed.errors, ...erpParsed.errors];

      await this.dataSource.transaction(async (manager) => {
        const ccCurrentRepo = manager.getRepository(CcCurrent);
        const ccBackupRepo = manager.getRepository(CcBackup);
        const errorsRepo = manager.getRepository(ConsolidationError);

        if (allErrors.length > 0) {
          await errorsRepo.save(
            allErrors.map((err) =>
              errorsRepo.create({
                consolidation,
                sourceFile: err.sourceFile,
                lineNumber: err.lineNumber,
                rawLine: err.rawLine,
                errorCode: err.errorCode,
                message: err.message,
              }),
            ),
          );
        }

        const previousCurrent = await ccCurrentRepo.find({
          where: { erpSource: dto.erpSource },
        });

        if (previousCurrent.length > 0) {
          await ccBackupRepo.save(
            previousCurrent.map((row) =>
              ccBackupRepo.create({
                erpSource: row.erpSource,
                clienteId: row.clienteId,
                tienda: row.tienda,
                tipoDocumento: row.tipoDocumento,
                numeroDocumento: row.numeroDocumento,
                fechaDoc: this.toDateOnly(row.fechaDoc),
                valor: row.valor,
                saldo: row.saldo,
                rawRowJson: row.rawRowJson,
                observaciones: row.observaciones,
                motivoDeuda: row.motivoDeuda,
                backupFromConsolidation: consolidation,
              }),
            ),
          );
        }

        await ccCurrentRepo.delete({ erpSource: dto.erpSource });

        await ccCurrentRepo.save(
          finalDocuments.map((doc) =>
            ccCurrentRepo.create({
              erpSource: doc.erpSource,
              clienteId: doc.clienteId,
              tienda: doc.tienda,
              tipoDocumento: doc.tipoDocumento,
              numeroDocumento: doc.numeroDocumento,
              fechaDoc: this.toDateOnly(doc.fechaDoc),
              valor: doc.valor,
              saldo: doc.saldo,
              rawRowJson: doc.rawRowJson,
              lastConsolidation: consolidation,
            }),
          ),
        );
      });

      consolidation.status = ConsolidationStatus.OK;
      consolidation.baseFileText = baseContent;
      consolidation.baseDocsCount = normalizedBaseDocs.length;
      consolidation.erpDocsCount = normalizedErpDocs.length;
      consolidation.keptDocsCount = normalizedBaseDocs.length;
      consolidation.addedDocsCount = addedDocuments.length;
      consolidation.errorCount = allErrors.length;
      await this.consolidationsRepository.save(consolidation);

      return {
        consolidationId: consolidation.id,
        erpSource: consolidation.erpSource,
        status: consolidation.status,
        baseActualizacionDate: dto.baseActualizacionDate,
        erpEmisionDate: dto.erpEmisionDate,
        stats: {
          baseDocs: consolidation.baseDocsCount,
          erpDocs: consolidation.erpDocsCount,
          keptDocs: consolidation.keptDocsCount,
          addedDocs: consolidation.addedDocsCount,
          removedDocs: 0,
          errors: consolidation.errorCount,
        },
        previewAdded: addedDocuments.slice(0, 20).map((doc) => ({
          clienteId: doc.clienteId,
          tienda: doc.tienda,
          tipoDocumento: doc.tipoDocumento,
          numeroDocumento: doc.numeroDocumento,
        })),
        previewCurrent: finalDocuments.slice(0, 20).map((doc) => ({
          clienteId: doc.clienteId,
          tienda: doc.tienda,
          tipoDocumento: doc.tipoDocumento,
          numeroDocumento: doc.numeroDocumento,
          saldo: doc.saldo,
          observaciones: null,
        })),
        previewRemoved: [],
        previewErrors: allErrors.slice(0, 20).map((err) => ({
          sourceFile: err.sourceFile,
          lineNumber: err.lineNumber,
          errorCode: err.errorCode,
          message: err.message,
        })),
      };
    } catch (error) {
      consolidation.status = ConsolidationStatus.FAILED;
      consolidation.errorCount += 1;
      await this.consolidationsRepository.save(consolidation);
      throw error;
    }
  }

  async removeDocumentsFromErp(
    dto: RemoveDocumentsFromErpDto,
    baseFile: Express.Multer.File,
    erpFile: Express.Multer.File,
  ) {
    const consolidation = await this.consolidationsRepository.save(
      this.consolidationsRepository.create({
        erpSource: dto.erpSource,
        baseFileName: baseFile.originalname,
        erpFileName: erpFile.originalname,
        status: ConsolidationStatus.PROCESSING,
      }),
    );

    try {
      const baseContent = baseFile.buffer.toString('utf-8');
      const erpContent = erpFile.buffer.toString('utf-8');

      this.parseUserIsoDateToUtcMidnight(dto.baseActualizacionDate);
      const cutoffDate = this.parseUserIsoDateToUtcMidnight(dto.erpEmisionDate);
      this.assertErpDeclaredDateMatchesUserOrConfirmed(
        dto.erpSource,
        erpContent,
        dto.erpEmisionDate,
        dto.confirmFileDateMismatch === true,
      );

      const baseParsed = parseBaseFile(dto.erpSource, baseContent);
      const erpParsed = parseErpListingForDocumentRemoval(
        dto.erpSource,
        erpContent,
      );

      const normalizedBaseDocs = baseParsed.documents.map((doc) =>
        this.normalizeDocumentAmounts(this.normalizeDocument(doc)),
      );
      const normalizedErpDocs = erpParsed.documents.map((doc) =>
        this.normalizeDocumentAmounts(this.normalizeDocument(doc)),
      );

      const erpDocKeys = new Set<string>();
      normalizedErpDocs.forEach((doc) =>
        erpDocKeys.add(buildDocumentKey(doc)),
      );

      const removedDocuments: (typeof normalizedBaseDocs)[number][] = [];
      const filteredDocuments = normalizedBaseDocs.filter((doc) => {
        if (!doc.fechaDoc) return true;
        if (doc.fechaDoc.getTime() >= cutoffDate.getTime()) return true;
        const existsInErpListing = erpDocKeys.has(buildDocumentKey(doc));
        if (!existsInErpListing) {
          removedDocuments.push(doc);
          return false;
        }
        return true;
      });

      const finalDocumentsMap = new Map<
        string,
        (typeof filteredDocuments)[number]
      >();
      filteredDocuments.forEach((doc) => {
        const key = buildDocumentKey(doc);
        if (!finalDocumentsMap.has(key)) {
          finalDocumentsMap.set(key, doc);
        }
      });
      const finalDocuments = [...finalDocumentsMap.values()];

      const allErrors = [...baseParsed.errors, ...erpParsed.errors];

      await this.dataSource.transaction(async (manager) => {
        const ccCurrentRepo = manager.getRepository(CcCurrent);
        const ccBackupRepo = manager.getRepository(CcBackup);
        const errorsRepo = manager.getRepository(ConsolidationError);

        if (allErrors.length > 0) {
          await errorsRepo.save(
            allErrors.map((err) =>
              errorsRepo.create({
                consolidation,
                sourceFile: err.sourceFile,
                lineNumber: err.lineNumber,
                rawLine: err.rawLine,
                errorCode: err.errorCode,
                message: err.message,
              }),
            ),
          );
        }

        const previousCurrent = await ccCurrentRepo.find({
          where: { erpSource: dto.erpSource },
        });

        if (previousCurrent.length > 0) {
          await ccBackupRepo.save(
            previousCurrent.map((row) =>
              ccBackupRepo.create({
                erpSource: row.erpSource,
                clienteId: row.clienteId,
                tienda: row.tienda,
                tipoDocumento: row.tipoDocumento,
                numeroDocumento: row.numeroDocumento,
                fechaDoc: this.toDateOnly(row.fechaDoc),
                valor: row.valor,
                saldo: row.saldo,
                rawRowJson: row.rawRowJson,
                observaciones: row.observaciones,
                motivoDeuda: row.motivoDeuda,
                backupFromConsolidation: consolidation,
              }),
            ),
          );
        }

        await ccCurrentRepo.delete({ erpSource: dto.erpSource });

        await ccCurrentRepo.save(
          finalDocuments.map((doc) =>
            ccCurrentRepo.create({
              erpSource: doc.erpSource,
              clienteId: doc.clienteId,
              tienda: doc.tienda,
              tipoDocumento: doc.tipoDocumento,
              numeroDocumento: doc.numeroDocumento,
              fechaDoc: this.toDateOnly(doc.fechaDoc),
              valor: doc.valor,
              saldo: doc.saldo,
              rawRowJson: doc.rawRowJson,
              lastConsolidation: consolidation,
            }),
          ),
        );
      });

      consolidation.status = ConsolidationStatus.OK;
      consolidation.baseFileText = baseContent;
      consolidation.baseDocsCount = normalizedBaseDocs.length;
      consolidation.erpDocsCount = normalizedErpDocs.length;
      consolidation.keptDocsCount = finalDocuments.length;
      consolidation.addedDocsCount = 0;
      consolidation.errorCount = allErrors.length;
      await this.consolidationsRepository.save(consolidation);

      return {
        consolidationId: consolidation.id,
        erpSource: consolidation.erpSource,
        status: consolidation.status,
        baseActualizacionDate: dto.baseActualizacionDate,
        erpEmisionDate: dto.erpEmisionDate,
        stats: {
          baseDocs: consolidation.baseDocsCount,
          erpDocs: consolidation.erpDocsCount,
          keptDocs: consolidation.keptDocsCount,
          removedDocs: removedDocuments.length,
          errors: consolidation.errorCount,
        },
        previewRemoved: removedDocuments.slice(0, 20).map((doc) => ({
          clienteId: doc.clienteId,
          tienda: doc.tienda,
          tipoDocumento: doc.tipoDocumento,
          numeroDocumento: doc.numeroDocumento,
          fechaDoc: doc.fechaDoc
            ? doc.fechaDoc.toISOString().slice(0, 10)
            : null,
        })),
        previewCurrent: finalDocuments.slice(0, 20).map((doc) => ({
          clienteId: doc.clienteId,
          tienda: doc.tienda,
          tipoDocumento: doc.tipoDocumento,
          numeroDocumento: doc.numeroDocumento,
          saldo: doc.saldo,
          observaciones: null,
        })),
        previewErrors: allErrors.slice(0, 20).map((err) => ({
          sourceFile: err.sourceFile,
          lineNumber: err.lineNumber,
          errorCode: err.errorCode,
          message: err.message,
        })),
      };
    } catch (error) {
      consolidation.status = ConsolidationStatus.FAILED;
      consolidation.errorCount += 1;
      await this.consolidationsRepository.save(consolidation);
      throw error;
    }
  }

  async findErrorsByConsolidation(id: number) {
    await this.getByIdOrThrow(id);
    return this.consolidationErrorsRepository.find({
      where: { consolidation: { id } },
      order: { lineNumber: 'ASC' },
      take: 500,
    });
  }
}
