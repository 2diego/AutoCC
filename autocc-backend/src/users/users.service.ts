import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto) {
    const { password, ...rest } = createUserDto;
    const passwordHash = await bcrypt.hash(password, 10);
    const entity = this.usersRepository.create({
      ...rest,
      passwordHash,
    });
    return this.usersRepository.save(entity);
  }

  findAll() {
    return this.usersRepository.find({ order: { id: 'DESC' } });
  }

  findOne(id: number) {
    return this.usersRepository.findOneBy({ id });
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    const { password, ...rest } = updateUserDto as UpdateUserDto & {
      password?: string;
    };
    const payload: Partial<User> = { ...rest };
    if (password) {
      payload.passwordHash = await bcrypt.hash(password, 10);
    }
    return this.usersRepository.update(id, payload);
  }

  remove(id: number) {
    return this.usersRepository.delete(id);
  }

  findByEmailWithPassword(email: string) {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
  }

  countAll() {
    return this.usersRepository.count();
  }
}
