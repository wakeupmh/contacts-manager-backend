import { Readable } from 'stream';
import csvParser from 'csv-parser';
import { Contact } from '../domain/entities/contact';
import { ContactService } from '../domain/services/contact-service';
import { ContactSchema } from '../domain/validation/contact-schema';
import { z } from 'zod';

export class ContactImporter {
  constructor(private readonly contactService: ContactService) {}

  async importFromCsv(fileStream: Readable): Promise<{ 
    success: boolean; 
    error?: string; 
    stats?: { 
      valid: number; 
      invalid: number; 
      total: number;
    }
  }> {
    console.log(`starting csv import process`);
    return new Promise((resolve) => {
      let emailColumn: string | undefined;
      let firstNameColumn: string | undefined;
      let lastNameColumn: string | undefined;
      const contacts: Contact[] = [];
      let headersChecked = false;
      let error: string | undefined;
      let invalidCount = 0;
      let totalCount = 0;

      console.log(`setting up csv parser`);
      fileStream
        .pipe(csvParser())
        .on('headers', (headers: string[]) => {
          console.log(`csv headers received: ${headers.join(', ')}`);
          emailColumn = headers.find((h: string) => h.toLowerCase().includes('email'));
          firstNameColumn = headers.find((h: string) => h.toLowerCase().includes('first'));
          lastNameColumn = headers.find((h: string) => h.toLowerCase().includes('last'));

          console.log(`identified columns - email: ${emailColumn}, first name: ${firstNameColumn}, last name: ${lastNameColumn}`);

          if (!emailColumn || !firstNameColumn) {
            error = 'CSV must contain email and first name columns';
            console.log(`missing required columns: ${!emailColumn ? 'email' : ''} ${!firstNameColumn ? 'first name' : ''}`);
            fileStream.resume();
            return;
          }
          headersChecked = true;
        })
        .on('data', (row: { [key: string]: string }) => {
          if (!headersChecked || !emailColumn || !firstNameColumn) return;
          
          totalCount++;
          console.log(`processing row ${totalCount}: ${JSON.stringify(row)}`);

          try {
            const validatedData = ContactSchema.parse({
              email: row[emailColumn],
              firstName: row[firstNameColumn],
              lastName: lastNameColumn ? row[lastNameColumn] : null
            });

            console.log(`row ${totalCount} validated successfully`);
            const contact = Contact.fromInput(validatedData);
            contacts.push(contact);
          } catch (err) {
            invalidCount++;
            
            if (err instanceof z.ZodError) {
              const errorMessages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
              console.log(`validation error in row ${totalCount}: ${errorMessages}`);
            } else {
              console.log(`unknown error in row ${totalCount}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        })
        .on('end', async () => {
          console.log(`csv parsing complete. total: ${totalCount}, valid: ${contacts.length}, invalid: ${invalidCount}`);
          
          if (error) {
            console.log(`import failed due to error: ${error}`);
            resolve({ success: false, error });
            return;
          }

          if (contacts.length === 0) {
            console.log(`import failed: no valid contacts found`);
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

          try {
            console.log(`saving ${contacts.length} contacts to database`);
            await this.contactService.saveContacts(contacts);
            console.log(`contacts saved successfully`);
            resolve({ 
              success: true, 
              stats: {
                valid: contacts.length,
                invalid: invalidCount,
                total: totalCount
              }
            });
          } catch (err) {
            console.log(`error saving contacts: ${err instanceof Error ? err.message : String(err)}`);
            resolve({ 
              success: false, 
              error: err instanceof Error ? err.message : 'Unknown error during import',
              stats: {
                valid: contacts.length,
                invalid: invalidCount,
                total: totalCount
              }
            });
          }
        })
        .on('error', (err: unknown) => {
          console.log(`csv parsing error: ${err instanceof Error ? err.message : String(err)}`);
          resolve({ 
            success: false, 
            error: err instanceof Error ? err.message : String(err)
          });
        });
    });
  }
}
