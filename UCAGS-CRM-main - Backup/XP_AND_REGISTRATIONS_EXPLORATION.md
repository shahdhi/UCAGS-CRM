# XP and Registrations Integration - Complete Exploration

## Overview
This document summarizes the integration between XP (Experience Points) system and the Registrations module, including all related files and logic flows.

---

## 1. GREP FINDINGS

### 1.1 XP in Registrations (`backend/modules/registrations/`)
**Result:** No direct mentions of 'xp' in registrations directory files

### 1.2 Registrations in XP (`backend/modules/xp/`)
**Result:** No direct mentions of 'registration' in xp directory files

**Note:** Despite no grep matches, there IS integration via the backend/modules/registrations/registrationsRoutes.js file (see Section 2).

---

## 2. XP-REGISTRATIONS INTEGRATION POINTS

### 2.1 Backend: Registration Submission → XP Award (registrationsRoutes.js, lines 199-223)

When a registration is submitted via the `/api/registrations/intake` endpoint:

```javascript
// XP: +40 for the assigned officer when a registration is received
try {
  const { awardXPOnce } = require('../xp/xpService');
  const assignedOfficerName = cleanString(data?.assigned_to || row.assigned_to);
  if (assignedOfficerName && data?.id) {
    const sb2 = getSupabaseAdmin();
    const { data: { users } } = await sb2.auth.admin.listUsers();
    const officerUser = (users || []).find(u => {
      const nm = String(u.user_metadata?.name || '').trim().toLowerCase();
      return nm === assignedOfficerName.toLowerCase();
    });
    if (officerUser?.id) {
      await awardXPOnce({
        userId: officerUser.id,
        eventType: 'registration_received',
        xp: 40,
        referenceId: data.id,
        referenceType: 'registration',
        note: `Registration received: ${data.name || 'student'}`
      });
    }
  }
} catch (xpErr) {
  console.warn('[XP] registration_received hook error:', xpErr.message);
}
```

**Key Details:**
- **XP Award:** +40 points
- **Event Type:** `registration_received`
- **Trigger:** When a registration is submitted via public intake form
- **Recipient:** The officer assigned to the registration
- **Idempotency:** Uses `awardXPOnce()` - prevents duplicate XP for same registration
- **Error Handling:** Non-fatal (errors are caught and logged, don't block registration)

---

## 3. XP SERVICE (`backend/modules/xp/xpService.js`)

### 3.1 XP Event Types & Point Values

| Event Type | XP | Source | Notes |
|---|---|---|---|
| `lead_contacted` | +2 | Lead status change | From 'New' status |
| `followup_completed` | +1/+2 | Followup tracking | +2 if answered=yes, +1 otherwise |
| `registration_received` | +40 | **Registration intake** | **This is the registrations integration** |
| `payment_received` | +100 | Payment tracking | When payment confirmed |
| `demo_attended` | +30 | Demo session | Marked as 'Attended' |
| `attendance_on_time` | +1 | Check-in | Before 10:00 AM (SL time) |
| `checklist_completed` | +2 | Daily checklist | Snapshot saved |
| `report_submitted` | +2 | Daily report | 1 per slot |
| `lead_responded_fast` | +2 | Quick response | Followup within 1h of assignment |
| `followup_overdue` | -5 | Daily cron penalty | 1+ day past scheduled date |

### 3.2 Core XP Functions

#### `awardXP(opts)`
- Main function to award/deduct XP
- Inserts event into `officer_xp_events` table
- Updates `officer_xp_summary` table (upserts total_xp)
- **XP floor:** Never goes below 0
- Returns the saved event row

#### `awardXPOnce(opts)`
- **Deduped version** used in registrations integration
- Checks if `(user, eventType, referenceId)` combo already awarded
- Only awards if not previously awarded
- Used in `registration_received` to prevent double-awarding for same registration ID

#### `awardXPSafe(opts)`
- Error-suppressing wrapper
- Logs warnings but never throws
- Used when XP failure shouldn't block main operations

#### `alreadyAwarded(opts)`
- Helper to check deduplication
- Returns `true` if event exists for (userId, eventType, referenceId)

### 3.3 Database Tables

**`officer_xp_events`**
- `user_id` - Officer who earned/lost XP
- `event_type` - Type of event (e.g., 'registration_received')
- `xp` - Points (positive or negative)
- `reference_id` - ID of referenced object (e.g., registration ID)
- `reference_type` - Type of reference (e.g., 'registration')
- `note` - Optional description
- `created_at` - Timestamp

**`officer_xp_summary`**
- `user_id` - Officer ID
- `total_xp` - Total accumulated XP (floored at 0)
- `last_updated` - Last update timestamp

---

## 4. XP ROUTES (`backend/modules/xp/xpRoutes.js`)

### Endpoints:

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/api/xp/leaderboard` | admin/officer | Ranked officers by XP |
| GET | `/api/xp/me` | authenticated | Personal XP summary + recent events |
| GET | `/api/xp/trend` | authenticated | Personal XP trend (last N days, default 30) |
| GET | `/api/xp/global-trend` | admin | Global XP trend (all officers, default 30 days) |
| POST | `/api/xp/cron/overdue` | admin | Manually trigger overdue penalty |

---

## 5. XP CRON JOB (`backend/modules/xp/xpCron.js`)

### Overdue Followup Penalty

- **Runs:** Daily at midnight (Sri Lanka time ≈ 18:30 UTC)
- **Logic:** Finds open followups 1+ day past scheduled date → deducts -5 XP
- **Idempotency:** Uses `referenceId = {followup_id}:{YYYY-MM-DD}` to prevent double-penalty
- **Scheduling:** Uses `setInterval` (no external cron library)

---

## 6. FRONTEND REGISTRATION PAGES

### 6.1 `/public/frontend/pages/registrations/registrationsPage.js` (Admin)

**Key Features:**
- Displays all registrations for admins
- Shows payment status badge
- Shows enrollment status with "Enroll" button for non-enrolled
- Shows assigned officer
- Edit/delete registrations
- Export to Google Sheet

**Payment Integration:**
- Toggle payment form in registration details modal
- Save payment details to database
- Delete saved payments
- Prefill with existing payment data

**Enrollment Integration:**
- "Enroll" button creates student record
- Generates student_id
- Updates registration as enrolled

**XP Note:** Frontend does NOT directly reference XP - XP is awarded server-side on registration submission.

### 6.2 `/public/frontend/pages/registrations/myRegistrationsPage.js` (Officer)

**Key Features:**
- Officers see only their assigned registrations
- Similar payment tracking as admin page
- No delete/admin actions (hidden for officers)
- Program and batch filtering

**Key Difference:** No enrollment capability - officers cannot enroll registrations.

---

## 7. REGISTRATION FLOW WITH XP

```
┌─ User submits registration via /Register page
│
├─ POST /api/registrations/intake
│  ├─ Validate program + batch
│  ├─ Normalize phone number
│  ├─ Find assigned officer (by phone lookup or explicit)
│  ├─ Insert into registrations table
│  │
│  ├─ SYNC OPERATIONS (best-effort, non-blocking):
│  │  ├─ Notify assigned officer + admins
│  │  ├─ Update lead status in crm_leads to 'Registered'
│  │  │
│  │  └─ ⭐ XP AWARD ⭐
│  │     └─ awardXPOnce({
│  │        userId: officerUser.id,
│  │        eventType: 'registration_received',
│  │        xp: 40,
│  │        referenceId: registration.id,
│  │        referenceType: 'registration',
│  │        note: 'Registration received: {name}'
│  │     })
│  │
│  └─ Return success + registration object
│
└─ Frontend shows registration in My Registrations / Registrations list
   (XP is reflected in officer's leaderboard ranking)
```

---

## 8. NO DIRECT MENTIONS - WHY?

The grep searches found:
- ❌ No 'xp' in `backend/modules/registrations/`
- ❌ No 'registration' in `backend/modules/xp/`

**Reason:** The integration is **one-directional**:
1. Registrations module **imports and calls** XP service (`require('../xp/xpService')`)
2. XP module has NO dependency on registrations module
3. XP module is generic - it doesn't know about registrations, it just stores events

This is clean architecture: registrations knows about XP as a dependency, but XP doesn't depend on registrations.

---

## 9. KEY FINDINGS SUMMARY

### Registration-XP Integration
- ✅ **When triggered:** Registration form submission via `/api/registrations/intake`
- ✅ **What happens:** +40 XP awarded to assigned officer
- ✅ **How it's tracked:** Event stored in `officer_xp_events` with:
  - `eventType: 'registration_received'`
  - `referenceId: registration.id` (for deduplication)
  - `referenceType: 'registration'`
- ✅ **Deduplication:** Uses `awardXPOnce()` - safe to call multiple times
- ✅ **Error handling:** Non-fatal - won't block registration if XP fails

### Related XP Operations
- Payment receives +100 XP (but NOT integrated in registrations code - separate payment module)
- Overdue followups lose -5 XP (daily cron job, separate from registrations)
- 9 other event types tracked for officers

### Frontend Integration
- **Admin page** (`registrationsPage.js`): Full CRUD, payments, enrollment
- **Officer page** (`myRegistrationsPage.js`): View/pay registrations, no delete/enroll
- **No XP UI on frontend:** XP calculated server-side, reflected in leaderboard

### Database Tables
- `officer_xp_events` - Event log
- `officer_xp_summary` - Total XP per officer
- `registrations` - Registration submissions
- `payments` - Payment tracking (separate module)

---

## 10. FILES INVOLVED

### Backend
- `backend/modules/registrations/registrationsRoutes.js` - **XP award on registration** (lines 199-223)
- `backend/modules/xp/xpService.js` - Core XP logic + awardXPOnce()
- `backend/modules/xp/xpRoutes.js` - XP API endpoints
- `backend/modules/xp/xpCron.js` - Daily overdue penalty cron
- `backend/modules/registrations/registrationAssignmentService.js` - Helper for officer assignment

### Frontend
- `public/frontend/pages/registrations/registrationsPage.js` - Admin registrations UI
- `public/frontend/pages/registrations/myRegistrationsPage.js` - Officer registrations UI

---

## 11. POTENTIAL IMPROVEMENTS/QUESTIONS

1. **Consistency:** Payment also awards XP (+100), but code not found in registrations module - is it in a separate payment module?
2. **Frontend display:** Officers can see their XP in leaderboard, but not explicitly tied to registrations they received
3. **Feedback loop:** No UI indication when officer earns XP from registrations (would require real-time sync or page refresh)
4. **Multiple registrations:** If same officer assigned to multiple registrations, they get +40 each (correct behavior)

