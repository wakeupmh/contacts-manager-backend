import { Readable } from 'stream';
import csvParser from 'csv-parser';
import { Contact } from '../domain/entities/contact';
import { ContactService } from '../domain/services/contact-service';
import { ContactSchema } from '../domain/validation/contact-schema';
import { z } from 'zod';

export class ContactImporter {
  constructor(
    private readonly contactService: ContactService,
    private readonly batchSize: number = 1000
  ) {}

  async importFromCsv(fileStream: Readable): Promise<{ 
    success: boolean; 
    error?: string; 
    stats?: { 
      valid: number; 
      invalid: number; 
      total: number;
    }
  }> {
    console.log(`starting csv import process with batch size: ${this.batchSize}`);
    return new Promise((resolve) => {
      let emailColumn: string | undefined;
      let firstNameColumn: string | undefined;
      let lastNameColumn: string | undefined;
      let contacts: Contact[] = [];
      let headersChecked = false;
      let error: string | undefined;
      let invalidCount = 0;
      let validCount = 0;
      let totalCount = 0;
      let currentBatch = 0;

      fileStream
        .pipe(csvParser())
        .on('headers', (headers: string[]) => {
          emailColumn = headers.find((header: string) => header.toLowerCase() === 'email');
          firstNameColumn = headers.find((header: string) => header.toLowerCase() === 'first_name');
          lastNameColumn = headers.find((header: string) => header.toLowerCase() === 'last_name');

          console.log(`identified columns - email: ${emailColumn}, first name: ${firstNameColumn}, last name: ${lastNameColumn}`);

          if (!emailColumn || !firstNameColumn) {
            error = 'CSV must contain email and first name columns';
            console.error(`missing required columns: ${!emailColumn ? 'email' : ''} ${!firstNameColumn ? 'first name' : ''}`);
            fileStream.resume();
            return;
          }
          headersChecked = true;
        })
        .on('data', async (row: { [key: string]: string }) => {
          if (!headersChecked || !emailColumn || !firstNameColumn) return;
          
          totalCount++;
          
          if (totalCount % this.batchSize === 0) {
            console.log(`processing row ${totalCount}`);
          }

          try {
            const validatedData = ContactSchema.parse({
              email: row[emailColumn],
              firstName: row[firstNameColumn],
              lastName: lastNameColumn ? row[lastNameColumn] : null
            });
            console.log(`validated row ${totalCount}`, validatedData);

            const contact = Contact.fromInput(validatedData);
            contacts.push(contact);
            validCount++;
            
            if (contacts.length >= this.batchSize) {
              fileStream.pause();
              
              try {
                currentBatch++;
                console.log(`saving batch ${currentBatch} with ${contacts.length} contacts (processed ${totalCount} rows so far)`);
                await this.contactService.saveContacts(contacts);
                console.log(`batch ${currentBatch} saved successfully`);
              } catch (err) {
                console.error(`error saving batch ${currentBatch}: ${err instanceof Error ? err.message : String(err)}`);
                error = err instanceof Error ? err.message : 'Unknown error during import';
              }
              
              contacts = [];
              
              fileStream.resume();
            }
          } catch (err) {
            invalidCount++;
            
            if (err instanceof z.ZodError) {
              const errorMessages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
              console.error(`Validation error in row ${totalCount} with data: ${JSON.stringify(row)}`);
              console.error(`Error details: ${errorMessages}`);
            } else {
              console.error(`Error in row ${totalCount} with data: ${JSON.stringify(row)}`);
              console.error(`Error details: ${err instanceof Error ? err.message : String(err)}`);
            }
            
            if (invalidCount % this.batchSize === 0) {
              if (err instanceof z.ZodError) {
                const errorMessages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
                console.error(`${invalidCount} validation errors so far. Last error in row ${totalCount}: ${errorMessages}`);
              } else {
                console.error(`${invalidCount} errors so far. Last error in row ${totalCount}: ${err instanceof Error ? err.message : String(err)}`);
              }
            }
          }
        })
        .on('end', async () => {
          console.log(`csv parsing complete => total: ${totalCount}, valid: ${validCount}, invalid: ${invalidCount}`);
          
          if (error) {
            console.log(`import failed due to error: ${error}`);
            resolve({ 
              success: false, 
              error,
              stats: {
                valid: validCount,
                invalid: invalidCount,
                total: totalCount
              }
            });
            return;
          }

          if (contacts.length > 0) {
            try {
              currentBatch++;
              console.log(`saving final batch ${currentBatch} with ${contacts.length} contacts`);
              await this.contactService.saveContacts(contacts);
              console.log(`final batch saved successfully`);
            } catch (err) {
              console.log(`error saving final batch: ${err instanceof Error ? err.message : String(err)}`);
              error = err instanceof Error ? err.message : 'Unknown error during import';
              resolve({ 
                success: false, 
                error,
                stats: {
                  valid: validCount,
                  invalid: invalidCount,
                  total: totalCount
                }
              });
              return;
            }
          }

          if (validCount === 0) {
            console.error(`import failed: no valid contacts found`);
            resolve({ 
              success: false, 
              error: 'No valid contacts found in CSV',
              stats: {
                valid: 0,
                invalid: invalidCount,
                total: totalCount
              }
            });
            return;
          }

          console.log(`import completed successfully`);
          resolve({ 
            success: true, 
            stats: {
              valid: validCount,
              invalid: invalidCount,
              total: totalCount
            }
          });
        })
        .on('error', (err: unknown) => {
          console.log(`csv parsing error: ${err instanceof Error ? err.message : String(err)}`);
          resolve({ 
            success: false, 
            error: err instanceof Error ? err.message : String(err),
            stats: {
              valid: validCount,
              invalid: invalidCount,
              total: totalCount
            }
          });
        });
    });
  }
}
