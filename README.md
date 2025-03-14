# Contacts Manager Backend

A backend service for managing contacts with a Domain-Driven Design (DDD) approach.

## Architecture

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
- Node.js (v14+)
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
