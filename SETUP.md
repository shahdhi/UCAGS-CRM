# UCAGS CRM - Setup Guide

This guide will walk you through the complete setup process for the UCAGS Student Enquiry & Admissions CRM System.

## Table of Contents
1. [Google Cloud Setup](#google-cloud-setup)
2. [Google Sheets Setup](#google-sheets-setup)
3. [Google Apps Script Setup](#google-apps-script-setup)
4. [Application Configuration](#application-configuration)
5. [Running the Application](#running-the-application)
6. [User Setup](#user-setup)
7. [Testing](#testing)

---

## 1. Google Cloud Setup

### Step 1.1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click on **"Select a project"** → **"New Project"**
3. Enter project name: `UCAGS-CRM`
4. Click **"Create"**

### Step 1.2: Enable Required APIs

1. In the Google Cloud Console, go to **"APIs & Services"** → **"Library"**
2. Search for and enable the following APIs:
   - **Google Sheets API**
   - **Gmail API**
   - **Google Calendar API**

### Step 1.3: Create a Service Account

1. Go to **"APIs & Services"** → **"Credentials"**
2. Click **"Create Credentials"** → **"Service Account"**
3. Enter details:
   - Name: `ucags-crm-service`
   - Service account ID: `ucags-crm-service`
   - Description: `Service account for UCAGS CRM`
4. Click **"Create and Continue"**
5. Skip role assignment (click **"Continue"**)
6. Click **"Done"**

### Step 1.4: Create Service Account Key

1. Click on the newly created service account
2. Go to the **"Keys"** tab
3. Click **"Add Key"** → **"Create new key"**
4. Select **"JSON"** format
5. Click **"Create"** (the key file will download)
6. **Important**: Keep this file secure - it contains sensitive credentials

### Step 1.5: Enable Domain-Wide Delegation

1. In the service account details, check **"Enable Google Workspace Domain-wide Delegation"**
2. Click **"Save"**
3. Note the **"Client ID"** (you'll need this for Google Workspace setup)

### Step 1.6: Configure Domain-Wide Delegation in Google Workspace

**Note**: This requires Google Workspace Admin access.

1. Go to [Google Admin Console](https://admin.google.com/)
2. Navigate to **"Security"** → **"Access and data control"** → **"API Controls"**
3. Click **"Manage Domain Wide Delegation"**
4. Click **"Add new"**
5. Enter the **Client ID** from your service account
6. Add the following OAuth scopes (one per line):
   ```
   https://www.googleapis.com/auth/spreadsheets
   https://www.googleapis.com/auth/gmail.send
   https://www.googleapis.com/auth/calendar
   ```
7. Click **"Authorize"**

---

## 2. Google Sheets Setup

### Step 2.1: Create the Admin Sheet

1. Go to [Google Sheets](https://sheets.google.com/)
2. Create a new spreadsheet named: **"UCAGS CRM - Admin Database"**
3. Rename the first sheet to: **"Admin"**
4. Add the following headers in row 1:

| A | B | C | D | E | F | G | H | I | J | K |
|---|---|---|---|---|---|---|---|---|---|---|
| Enquiry ID | Full Name | Phone | Email | Course Interested | Source | Assigned Officer | Status | Follow-up Date | Notes | Created Date |

5. Format the header row:
   - Bold text
   - Background color: Light blue
   - Freeze row 1

### Step 2.2: Create the Officers Sheet

1. In the same spreadsheet, create a new sheet named: **"Officers"**
2. Add the following headers in row 1:

| A | B | C | D | E |
|---|---|---|---|---|
| Username | Password | Name | Email | SheetID |

3. Format the header row (same as Admin sheet)

### Step 2.3: Add Officers

1. Add officer records in the Officers sheet
2. For passwords, use bcrypt hashed values. You can generate them using:

```javascript
// In Node.js
const bcrypt = require('bcryptjs');
const hashedPassword = bcrypt.hashSync('password123', 10);
console.log(hashedPassword);
```

Example officer record:
| Username | Password | Name | Email | SheetID |
|----------|----------|------|-------|---------|
| officer1 | $2a$10$... | John Smith | john.smith@ucags.edu.lk | (optional) |

### Step 2.4: Share the Admin Sheet with Service Account

1. Copy the service account email from your JSON key file (e.g., `ucags-crm-service@project-id.iam.gserviceaccount.com`)
2. Click **"Share"** button in the Admin sheet
3. Add the service account email with **"Editor"** permissions
4. Uncheck **"Notify people"**
5. Click **"Share"**

### Step 2.5: Get the Sheet ID

1. Look at the URL of your Admin spreadsheet
2. The Sheet ID is the long string between `/d/` and `/edit`
3. Example: `https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit`
4. Copy this ID - you'll need it for configuration

### Step 2.6: Create Individual Officer Sheets (Optional)

For each officer, you can create a separate sheet:
1. Create a new Google Sheet named: **"UCAGS CRM - [Officer Name]"**
2. Add the same columns as the Admin sheet
3. Share with the service account (Editor permissions)
4. Copy the Sheet ID
5. Add the Sheet ID to the Officers sheet in the "SheetID" column

---

## 3. Google Apps Script Setup

### Step 3.1: Open Apps Script Editor

1. Open your Admin Google Sheet
2. Go to **"Extensions"** → **"Apps Script"**

### Step 3.2: Add the Script

1. Delete any existing code in the editor
2. Copy the entire content from `scripts/google-apps-script.js`
3. Paste it into the Apps Script editor
4. Click **"Save"** (💾 icon)

### Step 3.3: Configure the Script

1. Update the `CONFIG` object at the top of the script:

```javascript
const CONFIG = {
  ADMIN_SHEET_NAME: 'Admin',
  OFFICERS_SHEET_NAME: 'Officers',
  WEBHOOK_URL: 'https://your-crm-domain.com/api/enquiries',
  EMAIL_FROM: 'admissions@ucags.edu.lk',
  CALENDAR_ID: 'primary'
};
```

### Step 3.4: Authorize the Script

1. Click **"Run"** → Select `onOpen` function
2. Click **"Run"**
3. A permission dialog will appear
4. Click **"Review permissions"**
5. Select your Google account
6. Click **"Advanced"** → **"Go to [project name] (unsafe)"**
7. Click **"Allow"**

### Step 3.5: Set Up Triggers

1. In the Apps Script editor, run the `setupTriggers` function once manually
2. This will create automatic triggers for:
   - Auto-assignment (every 10 minutes)
   - Follow-up reminders (daily at 9 AM)
   - Sheet synchronization (hourly)
   - Weekly reports (Monday at 8 AM)

3. To verify triggers:
   - Click on **"Triggers"** (⏰ icon) in the left sidebar
   - You should see 4 triggers listed

---

## 4. Application Configuration

### Step 4.1: Install Node.js Dependencies

```bash
cd ucags-crm
npm install
```

### Step 4.2: Create Environment File

```bash
cp .env.example .env
```

### Step 4.3: Configure Environment Variables

Edit `.env` file with your actual values:

```env
# Server Configuration
PORT=3000
NODE_ENV=development
SESSION_SECRET=your-random-secure-session-secret-min-32-chars

# Google Service Account
GOOGLE_SERVICE_ACCOUNT_EMAIL=ucags-crm-service@project-id.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour Private Key Here\n-----END PRIVATE KEY-----\n"

# Google Sheets Configuration
ADMIN_SHEET_ID=your-admin-sheet-id-from-url
ADMIN_SHEET_NAME=Admin

# Gmail Configuration
GMAIL_USER=admissions@ucags.edu.lk
GMAIL_DELEGATED_USER=admissions@ucags.edu.lk

# Google Calendar Configuration
CALENDAR_ID=primary

# Twilio Configuration (Optional - leave blank if not using)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Admin Credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# Application URL
APP_URL=http://localhost:3000
```

### Step 4.4: Extract Service Account Credentials

From your downloaded JSON key file, extract:

1. **Service Account Email**: Copy the `client_email` value
2. **Private Key**: Copy the entire `private_key` value (including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`)

**Important**: In the .env file, keep the private key as a single line with `\n` for newlines:
```
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
```

### Step 4.5: Generate Strong Session Secret

Generate a secure random session secret:

```bash
# On Linux/Mac
openssl rand -base64 32

# On Windows (PowerShell)
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

---

## 5. Running the Application

### Step 5.1: Development Mode

```bash
npm run dev
```

The server will start with auto-reload on file changes.

### Step 5.2: Production Mode

```bash
npm start
```

### Step 5.3: Access the Application

Open your browser and navigate to:
- **Main Application**: `http://localhost:3000`
- **Public Form**: `http://localhost:3000/form.html`

---

## 6. User Setup

### Step 6.1: Admin Login

1. Go to `http://localhost:3000`
2. Login with:
   - Username: `admin`
   - Password: `admin123` (or your custom password from .env)

### Step 6.2: Change Admin Password

**Important**: Change the default admin password immediately!

1. Update the `ADMIN_PASSWORD` in `.env` with a bcrypt hash
2. Generate hash:
```javascript
const bcrypt = require('bcryptjs');
console.log(bcrypt.hashSync('your-new-secure-password', 10));
```
3. Restart the server

### Step 6.3: Add Officers

Officers are managed in the Officers Google Sheet. To add a new officer:

1. Open the Officers sheet
2. Add a new row with:
   - Username: Unique username for login
   - Password: Bcrypt hashed password
   - Name: Officer's full name
   - Email: Officer's email address
   - SheetID: (Optional) Officer's individual sheet ID

3. Officers can login immediately (credentials refresh every 5 minutes)

---

## 7. Testing

### Step 7.1: Test Enquiry Submission

1. Go to `http://localhost:3000/form.html`
2. Fill out the form
3. Submit
4. Check the Admin Google Sheet - new enquiry should appear
5. The enquiry should be automatically assigned to an officer

### Step 7.2: Test Email Sending

1. Login to the CRM
2. Click on an enquiry
3. Click "Send Email"
4. Select "Acknowledgement"
5. Check the recipient's inbox

### Step 7.3: Test Calendar Integration

1. Login to the CRM
2. Open an enquiry
3. Click "Schedule Follow-up"
4. Enter a date
5. Check Google Calendar - event should be created

### Step 7.4: Test Officer Login

1. Logout from admin account
2. Login with officer credentials
3. Verify officer can only see assigned enquiries

---

## Troubleshooting

### Issue: "Error loading enquiries"

**Solution**: 
- Check service account has access to the sheet
- Verify ADMIN_SHEET_ID is correct
- Check Google Sheets API is enabled

### Issue: "Failed to send email"

**Solution**:
- Verify Gmail API is enabled
- Check domain-wide delegation is configured
- Ensure GMAIL_DELEGATED_USER has sending permissions

### Issue: "Cannot create calendar event"

**Solution**:
- Verify Google Calendar API is enabled
- Check service account has calendar delegation
- Ensure CALENDAR_ID is correct

### Issue: "Officers cannot login"

**Solution**:
- Verify officer exists in Officers sheet
- Check password is properly hashed
- Wait up to 5 minutes for credentials to refresh

---

## Next Steps

After completing setup:
1. Read [DEPLOYMENT.md](DEPLOYMENT.md) for production deployment
2. Customize email templates in `server/integrations/email.js`
3. Configure automatic backups for Google Sheets
4. Set up monitoring and logging
5. Train staff on using the CRM

---

**Setup Complete!** 🎉

Your UCAGS CRM system is now ready to use. For support, contact IT support at it-support@ucags.edu.lk.
