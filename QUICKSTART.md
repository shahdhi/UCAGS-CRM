# UCAGS CRM - Quick Start Guide

Get the UCAGS CRM up and running in 15 minutes!

## Prerequisites

- Node.js installed (v14+)
- Google account with admin access
- Basic knowledge of Google Sheets

## 5-Step Quick Start

### Step 1: Google Cloud Setup (5 minutes)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project: "UCAGS-CRM"
3. Enable these APIs:
   - Google Sheets API
   - Gmail API
   - Google Calendar API
4. Create a Service Account:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "Service Account"
   - Download the JSON key file

### Step 2: Google Sheets Setup (3 minutes)

1. Create a new Google Sheet named "UCAGS CRM - Admin Database"
2. Create two sheets inside:
   - **Admin Sheet** with columns:
     ```
     Enquiry ID | Full Name | Phone | Email | Course Interested | Source | Assigned Officer | Status | Follow-up Date | Notes | Created Date
     ```
   - **Officers Sheet** with columns:
     ```
     Username | Password | Name | Email | SheetID
     ```
3. Share the sheet with your service account email (from JSON file)
4. Copy the Sheet ID from the URL

### Step 3: Install & Configure (3 minutes)

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit .env with your values
# Minimum required:
# - GOOGLE_SERVICE_ACCOUNT_EMAIL (from JSON)
# - GOOGLE_PRIVATE_KEY (from JSON)
# - ADMIN_SHEET_ID (from sheet URL)
```

### Step 4: Add First Officer (2 minutes)

Generate password hash:
```bash
node -e "console.log(require('bcryptjs').hashSync('password123', 10))"
```

Add officer to Officers Sheet:
| Username | Password | Name | Email | SheetID |
|----------|----------|------|-------|---------|
| officer1 | [paste hash] | John Smith | john@ucags.edu.lk | (leave empty) |

### Step 5: Start Application (2 minutes)

```bash
# Start the server
npm start

# Open browser
# http://localhost:3000

# Login
# Username: admin
# Password: admin123
```

## Test It Out

1. Go to `http://localhost:3000/form.html`
2. Submit a test enquiry
3. Check the Admin Google Sheet
4. Login to CRM and view the enquiry

## What's Next?

- [Full Setup Guide](SETUP.md) - Detailed configuration
- [Deployment Guide](DEPLOYMENT.md) - Production deployment
- [API Documentation](API.md) - API reference

## Quick Troubleshooting

**Can't login?**
- Check .env file has correct credentials
- Verify service account JSON is correct

**No enquiries showing?**
- Check service account has access to sheet
- Verify ADMIN_SHEET_ID is correct
- Check sheet name is "Admin"

**Emails not sending?**
- Enable Gmail API in Google Cloud
- Set up domain-wide delegation
- Verify GMAIL_DELEGATED_USER

## Need Help?

Email: it-support@ucags.edu.lk

---

**That's it!** Your CRM is ready to use. 🎉
