# Contacts Manager Backend

A backend service for managing contacts with a Domain-Driven Design (DDD) approach, trying to not spend even a penny, so I've used Frugal Architecture xD

- Frontend: React -> Vercel
- Backend: Node.js -> Render
- Database: PostgreSQL -> Supabase

## Architecture
![Architecture](frugal-arch.png)

The application follows a DDD architecture with the following layers:

### Domain Layer
- **Entities**: Core business objects (e.g., Contact)
- **Repositories Interfaces**: Abstractions for data access
- **Services**: Domain logic and business rules
- **Validation**: Zod schemas for data validation

### Application Layer
- **Use Cases**: Application-specific logic (e.g., ContactImporter for CSV processing)

### Infrastructure Layer
- **Database**: Database configuration and repository implementations
- **HTTP**: Server setup and routing
- **Middleware**: Request validation (headers and structure)

### Presentation Layer
- **Controllers**: Handle HTTP requests and responses

## Getting Started

### Prerequisites
- Node.js (v20+)
- PostgreSQL database

### Installation

1. Install dependencies:
```
npm install
```

2. Set environment variables:
```
export DATABASE_URL=postgresql://username:password@localhost:5432/contacts_db
```

3. Build the application:
```
npm run build
```

4. Start the server:
```
npm start
```

For development:
```
npm run dev
```

## Self-Ping Mechanism

The application includes a self-ping mechanism that helps keep the service active by making periodic requests to its own `/health` endpoint. 
This is particularly useful for preventing the application from going idle on Render as it has a inactivity timeouts.

### Configuration

The self-ping mechanism can be configured using the following environment variables:

- `APP_URL`: The URL of the application (default: `http://localhost:3000`)
- `PING_INTERVAL_MINUTES`: How often to ping the application in minutes (default: `5`)


### How It Works

1. When the application starts, it initializes the self-ping service, because Render free tier has a spin down policy, so it's a lil hack to achieve the availability.
2. The service makes HTTP requests to the application's `/health` endpoint at regular intervals
3. These requests help keep the application active and prevent it from being terminated due to inactivity
4. The service logs the results of each ping for monitoring purposes

## API Endpoints

- `GET /contacts`: Get paginated contacts
  - Query parameters:
    - `page`: Page number (default: 1)
    - `limit`: Items per page (default: 20)

- `POST /upload`: Upload contacts from CSV
  - Form data:
    - `csv`: CSV file with contacts data
    - Required columns: email, first name
    - Optional columns: last name

## Large-Scale CSV Processing

This application is optimized to efficiently handle large CSV files with up to 1 million records. The following optimizations have been implemented:

### Batch Processing
- CSV data is processed in configurable batches (default: 1000 records)
- Each batch is saved to the database immediately, minimizing memory usage
- Progress tracking for large imports with detailed statistics

### Database Optimizations
- Bulk insert operations using parameterized queries
- Intelligent batching to stay within PostgreSQL's parameter limits
- Optimized connection pool settings for large-scale operations
- Transaction management to ensure data consistency

### HTTP Request Handling
- Extended request timeout (10 minutes) for large file processing
- Increased file size limits (up to 500MB)
- Comprehensive error handling and progress reporting
- Memory-efficient stream processing

### Why Busboy Instead of Multer

This application uses Busboy for file upload handling instead of the more commonly used Multer middleware. Here's why Busboy is superior for handling large files:

#### Memory Efficiency
- **Busboy**: Processes files as streams, never loading the entire file into memory
- **Multer**: By default, buffers entire files in memory before processing, which can cause out-of-memory errors with large files

#### Fine-grained Control
- **Busboy**: Provides low-level access to multipart form parsing, allowing custom handling of each file chunk
- **Multer**: Abstracts away the parsing process, making it harder to implement custom streaming logic

#### Error Handling
- **Busboy**: Offers better error handling for partial uploads and network interruptions
- **Multer**: Less granular error handling, especially for stream-related issues

#### Performance
- **Busboy**: Significantly lower memory footprint for large files (500MB+)
- **Multer**: Memory usage scales linearly with file size, becoming problematic for large uploads

For our use case of processing potentially large CSV files (up to 1 million records), Busboy's streaming approach provides the optimal balance of performance, reliability, and memory efficiency.

### Performance Configuration
- Configurable database connection pool settings via environment variables:
  - `DB_POOL_MAX`: Maximum number of clients in the pool (default: 20)
  - `DB_POOL_IDLE_TIMEOUT`: Client idle timeout in milliseconds (default: 30000)
  - `DB_POOL_CONNECTION_TIMEOUT`: Connection timeout in milliseconds (default: 5000)
  - `DB_STATEMENT_TIMEOUT`: SQL statement timeout in milliseconds (default: 180000)
- Node.js memory optimization via `NODE_OPTIONS="--max-old-space-size=4096"`

### Docker Configuration
The included Dockerfile is configured with optimized settings for handling large datasets:
```
# Set Node to use maximum memory
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Optimize environment variables for large datasets
ENV DB_POOL_MAX=20
ENV DB_POOL_IDLE_TIMEOUT=30000
ENV DB_POOL_CONNECTION_TIMEOUT=5000
ENV DB_STATEMENT_TIMEOUT=180000
```

### Best Practices for Large Imports
- Ensure your CSV file has clean, consistent data
- Make sure your database has sufficient resources
- For extremely large files (>1M records), consider using a dedicated database instance
- Monitor system resources during import operations
- Use the provided statistics in the API response to track import progress

## Performance Considerations

When importing very large CSV files:

1. **Memory Usage**: The application is designed to use streaming and batch processing to minimize memory consumption.

2. **Database Performance**: 
   - Ensure your PostgreSQL instance has sufficient resources
   - Consider optimizing your database indexes
   - For production, use a dedicated database instance with sufficient CPU and memory

3. **Network Considerations**:
   - For large file uploads, ensure stable network connectivity
   - The application includes timeout handling for long-running operations

4. **Monitoring**:
   - The application logs detailed information about the import process
   - Use these logs to monitor progress and troubleshoot issues

## Security Features

The application implements multiple layers of security to protect against SQL injection and other common vulnerabilities:

### SQL Injection Prevention

1. **Parameterized Queries**
   - All database operations use parameterized queries with placeholders
   - Query parameters are always passed separately from the SQL statements
   - Prevents attackers from injecting malicious SQL code

2. **Input Validation and Sanitization**
   - All user inputs are validated using Zod schemas
   - Regular expression patterns detect and block SQL injection attempts
   - Input data is sanitized (trimmed, normalized) before processing

### Web Security Measures

1. **Security Headers**
   - `X-Content-Type-Options: nosniff` - Prevents MIME type sniffing
   - `X-Frame-Options: DENY` - Prevents clickjacking attacks
   - `X-XSS-Protection: 1; mode=block` - Enables browser XSS protection
   - Content Security Policy (CSP) - Restricts resource loading

2. **Request Validation**
   - Query parameter sanitization prevents parameter-based attacks
   - Content-type validation ensures proper request formatting
   - File upload validation checks for appropriate file types

3. **Error Handling**
   - Secure error responses that don't leak sensitive information
   - Detailed internal logging for troubleshooting
   - Production mode hides implementation details from error responses

### Security Best Practices

The application follows these security best practices:

1. **Defense in Depth**
   - Multiple layers of security controls
   - Security at both application and database levels

2. **Principle of Least Privilege**
   - Database operations use only the permissions they need
   - API endpoints validate user access appropriately

3. **Secure Configuration**
   - Environment-specific security settings
   - Configurable security parameters

### Security Configuration

Security-related environment variables:
- `NODE_ENV`: Set to 'production' in production environments to enable additional security features
- `DB_STATEMENT_TIMEOUT`: Limits the duration of database queries to prevent DoS attacks
