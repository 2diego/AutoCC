import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Workbook } from 'exceljs';
import { Repository } from 'typeorm';
import { CcCurrent } from '../cc-current/entities/cc-current.entity';

@Injectable()
export class ExportsService {
  constructor(
    @InjectRepository(CcCurrent)
    private readonly ccCurrentRepository: Repository<CcCurrent>,
  ) {}

  private formatDate(date: Date | null): string {
    if (!date) return '';
    const d = new Date(date);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  async buildCurrentWorkbook(erpSource: string): Promise<Buffer> {
    const rows = await this.ccCurrentRepository.find({
      where: { erpSource },
      order: {
        clienteId: 'ASC',
        tienda: 'ASC',
        fechaDoc: 'ASC',
        tipoDocumento: 'ASC',
        numeroDocumento: 'ASC',
      },
    });

    const workbook = new Workbook();
    const ws = workbook.addWorksheet(`${erpSource}_CURRENT`);

    ws.columns = [
      { header: 'Cliente ID', key: 'clienteId', width: 16 },
      { header: 'Tienda', key: 'tienda', width: 10 },
      { header: 'Tipo Documento', key: 'tipoDocumento', width: 16 },
      { header: 'Numero Documento', key: 'numeroDocumento', width: 22 },
      { header: 'Fecha Documento', key: 'fechaDoc', width: 16 },
      { header: 'Valor', key: 'valor', width: 14 },
      { header: 'Saldo', key: 'saldo', width: 14 },
      { header: 'Observaciones', key: 'observaciones', width: 40 },
      { header: 'Motivo Deuda', key: 'motivoDeuda', width: 30 },
    ];

    ws.getRow(1).font = { bold: true };

    rows.forEach((row) => {
      ws.addRow({
        clienteId: row.clienteId,
        tienda: row.tienda,
        tipoDocumento: row.tipoDocumento,
        numeroDocumento: row.numeroDocumento,
        fechaDoc: this.formatDate(row.fechaDoc),
        valor: row.valor ?? '',
        saldo: row.saldo ?? '',
        observaciones: row.observaciones ?? '',
        motivoDeuda: row.motivoDeuda ?? '',
      });
    });

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
