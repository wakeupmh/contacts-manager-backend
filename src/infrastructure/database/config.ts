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
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: parseInt(process.env.DB_POOL_MAX || '20'),
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
    connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '5000'),
    statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '180000') // 3 minutes
  });
  
  pool.on('connect', () => {
    console.log(`new database connection established`);
  });
  
  pool.on('error', (err) => {
    console.error(`database connection error: ${err.message}`);
    if (err.message.includes('connection') || err.message.includes('timeout')) {
      console.log('Connection error detected, this connection will be removed from the pool');
    }
  });
  
  pool.on('acquire', () => {
    console.log(`client acquired from pool`);
  });
  
  pool.on('remove', () => {
    console.log(`client returned to pool`);
  });
  
  return pool;
};
