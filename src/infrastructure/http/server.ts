import express, { Express } from 'express';
import { setupRoutes } from './routes';
import { ContactController } from '../../presentation/controllers/contact-controller';

export const createServer = (contactController: ContactController): Express => {
  console.log(`creating server`);
  
  const app = express();
  app.use(express.json());
  
  console.log(`configuring middleware`);
  
  const router = express.Router();
  setupRoutes(router, contactController);
  
  app.use(router);
  
  console.log(`server creation complete`);
  return app;
};
