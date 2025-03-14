import { Router } from 'express';
import { ContactController } from '../../presentation/controllers/contact-controller';
import { validateContactsCsvUpload } from './middleware/contact-validation-middleware';

export const setupRoutes = (router: Router, contactController: ContactController): Router => {
  console.log(`setting up routes`);
  
  router.get('/contacts', (req, res) => {
    console.log(`received request for contacts`);
    contactController.getContacts(req, res);
  });
  
  router.post('/upload', 
    validateContactsCsvUpload,
    (req, res) => {
      console.log(`received csv upload request`);
      contactController.uploadContacts(req, res);
    }
  );
  
  router.get('/health', (req, res) => {
    console.log(`health check request received`);
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  
  console.log(`routes setup complete`);
  return router;
};
