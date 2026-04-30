import {
  BadRequestException,
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
} from './consolidation-parser.util';
import { AddDocumentsFromErpDto } from './dto/add-documents-from-erp.dto';
import { FullConsolidationFromErpDto } from './dto/full-consolidation-from-erp.dto';
import { RemoveDocumentsFromErpDto } from './dto/remove-documents-from-erp.dto';
import { decodeUploadBufferToUtf8String } from '../common/utils/decode-upload-buffer.util';
import { parseMoneyArStringToNumber } from '../common/utils/format-money-ar-display.util';

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
   * Reglas de “eliminar”: documentos con fechaDoc anterior o igual a la fecha de corte se mantienen solo si la clave está en el listado ERP.
   */
  private filterDocumentsByRemoveRules(
    documents: ParsedDocument[],
    erpDocKeys: Set<string>,
    cutoffDate: Date,
  ): {
    finalDocuments: ParsedDocument[];
    removedDocuments: ParsedDocument[];
  } {
    const removedDocuments: ParsedDocument[] = [];
    const filtered = documents.filter((doc) => {
      if (!doc.fechaDoc) return true;
      if (doc.fechaDoc.getTime() >= cutoffDate.getTime()) return true;
      const existsInErpListing = erpDocKeys.has(buildDocumentKey(doc));
      if (!existsInErpListing) {
        removedDocuments.push(doc);
        return false;
      }
      return true;
    });
    const finalDocumentsMap = new Map<string, (typeof filtered)[number]>();
    filtered.forEach((doc) => {
      const key = buildDocumentKey(doc);
      if (!finalDocumentsMap.has(key)) {
        finalDocumentsMap.set(key, doc);
      }
    });
    return {
      finalDocuments: [...finalDocumentsMap.values()],
      removedDocuments,
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

  /**
   * CEOS: si el documento quedó desde el base sin nombre/localidad en `rawRowJson` pero el listado ERP
   * trae la misma clave, copia esos campos (bots / export). TOTVS: sin cambios.
   */
  private enrichCeosDocsWithErpClienteMeta(
    finalDocs: ParsedDocument[],
    erpDocs: ParsedDocument[],
  ): ParsedDocument[] {
    if (finalDocs.length === 0 || finalDocs[0].erpSource !== ErpSource.CEOS) {
      return finalDocs;
    }
    const erpByKey = new Map<string, ParsedDocument>();
    for (const e of erpDocs) {
      erpByKey.set(buildDocumentKey(e), e);
    }
    const metaNombre = (doc: ParsedDocument) =>
      String(
        doc.rawRowJson?.['nombreCliente'] ??
          doc.rawRowJson?.['clienteNombre'] ??
          doc.clienteNombre ??
          '',
      ).trim();
    const metaLoc = (doc: ParsedDocument) =>
      String(doc.rawRowJson?.['localidad'] ?? doc.localidad ?? '').trim();

    return finalDocs.map((doc) => {
      const n = metaNombre(doc);
      const l = metaLoc(doc);
      if (n && l) return doc;
      const erp = erpByKey.get(buildDocumentKey(doc));
      if (!erp) return doc;
      const en = metaNombre(erp);
      const el = metaLoc(erp);
      if (!en && !el) return doc;
      const raw = { ...(doc.rawRowJson ?? {}) };
      if (!n && en) raw['nombreCliente'] = en;
      if (!l && el) raw['localidad'] = el;
      return {
        ...doc,
        clienteNombre: doc.clienteNombre ?? erp.clienteNombre,
        localidad: doc.localidad ?? erp.localidad,
        rawRowJson: raw,
      };
    });
  }

  /**
   * Si el mismo documento existe en base y ERP (misma clave), prioriza la fecha del ERP:
   * - si base no tiene `fechaDoc` y ERP sí, la completa;
   * - si ambas existen y difieren, sobrescribe con la del ERP.
   */
  private enrichBaseFechaFromErp(
    baseDocs: ParsedDocument[],
    erpDocs: ParsedDocument[],
  ): ParsedDocument[] {
    const erpByKey = new Map<string, ParsedDocument>();
    for (const e of erpDocs) {
      erpByKey.set(buildDocumentKey(e), e);
    }
    return baseDocs.map((doc) => {
      const erp = erpByKey.get(buildDocumentKey(doc));
      if (!erp?.fechaDoc) {
        return doc;
      }
      const baseDateIso = doc.fechaDoc?.toISOString().slice(0, 10) ?? null;
      const erpDateIso = erp.fechaDoc.toISOString().slice(0, 10);
      if (baseDateIso === erpDateIso) {
        return doc;
      }
      return {
        ...doc,
        fechaDoc: erp.fechaDoc,
        rawRowJson: {
          ...(doc.rawRowJson ?? {}),
          ...(doc.fechaDoc == null
            ? { fechaDocEnrichedFromErp: true }
            : {
                fechaDocOverriddenFromErp: true,
                fechaDocBaseOriginal: baseDateIso,
              }),
        },
      };
    });
  }

  private readonly saldoDiscrepancyEpsilon = 0.99;

  private parseSaldoNumeric(value: string | null | undefined): number | null {
    if (value == null) {
      return null;
    }
    return parseMoneyArStringToNumber(String(value));
  }

  /**
   * Documentos presentes en base y ERP con mismo `documentKey`, donde ambos
   * tienen saldo numérico y difieren más que `saldoDiscrepancyEpsilon`.
   * Solo informativo para vista previa; no altera la consolidación.
   */
  private collectSaldoDiscrepancies(
    baseDocs: ParsedDocument[],
    erpDocs: ParsedDocument[],
  ): Array<{
    documentKey: string;
    clienteId: string;
    tienda: string;
    tipoDocumento: string;
    numeroDocumento: string;
    saldoBase: string | null;
    saldoErp: string | null;
  }> {
    const erpByKey = new Map<string, ParsedDocument>();
    for (const e of erpDocs) {
      erpByKey.set(buildDocumentKey(e), e);
    }
    const out: Array<{
      documentKey: string;
      clienteId: string;
      tienda: string;
      tipoDocumento: string;
      numeroDocumento: string;
      saldoBase: string | null;
      saldoErp: string | null;
    }> = [];
    for (const b of baseDocs) {
      const key = buildDocumentKey(b);
      const erp = erpByKey.get(key);
      if (!erp) {
        continue;
      }
      const nb = this.parseSaldoNumeric(b.saldo);
      const ne = this.parseSaldoNumeric(erp.saldo);
      if (nb === null || ne === null) {
        continue;
      }
      if (Math.abs(nb - ne) <= this.saldoDiscrepancyEpsilon) {
        continue;
      }
      out.push({
        documentKey: key,
        clienteId: b.clienteId,
        tienda: b.tienda,
        tipoDocumento: b.tipoDocumento,
        numeroDocumento: b.numeroDocumento,
        saldoBase: b.saldo,
        saldoErp: erp.saldo,
      });
    }
    return out;
  }

  /**
   * Entre documentos con discrepancia de saldo (base vs ERP), devuelve las claves
   * donde el saldo del ERP es estrictamente menor que el del archivo base.
   * Se persiste en `rawRowJson` para resaltar la celda Saldo en el Excel exportado.
   */
  private documentKeysWhereErpSaldoLowerThanBase(
    discrepancies: Array<{
      documentKey: string;
      saldoBase: string | null;
      saldoErp: string | null;
    }>,
  ): Set<string> {
    const keys = new Set<string>();
    for (const d of discrepancies) {
      const nb = this.parseSaldoNumeric(d.saldoBase);
      const ne = this.parseSaldoNumeric(d.saldoErp);
      if (nb === null || ne === null) {
        continue;
      }
      if (ne < nb) {
        keys.add(d.documentKey);
      }
    }
    return keys;
  }

  private mergeRawJsonSaldoErpMenorFlag(
    doc: ParsedDocument,
    erpSaldoLowerThanBaseKeys: Set<string>,
  ): Record<string, unknown> | null {
    const key = buildDocumentKey(doc);
    const base = { ...(doc.rawRowJson ?? {}) };
    if (erpSaldoLowerThanBaseKeys.has(key)) {
      base['saldoErpMenorQueArchivoBase'] = true;
    } else {
      delete base['saldoErpMenorQueArchivoBase'];
    }
    return Object.keys(base).length > 0 ? base : null;
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
      const baseContent = decodeUploadBufferToUtf8String(baseFile.buffer);
      const erpContent = decodeUploadBufferToUtf8String(erpFile.buffer);

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

      const baseDocsEnrichedFecha = this.enrichBaseFechaFromErp(
        normalizedBaseDocs,
        normalizedErpDocs,
      );
      const previewSaldoDiscrepancies = this.collectSaldoDiscrepancies(
        normalizedBaseDocs,
        normalizedErpDocs,
      );
      const erpSaldoLowerThanBaseKeys =
        this.documentKeysWhereErpSaldoLowerThanBase(previewSaldoDiscrepancies);

      const baseMap = new Map<string, (typeof baseDocsEnrichedFecha)[number]>();
      baseDocsEnrichedFecha.forEach((doc) =>
        baseMap.set(buildDocumentKey(doc), doc),
      );

      const addedDocuments = normalizedErpDocs.filter(
        (doc) => !baseMap.has(buildDocumentKey(doc)),
      );
      const finalDocumentsRaw = [...baseDocsEnrichedFecha, ...addedDocuments];
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
      const finalForSave = this.enrichCeosDocsWithErpClienteMeta(
        finalDocuments,
        normalizedErpDocs,
      );
      const allErrors = [...baseParsed.errors, ...erpParsed.errors];

      await this.dataSource.transaction(async (manager) => {
        const ccCurrentRepo = manager.getRepository(CcCurrent);
        const ccBackupRepo = manager.getRepository(CcBackup);
        const errorsRepo = manager.getRepository(ConsolidationError);
        const consRepo = manager.getRepository(Consolidation);

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
          finalForSave.map((doc) =>
            ccCurrentRepo.create({
              erpSource: doc.erpSource,
              clienteId: doc.clienteId,
              tienda: doc.tienda,
              tipoDocumento: doc.tipoDocumento,
              numeroDocumento: doc.numeroDocumento,
              fechaDoc: this.toDateOnly(doc.fechaDoc),
              valor: doc.valor,
              saldo: doc.saldo,
              rawRowJson: this.mergeRawJsonSaldoErpMenorFlag(
                doc,
                erpSaldoLowerThanBaseKeys,
              ),
              lastConsolidation: consolidation,
            }),
          ),
        );

        consolidation.status = ConsolidationStatus.OK;
        consolidation.baseFileText = baseContent;
        consolidation.baseDocsCount = normalizedBaseDocs.length;
        consolidation.erpDocsCount = normalizedErpDocs.length;
        consolidation.keptDocsCount = normalizedBaseDocs.length;
        consolidation.addedDocsCount = addedDocuments.length;
        consolidation.errorCount = allErrors.length;
        await consRepo.save(consolidation);
      });

      return {
        consolidationId: consolidation.id,
        erpSource: consolidation.erpSource,
        status: consolidation.status,
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
        previewCurrent: finalForSave.slice(0, 20).map((doc) => ({
          clienteId: doc.clienteId,
          tienda: doc.tienda,
          tipoDocumento: doc.tipoDocumento,
          numeroDocumento: doc.numeroDocumento,
          saldo: doc.saldo,
          observaciones: null,
        })),
        previewRemoved: [],
        previewSaldoDiscrepancies: previewSaldoDiscrepancies.slice(0, 50),
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
      const baseContent = decodeUploadBufferToUtf8String(baseFile.buffer);
      const erpContent = decodeUploadBufferToUtf8String(erpFile.buffer);

      const cutoffDate = this.parseUserIsoDateToUtcMidnight(
        dto.fechaCorteEliminacion,
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

      const baseDocsEnrichedFecha = this.enrichBaseFechaFromErp(
        normalizedBaseDocs,
        normalizedErpDocs,
      );
      const previewSaldoDiscrepancies = this.collectSaldoDiscrepancies(
        normalizedBaseDocs,
        normalizedErpDocs,
      );
      const erpSaldoLowerThanBaseKeys =
        this.documentKeysWhereErpSaldoLowerThanBase(previewSaldoDiscrepancies);

      const erpDocKeys = new Set<string>();
      normalizedErpDocs.forEach((doc) => erpDocKeys.add(buildDocumentKey(doc)));

      const { finalDocuments, removedDocuments } =
        this.filterDocumentsByRemoveRules(
          baseDocsEnrichedFecha,
          erpDocKeys,
          cutoffDate,
        );

      const finalForSave = this.enrichCeosDocsWithErpClienteMeta(
        finalDocuments,
        normalizedErpDocs,
      );

      const allErrors = [...baseParsed.errors, ...erpParsed.errors];

      await this.dataSource.transaction(async (manager) => {
        const ccCurrentRepo = manager.getRepository(CcCurrent);
        const ccBackupRepo = manager.getRepository(CcBackup);
        const errorsRepo = manager.getRepository(ConsolidationError);
        const consRepo = manager.getRepository(Consolidation);

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
          finalForSave.map((doc) =>
            ccCurrentRepo.create({
              erpSource: doc.erpSource,
              clienteId: doc.clienteId,
              tienda: doc.tienda,
              tipoDocumento: doc.tipoDocumento,
              numeroDocumento: doc.numeroDocumento,
              fechaDoc: this.toDateOnly(doc.fechaDoc),
              valor: doc.valor,
              saldo: doc.saldo,
              rawRowJson: this.mergeRawJsonSaldoErpMenorFlag(
                doc,
                erpSaldoLowerThanBaseKeys,
              ),
              lastConsolidation: consolidation,
            }),
          ),
        );

        consolidation.status = ConsolidationStatus.OK;
        consolidation.baseFileText = baseContent;
        consolidation.baseDocsCount = normalizedBaseDocs.length;
        consolidation.erpDocsCount = normalizedErpDocs.length;
        consolidation.keptDocsCount = finalForSave.length;
        consolidation.addedDocsCount = 0;
        consolidation.errorCount = allErrors.length;
        await consRepo.save(consolidation);
      });

      return {
        consolidationId: consolidation.id,
        erpSource: consolidation.erpSource,
        status: consolidation.status,
        fechaCorteEliminacion: dto.fechaCorteEliminacion,
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
        previewCurrent: finalForSave.slice(0, 20).map((doc) => ({
          clienteId: doc.clienteId,
          tienda: doc.tienda,
          tipoDocumento: doc.tipoDocumento,
          numeroDocumento: doc.numeroDocumento,
          saldo: doc.saldo,
          observaciones: null,
        })),
        previewSaldoDiscrepancies: previewSaldoDiscrepancies.slice(0, 50),
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

  /**
   * Un solo paso: misma lógica que agregar (unión base + ERP por clave) y luego eliminar
   * (corte + presencia en el mismo listado ERP), sin nuevos algoritmos de parseo.
   */
  async fullConsolidationFromErp(
    dto: FullConsolidationFromErpDto,
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
      const baseContent = decodeUploadBufferToUtf8String(baseFile.buffer);
      const erpContent = decodeUploadBufferToUtf8String(erpFile.buffer);

      const cutoffDate = this.parseUserIsoDateToUtcMidnight(
        dto.fechaCorteEliminacion,
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

      const baseDocsEnrichedFecha = this.enrichBaseFechaFromErp(
        normalizedBaseDocs,
        normalizedErpDocs,
      );
      const previewSaldoDiscrepancies = this.collectSaldoDiscrepancies(
        normalizedBaseDocs,
        normalizedErpDocs,
      );
      const erpSaldoLowerThanBaseKeys =
        this.documentKeysWhereErpSaldoLowerThanBase(previewSaldoDiscrepancies);

      const baseMap = new Map<string, (typeof baseDocsEnrichedFecha)[number]>();
      baseDocsEnrichedFecha.forEach((doc) =>
        baseMap.set(buildDocumentKey(doc), doc),
      );

      const addedDocuments = normalizedErpDocs.filter(
        (doc) => !baseMap.has(buildDocumentKey(doc)),
      );
      const afterAddRaw = [...baseDocsEnrichedFecha, ...addedDocuments];
      const afterAddDeduped = new Map<string, (typeof afterAddRaw)[number]>();
      afterAddRaw.forEach((doc) => {
        const key = buildDocumentKey(doc);
        if (!afterAddDeduped.has(key)) {
          afterAddDeduped.set(key, doc);
        }
      });
      const afterAddDocuments = [...afterAddDeduped.values()];

      const erpDocKeys = new Set<string>();
      normalizedErpDocs.forEach((doc) => erpDocKeys.add(buildDocumentKey(doc)));

      const { finalDocuments, removedDocuments } =
        this.filterDocumentsByRemoveRules(
          afterAddDocuments,
          erpDocKeys,
          cutoffDate,
        );

      const finalForSave = this.enrichCeosDocsWithErpClienteMeta(
        finalDocuments,
        normalizedErpDocs,
      );

      const allErrors = [...baseParsed.errors, ...erpParsed.errors];

      await this.dataSource.transaction(async (manager) => {
        const ccCurrentRepo = manager.getRepository(CcCurrent);
        const ccBackupRepo = manager.getRepository(CcBackup);
        const errorsRepo = manager.getRepository(ConsolidationError);
        const consRepo = manager.getRepository(Consolidation);

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
          finalForSave.map((doc) =>
            ccCurrentRepo.create({
              erpSource: doc.erpSource,
              clienteId: doc.clienteId,
              tienda: doc.tienda,
              tipoDocumento: doc.tipoDocumento,
              numeroDocumento: doc.numeroDocumento,
              fechaDoc: this.toDateOnly(doc.fechaDoc),
              valor: doc.valor,
              saldo: doc.saldo,
              rawRowJson: this.mergeRawJsonSaldoErpMenorFlag(
                doc,
                erpSaldoLowerThanBaseKeys,
              ),
              lastConsolidation: consolidation,
            }),
          ),
        );

        consolidation.status = ConsolidationStatus.OK;
        consolidation.baseFileText = baseContent;
        consolidation.baseDocsCount = normalizedBaseDocs.length;
        consolidation.erpDocsCount = normalizedErpDocs.length;
        consolidation.keptDocsCount = finalForSave.length;
        consolidation.addedDocsCount = addedDocuments.length;
        consolidation.errorCount = allErrors.length;
        await consRepo.save(consolidation);
      });

      return {
        consolidationId: consolidation.id,
        erpSource: consolidation.erpSource,
        status: consolidation.status,
        fechaCorteEliminacion: dto.fechaCorteEliminacion,
        stats: {
          baseDocs: consolidation.baseDocsCount,
          erpDocs: consolidation.erpDocsCount,
          keptDocs: consolidation.keptDocsCount,
          addedDocs: consolidation.addedDocsCount,
          removedDocs: removedDocuments.length,
          errors: consolidation.errorCount,
        },
        previewAdded: addedDocuments.slice(0, 20).map((doc) => ({
          clienteId: doc.clienteId,
          tienda: doc.tienda,
          tipoDocumento: doc.tipoDocumento,
          numeroDocumento: doc.numeroDocumento,
        })),
        previewRemoved: removedDocuments.slice(0, 20).map((doc) => ({
          clienteId: doc.clienteId,
          tienda: doc.tienda,
          tipoDocumento: doc.tipoDocumento,
          numeroDocumento: doc.numeroDocumento,
          fechaDoc: doc.fechaDoc
            ? doc.fechaDoc.toISOString().slice(0, 10)
            : null,
        })),
        previewCurrent: finalForSave.slice(0, 20).map((doc) => ({
          clienteId: doc.clienteId,
          tienda: doc.tienda,
          tipoDocumento: doc.tipoDocumento,
          numeroDocumento: doc.numeroDocumento,
          saldo: doc.saldo,
          observaciones: null,
        })),
        previewSaldoDiscrepancies: previewSaldoDiscrepancies.slice(0, 50),
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
