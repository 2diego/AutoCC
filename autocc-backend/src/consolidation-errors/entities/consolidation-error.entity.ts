import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Consolidation } from '../../consolidations/entities/consolidation.entity';

@Entity('consolidation_errors')
export class ConsolidationError {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Consolidation, (consolidation) => consolidation.errors, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'consolidation_id' })
  consolidation: Consolidation;

  @Column()
  sourceFile: 'BASE' | 'ERP';

  @Column({ type: 'int' })
  lineNumber: number;

  @Column({ type: 'text' })
  rawLine: string;

  @Column()
  errorCode: string;

  @Column({ type: 'text' })
  message: string;
}
