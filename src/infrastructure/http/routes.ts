import { Router } from 'express';
import { ContactController } from '../../presentation/controllers/contact-controller';
import { validateContactsCsvUpload } from './middleware/contact-validation-middleware';

export const setupRoutes = (router: Router, contactController: ContactController): Router => {
  console.log(`setting up routes`);
  
  /**
   * @swagger
   * /contacts:
   *   get:
   *     summary: Get all contacts
   *     description: Retrieves a list of all contacts
   *     tags:
   *       - Contacts
   *     responses:
   *       200:
   *         description: A list of contacts
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *                 properties:
   *                   id:
   *                     type: string
   *                   name:
   *                     type: string
   *                   email:
   *                     type: string
   *                   phone:
   *                     type: string
   *       500:
   *         description: Server error
   */
  router.get('/contacts', (req, res) => {
    console.log(`received request for contacts`);
    contactController.getContacts(req, res);
  });
  
  /**
   * @swagger
   * /upload:
   *   post:
   *     summary: Upload contacts CSV
   *     description: Upload a CSV file containing contact information
   *     tags:
   *       - Contacts
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *                 description: CSV file with contact data
   *     responses:
   *       200:
   *         description: Contacts successfully uploaded
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                 count:
   *                   type: number
   *       400:
   *         description: Invalid file format or data
   *       500:
   *         description: Server error
   */
  router.post('/upload', 
    validateContactsCsvUpload,
    (req, res) => {
      console.log(`received csv upload request`);
      contactController.uploadContacts(req, res);
    }
  );
  
  /**
   * @swagger
   * /health:
   *   get:
   *     summary: Health check endpoint
   *     description: Returns the current status of the API
   *     tags:
   *       - System
   *     responses:
   *       200:
   *         description: API is healthy
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: ok
   *                 timestamp:
   *                   type: string
   *                   format: date-time
   */
  router.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  
  console.log(`routes setup complete`);
  return router;
};
