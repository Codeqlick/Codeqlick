import { Injectable } from '@nestjs/common';
import { toApiLocale, type ApiLocale } from '../../common/schemas/common.schemas.js';
import { AccountsRepository } from './accounts.repository.js';

/** Someone who receives a client account's emails. */
export interface AccountPerson {
  name: string;
  email: string;
  locale: ApiLocale;
}

/**
 * Client accounts (companies): the main client account owns the projects, requests and proposals;
 * its members see and act on them too, and get the same emails.
 */
@Injectable()
export class AccountsService {
  constructor(private readonly repository: AccountsRepository) {}

  /** Who gets the account's emails: the owner and the members, active ones only. */
  async people(accountId: string): Promise<AccountPerson[]> {
    return (await this.repository.people(accountId)).map((person) => ({
      ...person,
      locale: toApiLocale(person.locale),
    }));
  }
}
