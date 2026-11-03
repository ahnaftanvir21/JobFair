import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../../common/enums/index.js';
import { User } from './entities/user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.usersRepo.findOneBy({ id });
  }

  /** Includes the password hash, for login checks only. */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: email.toLowerCase() })
      .getOne();
  }

  async emailExists(email: string): Promise<boolean> {
    return this.usersRepo.existsBy({ email: email.toLowerCase() });
  }

  async create(data: {
    email: string;
    passwordHash: string;
    role: UserRole;
  }): Promise<User> {
    const user = this.usersRepo.create({
      ...data,
      email: data.email.toLowerCase(),
    });
    const saved = await this.usersRepo.save(user);
    // Do not leak the hash back to callers.
    const { passwordHash: _hash, ...safe } = saved;
    return safe as User;
  }
}
