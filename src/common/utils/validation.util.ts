import { BadRequestException } from '@nestjs/common';

/**
 * Update DTOs make every field optional, which also lets null through.
 * Call this for fields that are optional to send but must never be cleared.
 */
export function assertNotNull<T extends object>(
  dto: T,
  keys: readonly (keyof T & string)[],
): void {
  const cleared = keys.filter((key) => dto[key] === null);
  if (cleared.length) {
    throw new BadRequestException(
      cleared.map((key) => `${key} cannot be empty`),
    );
  }
}
