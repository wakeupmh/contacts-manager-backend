import { Request, Response } from 'express';
import busboy from 'busboy';
import { ContactService } from '../../domain/services/contact-service';
import { ContactImporter } from '../../application/contact-importer';

export class ContactController {
  constructor(
    private readonly contactService: ContactService,
    private readonly contactImporter: ContactImporter
  ) {}

  async getContacts(req: Request, res: Response): Promise<void> {
    try {
      console.log(`fetching contacts`);
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      
      if (isNaN(page) || isNaN(limit) || page < 1 || limit < 1) {
        console.log(`invalid pagination parameters: page=${req.query.page}, limit=${req.query.limit}`);
        res.status(400).json({ error: 'Invalid pagination parameters' });
        return;
      }

      console.log(`retrieving contacts with page=${page}, limit=${limit}`);
      const contacts = await this.contactService.getContacts(page, limit);
      console.log(`found ${contacts.length} contacts`);
      res.json(contacts);
    } catch (error) {
      console.log(`error fetching contacts: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Error fetching contacts' });
    }
  }

  uploadContacts(req: Request, res: Response): void {
    console.log(`processing contact upload`);
    const bb = busboy({ headers: req.headers });

    bb.on('file', async (name, file, info) => {
      console.log(`received file with name: ${name}, filename: ${info.filename}, encoding: ${info.encoding}, mimeType: ${info.mimeType}`);
      
      if (name !== 'csv') {
        console.log(`invalid file field name: ${name}, expected: csv`);
        res.status(400).json({ error: 'Upload a CSV file with name "csv"' });
        return;
      }

      console.log(`importing contacts from csv`);
      const result = await this.contactImporter.importFromCsv(file);
      
      if (!result.success) {
        console.log(`import failed: ${result.error}`);
        res.status(400).json({ 
          error: result.error,
          stats: result.stats
        });
        return;
      }

      console.log(`import successful, stats: ${JSON.stringify(result.stats)}`);
      res.status(200).json({ 
        message: 'Contacts imported successfully',
        stats: result.stats
      });
    });

    bb.on('error', (err) => {
      console.log(`error processing upload: ${err instanceof Error ? err.message : String(err)}`);
      res.status(500).json({ error: 'Error processing upload' });
    });

    req.pipe(bb);
  }
}
