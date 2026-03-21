# UCAGS Student Enquiry & Admissions CRM System

A comprehensive Customer Relationship Management (CRM) system built for Universal College of Applied & General Studies (UCAGS) to manage student enquiries, track admissions pipeline, and automate follow-ups.

## 🌟 Features

### Core Functionality
- **Lead/Enquiry Capture**: Collect enquiries from website forms, Google Forms, and external platforms
- **Automatic Assignment**: Round-robin distribution of enquiries to admissions officers
- **Pipeline Tracking**: Monitor enquiry status (New, Contacted, Follow-up, Registered, Closed)
- **Dashboard Analytics**: Real-time statistics and performance metrics
- **Email Integration**: Automated acknowledgement, follow-up, and registration emails via Gmail API
- **Calendar Integration**: Google Calendar reminders for follow-ups
- **Search & Filter**: Advanced enquiry search and filtering capabilities
- **Role-Based Access**: Separate dashboards for Admin and Officers

### User Roles
- **Admin**: Full access to all enquiries, officer management, and system-wide analytics
- **Officers**: Access to assigned enquiries with update and communication capabilities

### Automation
- Automatic enquiry assignment to officers
- Follow-up reminder notifications
- Email acknowledgements for new enquiries
- Synchronization between Admin and Officer sheets

## 🛠️ Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Node.js with Express
- **Database**: Google Sheets (as primary data store)
- **Authentication**: Session-based with bcrypt
- **Email**: Gmail API with domain-wide delegation
- **Calendar**: Google Calendar API
- **Automation**: Google Apps Script
- **Optional**: Twilio for call integration

## 📋 Prerequisites

Before setting up the CRM, ensure you have:

1. **Node.js** (v14 or higher) installed
2. **Google Cloud Project** with the following APIs enabled:
   - Google Sheets API
   - Gmail API
   - Google Calendar API
3. **Google Service Account** with domain-wide delegation
4. **Google Sheets** set up:
   - Admin Sheet (main CRM database)
   - Officers Sheet (officer credentials and information)
   - Individual officer sheets (optional)

## 🚀 Quick Start

### 1. Clone or Download the Project

```bash
# If using git
git clone <repository-url>
cd ucags-crm

# Or download and extract the ZIP file
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment file and update with your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your actual values (see SETUP.md for detailed instructions).

### 4. Start the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The application will be available at `http://localhost:3000`

## 📖 Documentation

Detailed documentation is available in the following files:

- **[SETUP.md](SETUP.md)** - Step-by-step setup instructions
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Production deployment guide
- **[API.md](API.md)** - API endpoint documentation

## 📁 Project Structure

```
ucags-crm/
├── server/
│   ├── index.js                 # Main server file
│   ├── config/
│   │   └── google.js           # Google API configuration
│   ├── middleware/
│   │   └── auth.js             # Authentication middleware
│   ├── routes/
│   │   ├── auth.js             # Authentication routes
│   │   ├── enquiry.js          # Enquiry management routes
│   │   ├── dashboard.js        # Dashboard statistics routes
│   │   ├── officer.js          # Officer management routes
│   │   ├── email.js            # Email sending routes
│   │   ├── calendar.js         # Calendar integration routes
│   │   └── call.js             # Call integration routes
│   ├── integrations/
│   │   ├── sheets.js           # Google Sheets integration
│   │   ├── email.js            # Gmail integration
│   │   └── calendar.js         # Calendar integration
│   └── services/
│       └── assignment.js       # Enquiry assignment logic
├── public/
│   ├── index.html              # Main application UI
│   ├── form.html               # Public enquiry form
│   ├── css/
│   │   └── styles.css          # Application styles
│   └── js/
│       ├── app.js              # Main application logic
│       ├── api.js              # API client functions
│       └── ui.js               # UI helper functions
├── scripts/
│   └── google-apps-script.js   # Google Apps Script automation
├── package.json                # Node.js dependencies
├── .env.example                # Environment variables template
├── .gitignore                  # Git ignore rules
└── README.md                   # This file
```

## 🔐 Default Login Credentials

**Admin Account:**
- Username: `admin`
- Password: `admin123`

⚠️ **Important**: Change the default password immediately after first login!

## 🎨 Key Features Overview

### Dashboard
- Total enquiries count
- Status distribution (New, Contacted, Follow-up, Registered, Closed)
- Recent enquiries list
- Upcoming follow-ups
- Officer performance metrics (Admin only)

### Enquiry Management
- Create new enquiries manually
- View and edit enquiry details
- Update status
- Add notes and comments
- Schedule follow-ups
- Send emails
- Make calls (tel: links or Twilio integration)

### Email Templates
- **Acknowledgement**: Automatic thank you email for new enquiries
- **Follow-up**: Personalized follow-up emails
- **Registration**: Registration process information
- **Custom**: Send custom emails to enquirers

### Calendar Integration
- Automatic calendar event creation for follow-ups
- Email and popup reminders
- Visual calendar view of upcoming follow-ups
- Overdue follow-up tracking

## 🔧 Configuration

### Google Sheets Structure

#### Admin Sheet Columns:
| Column | Description |
|--------|-------------|
| Enquiry ID | Unique identifier (auto-generated) |
| Full Name | Student's full name |
| Phone | Contact phone number |
| Email | Email address |
| Course Interested | Program of interest |
| Source | Lead source (Website, Google Form, etc.) |
| Assigned Officer | Officer username |
| Status | Current status |
| Follow-up Date | Scheduled follow-up date |
| Notes | Internal notes and comments |
| Created Date | Timestamp of enquiry creation |

#### Officers Sheet Columns:
| Column | Description |
|--------|-------------|
| Username | Officer login username |
| Password | Hashed password |
| Name | Officer's full name |
| Email | Officer's email address |
| SheetID | Individual officer's sheet ID (optional) |

## 🌐 Public Enquiry Form

A standalone enquiry form is available at `/form.html` for embedding on the UCAGS website. This form:
- Collects student information
- Submits directly to the CRM API
- Provides instant confirmation
- Triggers automatic assignment
- Sends acknowledgement email

### Embedding the Form

```html
<iframe src="https://your-crm-domain.com/form.html" width="100%" height="800px"></iframe>
```

## 📊 Google Apps Script Automation

The included Google Apps Script provides:
- Automatic assignment of new enquiries (every 10 minutes)
- Daily follow-up reminders (9 AM daily)
- Officer sheet synchronization (hourly)
- Weekly performance reports (Monday 8 AM)

See `scripts/google-apps-script.js` for implementation details.

## 🔒 Security Features

- Session-based authentication
- Password hashing with bcrypt
- Role-based access control
- Environment variable protection
- HTTPS recommended for production
- Service account security

## 🐛 Troubleshooting

### Common Issues

**1. Google API Authentication Errors**
- Verify service account credentials are correct
- Ensure APIs are enabled in Google Cloud Console
- Check domain-wide delegation is configured

**2. Email Sending Fails**
- Confirm Gmail API is enabled
- Verify delegated user email is correct
- Check service account has domain-wide delegation

**3. Cannot Access Google Sheets**
- Ensure service account email has Editor access to the sheet
- Verify ADMIN_SHEET_ID is correct
- Check sheet name matches ADMIN_SHEET_NAME

**4. Officers Cannot Login**
- Verify officer exists in Officers sheet
- Ensure password is properly hashed (use bcrypt)
- Check officer has a valid sheet ID if required

## 📞 Support

For issues, questions, or feature requests:
- Email: it-support@ucags.edu.lk
- Website: https://ucags.edu.lk

## 📝 License

Proprietary - Universal College of Applied & General Studies (UCAGS)

## 🙏 Acknowledgments

Built for UCAGS to streamline student admissions and improve communication with prospective students.

---

**Version**: 1.0.0  
**Last Updated**: January 2026  
**Maintained by**: UCAGS IT Department
