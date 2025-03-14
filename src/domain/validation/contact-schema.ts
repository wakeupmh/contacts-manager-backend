import { z } from 'zod';

export const ContactSchema = z.object({
  email: z.string()
    .email()
    .transform(val => {
      console.log(`validating email: ${val}`);
      return val.toLowerCase().trim();
    }),
  firstName: z.string()
    .min(1, 'First name is required')
    .transform(val => {
      console.log(`validating first name: ${val}`);
      return val.trim();
    }),
  lastName: z.string()
    .max(255, 'Last name must be less than 255 characters')
    .nullable()
    .optional()
    .transform(val => {
      console.log(`validating last name: ${val || 'null'}`);
      return val ? val.trim() : null;
    })
});

export type ContactInput = z.infer<typeof ContactSchema>;
