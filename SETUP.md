# Backend Setup Instructions

## Quick Start

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create .env file:**
   Create a `.env` file in the backend directory with the following content:
   ```
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=Mudhro_FinTech
   DB_USER=postgres
   DB_PASSWORD=root

   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   JWT_EXPIRES_IN=2h
   REFRESH_TOKEN_EXPIRES_IN=7d

   PORT=3000
   NODE_ENV=development
   CORS_ORIGIN=http://localhost:8080
   ```

4. **Set up PostgreSQL database:**
   - Make sure PostgreSQL is running
   - Create the database:
     ```sql
     CREATE DATABASE "Mudhro_FinTech";
     ```
   - Run the schema SQL:
     ```bash
     psql -U postgres -d Mudhro_FinTech -f src/config/db-schema.sql
     ```
     Or manually execute the SQL from `src/config/db-schema.sql`

5. **Start the server:**
   ```bash
   npm run dev
   ```

   The server will run on `http://localhost:3000`

## Testing the API

### Health Check
```bash
curl http://localhost:3000/health
```

### Register a User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "John Doe",
    "email": "john@example.com",
    "password": "password123",
    "country": "India",
    "mobileNumber": "+91-9876543210"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

### Get User Profile (requires token)
```bash
curl http://localhost:3000/api/user/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

