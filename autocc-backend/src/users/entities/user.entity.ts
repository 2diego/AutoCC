import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DocumentNotesAudit } from '../../document-notes-audit/entities/document-notes-audit.entity';

export enum UserRole {
  ADMIN = 'admin',
  OPERATOR = 'operator',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash', select: false })
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.OPERATOR })
  role: UserRole;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => DocumentNotesAudit, (audit) => audit.changedByUser)
  noteAudits: DocumentNotesAudit[];
}
