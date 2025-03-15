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

    const SUPABASE_BATCH_SIZE = 500; 
    const MAX_RETRIES = 5;
    const RETRY_DELAY_MS = 3000;
    
    for (let startIdx = 0; startIdx < contacts.length; startIdx += SUPABASE_BATCH_SIZE) {
      const batchContacts = contacts.slice(startIdx, startIdx + SUPABASE_BATCH_SIZE);
      const batchNumber = Math.floor(startIdx / SUPABASE_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(contacts.length / SUPABASE_BATCH_SIZE);
      
      console.log(`processing batch ${batchNumber}/${totalBatches} with ${batchContacts.length} contacts`);
      
      let retryCount = 0;
      let success = false;
      
      while (!success && retryCount <= MAX_RETRIES) {
        try {
          if (retryCount > 0) {
            console.log(`retrying attempt ${retryCount}/${MAX_RETRIES} for batch ${batchNumber}`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, retryCount - 1)));
          }
          
          await this.saveBatch(batchContacts);
          success = true;
          console.log(`batch ${batchNumber}/${totalBatches} completed successfully`);
          
        } catch (error) {
          retryCount++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`error in batch ${batchNumber}, attempt ${retryCount}: ${errorMessage}`);
          
          if (retryCount > MAX_RETRIES) {
            console.error(`max retries exceeded for batch ${batchNumber}, giving up`);
            throw error;
          }
        }
      }
    }
    
    console.log(`all ${contacts.length} contacts saved successfully`);
  }
  
  private async saveBatch(contacts: Contact[]): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      console.log(`Beginning transaction for batch of ${contacts.length} contacts`);
      await client.query('BEGIN');
      
      const placeholders = contacts.map((_, idx) => {
        const offset = idx * 3; // 3 parameters per contact
        return `($${offset + 1}, $${offset + 2}, $${offset + 3})`;
      }).join(', ');
      
      const values = contacts.flatMap(contact => [
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
      
      console.log(`Executing batch insert with ${contacts.length} contacts`);
      await client.query(query, values);
      
      console.log(`Committing transaction`);
      await client.query('COMMIT');
      
    } catch (error) {
      console.log(`Error in transaction, rolling back: ${error instanceof Error ? error.message : String(error)}`);
      await client.query('ROLLBACK');
      throw error;
    } finally {
      console.log(`Releasing client`);
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
