import { z } from 'zod';

// regular expressions for additional security validation - modified to be less strict
const SQL_INJECTION_PATTERN = /('|"|;|--|\/\*|\*\/|@@|exec|execute|insert|update|delete|drop|alter)/i;

export const ContactSchema = z.object({
  email: z.string()
    .email()
    .transform(val => val.toLowerCase().trim())
    .refine(val => !SQL_INJECTION_PATTERN.test(val), {
      message: 'Email contains potentially unsafe characters'
    }),
  firstName: z.string()
    .min(1, 'First name is required')
    .transform(val => val.trim())
    .refine(val => !SQL_INJECTION_PATTERN.test(val), {
      message: 'First name contains potentially unsafe characters'
    }),
  lastName: z.string()
    .max(255, 'Last name must be less than 255 characters')
    .nullable()
    .optional()
    .transform(val => val ? val.trim() : val)
    .refine(val => val === null || val === undefined || !SQL_INJECTION_PATTERN.test(val), {
      message: 'Last name contains potentially unsafe characters'
    })
});

export type ContactInput = z.infer<typeof ContactSchema>;
