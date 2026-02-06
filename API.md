# UCAGS CRM - API Documentation

Complete API reference for the UCAGS Student Enquiry & Admissions CRM System.

## Base URL

```
http://localhost:3000/api    (Development)
https://crm.ucags.edu.lk/api (Production)
```

## Authentication

All authenticated endpoints require a valid session cookie. Login first to establish a session.

---

## Authentication Endpoints

### Login

**POST** `/auth/login`

Authenticate a user and create a session.

**Request Body:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response (200):**
```json
{
  "success": true,
  "user": {
    "username": "admin",
    "role": "admin",
    "name": "Admin User"
  }
}
```

**Response (401):**
```json
{
  "error": "Invalid username or password"
}
```

---

### Logout

**POST** `/auth/logout`

Destroy the current session.

**Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### Get Current User

**GET** `/auth/me`

Get information about the currently authenticated user.

**Response (200):**
```json
{
  "user": {
    "username": "admin",
    "role": "admin",
    "name": "Admin User"
  }
}
```

**Response (401):**
```json
{
  "error": "Not authenticated"
}
```

---

## Enquiry Endpoints

### Get All Enquiries

**GET** `/enquiries`

Get all enquiries (Admin sees all, Officers see only assigned).

**Authentication:** Required

**Query Parameters:**
- `status` (optional): Filter by status (New, Contacted, Follow-up, Registered, Closed)
- `search` (optional): Search by name, email, phone, or course
- `dateFrom` (optional): Filter from date (ISO 8601)
- `dateTo` (optional): Filter to date (ISO 8601)

**Example:**
```
GET /api/enquiries?status=New&search=john
```

**Response (200):**
```json
{
  "enquiries": [
    {
      "enquiryId": "abc123",
      "fullName": "John Smith",
      "phone": "+94771234567",
      "email": "john@example.com",
      "course": "Diploma in Business Management",
      "source": "Website",
      "assignedOfficer": "officer1",
      "status": "New",
      "followUpDate": "2026-02-01",
      "notes": "Interested in evening classes",
      "createdDate": "2026-01-21T10:30:00.000Z"
    }
  ]
}
```

---

### Get Enquiry by ID

**GET** `/enquiries/:id`

Get details of a specific enquiry.

**Authentication:** Required

**Parameters:**
- `id`: Enquiry ID

**Response (200):**
```json
{
  "enquiry": {
    "enquiryId": "abc123",
    "fullName": "John Smith",
    "phone": "+94771234567",
    "email": "john@example.com",
    "course": "Diploma in Business Management",
    "source": "Website",
    "assignedOfficer": "officer1",
    "status": "New",
    "followUpDate": "2026-02-01",
    "notes": "Interested in evening classes",
    "createdDate": "2026-01-21T10:30:00.000Z"
  }
}
```

**Response (404):**
```json
{
  "error": "Enquiry not found"
}
```

---

### Create Enquiry

**POST** `/enquiries`

Create a new enquiry. This is a public endpoint for form submissions.

**Authentication:** Not required (public endpoint)

**Request Body:**
```json
{
  "fullName": "John Smith",
  "email": "john@example.com",
  "phone": "+94771234567",
  "course": "Diploma in Business Management",
  "source": "Website",
  "notes": "Interested in evening classes"
}
```

**Response (201):**
```json
{
  "success": true,
  "enquiry": {
    "enquiryId": "abc123",
    "fullName": "John Smith",
    "email": "john@example.com",
    "phone": "+94771234567",
    "course": "Diploma in Business Management",
    "source": "Website",
    "status": "New",
    "notes": "Interested in evening classes",
    "assignedOfficer": "officer1",
    "createdDate": "2026-01-21T10:30:00.000Z"
  },
  "message": "Enquiry submitted successfully"
}
```

---

### Update Enquiry

**PUT** `/enquiries/:id`

Update an existing enquiry.

**Authentication:** Required

**Parameters:**
- `id`: Enquiry ID

**Request Body (partial update):**
```json
{
  "status": "Contacted",
  "followUpDate": "2026-02-01",
  "notes": "Called and discussed program details"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Enquiry updated successfully"
}
```

---

### Add Note to Enquiry

**POST** `/enquiries/:id/notes`

Add a note to an enquiry.

**Authentication:** Required

**Parameters:**
- `id`: Enquiry ID

**Request Body:**
```json
{
  "note": "Student confirmed interest in January intake"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Note added successfully"
}
```

---

## Dashboard Endpoints

### Get Dashboard Statistics

**GET** `/dashboard/stats`

Get comprehensive dashboard statistics.

**Authentication:** Required

**Response (200):**
```json
{
  "stats": {
    "total": 150,
    "new": 45,
    "contacted": 30,
    "followUp": 25,
    "registered": 40,
    "closed": 10
  },
  "statusDistribution": {
    "New": 45,
    "Contacted": 30,
    "Follow-up": 25,
    "Registered": 40,
    "Closed": 10
  },
  "sourceDistribution": {
    "Website": 80,
    "Google Form": 40,
    "Phone Call": 20,
    "Walk-in": 10
  },
  "recentCount": 12,
  "upcomingFollowUps": 8,
  "officerStats": {
    "officer1": {
      "total": 50,
      "new": 15,
      "contacted": 10,
      "followUp": 10,
      "registered": 12,
      "closed": 3
    }
  }
}
```

---

### Get Recent Enquiries

**GET** `/dashboard/recent`

Get most recent enquiries.

**Authentication:** Required

**Query Parameters:**
- `limit` (optional, default: 10): Number of enquiries to return

**Response (200):**
```json
{
  "enquiries": [
    {
      "enquiryId": "abc123",
      "fullName": "John Smith",
      "email": "john@example.com",
      "status": "New",
      "createdDate": "2026-01-21T10:30:00.000Z"
    }
  ]
}
```

---

### Get Follow-ups

**GET** `/dashboard/follow-ups`

Get overdue and upcoming follow-ups.

**Authentication:** Required

**Response (200):**
```json
{
  "overdue": [
    {
      "enquiryId": "abc123",
      "fullName": "John Smith",
      "followUpDate": "2026-01-20",
      "status": "Follow-up"
    }
  ],
  "upcoming": [
    {
      "enquiryId": "def456",
      "fullName": "Jane Doe",
      "followUpDate": "2026-01-25",
      "status": "Contacted"
    }
  ]
}
```

---

## Officer Endpoints

### Get All Officers

**GET** `/officers`

Get list of all officers (Admin only).

**Authentication:** Required (Admin)

**Response (200):**
```json
{
  "officers": [
    {
      "username": "officer1",
      "name": "John Officer",
      "email": "john.officer@ucags.edu.lk",
      "sheetId": "1abc..."
    }
  ]
}
```

---

### Get Officer Statistics

**GET** `/officers/stats`

Get statistics for all officers (Admin only).

**Authentication:** Required (Admin)

**Response (200):**
```json
{
  "officerStats": [
    {
      "username": "officer1",
      "name": "John Officer",
      "email": "john.officer@ucags.edu.lk",
      "totalEnquiries": 50,
      "new": 15,
      "contacted": 10,
      "followUp": 10,
      "registered": 12,
      "closed": 3
    }
  ]
}
```

---

## Email Endpoints

### Send Acknowledgement Email

**POST** `/email/acknowledgement`

Send acknowledgement email to enquirer.

**Authentication:** Required

**Request Body:**
```json
{
  "enquiryId": "abc123"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Acknowledgement email sent successfully"
}
```

---

### Send Follow-up Email

**POST** `/email/follow-up`

Send follow-up email to enquirer.

**Authentication:** Required

**Request Body:**
```json
{
  "enquiryId": "abc123"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Follow-up email sent successfully"
}
```

---

### Send Registration Email

**POST** `/email/registration`

Send registration information email.

**Authentication:** Required

**Request Body:**
```json
{
  "enquiryId": "abc123"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Registration email sent successfully"
}
```

---

### Send Custom Email

**POST** `/email/custom`

Send custom email to enquirer.

**Authentication:** Required

**Request Body:**
```json
{
  "enquiryId": "abc123",
  "subject": "Custom Subject",
  "message": "Custom email message content"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Email sent successfully"
}
```

---

## Calendar Endpoints

### Create Follow-up Event

**POST** `/calendar/follow-up`

Create a Google Calendar event for follow-up.

**Authentication:** Required

**Request Body:**
```json
{
  "enquiryId": "abc123",
  "followUpDate": "2026-02-01T10:00:00.000Z",
  "notes": "Call to discuss program details"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Follow-up scheduled successfully",
  "eventId": "event123",
  "eventLink": "https://calendar.google.com/..."
}
```

---

### Get Upcoming Events

**GET** `/calendar/upcoming`

Get upcoming calendar events.

**Authentication:** Required

**Query Parameters:**
- `days` (optional, default: 7): Number of days to look ahead

**Response (200):**
```json
{
  "events": [
    {
      "id": "event123",
      "summary": "Follow-up: John Smith",
      "start": "2026-01-25T10:00:00.000Z",
      "end": "2026-01-25T10:30:00.000Z"
    }
  ]
}
```

---

## Call Endpoints

### Get Call Status

**GET** `/call/status`

Check if Twilio integration is configured.

**Authentication:** Required

**Response (200):**
```json
{
  "configured": true,
  "enabled": true
}
```

---

### Initiate Call

**POST** `/call/initiate`

Initiate a call (if Twilio is configured).

**Authentication:** Required

**Request Body:**
```json
{
  "to": "+94771234567",
  "enquiryId": "abc123"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Call feature is available. Use tel: links for direct calling.",
  "telLink": "tel:+94771234567"
}
```

---

### Log Call

**POST** `/call/log`

Log a call activity.

**Authentication:** Required

**Request Body:**
```json
{
  "enquiryId": "abc123",
  "duration": 300,
  "notes": "Discussed program options"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Call logged successfully"
}
```

---

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "error": "Invalid request parameters"
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized. Please login."
}
```

### 403 Forbidden
```json
{
  "error": "Forbidden. Admin access required."
}
```

### 404 Not Found
```json
{
  "error": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal Server Error"
}
```

---

## Rate Limiting

API requests are rate-limited to prevent abuse:
- **Limit**: 100 requests per 15 minutes per IP
- **Headers**: Rate limit info is returned in response headers

---

## CORS

For security, CORS is configured to only allow requests from:
- Same origin (production)
- localhost:3000 (development)

---

## Webhooks

### External Form Webhook

**POST** `/enquiries`

External systems can submit enquiries via webhook using the public enquiry endpoint.

**Headers:**
```
Content-Type: application/json
```

**Payload:**
```json
{
  "fullName": "John Smith",
  "email": "john@example.com",
  "phone": "+94771234567",
  "course": "Diploma in IT",
  "source": "External Platform",
  "notes": "Lead from partner platform"
}
```

---

## JavaScript Client Example

```javascript
// Login
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  credentials: 'include' // Important for cookies
});

const data = await response.json();

// Get enquiries
const enquiries = await fetch('/api/enquiries', {
  credentials: 'include'
});

// Create enquiry
const newEnquiry = await fetch('/api/enquiries', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fullName: 'John Smith',
    email: 'john@example.com',
    course: 'Diploma in Business'
  })
});
```

---

For additional support or questions about the API, contact: it-support@ucags.edu.lk
