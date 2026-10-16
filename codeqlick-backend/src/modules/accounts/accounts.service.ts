import { Injectable } from '@nestjs/common';
import { toApiLocale, type ApiLocale } from '../../common/schemas/common.schemas.js';
import { AccountsRepository } from './accounts.repository.js';

/** Someone who receives a client account's emails. */
export interface AccountPerson {
  id: string;
  name: string;
  email: string;
  locale: ApiLocale;
  /** False until the owner of a team-prepared account makes it theirs (decision 17). */
  registered: boolean;
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
    return (await this.repository.people(accountId)).map(({ registeredAt, ...person }) => ({
      ...person,
      locale: toApiLocale(person.locale),
      registered: Boolean(registeredAt),
    }));
  }
}
