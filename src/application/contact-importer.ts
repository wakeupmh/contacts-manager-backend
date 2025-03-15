import { Readable } from 'stream';
import csvParser from 'csv-parser';
import { Contact } from '../domain/entities/contact';
import { ContactService } from '../domain/services/contact-service';
import { ContactSchema } from '../domain/validation/contact-schema';
import { Transform } from 'stream';

interface ImportResults {
  success: boolean;
  error?: string;
  stats: {
    valid: number;
    invalid: number;
    total: number;
  };
}

interface ImportState {
  contacts: Contact[];
  validCount: number;
  invalidCount: number;
  totalCount: number;
  currentBatch: number;
  batchSize: number;
  failedBatches: number[];
  error?: string;
  startTime: number;
}

/**
 * Custom transform stream that batches contacts and processes them
 */
class BatchProcessor extends Transform {
  private buffer: Contact[] = [];
  private state: ImportState;
  private contactService: ContactService;
  
  constructor(state: ImportState, contactService: ContactService) {
    super({ objectMode: true, highWaterMark: 50 });
    this.state = state;
    this.contactService = contactService;
  }
  
  _transform(contact: Contact, encoding: string, callback: Function) {
    this.buffer.push(contact);
    this.state.validCount++;
    this.state.totalCount++;
    
    if (this.buffer.length >= this.state.batchSize) {
      this.processBatch()
        .then(() => callback())
        .catch(err => callback(err));
    } else {
      callback();
    }
  }
  
  _flush(callback: Function) {
    if (this.buffer.length > 0) {
      this.processBatch()
        .then(() => callback())
        .catch(err => callback(err));
    } else {
      callback();
    }
  }
  
  private async processBatch(): Promise<void> {
    try {
      const batch = [...this.buffer];
      this.buffer = [];
      
      this.state.currentBatch++;
      const batchNumber = this.state.currentBatch;
      
      if (batchNumber % 5 === 0) {
        const elapsedSeconds = (Date.now() - this.state.startTime) / 1000;
        const ratePerSecond = Math.round(this.state.totalCount / elapsedSeconds);
        console.log(`batch ${batchNumber}: saving ${batch.length} contacts (total: ${this.state.totalCount}, rate: ${ratePerSecond}/sec)`);
      }
      
      await this.contactService.saveContacts(batch);
      
      if (batchNumber % 20 === 0 && this.state.batchSize < 500) {
        this.state.batchSize = Math.min(500, Math.floor(this.state.batchSize * 1.1));
        console.log(`adjusted batch size to ${this.state.batchSize}`);
      }
    } catch (err) {
      console.error(`error in batch ${this.state.currentBatch}:`, err);
      this.state.failedBatches.push(this.state.currentBatch);
      
      if (this.state.batchSize > 50) {
        this.state.batchSize = Math.max(50, Math.floor(this.state.batchSize * 0.7));
        console.log(`reduced batch size to ${this.state.batchSize} due to error`);
      }
      
      if (err instanceof Error && 
          !err.message.includes('timeout') && 
          !err.message.includes('network')) {
        this.state.error = err.message;
      }
    }
  }
}

class ContactValidator extends Transform {
  private columns: { email?: string; firstName?: string; lastName?: string };
  private state: ImportState;
  
  constructor(columns: { email?: string; firstName?: string; lastName?: string }, state: ImportState) {
    super({ objectMode: true });
    this.columns = columns;
    this.state = state;
  }
  
  _transform(row: { [key: string]: string }, encoding: string, callback: Function) {
    try {
      const contact = this.validateAndCreateContact(row);
      callback(null, contact); 
    } catch (err) {
      this.state.invalidCount++;
      this.state.totalCount++;
      
      if (this.state.invalidCount % 100 === 0) {
        console.warn(`${this.state.invalidCount} validation errors out of ${this.state.totalCount} total rows`);
      }
      
      callback();
    }
  }
  
  private validateAndCreateContact(row: { [key: string]: string }): Contact {
    if (!this.columns.email || !this.columns.firstName) {
      throw new Error('Required columns not identified');
    }
    
    const input = {
      email: row[this.columns.email],
      firstName: row[this.columns.firstName],
      lastName: this.columns.lastName ? row[this.columns.lastName] : undefined
    };
    
    const validatedData = ContactSchema.parse(input);
    return Contact.fromInput(validatedData);
  }
}

export class ContactImporter {
  constructor(
    private readonly contactService: ContactService,
    private readonly initialBatchSize: number = 100
  ) {}

  async importFromCsv(fileStream: Readable): Promise<ImportResults> {
    console.log(`Starting CSV import process with initial batch size: ${this.initialBatchSize}`);
    
    const state: ImportState = {
      contacts: [],
      validCount: 0,
      invalidCount: 0,
      totalCount: 0,
      currentBatch: 0,
      batchSize: this.initialBatchSize,
      failedBatches: [],
      startTime: Date.now()
    };
    
    try {
      const columns = await this.identifyColumnsFromStream(fileStream);
      
      if (!columns.email || !columns.firstName) {
        throw new Error(`Missing required columns: ${!columns.email ? 'email' : ''} ${!columns.firstName ? 'first name' : ''}`);
      }
      
      const dataStream = fileStream.pipe(csvParser({ 
        strict: true, 
        skipLines: 1,
      }));
      
      const validator = new ContactValidator(columns, state);
      const batchProcessor = new BatchProcessor(state, this.contactService);
      
      await new Promise<void>((resolve, reject) => {
        dataStream
          .pipe(validator)
          .pipe(batchProcessor)
          .on('finish', () => {
            if (state.failedBatches.length > 0) {
              console.warn(`${state.failedBatches.length} batches failed during import`);
            }
            
            resolve();
          })
          .on('error', (err) => {
            console.error('stream processing error:', err);
            reject(err);
          });
      });
      
      return {
        success: !state.error,
        error: state.error,
        stats: {
          total: state.totalCount,
          valid: state.validCount,
          invalid: state.invalidCount
        }
      };
      
    } catch (err) {
      console.error('error during CSV import:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        stats: {
          total: state.totalCount,
          valid: state.validCount,
          invalid: state.invalidCount
        }
      };
    }
  }
  
  private async identifyColumnsFromStream(fileStream: Readable): Promise<{ email?: string; firstName?: string; lastName?: string }> {
    return new Promise((resolve, reject) => {
      const columns = {
        email: undefined as string | undefined,
        firstName: undefined as string | undefined,
        lastName: undefined as string | undefined
      };
      
      const headerParser = csvParser();
      
      headerParser.once('headers', (headers: string[]) => {
        try {
          columns.email = headers.find((header: string) => header.toLowerCase() === 'email');
          columns.firstName = headers.find((header: string) => 
            header.toLowerCase() === 'first_name' || 
            header.toLowerCase() === 'firstname' ||
            header.toLowerCase() === 'first name'
          );
          columns.lastName = headers.find((header: string) => 
            header.toLowerCase() === 'last_name' || 
            header.toLowerCase() === 'lastname' ||
            header.toLowerCase() === 'last name'
          );
          
          headerParser.destroy();
          resolve(columns);
        } catch (err) {
          reject(err);
        }
      });
      
      headerParser.once('error', (err) => {
        reject(err);
      });
      
      fileStream.pipe(headerParser);
    });
  }
}
