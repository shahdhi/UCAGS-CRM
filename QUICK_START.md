# ⚡ Quick Start Guide

## 🚀 Get Running in 5 Minutes

### Step 1: Configure Your Google Sheet ID (2 minutes)

1. Open your Google Sheet in browser
2. Copy the ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/[COPY_THIS_PART]/edit
   ```
3. Edit `.env` file and replace:
   ```env
   SHEET_ID=your-google-sheet-id-here
   ```
   with:
   ```env
   SHEET_ID=1ABC123xyz_your_actual_id_here
   ```

### Step 2: Share Your Sheet (1 minute)

1. Open the file `ucags-crm-d8465dffdfea.json`
2. Find `"client_email"` (looks like: `xyz@abc.iam.gserviceaccount.com`)
3. In your Google Sheet, click **Share**
4. Add that email with **Editor** access

### Step 3: Verify Sheet Structure (1 minute)

Your sheet should have these columns in Row 1:

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| Name | Phone | Email | Course | Status | Notes | Created Date | Source | Assigned To |

**Example Row 2:**
```
John Doe | 0771234567 | john@example.com | BSc IT | New | Interested | 2024-01-15 | Website |
```

### Step 4: Start Server (1 minute)

```bash
node backend/index.js
```

You should see:
```
🚀 UCAGS CRM Server Started
📍 Server URL: http://localhost:3000
```

### Step 5: Login & Test

1. Open browser: `http://localhost:3000`
2. Login:
   - **Username:** `admin`
   - **Password:** `admin123`
3. Click **Leads** in sidebar
4. You should see your data!

---

## ❓ Troubleshooting

### "Requested entity was not found"
→ Sheet ID not configured or sheet doesn't exist

### "Permission denied" or "Access denied"
→ Service account email not shared with sheet

### "Failed to authenticate"
→ Check that `ucags-crm-d8465dffdfea.json` exists in project root

### "No leads found" but you have data
→ Check column mapping in `backend/modules/leads/leadsService.js`

---

## 📚 Need More Info?

- **Detailed Setup:** See `SETUP_INSTRUCTIONS.md`
- **Architecture:** See `IMPLEMENTATION_SUMMARY.md`
- **Full README:** See `README_NEW.md`

---

## 🎯 What You Get

✅ **Leads Management** - View, search, filter, sort leads from Google Sheets
✅ **Auto-refresh** - Data updates every 30 seconds
✅ **Modern UI** - Clean, responsive design
✅ **Scalable** - Easy to add more modules later
✅ **Secure** - Service account authentication

---

**That's it! You're ready to go! 🎉**
