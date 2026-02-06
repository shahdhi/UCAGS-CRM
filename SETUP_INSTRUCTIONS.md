# UCAGS CRM - Setup Instructions

## 🎯 Quick Start Guide

This application has been refactored with a **modular, scalable architecture** that supports future CRM features while implementing only the core Leads functionality.

---

## 📋 Prerequisites

- **Node.js** (v14 or higher)
- **npm** (comes with Node.js)
- **Google Cloud Service Account** with Sheets API enabled
- **Google Sheet** with your lead data

---

## 🔧 Installation Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Google Service Account

You already have the service account JSON file: `ucags-crm-d8465dffdfea.json`

**Make sure this file is in the project root directory.**

The application will automatically use this file for authentication.

### 3. Set Up Environment Variables

Create or edit the `.env` file in the project root:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Google Service Account
# The app will use the JSON file by default
GOOGLE_APPLICATION_CREDENTIALS=./ucags-crm-d8465dffdfea.json

# Google Sheets Configuration
# Replace with your actual Google Sheet ID
SHEET_ID=your-google-sheet-id-here
SHEET_NAME=Sheet1
```

**How to get your Google Sheet ID:**
1. Open your Google Sheet in browser
2. Copy the ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/[SHEET_ID_HERE]/edit
   ```
3. Paste it as `SHEET_ID` in the `.env` file

### 4. Prepare Your Google Sheet

Your Google Sheet should have the following columns (starting from column A):

| A    | B     | C     | D      | E      | F     | G           | H      | I      |
|------|-------|-------|--------|--------|-------|-------------|--------|--------|
| Name | Phone | Email | Course | Status | Notes | Created Date| Source | Assigned To |

**Example:**
```
Name          | Phone        | Email              | Course    | Status | Notes
John Doe      | 0771234567   | john@example.com   | BSc IT    | New    | Interested in evening classes
Jane Smith    | 0777654321   | jane@example.com   | MBA       | Contacted | Follow up next week
```

### 5. Share Your Google Sheet

Share your Google Sheet with the service account email address:
1. Open your Google Sheet
2. Click **Share**
3. Add the service account email (found in `ucags-crm-d8465dffdfea.json` as `client_email`)
4. Give it **Editor** access

---

## 🚀 Running the Application

### Development Mode

```bash
npm run dev
```

This will start the server with auto-reload on file changes.

### Production Mode

```bash
npm start
```

### Access the Application

Open your browser and navigate to:
```
http://localhost:3000
```

**Default Login Credentials:**
- Username: `admin`
- Password: `admin123`

---

## 📁 Project Structure

The application follows a **modular architecture** for scalability:

```
backend/
├── core/
│   ├── config/
│   │   └── environment.js          # Centralized configuration
│   └── sheets/
│       └── sheetsClient.js         # Reusable Google Sheets client
├── modules/
│   ├── leads/                      # ✓ Active module
│   │   ├── leadsService.js         # Business logic
│   │   └── leadsRoutes.js          # API endpoints
│   ├── dashboard/                  # ✓ Active module
│   │   └── dashboardRoutes.js
│   ├── users/                      # ⊙ Placeholder for future
│   │   └── usersRoutes.js
│   ├── admissions/                 # ⊙ Placeholder for future
│   │   └── admissionsRoutes.js
│   ├── students/                   # ⊙ Placeholder for future
│   │   └── studentsRoutes.js
│   └── analytics/                  # ⊙ Placeholder for future
│       └── analyticsRoutes.js
└── index.js                        # Main server entry point

frontend/
├── services/
│   └── apiService.js               # Centralized API calls
└── pages/
    └── leads/
        └── leadsPage.js            # Leads page functionality

public/
├── index.html                      # Main HTML (SPA)
├── css/                            # Stylesheets
└── js/
    ├── app.js                      # Main application logic
    └── ui.js                       # UI helper functions
```

---

## 🔌 API Endpoints

### Active Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check and module status |
| GET | `/api/leads` | Get all leads (with optional filters) |
| GET | `/api/leads/:id` | Get specific lead by ID |
| GET | `/api/leads/stats` | Get leads statistics |
| GET | `/api/dashboard/stats` | Get dashboard statistics |

### Query Parameters for `/api/leads`

- `status` - Filter by status (New, Contacted, Follow-up, Registered, Closed)
- `search` - Search by name, email, phone, or course

**Example:**
```
GET /api/leads?status=New&search=john
```

### Placeholder Endpoints (Future Modules)

These endpoints return a 501 (Not Implemented) status:
- `/api/users`
- `/api/admissions`
- `/api/students`
- `/api/analytics`

---

## ✨ Features

### Currently Active

✅ **Leads Management**
- View all leads from Google Sheets
- Real-time search and filtering
- Sortable table columns
- Auto-refresh every 30 seconds
- Responsive design

✅ **Dashboard**
- Leads statistics

✅ **Modern UI**
- Clean, professional academic theme
- Sidebar navigation
- Mobile responsive

### Planned for Future

⏳ **User Management**
⏳ **Admissions Processing**
⏳ **Student Records**
⏳ **Analytics & Reporting**
⏳ **Follow-ups & Calendar**
⏳ **Email Integration**
⏳ **Call Center Integration**

---

## 🛠️ Customization

### Adjusting Column Mapping

If your Google Sheet has different column order, edit `backend/modules/leads/leadsService.js`:

```javascript
const COLUMN_MAP = {
  NAME: 0,        // Column A
  PHONE: 1,       // Column B
  EMAIL: 2,       // Column C
  COURSE: 3,      // Column D
  STATUS: 4,      // Column E
  NOTES: 5,       // Column F
  // Add more columns as needed
};
```

### Adding New Modules

To add a new CRM module (e.g., Admissions):

1. **Create module folder:**
   ```
   backend/modules/admissions/
   ├── admissionsService.js
   └── admissionsRoutes.js
   ```

2. **Implement service logic** in `admissionsService.js`

3. **Create API routes** in `admissionsRoutes.js`

4. **Register routes** in `backend/index.js`:
   ```javascript
   app.use('/api/admissions', require('./modules/admissions/admissionsRoutes'));
   ```

5. **Create frontend page** in `frontend/pages/admissions/`

6. **Update navigation** in `public/index.html`

---

## 🔍 Troubleshooting

### Issue: "Failed to authenticate"

**Solution:**
- Verify `ucags-crm-d8465dffdfea.json` is in the project root
- Check that the service account email has access to your Google Sheet
- Ensure Sheets API is enabled in Google Cloud Console

### Issue: "No spreadsheet ID configured"

**Solution:**
- Set `SHEET_ID` in `.env` file
- Make sure the value matches your Google Sheet ID

### Issue: "Failed to read sheet"

**Solution:**
- Verify the sheet name matches `SHEET_NAME` in `.env` (default: "Sheet1")
- Ensure your sheet has a header row
- Check that the service account has "Editor" permission

### Issue: Leads page shows "No leads found"

**Solution:**
- Check that your Google Sheet has data rows (beyond the header)
- Verify column mapping in `backend/modules/leads/leadsService.js`
- Check browser console for errors

---

## 📝 Development Tips

### Testing the API

Use curl or Postman to test endpoints:

```bash
# Health check
curl http://localhost:3000/api/health

# Get all leads
curl http://localhost:3000/api/leads

# Get leads with filters
curl "http://localhost:3000/api/leads?status=New&search=john"

# Get leads statistics
curl http://localhost:3000/api/leads/stats
```

### Viewing Logs

The application logs important information to the console:
- Authentication status
- Module loading
- API requests
- Errors

### Hot Reload

When using `npm run dev`, the server automatically restarts when you modify backend files.

---

## 🔒 Security Notes

- **Change default admin password** in production
- Never commit `.env` or `ucags-crm-d8465dffdfea.json` to version control
- Keep service account credentials secure
- Use HTTPS in production
- Set `NODE_ENV=production` when deploying

---

## 📞 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the console logs
3. Verify your Google Sheets configuration
4. Ensure all dependencies are installed

---

## 🎉 Next Steps

1. ✅ Complete the setup steps above
2. ✅ Test the application with sample data
3. ✅ Customize the column mapping if needed
4. 🚀 Deploy to production (see DEPLOYMENT.md)
5. 📈 Add new modules as your CRM needs grow

---

**Architecture Benefits:**
- ✨ Clean separation of concerns
- 🔌 Easy to add new modules
- 🛠️ Reusable Google Sheets client
- 📦 Modular structure
- 🚀 Production-ready foundation
