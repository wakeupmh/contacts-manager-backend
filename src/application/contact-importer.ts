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
    totalProcessed: number;
    validContacts: number;
    invalidContacts: number;
    processingTimeMs: number;
  };
}

interface ImportState {
  validCount: number;
  invalidCount: number;
  totalCount: number;
  currentBatch: number;
  batchSize: number;
  failedBatches: number[];
  error?: string;
  startTime: number;
}

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
  private state: ImportState;
  
  constructor(state: ImportState) {
    super({ objectMode: true, highWaterMark: 50 });
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
    if (this.state.totalCount <= 5) {
      console.log('row data:', JSON.stringify(row));
    }
    
    const input = {
      email: row['email'],
      firstName: row['first_name'],
      lastName: row['last_name']
    };
    
    if (this.state.totalCount <= 5) {
      console.log('Input for validation:', JSON.stringify(input));
    }
    
    try {
      const validatedData = ContactSchema.parse(input);
      return Contact.fromInput(validatedData);
    } catch (err) {
      if (this.state.invalidCount <= 10) {
        console.error('validation error details:', err);
        console.error('failed row:', JSON.stringify(row));
        console.error('attempted to validate:', JSON.stringify(input));
      }
      throw err;
    }
  }
}

export class ContactImporter {
  constructor(
    private readonly contactService: ContactService,
  ) {}

  async import(fileStream: Readable): Promise<ImportResults> {
    const state: ImportState = {
      validCount: 0,
      invalidCount: 0,
      totalCount: 0,
      currentBatch: 0,
      batchSize: 100,
      failedBatches: [],
      startTime: Date.now()
    };
    
    try {
      await this.identifyColumnsFromStream(fileStream);
      
      const dataStream = fileStream.pipe(csvParser({ 
        strict: true, 
        skipLines: 1,
        mapValues: ({ header, value }) => {
          return value ? value.trim() : value;
        }
      }));
      
      const validator = new ContactValidator(state);
      const batchProcessor = new BatchProcessor(state, this.contactService);
      
      await new Promise<void>((resolve, reject) => {
        dataStream
          .pipe(validator)
          .pipe(batchProcessor)
          .on('finish', () => {
            console.log(`Total: ${state.totalCount}, Valid: ${state.validCount}, Invalid: ${state.invalidCount}`);
            
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
        success: true,
        stats: {
          totalProcessed: state.totalCount,
          validContacts: state.validCount,
          invalidContacts: state.invalidCount,
          processingTimeMs: Date.now() - state.startTime
        }
      };
      
    } catch (err) {
      console.error('error during CSV import:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        stats: {
          totalProcessed: state.totalCount,
          validContacts: state.validCount,
          invalidContacts: state.invalidCount,
          processingTimeMs: Date.now() - state.startTime
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
          console.log('CSV Headers detected:', headers);
          
          columns.email = 'email';
          columns.firstName = 'first_name';
          columns.lastName = 'last_name';
          
          console.log('identified columns:', columns);
          
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
