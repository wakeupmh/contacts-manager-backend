import { Pool } from 'pg';

export const createDatabasePool = (): Pool => {
  console.log(`creating database connection pool`);
  
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.log(`database url not provided, using default connection parameters`);
  } else {
    console.log(`using provided database url`);
  }
  
  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  
  pool.on('connect', () => {
    console.log(`new database connection established`);
  });
  
  pool.on('error', (err) => {
    console.log(`database connection error: ${err.message}`);
  });
  
  return pool;
};
