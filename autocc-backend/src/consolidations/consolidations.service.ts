import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateConsolidationDto } from './dto/create-consolidation.dto';
import { UpdateConsolidationDto } from './dto/update-consolidation.dto';
import {
  Consolidation,
  ConsolidationStatus,
} from './entities/consolidation.entity';
import { CcCurrent } from '../cc-current/entities/cc-current.entity';
import { CcBackup } from '../cc-backup/entities/cc-backup.entity';
import { ConsolidationError } from '../consolidation-errors/entities/consolidation-error.entity';
import {
  buildDocumentKey,
  ParsedDocument,
  parseBaseFile,
  parseIncrementalFile,
} from './consolidation-parser.util';
import { RunConsolidationDto } from './dto/run-consolidation.dto';

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

  async runConsolidation(
    dto: RunConsolidationDto,
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

      const baseParsed = parseBaseFile(dto.erpSource, baseContent);
      const erpParsed = parseIncrementalFile(dto.erpSource, erpContent);
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
                fechaDoc: row.fechaDoc,
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
              fechaDoc: doc.fechaDoc,
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
      consolidation.keptDocsCount = Math.min(
        normalizedBaseDocs.length,
        finalDocuments.length,
      );
      consolidation.addedDocsCount = addedDocuments.length;
      consolidation.errorCount = allErrors.length;
      await this.consolidationsRepository.save(consolidation);

      return {
        consolidationId: consolidation.id,
        erpSource: consolidation.erpSource,
        status: consolidation.status,
        stats: {
          baseDocs: consolidation.baseDocsCount,
          erpDocs: consolidation.erpDocsCount,
          keptDocs: consolidation.keptDocsCount,
          addedDocs: consolidation.addedDocsCount,
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
