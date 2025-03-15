import { Pool } from 'pg';
import { ContactRepository } from '../../domain/interfaces/contact-repository';
import { Contact } from '../../domain/entities/contact';

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
      contact.lastName
    ]);
    
    console.log(`contact saved successfully`);
  }

  async saveMany(contacts: Contact[]): Promise<void> {
    console.log(`saving ${contacts.length} contacts to database`);
    
    if (contacts.length === 0) {
      console.log(`no contacts to save, skipping`);
      return;
    }

    const client = await this.pool.connect();
    
    try {
      console.log(`beginning transaction`);
      await client.query('BEGIN');
      
      const MAX_PARAMS = 65535; // parameters in a single query due to PostgreSQL limit
      const PARAMS_PER_CONTACT = 3;
      const MAX_CONTACTS_PER_INSERT = Math.floor(MAX_PARAMS / PARAMS_PER_CONTACT);
      
      for (let i = 0; i < contacts.length; i += MAX_CONTACTS_PER_INSERT) {
        const batch = contacts.slice(i, i + MAX_CONTACTS_PER_INSERT);
        console.log(`processing batch of ${batch.length} contacts, starting at index ${i}`);
        
        // placeholders for bulk insert: ($1, $2, $3), ($4, $5, $6), ...
        const placeholders = batch.map((_, idx) => {
          const offset = idx * PARAMS_PER_CONTACT;
          return `($${offset + 1}, $${offset + 2}, $${offset + 3})`;
        }).join(', ');
        
        const values = batch.flatMap(contact => [
          contact.email,
          contact.firstName,
          contact.lastName
        ]);
        
        const query = `
          INSERT INTO contacts (email, first_name, last_name)
          VALUES ${placeholders}
          ON CONFLICT (email) DO UPDATE
          SET first_name = EXCLUDED.first_name, 
              last_name = EXCLUDED.last_name
        `;
        
        console.log(`executing batch insert with ${batch.length} contacts`);
        await client.query(query, values);
        console.log(`batch insert successful`);
      }
      
      console.log(`committing transaction`);
      await client.query('COMMIT');
      console.log(`transaction committed successfully`);
    } catch (error) {
      console.log(`error in transaction, rolling back: ${error instanceof Error ? error.message : String(error)}`);
      await client.query('ROLLBACK');
      throw error;
    } finally {
      console.log(`releasing client`);
      client.release();
    }
  }

  async findAll(options: { limit: number; offset: number }): Promise<Contact[]> {
    console.log(`finding all contacts with limit: ${options.limit}, offset: ${options.offset}`);
    
    const query = `
      SELECT id, email, first_name, last_name
      FROM contacts
      ORDER BY email
      OFFSET $1
      LIMIT $2
    `;
    
    const result = await this.pool.query(query, [options.offset, options.limit]);
    
    console.log(`found ${result.rows.length} contacts`);
    
    return result.rows.map(row => new Contact(
      row.email,
      row.first_name,
      row.last_name,
      row.id
    ));
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
