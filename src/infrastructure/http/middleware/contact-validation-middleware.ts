import { Request, Response, NextFunction } from 'express';
import { validateFileUpload } from './validation-middleware';

export const validateContactsCsvUpload = validateFileUpload('csv');
