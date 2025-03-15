import { Readable } from 'stream';
import csvParser from 'csv-parser';
import { Contact } from '../domain/entities/contact';
import { ContactService } from '../domain/services/contact-service';
import { ContactSchema } from '../domain/validation/contact-schema';
import { z } from 'zod';

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
}

export class ContactImporter {
  constructor(
    private readonly contactService: ContactService,
    private readonly batchSize: number = 500
  ) {}

  async importFromCsv(fileStream: Readable): Promise<ImportResults> {
    console.log(`Starting CSV import process with batch size: ${this.batchSize}`);
    
    return new Promise((resolve) => {
      const state: ImportState = {
        contacts: [],
        validCount: 0,
        invalidCount: 0,
        totalCount: 0,
        currentBatch: 0,
        batchSize: this.batchSize,
        failedBatches: []
      };
      
      const columns = {
        email: undefined as string | undefined,
        firstName: undefined as string | undefined,
        lastName: undefined as string | undefined
      };
      
      let headersChecked = false;
      
      fileStream
        .pipe(csvParser())
        .on('headers', (headers: string[]) => {
          this.identifyColumns(headers, columns);
          
          if (!columns.email || !columns.firstName) {
            state.error = 'CSV must contain email and first name columns';
            console.error(`Missing required columns: ${!columns.email ? 'email' : ''} ${!columns.firstName ? 'first name' : ''}`);
            fileStream.resume();
            return;
          }
          
          headersChecked = true;
        })
        .on('data', async (row: { [key: string]: string }) => {
          if (!headersChecked || !columns.email || !columns.firstName) return;
          
          state.totalCount++;
          
          this.logProgress(state.totalCount, state.batchSize);
          
          try {
            const contact = this.validateAndCreateContact(row, columns);
            state.contacts.push(contact);
            state.validCount++;
            
            if (state.contacts.length >= state.batchSize) {
              fileStream.pause();
              await this.processBatch(state, fileStream);
            }
          } catch (err) {
            this.handleValidationError(err, row, state);
          }
        })
        .on('end', async () => {
          await this.finishImport(state, resolve);
        })
        .on('error', (err: unknown) => {
          this.handleCsvParsingError(err, state, resolve);
        });
    });
  }
  
  private identifyColumns(headers: string[], columns: { email?: string; firstName?: string; lastName?: string }): void {
    columns.email = headers.find((header: string) => header.toLowerCase() === 'email');
    columns.firstName = headers.find((header: string) => header.toLowerCase() === 'first_name');
    columns.lastName = headers.find((header: string) => header.toLowerCase() === 'last_name');
    
    console.log(`identifying columns - email: ${columns.email}, first name: ${columns.firstName}, last name: ${columns.lastName}`);
  }
  
  private logProgress(totalCount: number, batchSize: number): void {
    if (totalCount % (batchSize * 5) === 0) {
      console.log(`processing progress: ${totalCount} rows processed so far`);
    }
  }
  
  private validateAndCreateContact(
    row: { [key: string]: string }, 
    columns: { email?: string; firstName?: string; lastName?: string }
  ): Contact {
    if (!columns.email || !columns.firstName) {
      throw new Error('Required columns missing');
    }
    
    const validatedData = ContactSchema.parse({
      email: row[columns.email],
      firstName: row[columns.firstName],
      lastName: columns.lastName ? row[columns.lastName] : null
    });
    
    return Contact.fromInput(validatedData);
  }
  
  private async processBatch(state: ImportState, fileStream: Readable): Promise<void> {
    try {
      state.currentBatch++;
      console.log(`Saving batch ${state.currentBatch} with ${state.contacts.length} contacts (processed ${state.totalCount} rows so far)`);
      
      const startTime = Date.now();
      await this.contactService.saveContacts(state.contacts);
      const duration = Date.now() - startTime;
      
      console.log(`batch ${state.currentBatch} saved successfully in ${duration}ms`);
    } catch (err) {
      console.error(`Error saving batch ${state.currentBatch}: ${err instanceof Error ? err.message : String(err)}`);
      
      if (err instanceof Error && err.message.includes('timeout')) {
        state.failedBatches.push(state.currentBatch);
        
        state.batchSize = Math.max(100, Math.floor(state.batchSize / 2));
        console.log(`reduced batch size to ${state.batchSize} due to timeout`);
      } else {
        state.error = err instanceof Error ? err.message : 'Unknown error during import';
      }
    } finally {
      state.contacts = [];
      fileStream.resume();
    }
  }
  
  private handleValidationError(err: unknown, row: { [key: string]: string }, state: ImportState): void {
    state.invalidCount++;
    
    if (err instanceof z.ZodError) {
      const errorMessages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      
      if (state.invalidCount <= 10 || state.invalidCount % 1000 === 0) {
        console.error(`validation error in row ${state.totalCount}: ${errorMessages}`);
        console.error(`data: ${JSON.stringify(row)}`);
      }
    } else {
      if (state.invalidCount <= 10 || state.invalidCount % 1000 === 0) {
        console.error(`error in row ${state.totalCount}: ${err instanceof Error ? err.message : String(err)}`);
        console.error(`data: ${JSON.stringify(row)}`);
      }
    }
    
    if (state.invalidCount % state.batchSize === 0) {
      console.error(`${state.invalidCount} validation errors so far out of ${state.totalCount} total rows`);
    }
  }
  
  private async finishImport(state: ImportState, resolve: (result: ImportResults) => void): Promise<void> {
    console.log(`CSV parsing complete => total: ${state.totalCount}, valid: ${state.validCount}, invalid: ${state.invalidCount}`);
    
    if (state.failedBatches.length > 0 && !state.error) {
      console.log(`found ${state.failedBatches.length} failed batches due to timeouts`);
      console.log(`batches ${state.failedBatches.join(', ')} failed and may need manual processing`);
    }
    
    if (state.error) {
      this.resolveWithError(state, resolve);
      return;
    }
    
    if (state.contacts.length > 0) {
      await this.saveRemainingContacts(state, resolve);
      return;
    }
    
    if (state.validCount === 0) {
      this.resolveWithNoValidContacts(state, resolve);
      return;
    }
    
    console.log(`import completed successfully`);
    resolve({ 
      success: true, 
      stats: {
        valid: state.validCount,
        invalid: state.invalidCount,
        total: state.totalCount
      }
    });
  }
  
  private resolveWithError(state: ImportState, resolve: (result: ImportResults) => void): void {
    console.log(`import failed due to error: ${state.error}`);
    resolve({ 
      success: false, 
      error: state.error,
      stats: {
        valid: state.validCount,
        invalid: state.invalidCount,
        total: state.totalCount
      }
    });
  }
  
  private async saveRemainingContacts(state: ImportState, resolve: (result: ImportResults) => void): Promise<void> {
    try {
      state.currentBatch++;
      console.log(`saving final batch ${state.currentBatch} with ${state.contacts.length} contacts`);
      await this.contactService.saveContacts(state.contacts);
      console.log(`final batch saved successfully`);
      
      console.log(`import completed successfully`);
      resolve({ 
        success: true, 
        stats: {
          valid: state.validCount,
          invalid: state.invalidCount,
          total: state.totalCount
        }
      });
    } catch (err) {
      console.log(`error saving final batch: ${err instanceof Error ? err.message : String(err)}`);
      state.error = err instanceof Error ? err.message : 'Unknown error during import';
      
      this.resolveWithError(state, resolve);
    }
  }
  
  private resolveWithNoValidContacts(state: ImportState, resolve: (result: ImportResults) => void): void {
    console.error(`import failed: no valid contacts found`);
    resolve({ 
      success: false, 
      error: 'No valid contacts found in CSV',
      stats: {
        valid: 0,
        invalid: state.invalidCount,
        total: state.totalCount
      }
    });
  }
  
  private handleCsvParsingError(err: unknown, state: ImportState, resolve: (result: ImportResults) => void): void {
    console.log(`CSV parsing error: ${err instanceof Error ? err.message : String(err)}`);
    resolve({ 
      success: false, 
      error: err instanceof Error ? err.message : String(err),
      stats: {
        valid: state.validCount,
        invalid: state.invalidCount,
        total: state.totalCount
      }
    });
  }
}
