import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
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

  /** Includes the token version, for checking login tokens. */
  findByIdForAuth(id: string): Promise<User | null> {
    return this.usersRepo
      .createQueryBuilder('user')
      .addSelect('user.tokenVersion')
      .where('user.id = :id', { id })
      .getOne();
  }

  /** Includes the password hash and token version, for login checks only. */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepo
      .createQueryBuilder('user')
      .addSelect(['user.passwordHash', 'user.tokenVersion'])
      .where('user.email = :email', { email: email.toLowerCase() })
      .getOne();
  }

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOneBy({ email: email.toLowerCase() });
  }

  /** Saves a new password hash and logs out every existing token. */
  async updatePassword(
    userId: string,
    passwordHash: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(User) : this.usersRepo;
    await repo.update(userId, {
      passwordHash,
      tokenVersion: () => 'token_version + 1',
    });
  }

  async markEmailVerified(
    userId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(User) : this.usersRepo;
    await repo.update(userId, { emailVerified: true });
  }

  async emailExists(email: string): Promise<boolean> {
    return this.usersRepo.existsBy({ email: email.toLowerCase() });
  }

  /** Pass a transaction manager to create the user inside a transaction. */
  async create(
    data: {
      email: string;
      passwordHash: string;
      role: UserRole;
      emailVerified: boolean;
    },
    manager?: EntityManager,
  ): Promise<User> {
    const repo = manager ? manager.getRepository(User) : this.usersRepo;
    const user = repo.create({ ...data, email: data.email.toLowerCase() });
    const saved = await repo.save(user);
    // Do not leak the hash back to callers.
    const { passwordHash: _hash, ...safe } = saved;
    return safe as User;
  }
}
