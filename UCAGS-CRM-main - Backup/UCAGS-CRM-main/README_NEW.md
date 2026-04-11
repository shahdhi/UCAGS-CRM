# UCAGS CRM - Modular Architecture

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)
![License](https://img.shields.io/badge/license-ISC-green)

A **full-stack CRM web application** with a **scalable, modular architecture** designed for educational institutions. Currently implements core Leads functionality with Google Sheets integration, while providing a foundation for future CRM modules.

---

## 🎯 Features

### ✅ Currently Active

- **Leads Management**
  - Fetch lead data from Google Sheets using Service Account authentication
  - Real-time search and filtering
  - Sortable table columns
  - Auto-refresh capability
  - Responsive modern UI

- **Dashboard**
  - Leads statistics and overview
  - Clean, professional academic theme

- **Modular Architecture**
  - Scalable backend structure
  - Easy to add new modules
  - Reusable Google Sheets client
  - Centralized configuration

### 🔮 Planned Modules (Placeholders Ready)

- User Management
- Admissions Processing
- Student Records
- Analytics & Reporting
- Follow-ups & Calendar
- Email Integration (Gmail)
- Call Center (Twilio)

---

## 🏗️ Architecture

### Backend Structure

```
backend/
├── core/
│   ├── config/
│   │   └── environment.js          # Centralized configuration
│   └── sheets/
│       └── sheetsClient.js         # Reusable Google Sheets client
│
├── modules/
│   ├── leads/                      # ✓ ACTIVE
│   │   ├── leadsService.js         # Business logic
│   │   └── leadsRoutes.js          # API endpoints
│   │
│   ├── dashboard/                  # ✓ ACTIVE
│   │   └── dashboardRoutes.js
│   │
│   ├── users/                      # ⊙ PLACEHOLDER
│   ├── admissions/                 # ⊙ PLACEHOLDER
│   ├── students/                   # ⊙ PLACEHOLDER
│   └── analytics/                  # ⊙ PLACEHOLDER
│
└── index.js                        # Main server
```

### Frontend Structure

```
frontend/
├── services/
│   └── apiService.js               # Centralized API service
│
└── pages/
    └── leads/
        └── leadsPage.js            # Leads page module

public/
├── index.html                      # Main SPA
├── css/                            # Stylesheets
└── js/
    ├── app.js                      # Main app logic
    └── ui.js                       # UI helpers
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js (v14+)
- Google Cloud Service Account with Sheets API enabled
- Google Sheet with lead data

### Installation

1. **Clone and install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   
   Edit `.env` file:
   ```env
   GOOGLE_APPLICATION_CREDENTIALS=./ucags-crm-d8465dffdfea.json
   SHEET_ID=your-google-sheet-id
   SHEET_NAME=Sheet1
   PORT=3000
   ```

3. **Prepare Google Sheet:**
   
   Your sheet should have these columns:
   ```
   Name | Phone | Email | Course | Status | Notes | Created Date | Source | Assigned To
   ```

4. **Share your Google Sheet:**
   
   Share with the service account email found in your JSON key file.

5. **Run the application:**
   ```bash
   npm run dev
   ```

6. **Access:**
   ```
   http://localhost:3000
   
   Username: admin
   Password: admin123
   ```

📖 **For detailed setup instructions, see [SETUP_INSTRUCTIONS.md](./SETUP_INSTRUCTIONS.md)**

---

## 🔌 API Endpoints

### Active Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check & module status |
| GET | `/api/leads` | Get all leads (with filters) |
| GET | `/api/leads/:id` | Get specific lead |
| GET | `/api/leads/stats` | Get leads statistics |
| GET | `/api/dashboard/stats` | Dashboard stats |

**Example with filters:**
```bash
curl "http://localhost:3000/api/leads?status=New&search=john"
```

### Response Format

```json
{
  "success": true,
  "count": 2,
  "leads": [
    {
      "id": 1,
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "0771234567",
      "course": "BSc IT",
      "status": "New",
      "notes": "Interested in evening classes",
      "createdDate": "2024-01-15",
      "source": "Website",
      "assignedTo": ""
    }
  ]
}
```

---

## 🎨 UI Design

- **Modern, Clean Interface** - Professional academic theme
- **Responsive Layout** - Works on desktop, tablet, and mobile
- **Sidebar Navigation** - Easy access to all modules
- **Real-time Updates** - Auto-refresh every 30 seconds
- **Search & Filter** - Powerful data filtering
- **Sortable Tables** - Click column headers to sort

---

## 🔧 Customization

### Adjust Column Mapping

Edit `backend/modules/leads/leadsService.js`:

```javascript
const COLUMN_MAP = {
  NAME: 0,      // Column A
  PHONE: 1,     // Column B
  EMAIL: 2,     // Column C
  COURSE: 3,    // Column D
  STATUS: 4,    // Column E
  NOTES: 5,     // Column F
  // Adjust based on your sheet structure
};
```

### Add New Module

1. Create module folder in `backend/modules/`
2. Implement service and routes
3. Register in `backend/index.js`
4. Create frontend page in `frontend/pages/`
5. Update navigation

See [SETUP_INSTRUCTIONS.md](./SETUP_INSTRUCTIONS.md) for details.

---

## 🔒 Security

- ✅ Service Account authentication (no user credentials in code)
- ✅ Environment variables for sensitive data
- ✅ `.env` and credentials excluded from git
- ⚠️ Change default admin password in production
- ⚠️ Use HTTPS in production
- ⚠️ Set `NODE_ENV=production` when deploying

---

## 📁 Key Files

| File | Purpose |
|------|---------|
| `backend/index.js` | Main server entry point |
| `backend/core/sheets/sheetsClient.js` | Google Sheets client |
| `backend/modules/leads/leadsService.js` | Leads business logic |
| `frontend/services/apiService.js` | Frontend API service |
| `.env` | Environment configuration |
| `ucags-crm-d8465dffdfea.json` | Google Service Account key |

---

## 🛠️ Development

### Run in Development Mode
```bash
npm run dev
```
Auto-reloads on file changes.

### Run in Production Mode
```bash
npm start
```

### Test API Endpoints
```bash
# Health check
curl http://localhost:3000/api/health

# Get leads
curl http://localhost:3000/api/leads

# Get statistics
curl http://localhost:3000/api/leads/stats
```

---

## 🐛 Troubleshooting

### "Failed to authenticate"
- Verify `ucags-crm-d8465dffdfea.json` exists
- Check service account has sheet access
- Ensure Sheets API is enabled

### "No spreadsheet ID configured"
- Set `SHEET_ID` in `.env`
- Verify sheet ID from URL

### "Failed to read sheet"
- Check `SHEET_NAME` matches your sheet
- Verify service account has Editor permission
- Ensure sheet has header row

See [SETUP_INSTRUCTIONS.md](./SETUP_INSTRUCTIONS.md) for more troubleshooting.

---

## 📚 Documentation

- [Setup Instructions](./SETUP_INSTRUCTIONS.md) - Detailed setup guide
- [API Documentation](./API.md) - API reference (legacy)
- [Deployment Guide](./DEPLOYMENT.md) - How to deploy
- [UI Design Guide](./UI_DESIGN_GUIDE.md) - Design system

---

## 🚀 Deployment

The application can be deployed to:
- Heroku
- AWS
- Google Cloud
- Any Node.js hosting

See [DEPLOYMENT.md](./DEPLOYMENT.md) for instructions.

---

## 📈 Roadmap

### Phase 1 - Core (Current)
- [x] Modular architecture
- [x] Google Sheets integration
- [x] Leads management
- [x] Dashboard basics

### Phase 2 - User Management
- [ ] User authentication
- [ ] Role-based access control
- [ ] User profiles

### Phase 3 - Admissions
- [ ] Application processing
- [ ] Document management
- [ ] Status tracking

### Phase 4 - Students
- [ ] Student records
- [ ] Enrollment management
- [ ] Academic tracking

### Phase 5 - Communication
- [ ] Email integration (Gmail)
- [ ] SMS notifications (Twilio)
- [ ] Follow-up scheduling

### Phase 6 - Analytics
- [ ] Reports & dashboards
- [ ] Data visualization
- [ ] Export capabilities

---

## 🤝 Contributing

This is a private project. For questions or suggestions, contact the development team.

---

## 📄 License

ISC License - See LICENSE file for details.

---

## 👨‍💻 Technical Stack

**Backend:**
- Node.js + Express
- Google APIs (Sheets)
- Modular architecture

**Frontend:**
- Vanilla JavaScript (modular)
- HTML5 + CSS3
- Responsive design

**Infrastructure:**
- Google Cloud Service Account
- Google Sheets as database
- Environment-based configuration

---

## ✨ Why This Architecture?

1. **Scalability** - Easy to add new modules without refactoring
2. **Maintainability** - Clean separation of concerns
3. **Reusability** - Shared core services
4. **Flexibility** - Adapt to changing requirements
5. **Developer-Friendly** - Clear structure and documentation

---

**Built with ❤️ for UCAGS**

For support, see [SETUP_INSTRUCTIONS.md](./SETUP_INSTRUCTIONS.md) or contact your administrator.
