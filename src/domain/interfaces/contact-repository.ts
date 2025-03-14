import { Contact } from "../entities/contact";

export interface ContactRepository {
  save(contact: Contact): Promise<void>;
  saveMany(contacts: Contact[]): Promise<void>;
  findAll(options: { limit: number; offset: number }): Promise<Contact[]>;
  findByEmail(email: string): Promise<Contact | null>;
}
