import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export interface ValidatedRequest<T> extends Request {
  validatedData?: T;
}

export const validateRequest = <T>(schema: z.ZodType<T>) => {
  return (req: ValidatedRequest<T>, res: Response, next: NextFunction) => {
    try {
      console.log(`validating request at ${new Date().toISOString()}`);
      const data = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      
      req.validatedData = data;
      console.log(`request validation successful`);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map(err => 
          `${err.path.join('.')}: ${err.message}`
        ).join(', ');
        
        console.log(`validation error: ${errorMessages}`);
        res.status(400).json({ error: `Validation error: ${errorMessages}` });
      } else {
        console.log(`unexpected validation error: ${error instanceof Error ? error.message : String(error)}`);
        res.status(500).json({ 
          error: error instanceof Error ? error.message : 'Unknown validation error' 
        });
      }
    }
  };
};

export const validateFileUpload = (fieldName: string, allowedMimeTypes: string[] = []) => {
  return (req: Request, res: Response, next: NextFunction) => {
    console.log(`validating file upload request for field: ${fieldName}`);
    
    if (!req.headers['content-type']?.includes('multipart/form-data')) {
      console.log(`invalid content-type: ${req.headers['content-type']}`);
      res.status(400).json({ error: 'Request must be multipart/form-data' });
      return;
    }
    
    console.log(`file upload validation successful`);
    next();
  };
};
