import express, { Express, RequestHandler } from 'express';
import { setupRoutes } from './routes';
import { ContactController } from '../../presentation/controllers/contact-controller';
import { securityMiddleware } from './security-middleware';
import cors from 'cors';

export const createServer = (contactController: ContactController): Express => {
  console.log(`creating server`);
  
  const app = express();
  
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  
  app.use(securityMiddleware.addSecurityHeaders as RequestHandler);
  app.use(securityMiddleware.sanitizeQueryParams as RequestHandler);
  app.use(securityMiddleware.validateContentType as RequestHandler);
  app.use(cors());
  
  app.use((req, res, next) => {
    res.setTimeout(10 * 60 * 1000, () => {
      console.log('Request has timed out.');
      res.status(408).send('Request Timeout');
    });
    next();
  });
  
  console.log(`configuring middleware`);
  
  const router = express.Router();
  setupRoutes(router, contactController);
  
  app.use(router);
  
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(`Global error handler caught: ${err.message}`);
    res.status(500).json({ 
      error: 'An unexpected error occurred',
      message: process.env.NODE_ENV === 'production' ? undefined : err.message
    });
  });
  
  console.log(`server creation complete`);
  return app;
};
