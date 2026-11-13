import { randomBytes } from 'node:crypto';
import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import pg from 'pg';
import { AppConfigService } from '../../config/app-config.service.js';

/** Names Cloud gives databases and their roles; checked before any goes into SQL. */
export const PG_NAME = /^cq_[0-9a-f]{16}$/;

export const newPgName = () => `cq_${randomBytes(8).toString('hex')}`;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
/** 32 characters from an unambiguous alphabet: safe in a connection string as is. */
export function newPgPassword(): string {
  const bytes = randomBytes(64);
  let out = '';
  for (const byte of bytes) {
    // 56 letters: drop bytes that would bias the choice.
    if (byte >= 224) continue;
    out += ALPHABET[byte % ALPHABET.length];
    if (out.length === 32) return out;
  }
  return out + newPgPassword().slice(0, 32 - out.length);
}

function ident(name: string): string {
  if (!PG_NAME.test(name)) throw new Error(`Not a Cloud database name: ${name}`);
  return `"${name}"`;
}

/**
 * The administrator of cloud-pg, the PostgreSQL of teams' databases (architecture 4.13
 * "Databases", decision 47). Only this class runs SQL there; names are Cloud's own (`cq_…`).
 */
@Injectable()
export class CloudPgClient implements OnApplicationShutdown {
  private pool?: pg.Pool;

  constructor(private readonly config: AppConfigService) {}

  get configured(): boolean {
    return this.config.cloudPg !== undefined;
  }

  private db(): pg.Pool {
    const settings = this.config.cloudPg;
    if (!settings) throw new Error('Managed databases are not set up');
    this.pool ??= new pg.Pool({ connectionString: settings.adminUrl, max: 3 });
    return this.pool;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool?.end();
  }

  private async run(sql: string): Promise<void> {
    await this.db().query(sql);
  }

  /** A database owned by a role of the same name, which can only reach it. */
  async create(name: string, password: string, connections: number): Promise<void> {
    const id = ident(name);
    const pool = this.db();
    const client = await pool.connect();
    try {
      await client.query(
        `CREATE ROLE ${id} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION ` +
          `CONNECTION LIMIT ${Math.trunc(connections)} PASSWORD ${client.escapeLiteral(password)}`,
      );
      await client.query(`ALTER ROLE ${id} SET statement_timeout = '60s'`);
      await client.query(`ALTER ROLE ${id} SET idle_in_transaction_session_timeout = '5min'`);
      await client.query(`CREATE DATABASE ${id} OWNER ${id}`);
      await client.query(`REVOKE ALL ON DATABASE ${id} FROM PUBLIC`);
      await client.query(`GRANT CONNECT, TEMPORARY ON DATABASE ${id} TO ${id}`);
    } catch (error) {
      await client.query(`DROP DATABASE IF EXISTS ${id} WITH (FORCE)`).catch(() => undefined);
      await client.query(`DROP ROLE IF EXISTS ${id}`).catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async setPassword(name: string, password: string): Promise<void> {
    const client = await this.db().connect();
    try {
      await client.query(`ALTER ROLE ${ident(name)} PASSWORD ${client.escapeLiteral(password)}`);
    } finally {
      client.release();
    }
  }

  async drop(name: string): Promise<void> {
    const id = ident(name);
    await this.run(`DROP DATABASE IF EXISTS ${id} WITH (FORCE)`);
    await this.run(`DROP ROLE IF EXISTS ${id}`);
  }

  /** Each Cloud database's size and its role's connection limit. */
  async state(): Promise<Map<string, { bytes: number; connections: number }>> {
    const { rows } = await this.db().query<{ name: string; bytes: string; connections: number }>(
      `SELECT d.datname AS name, pg_database_size(d.oid)::text AS bytes,
              coalesce(r.rolconnlimit, -1) AS connections
       FROM pg_database d LEFT JOIN pg_roles r ON r.rolname = d.datname
       WHERE d.datname ~ '^cq_[0-9a-f]{16}$'`,
    );
    return new Map(
      rows.map((row) => [row.name, { bytes: Number(row.bytes), connections: row.connections }]),
    );
  }

  /** Read-only (over its size) or writable again; its sessions are ended so it applies now. */
  async setReadOnly(name: string, readOnly: boolean): Promise<void> {
    const id = ident(name);
    await this.run(
      readOnly
        ? `ALTER DATABASE ${id} SET default_transaction_read_only = on`
        : `ALTER DATABASE ${id} RESET default_transaction_read_only`,
    );
    await this.endSessions(name);
  }

  async setConnections(name: string, connections: number): Promise<void> {
    await this.run(`ALTER ROLE ${ident(name)} CONNECTION LIMIT ${Math.trunc(connections)}`);
  }

  async endSessions(name: string): Promise<void> {
    ident(name);
    await this.db().query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
      [name],
    );
  }
}
