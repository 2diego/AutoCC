import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('document_notes_audit')
export class DocumentNotesAudit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 10 })
  erpSource: string;

  @Column()
  documentKey: string;

  @Column({ type: 'text', nullable: true })
  oldObservaciones: string | null;

  @Column({ type: 'text', nullable: true })
  newObservaciones: string | null;

  @Column({ type: 'text', nullable: true })
  oldMotivoDeuda: string | null;

  @Column({ type: 'text', nullable: true })
  newMotivoDeuda: string | null;

  @ManyToOne(() => User, (user) => user.noteAudits, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'changed_by_user_id' })
  changedByUser: User | null;

  @CreateDateColumn({ name: 'changed_at' })
  changedAt: Date;
}
