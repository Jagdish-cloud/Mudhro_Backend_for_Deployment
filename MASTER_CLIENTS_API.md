# Master Clients API Documentation

Complete backend implementation for MasterClients with one-to-many relationship with Users.

## Database Schema

- **Table:** `master_clients`
- **Relationship:** One User can have Many Clients (Foreign Key: `userId` → `users.id`)
- **Cascade Delete:** When a user is deleted, all their clients are automatically deleted

## API Endpoints

All endpoints require authentication (Bearer Token in Authorization header).

### Base URL
```
http://localhost:3000/api/master-clients
```

---

### 1. Create Master Client

**POST** `/api/master-clients`

**Headers:**
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "fullName": "John Doe",
  "email": "john.doe@example.com",
  "organization": "Acme Corporation",
  "mobileNumber": "+919876543210",
  "gstin": "27AAEPM1234C1Z1"
}
```

**Required Fields:**
- `fullName` (string, 2-255 characters)
- `email` (valid email format)

**Optional Fields:**
- `organization` (string, max 255 characters)
- `mobileNumber` (international format)
- `gstin` (valid GSTIN format)

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Master client created successfully",
  "client": {
    "id": 1,
    "organization": "Acme Corporation",
    "fullName": "John Doe",
    "email": "john.doe@example.com",
    "mobileNumber": "+919876543210",
    "gstin": "27AAEPM1234C1Z1",
    "userId": 1,
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T10:30:00.000Z"
  }
}
```

---

### 2. Get All Master Clients

**GET** `/api/master-clients`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Master clients retrieved successfully",
  "clients": [
    {
      "id": 1,
      "organization": "Acme Corporation",
      "fullName": "John Doe",
      "email": "john.doe@example.com",
      "mobileNumber": "+919876543210",
      "gstin": "27AAEPM1234C1Z1",
      "userId": 1,
      "createdAt": "2025-01-15T10:30:00.000Z",
      "updatedAt": "2025-01-15T10:30:00.000Z"
    }
  ],
  "count": 1
}
```

**Note:** Returns only clients belonging to the authenticated user.

---

### 3. Get Master Client by ID

**GET** `/api/master-clients/:id`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "client": {
    "id": 1,
    "organization": "Acme Corporation",
    "fullName": "John Doe",
    "email": "john.doe@example.com",
    "mobileNumber": "+919876543210",
    "gstin": "27AAEPM1234C1Z1",
    "userId": 1,
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T10:30:00.000Z"
  }
}
```

**Error (404 Not Found):**
```json
{
  "success": false,
  "message": "Master client not found"
}
```

---

### 4. Update Master Client

**PUT** `/api/master-clients/:id`

**Headers:**
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body (all fields optional):**
```json
{
  "fullName": "Jane Doe",
  "email": "jane.doe@example.com",
  "organization": "New Organization",
  "mobileNumber": "+919999999999",
  "gstin": "27ABCDE1234F1Z2"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Master client updated successfully",
  "client": {
    "id": 1,
    "organization": "New Organization",
    "fullName": "Jane Doe",
    "email": "jane.doe@example.com",
    "mobileNumber": "+919999999999",
    "gstin": "27ABCDE1234F1Z2",
    "userId": 1,
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T10:35:00.000Z"
  }
}
```

---

### 5. Delete Master Client

**DELETE** `/api/master-clients/:id`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Master client deleted successfully"
}
```

---

## Error Responses

### 400 Bad Request (Validation Error)
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "type": "field",
      "msg": "Full name is required",
      "path": "fullName",
      "location": "body"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Unauthorized"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Master client not found"
}
```

### 409 Conflict (Duplicate Email)
```json
{
  "success": false,
  "message": "Client with this email already exists for this user"
}
```

---

## Security Features

1. **Authentication Required:** All endpoints require JWT token
2. **User Isolation:** Users can only access their own clients
3. **Foreign Key Constraint:** Ensures data integrity
4. **Cascade Delete:** Clients are automatically deleted when user is deleted
5. **Email Uniqueness:** Email must be unique per user (not globally)

---

## Database Setup

Run the updated schema SQL:
```bash
psql -U postgres -d Mudhro_FinTech -f src/config/db-schema.sql
```

Or manually execute the SQL from `backend/src/config/db-schema.sql`

The `master_clients` table will be created with:
- Auto-incrementing ID
- Foreign key relationship to `users` table
- Automatic `updatedAt` timestamp trigger
- Indexes for performance optimization

---

## Testing with Postman

1. **Login first** to get access token
2. **Copy the access token** from login response
3. **Set Authorization header** as: `Bearer <your_access_token>`
4. **Test all CRUD operations** using the endpoints above

---

## Relationship Details

- **One User → Many Clients**
- Each client belongs to exactly one user
- `userId` is automatically set from the authenticated user's token
- Users cannot access or modify clients belonging to other users
- When a user is deleted, all their clients are automatically deleted (CASCADE)

