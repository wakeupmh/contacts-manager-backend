import { Contact } from '../entities/contact';
import { ContactRepository } from '../interfaces/contact-repository';

export class ContactService {
  constructor(private readonly contactRepository: ContactRepository) {}

  async getContacts(page: number = 1, limit: number = 20): Promise<Contact[]> {
    console.log(`getting contacts with pagination: page=${page}, limit=${limit}`);
    const offset = (page - 1) * limit;
    return this.contactRepository.findAll({ limit, offset });
  }

  async saveContacts(contacts: Contact[]): Promise<void> {
    console.log(`saving ${contacts.length} contacts to repository`);
    await this.contactRepository.saveMany(contacts);
    console.log(`contacts saved successfully`);
  }
}
