import { Pool } from "pg";
import { ContactRepository } from "../../domain/interfaces/contact-repository";
import { Contact } from "../../domain/entities/contact";

export class PostgresContactRepository implements ContactRepository {
  constructor(private readonly pool: Pool) {}

  async save(contact: Contact): Promise<void> {
    console.log(`saving contact to database: ${JSON.stringify(contact)}`);

    const query = `
      INSERT INTO contacts (email, first_name, last_name)
      VALUES ($1, $2, $3)
      ON CONFLICT (email) DO UPDATE
      SET first_name = $2, last_name = $3
    `;

    await this.pool.query(query, [
      contact.email,
      contact.firstName,
      contact.lastName,
    ]);

    console.log(`contact saved successfully`);
  }

  async saveMany(contacts: Contact[]): Promise<void> {
    if (contacts.length === 0) {
      console.log("no contacts to save, skipping");
      return;
    }

    console.log(`saving ${contacts.length} contacts to database`);

    let retries = 0;
    const maxRetries = 3;
    const retryDelay = 5000; // 5 seconds

    while (retries <= maxRetries) {
      let client;

      try {
        client = await this.acquireClient();

        await this.beginTransaction(client, retries, maxRetries);
        await this.processBatches(client, contacts, retries);
        await this.commitTransaction(client);
        break;
      } catch (error) {
        if (client) {
          await this.handleTransactionError(client, error);
          
          if (this.shouldRetry(error, retries, maxRetries)) {
            retries++;
            await this.delay(retryDelay);
            continue;
          }
        }

        throw error;
      } finally {
        if (client) {
          this.releaseClient(client);
        }
      }
    }
  }

  private async acquireClient() {
    console.log("Acquiring database client from pool");
    return await this.pool.connect();
  }

  private releaseClient(client: any) {
    console.log("releasing client back to pool");
    client.release();
  }

  private async beginTransaction(
    client: any,
    retryCount: number,
    maxRetries: number
  ) {
    console.log(
      `beginning transaction (attempt ${retryCount + 1}/${maxRetries + 1})`
    );
    await client.query("BEGIN");
  }

  private async commitTransaction(client: any) {
    console.log("committing transaction");
    await client.query("COMMIT");
    console.log("transaction committed successfully");
  }

  private async handleTransactionError(client: any, error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`error in transaction, rolling back: ${errorMessage}`);

    try {
      await client.query("ROLLBACK");
      console.log("transaction rolled back successfully");
    } catch (rollbackError) {
      console.error("failed to rollback transaction:", rollbackError);
    }
  }

  private shouldRetry(
    error: unknown,
    currentRetry: number,
    maxRetries: number
  ): boolean {
    if (currentRetry >= maxRetries) {
      return false;
    }

    if (
      error instanceof Error &&
      (error.message.includes("timeout") ||
        error.message.includes("connection"))
    ) {
      console.log(
        `retry attempt ${
          currentRetry + 1
        }/${maxRetries} will be performed due to recoverable error`
      );
      return true;
    }

    return false;
  }

  private async delay(ms: number): Promise<void> {
    console.log(`waiting ${ms}ms before retry`);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async processBatches(
    client: any,
    contacts: Contact[],
    retryCount: number
  ): Promise<void> {
    const MAX_PARAMS = 32767; //  half of 65535 to stay well within PG limits
    const PARAMS_PER_CONTACT = 3;
    const MAX_CONTACTS_PER_INSERT = Math.floor(MAX_PARAMS / PARAMS_PER_CONTACT);

    const batchDivisor = retryCount > 0 ? Math.pow(2, retryCount) : 1;
    const batchSize = Math.floor(MAX_CONTACTS_PER_INSERT / batchDivisor);

    const statementName = `batch_insert_${Date.now()}`;
    const prepStmtQuery = `
      PREPARE ${statementName}(text, text, text) AS
      INSERT INTO contacts (email, first_name, last_name)
      VALUES ($1, $2, $3)
      ON CONFLICT (email) DO UPDATE
      SET first_name = EXCLUDED.first_name, 
          last_name = EXCLUDED.last_name
    `;

    await client.query(prepStmtQuery);

    let processedCount = 0;
    const totalContacts = contacts.length;

    for (let i = 0; i < totalContacts; i += batchSize) {
      const batchContacts = contacts.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(totalContacts / batchSize);

      await this.saveBatch({
        client,
        batchContacts,
        statementName,
        batchNumber,
        totalBatches,
      });

      processedCount += batchContacts.length;

      const progressPercent = Math.round(
        (processedCount / totalContacts) * 100
      );
      if (
        batchNumber === 1 ||
        batchNumber === totalBatches ||
        batchNumber % 5 === 0
      ) {
        console.log(
          `progress: ${progressPercent}% (${processedCount}/${totalContacts} contacts processed)`
        );
      }
    }

    await client.query(`DEALLOCATE ${statementName}`);
  }

  private async saveBatch({
    client,
    batchContacts,
    statementName,
    batchNumber,
    totalBatches,
  }: {
    client: any;
    batchContacts: Contact[];
    statementName: string;
    batchNumber: number;
    totalBatches: number;
  }): Promise<void> {
    console.log(
      `Processing batch ${batchNumber}/${totalBatches} with ${batchContacts.length} contacts`
    );

    /** 
      execute batch using EXECUTE statements for each prepared statement
      this is more efficient than constructing a single large query
    **/
    const promises = batchContacts.map((contact) => {
      return client.query(`EXECUTE ${statementName}($1, $2, $3)`, [
        contact.email,
        contact.firstName,
        contact.lastName,
      ]);
    });

    const results = await Promise.allSettled(promises);

    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter((r) => r.status === "rejected");

    if (rejected.length > 0) {
      console.warn(
        `batch ${batchNumber}/${totalBatches}: ${rejected.length} operations failed out of ${batchContacts.length}`
      );

      const maxErrorsToLog = Math.min(3, rejected.length);
      for (let i = 0; i < maxErrorsToLog; i++) {
        const error = (rejected[i] as PromiseRejectedResult).reason;
        console.error(
          `error ${i + 1}/${maxErrorsToLog}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      if (rejected.length > maxErrorsToLog) {
        console.error(
          `${rejected.length - maxErrorsToLog} more errors`
        );
      }

      if (rejected.length > batchContacts.length / 2) {
        throw new Error(
          `too many operations failed in batch ${batchNumber} (${rejected.length}/${batchContacts.length})`
        );
      }
    }

    console.log(
      `batch ${batchNumber}/${totalBatches} completed: ${fulfilled} successful, ${rejected.length} failed`
    );
  }

  async findAll(options: {
    limit: number;
    offset: number;
  }): Promise<Contact[]> {
    console.log(
      `finding all contacts with limit: ${options.limit}, offset: ${options.offset}`
    );

    const query = `
      SELECT id, email, first_name, last_name
      FROM contacts
      ORDER BY email
      OFFSET $1
      LIMIT $2
    `;

    const result = await this.pool.query(query, [
      options.offset,
      options.limit,
    ]);

    console.log(`found ${result.rows.length} contacts`);

    return result.rows.map(
      (row) => new Contact(row.email, row.first_name, row.last_name, row.id)
    );
  }

  async findByEmail(email: string): Promise<Contact | null> {
    console.log(`finding contact by email: ${email}`);

    const query = `
      SELECT id, email, first_name, last_name
      FROM contacts
      WHERE email = $1
    `;

    const result = await this.pool.query(query, [email]);

    if (result.rows.length === 0) {
      console.log(`contact not found`);
      return null;
    }

    const row = result.rows[0];
    console.log(`contact found: ${row.email}`);
    return new Contact(row.email, row.first_name, row.last_name, row.id);
  }
}
