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
    
    const bb = busboy({
      headers: req.headers,
      limits: {
        fileSize: 1024 * 1024 * 500, // 500MB limit
        files: 1 // limit to only one file
      }
    });
    
    req.on('error', (err: unknown) => {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`Request error during upload: ${errorMessage}`);
      res.status(500).json({ error: 'Upload interrupted', message: errorMessage });
    });
    
    bb.on('error', (err: unknown) => {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`Busboy error during upload: ${errorMessage}`);
      res.status(500).json({ error: 'Error processing upload', message: errorMessage });
    });
    
    let uploadStartTime: number;
    
    bb.on('filesLimit', () => {
      console.log(`File limit reached`);
      res.status(400).json({ error: 'Too many files, please upload only one CSV file' });
    });
    
    bb.on('file', async (name, file, info) => {
      uploadStartTime = Date.now();
      console.log(`received file with name: ${name}, filename: ${info.filename}, encoding: ${info.encoding}, mimeType: ${info.mimeType}`);
      
      if (!info.mimeType.includes('csv') && !info.mimeType.includes('text/plain')) {
        console.log(`invalid mime type: ${info.mimeType}`);
        res.status(400).json({ error: 'The uploaded file must be a CSV file' });
        return;
      }

      console.log(`importing contacts from csv`);
      
      const processingTimeout = setTimeout(() => {
        console.log('Still processing file, taking longer than expected');
        res.write(JSON.stringify({ 
          status: 'processing',
          message: 'Your file is being processed. This may take several minutes for large files.'
        }) + '\n');
      }, 10000);
      
      try {
        const result = await this.contactImporter.import(file);
        clearTimeout(processingTimeout);
        
        if (!result.success) {
          console.log(`import failed: ${result.error}`);
          res.status(400).json({ 
            error: result.error,
            stats: result.stats
          });
          return;
        }
        
        const processingTime = ((Date.now() - uploadStartTime) / 1000).toFixed(2);
        console.log(`import successful: ${JSON.stringify(result.stats)}, processing time: ${processingTime}s`);
        res.status(200).json({ 
          message: 'Contacts imported successfully',
          stats: result.stats,
          processing_time: `${processingTime} seconds`
        });
      } catch (error) {
        clearTimeout(processingTimeout);
        console.error(`Uncaught error during import: ${error instanceof Error ? error.message : String(error)}`);
        res.status(500).json({ 
          error: 'Failed to process CSV file',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });
    
    bb.on('fieldsLimit', () => {
      console.log('Fields limit reached');
      res.status(400).json({ error: 'Too many fields in form' });
    });
    
    bb.on('partsLimit', () => {
      console.log('Parts limit reached');
      res.status(400).json({ error: 'Too many parts in multipart form' });
    });
    
    req.pipe(bb);
  }
}
