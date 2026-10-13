import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/** Argon2id hashing. Wrapped in a service so it can be mocked in unit tests. */
@Injectable()
export class PasswordService {
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /**
   * Runs a verification against a throwaway hash so a login for an unknown email costs
   * about as much time as one for a known email.
   */
  async verifyDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash('codeqlick-timing-equalizer-not-a-real-password');
    await this.verify(await this.dummyHash, password);
  }
}
