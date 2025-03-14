import { Request, Response, NextFunction } from 'express';

export const securityMiddleware = {
  addSecurityHeaders: (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; object-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'"
    );
    next();
  },
  
  sanitizeQueryParams: (req: Request, res: Response, next: NextFunction) => {
    if (req.query) {
      if (req.query.page && !/^\d+$/.test(req.query.page as string)) {
        return res.status(400).json({ error: 'Invalid page parameter' });
      }
      
      if (req.query.limit && !/^\d+$/.test(req.query.limit as string)) {
        return res.status(400).json({ error: 'Invalid limit parameter' });
      }
    }
    
    next();
  },
  
  validateContentType: (req: Request, res: Response, next: NextFunction) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const contentType = req.headers['content-type'] || '';
      
      if (req.path === '/upload' && !contentType.includes('multipart/form-data')) {
        return res.status(415).json({ 
          error: 'Unsupported Media Type',
          message: 'The upload endpoint requires multipart/form-data'
        });
      }
      
      if (req.path !== '/upload' && !contentType.includes('application/json')) {
        return res.status(415).json({ 
          error: 'Unsupported Media Type',
          message: 'This endpoint requires application/json'
        });
      }
    }
    
    next();
  }
};

export default securityMiddleware;
