import { createDatabasePool } from './infrastructure/database/config';
import { PostgresContactRepository } from './infrastructure/database/postgres-contact-repository';
import { ContactService } from './domain/services/contact-service';
import { ContactImporter } from './application/contact-importer';
import { ContactController } from './presentation/controllers/contact-controller';
import { createServer } from './infrastructure/http/server';
import { SelfPingService } from './infrastructure/utils/self-ping';

console.log(`starting application at ${new Date().toISOString()}`);

console.log(`setting up dependencies`);
const pool = createDatabasePool();
const contactRepository = new PostgresContactRepository(pool);
const contactService = new ContactService(contactRepository);
const contactImporter = new ContactImporter(contactService);
const contactController = new ContactController(contactService, contactImporter);

console.log(`creating server`);
const app = createServer(contactController);
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`server running on port ${PORT}`);
  
  const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
  const pingIntervalMinutes = process.env.PING_INTERVAL_MINUTES ? parseInt(process.env.PING_INTERVAL_MINUTES, 10) : 5;
  
  const selfPingService = new SelfPingService(appUrl, pingIntervalMinutes);
  selfPingService.start();
});
