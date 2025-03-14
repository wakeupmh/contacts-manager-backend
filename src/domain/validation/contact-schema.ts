import { z } from 'zod';

// regular expressions for additional security validation
const SQL_INJECTION_PATTERN = /('|"|;|--|\/\*|\*\/|@@|@|char|nchar|varchar|nvarchar|alter|begin|cast|create|cursor|declare|delete|drop|exec|execute|fetch|insert|kill|open|select|sys|sysobjects|syscolumns|table|update|xp_)/i;

export const ContactSchema = z.object({
  email: z.string()
    .email()
    .transform(val => {
      console.log(`validating email: ${val}`);
      return val.toLowerCase().trim();
    })
    .refine(val => !SQL_INJECTION_PATTERN.test(val), {
      message: 'Email contains potentially unsafe characters'
    }),
  firstName: z.string()
    .min(1, 'First name is required')
    .transform(val => {
      console.log(`validating first name: ${val}`);
      return val.trim();
    })
    .refine(val => !SQL_INJECTION_PATTERN.test(val), {
      message: 'First name contains potentially unsafe characters'
    }),
  lastName: z.string()
    .max(255, 'Last name must be less than 255 characters')
    .nullable()
    .optional()
    .transform(val => {
      console.log(`validating last name: ${val || 'null'}`);
      return val ? val.trim() : val;
    })
    .refine(val => val === null || val === undefined || !SQL_INJECTION_PATTERN.test(val), {
      message: 'Last name contains potentially unsafe characters'
    })
});

export type ContactInput = z.infer<typeof ContactSchema>;
