import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCcBackupDto } from './dto/create-cc-backup.dto';
import { UpdateCcBackupDto } from './dto/update-cc-backup.dto';
import { CcBackup } from './entities/cc-backup.entity';

@Injectable()
export class CcBackupService {
  constructor(
    @InjectRepository(CcBackup)
    private readonly ccBackupRepository: Repository<CcBackup>,
  ) {}

  create(createCcBackupDto: CreateCcBackupDto) {
    const entity = this.ccBackupRepository.create(createCcBackupDto);
    return this.ccBackupRepository.save(entity);
  }

  findAll() {
    return this.ccBackupRepository.find({ order: { backupCreatedAt: 'DESC' } });
  }

  findOne(id: number) {
    return this.ccBackupRepository.findOneBy({ id });
  }

  update(id: number, updateCcBackupDto: UpdateCcBackupDto) {
    return this.ccBackupRepository.save({
      id,
      ...updateCcBackupDto,
    });
  }

  remove(id: number) {
    return this.ccBackupRepository.delete(id);
  }
}
