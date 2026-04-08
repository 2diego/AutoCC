import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Workbook } from 'exceljs';
import { Repository } from 'typeorm';
import { CcBackup } from '../cc-backup/entities/cc-backup.entity';
import { formatFechaDocUtcDmy } from '../common/utils/format-fecha-doc-utc-dmy.util';
import { CcCurrent } from '../cc-current/entities/cc-current.entity';
import {
  Consolidation,
  ConsolidationStatus,
  ErpSource,
} from '../consolidations/entities/consolidation.entity';
import { buildReplayWorkbook } from './base-export-replay.util';

@Injectable()
export class ExportsService {
  constructor(
    @InjectRepository(CcCurrent)
    private readonly ccCurrentRepository: Repository<CcCurrent>,
    @InjectRepository(CcBackup)
    private readonly ccBackupRepository: Repository<CcBackup>,
    @InjectRepository(Consolidation)
    private readonly consolidationsRepository: Repository<Consolidation>,
  ) {}

  private getClientMeta(rows: CcCurrent[]): {
    nombre: string;
    localidad: string;
  } {
    // El snapshot actual no persiste datos maestros dedicados de clientes.
    // Si el parser enriquece rawRowJson en el futuro, esto lo captura automáticamente.
    for (const row of rows) {
      const raw = row.rawRowJson ?? {};
      const nombre =
        (raw['nombreCliente'] as string | undefined) ??
        (raw['clienteNombre'] as string | undefined) ??
        '';
      const localidad =
        (raw['localidad'] as string | undefined) ??
        (raw['clienteLocalidad'] as string | undefined) ??
        '';
      if (nombre || localidad) {
        return { nombre, localidad };
      }
    }
    return { nombre: '', localidad: '' };
  }

  private toBaseLikeRow(row: CcCurrent): Record<string, string> {
    const raw = row.rawRowJson ?? {};
    const rawLine = (raw['raw'] as string | undefined) ?? '';
    const sourceFile = (raw['sourceFile'] as string | undefined) ?? '';

    if (sourceFile === 'BASE' && rawLine.includes(';')) {
      const parts = rawLine.split(';');
      return {
        c1: (parts[0] ?? '').trim(),
        c2: (parts[1] ?? '').trim(),
        c3: (parts[2] ?? '').trim(),
        c4: (parts[3] ?? '').trim(),
        c5: (parts[4] ?? '').trim(),
        c6: (parts[5] ?? '').trim(),
        c7: (parts[6] ?? '').trim(),
        c8: (parts[7] ?? '').trim(),
        c9: (parts[8] ?? '').trim(),
        c10: (parts[9] ?? '').trim(),
        c11: (parts[10] ?? '').trim(),
      };
    }

    const comprobante =
      row.erpSource.toUpperCase() === 'CEOS'
        ? `${row.tipoDocumento} ${row.numeroDocumento}`.trim()
        : row.numeroDocumento;

    return {
      c1: '',
      c2: comprobante,
      c3: formatFechaDocUtcDmy(row.fechaDoc),
      c4: row.valor ?? '',
      c5: row.saldo ?? '',
      c6: '',
      c7: '',
      c8: '',
      c9: '',
      c10: '',
      c11: '',
    };
  }

  private toBaseLikeBackupRow(row: CcBackup): Record<string, string> {
    const raw = row.rawRowJson ?? {};
    const rawLine = (raw['raw'] as string | undefined) ?? '';
    const sourceFile = (raw['sourceFile'] as string | undefined) ?? '';

    if (sourceFile === 'BASE' && rawLine.includes(';')) {
      const parts = rawLine.split(';');
      return {
        c1: (parts[0] ?? '').trim(),
        c2: (parts[1] ?? '').trim(),
        c3: (parts[2] ?? '').trim(),
        c4: (parts[3] ?? '').trim(),
        c5: (parts[4] ?? '').trim(),
        c6: (parts[5] ?? '').trim(),
        c7: (parts[6] ?? '').trim(),
        c8: (parts[7] ?? '').trim(),
        c9: (parts[8] ?? '').trim(),
        c10: (parts[9] ?? '').trim(),
        c11: (parts[10] ?? '').trim(),
      };
    }

    const comprobante =
      row.erpSource.toUpperCase() === 'CEOS'
        ? `${row.tipoDocumento} ${row.numeroDocumento}`.trim()
        : row.numeroDocumento;

    return {
      c1: '',
      c2: comprobante,
      c3: formatFechaDocUtcDmy(row.fechaDoc),
      c4: row.valor ?? '',
      c5: row.saldo ?? '',
      c6: '',
      c7: '',
      c8: '',
      c9: '',
      c10: '',
      c11: '',
    };
  }

  async buildCurrentWorkbook(erpSource: string): Promise<Buffer> {
    const rows = await this.ccCurrentRepository.find({
      where: { erpSource },
      order: {
        tienda: 'ASC',
        fechaDoc: 'ASC',
        tipoDocumento: 'ASC',
        numeroDocumento: 'ASC',
      },
    });

    const latestBase = await this.consolidationsRepository.findOne({
      where: {
        erpSource: erpSource as ErpSource,
        status: ConsolidationStatus.OK,
      },
      order: { id: 'DESC' },
    });
    if (latestBase?.baseFileText && latestBase.baseFileText.length > 0) {
      return buildReplayWorkbook(
        erpSource as ErpSource,
        latestBase.baseFileText,
        rows,
      );
    }

    const workbook = new Workbook();
    const ws = workbook.addWorksheet(`${erpSource}_CURRENT`);

    ws.columns = [
      { header: '', key: 'c1', width: 24 },
      { header: 'Comprobante', key: 'c2', width: 24 },
      { header: 'Fecha', key: 'c3', width: 14 },
      { header: 'Valor', key: 'c4', width: 14 },
      { header: 'Saldo', key: 'c5', width: 14 },
      { header: 'Atraso', key: 'c6', width: 12 },
      { header: 'Recibo', key: 'c7', width: 16 },
      { header: 'Importe', key: 'c8', width: 16 },
      { header: 'Fecha', key: 'c9', width: 14 },
      { header: 'Nota Credito', key: 'c10', width: 16 },
      { header: 'Nota Credito', key: 'c11', width: 16 },
      { header: 'Observaciones', key: 'observaciones', width: 40 },
    ];

    ws.getRow(1).font = { bold: true };
    const grouped = new Map<string, CcCurrent[]>();
    rows.forEach((row) => {
      const key = `${row.clienteId}|${row.tienda}`;
      const current = grouped.get(key) ?? [];
      current.push(row);
      grouped.set(key, current);
    });

    const groupedEntries = [...grouped.entries()].sort((a, b) => {
      const aMeta = this.getClientMeta(a[1]);
      const bMeta = this.getClientMeta(b[1]);
      const aName = aMeta.nombre.trim().toUpperCase();
      const bName = bMeta.nombre.trim().toUpperCase();
      if (aName && bName && aName !== bName) {
        return aName.localeCompare(bName, 'es');
      }
      if (aName && !bName) return -1;
      if (!aName && bName) return 1;
      return a[0].localeCompare(b[0], 'es');
    });

    groupedEntries.forEach(([, clientRows]) => {
      const first = clientRows[0];
      const meta = this.getClientMeta(clientRows);

      const clientHeaderRow = ws.addRow({
        c1: `Cliente :${first.clienteId} - ${first.tienda} - ${meta.nombre}`.trim(),
        c2: '',
        c3: '',
        c4: meta.localidad,
        c5: '',
        c6: '',
        c7: '',
        c8: '',
        c9: '',
        c10: '',
        c11: '',
        observaciones: '',
      });
      clientHeaderRow.font = { bold: true };

      clientRows.forEach((row) => {
        const baseLike = this.toBaseLikeRow(row);
        ws.addRow({
          c1: baseLike.c1,
          c2: baseLike.c2,
          c3: baseLike.c3,
          c4: baseLike.c4,
          c5: baseLike.c5,
          c6: baseLike.c6,
          c7: baseLike.c7,
          c8: baseLike.c8,
          c9: baseLike.c9,
          c10: baseLike.c10,
          c11: baseLike.c11,
          observaciones: row.observaciones ?? '',
        });
      });

      ws.addRow({});
    });

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async buildBackupWorkbook(erpSource: string): Promise<Buffer> {
    const latestBackupSnapshot = await this.ccBackupRepository.findOne({
      where: { erpSource },
      order: { id: 'DESC' },
      relations: { backupFromConsolidation: true },
    });

    if (!latestBackupSnapshot) {
      throw new NotFoundException(
        `No hay backup disponible para ERP ${erpSource}`,
      );
    }

    const backupFromConsolidationId =
      latestBackupSnapshot.backupFromConsolidation?.id ?? null;
    const whereClause = backupFromConsolidationId
      ? {
          erpSource,
          backupFromConsolidation: { id: backupFromConsolidationId },
        }
      : { erpSource, backupCreatedAt: latestBackupSnapshot.backupCreatedAt };

    const rows = await this.ccBackupRepository.find({
      where: whereClause,
      order: {
        tienda: 'ASC',
        fechaDoc: 'ASC',
        tipoDocumento: 'ASC',
        numeroDocumento: 'ASC',
      },
    });

    const workbook = new Workbook();
    const ws = workbook.addWorksheet(`${erpSource}_BACKUP`);

    ws.columns = [
      { header: '', key: 'c1', width: 24 },
      { header: 'Comprobante', key: 'c2', width: 24 },
      { header: 'Fecha', key: 'c3', width: 14 },
      { header: 'Valor', key: 'c4', width: 14 },
      { header: 'Saldo', key: 'c5', width: 14 },
      { header: 'Atraso', key: 'c6', width: 12 },
      { header: 'Recibo', key: 'c7', width: 16 },
      { header: 'Importe', key: 'c8', width: 16 },
      { header: 'Fecha', key: 'c9', width: 14 },
      { header: 'Nota Credito', key: 'c10', width: 16 },
      { header: 'Nota Credito', key: 'c11', width: 16 },
      { header: 'Observaciones', key: 'observaciones', width: 40 },
    ];

    ws.getRow(1).font = { bold: true };

    rows.forEach((row) => {
      const baseLike = this.toBaseLikeBackupRow(row);
      ws.addRow({
        c1: baseLike.c1,
        c2: baseLike.c2,
        c3: baseLike.c3,
        c4: baseLike.c4,
        c5: baseLike.c5,
        c6: baseLike.c6,
        c7: baseLike.c7,
        c8: baseLike.c8,
        c9: baseLike.c9,
        c10: baseLike.c10,
        c11: baseLike.c11,
        observaciones: row.observaciones ?? '',
      });
    });

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
