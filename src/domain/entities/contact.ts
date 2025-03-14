import { z } from 'zod';
import { ContactSchema } from '../validation/contact-schema';

export class Contact {
  constructor(
    public readonly email: string,
    public readonly firstName: string,
    public readonly lastName: string | null = null,
    public readonly id?: number
  ) {}

  toJSON() {
    return {
      id: this.id,
      email: this.email,
      first_name: this.firstName,
      last_name: this.lastName
    };
  }

  static fromInput(data: z.infer<typeof ContactSchema>): Contact {
    console.log(`creating contact entity from validated data: ${JSON.stringify(data)}`);
    return new Contact(
      data.email,
      data.firstName,
      data.lastName
    );
  }
}
