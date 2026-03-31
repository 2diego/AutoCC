import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Consolidation } from '../../consolidations/entities/consolidation.entity';

@Entity('cc_backup')
export class CcBackup {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 10 })
  erpSource: string;

  @Column()
  clienteId: string;

  @Column()
  tienda: string;

  @Column()
  tipoDocumento: string;

  @Column()
  numeroDocumento: string;

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

  @ManyToOne(() => Consolidation, (consolidation) => consolidation.backupRows, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'backup_from_consolidation_id' })
  backupFromConsolidation: Consolidation | null;

  @CreateDateColumn({ name: 'backup_created_at' })
  backupCreatedAt: Date;
}
