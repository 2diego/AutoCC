import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CcCurrent } from '../../cc-current/entities/cc-current.entity';
import { CcBackup } from '../../cc-backup/entities/cc-backup.entity';
import { ConsolidationError } from '../../consolidation-errors/entities/consolidation-error.entity';

export enum ErpSource {
  CEOS = 'CEOS',
  TOTVS = 'TOTVS',
}

export enum ConsolidationStatus {
  PROCESSING = 'processing',
  OK = 'ok',
  FAILED = 'failed',
}

@Entity('consolidations')
export class Consolidation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: ErpSource })
  erpSource: ErpSource;

  @Column()
  baseFileName: string;

  @Column()
  erpFileName: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'enum', enum: ConsolidationStatus, default: ConsolidationStatus.PROCESSING })
  status: ConsolidationStatus;

  @Column({ type: 'int', default: 0 })
  baseDocsCount: number;

  @Column({ type: 'int', default: 0 })
  erpDocsCount: number;

  @Column({ type: 'int', default: 0 })
  addedDocsCount: number;

  @Column({ type: 'int', default: 0 })
  keptDocsCount: number;

  @Column({ type: 'int', default: 0 })
  errorCount: number;

  @OneToMany(() => CcCurrent, (ccCurrent) => ccCurrent.lastConsolidation)
  currentRows: CcCurrent[];

  @OneToMany(() => CcBackup, (ccBackup) => ccBackup.backupFromConsolidation)
  backupRows: CcBackup[];

  @OneToMany(() => ConsolidationError, (error) => error.consolidation)
  errors: ConsolidationError[];
}
