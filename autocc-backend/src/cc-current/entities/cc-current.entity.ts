import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Consolidation } from '../../consolidations/entities/consolidation.entity';

@Entity('cc_current')
@Index(
  ['erpSource', 'clienteId', 'tienda', 'tipoDocumento', 'numeroDocumento'],
  {
    unique: true,
  },
)
export class CcCurrent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 10 })
  erpSource: string;

  @Column({ length: 32 })
  clienteId: string;

  @Column({ length: 10 })
  tienda: string;

  @Column({ length: 16 })
  tipoDocumento: string;

  @Column({ length: 64 })
  numeroDocumento: string;

  /** Vencimiento / fecha documento. Atraso en días para lógica API/bots: calcular desde aca + tipo (p. ej. excluir recibos), no desde celdas de export Excel. */
  @Column({ type: 'date', nullable: true })
  fechaDoc: Date | null;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true })
  valor: string | null;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true })
  saldo: string | null;

  @Column({ type: 'simple-json', nullable: true })
  rawRowJson: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  observaciones: string | null;

  @Column({ type: 'text', nullable: true })
  motivoDeuda: string | null;

  @ManyToOne(
    () => Consolidation,
    (consolidation) => consolidation.currentRows,
    {
      nullable: true,
      onDelete: 'SET NULL',
    },
  )
  @JoinColumn({ name: 'last_consolidation_id' })
  lastConsolidation: Consolidation | null;
}
