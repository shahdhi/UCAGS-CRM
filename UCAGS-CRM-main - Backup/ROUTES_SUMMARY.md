# Backend Routes & Services Summary

## 1. Registrations Module
**File:** `backend/modules/registrations/registrationsRoutes.js`

**Purpose:** Handle student registration intake and management, including assignment to officers and enrollment workflows.

**Environment Variables:**
- `SUPABASE_URL` / `SUPABASE_KEY` (via getSupabaseAdmin)
- Sheet-based auth (Google Sheets client)

**External Services:**
- **Supabase:** registrations, programs, program_batches, payments, students, registrations tables
- **Google Sheets:** Export registrations to batch admin spreadsheets (push-only)

**Key Express Routes:**
- `POST /api/registrations/intake` — Public endpoint for registration form submission
- `GET /api/registrations/my?limit=100` — Officer's assigned registrations (requires isAdminOrOfficer)
- `GET /api/registrations/admin?limit=100` — Admin list all registrations (requires isAdmin)
- `PUT /api/registrations/admin/:id/assign` — Update registration assignment (requires isAdmin)
- `POST /api/registrations/:id/payments` — Add/update payment for a registration (requires isAdminOrOfficer)
- `DELETE /api/registrations/:id/payments` — Remove payments (requires isAdminOrOfficer)
- `GET /api/registrations/:id/payments` — List payments for a registration (requires isAdminOrOfficer)
- `POST /api/registrations/admin/:id/enroll` — Create student record and mark registration as enrolled (requires isAdmin)
- `DELETE /api/registrations/admin/:id` — Delete registration and related payments (requires isAdmin)
- `POST /api/registrations/admin/export-sheet` — Export registrations to Google Sheet (requires isAdmin)

**Key Features:**
- Phone number normalization (Sri Lanka format)
- Automatic assignee inference from leads sheet
- XP awards for registration received (+40) and payment received (+100)
- Lead status sync to crm_leads table
- Installment payment plan support
- Dynamic Google Sheets export with payload field expansion

---

## 2. Payments Module
**File:** `backend/modules/payments/paymentsRoutes.js`

**Purpose:** Manage payment tracking, installment plans, and payment confirmations with status calculation.

**Environment Variables:**
- `SUPABASE_URL` / `SUPABASE_KEY`

**External Services:**
- **Supabase:** payments, registrations, program_batches, officer_xp_summary, officer_xp_events, receipts tables

**Key Express Routes:**
- `GET /api/payments/admin/summary?programId=...&batchName=...&status=...&limit=200&type=...` — Admin payment summary with status filtering (requires isAdmin)
- `GET /api/payments/coordinator/summary?programId=...&batchName=...` — Batch coordinator payment summary (requires isAdminOrOfficer)
- `GET /api/payments/coordinator/registration/:registrationId` — Coordinator view all payments for a registration (requires isAdminOrOfficer)
- `PUT /api/payments/coordinator/:id` — Coordinator update payment fields (requires isAdminOrOfficer)
- `GET /api/payments/admin/registration/:registrationId` — Admin view all payments for a registration (requires isAdmin)
- `GET /api/payments/admin?limit=200` — Admin list all payments (requires isAdmin)
- `PUT /api/payments/admin/:id` — Admin update payment fields including receipt_no (requires isAdmin)
- `POST /api/payments/admin/:id/confirm` — Confirm payment and auto-generate receipt_no (requires isAdmin)
- `POST /api/payments/admin/:id/unconfirm` — Undo payment confirmation (requires isAdmin)

**Key Features:**
- Status calculation (due, overdue, upcoming, completed) based on date ranges
- Installment tracking with window calculations
- Coordinator batch access control
- XP award on payment confirmation (+100)
- Automatic lead status sync to "Enrolled" when payment saved
- Receipt auto-creation via DB trigger

---

## 3. Receipts Module
**File:** `backend/modules/receipts/receiptsRoutes.js`

**Purpose:** Generate PDF receipts for payments with UCAGS branding.

**Environment Variables:**
- `SUPABASE_URL` / `SUPABASE_KEY`

**External Services:**
- **Supabase:** payments, registrations, receipts tables
- **File system:** logo.png, seal.png (from project root), San Francisco fonts (optional)

**Key Express Routes:**
- `POST /api/receipts/generate` — Generate custom receipt PDF (requires isAdmin)
- `GET /api/receipts/next-number` — Get next receipt number preview (requires isAdmin)
- `GET /api/receipts/payment/:paymentId` — Download receipt PDF for a payment (requires isAdmin)
- `GET /api/receipts/version` — Debug endpoint to check loaded version (requires isAdmin)

**Key Features:**
- Custom PDF generation with pdfkit (A4 size, 420x595pt)
- UCAGS purple branding (#5B2C6F, #E8DFF5)
- Receipt number auto-generation (UC0001, UC0002, etc.)
- Dynamic font fallback (SF Pro → Helvetica)
- Logo and seal image embedding
- Table rendering for payment line items
- Ordinal date formatting ("11th of January 2026")

---

## 4. Students Module
**File:** `backend/modules/students/studentsRoutes.js`

**Purpose:** Admin-only listing and management of enrolled students.

**Environment Variables:**
- `SUPABASE_URL` / `SUPABASE_KEY`

**External Services:**
- **Supabase:** students, registrations tables

**Key Express Routes:**
- `GET /api/students/admin?limit=200&search=` — List enrolled students with optional search (requires isAdmin)
- `DELETE /api/students/admin/:id` — Delete student and revert registration to not enrolled (requires isAdmin)

**Key Features:**
- Search by student_id, name, phone_number, email
- Automatic registration unenrollment on student deletion
- Payload fallback for missing columns (backward compatibility)

---

## 5. Admissions Module
**File:** `backend/modules/admissions/admissionsRoutes.js`

**Purpose:** Placeholder for future admissions processing functionality.

**Environment Variables:** None

**External Services:** None

**Key Express Routes:**
- `GET /api/admissions` — Returns 501 Not Implemented placeholder

**Status:** Not yet implemented

---

## 6. Calendar Tasks Module
**File:** `backend/modules/calendar/calendarTasksRoutes.js`

**Purpose:** Personal and global task management for officers.

**Environment Variables:**
- `SUPABASE_URL` / `SUPABASE_KEY`

**External Services:**
- **Supabase:** calendar_tasks table

**Key Express Routes:**
- `GET /api/calendar/tasks?mode=me|officer|everyone&officer=...&from=...&to=...` — List tasks filtered by owner and date range (requires isAuthenticated)
- `POST /api/calendar/tasks` — Create a task for self or another officer (admin only) (requires isAuthenticated)
- `DELETE /api/calendar/tasks/:id` — Delete a task (requires isAuthenticated)

**Key Features:**
- Role-based visibility (admin can see all, officers see own)
- Repeat scheduling (none, daily, weekly, monthly)
- Global vs. personal visibility toggle
- Owner assignment for cross-officer task creation

---

## 7. Follow-up Calendar Module
**File:** `backend/modules/calendar/followupCalendarRoutes.js`

**Purpose:** Retrieve follow-up events from Google Sheets for calendar display.

**Environment Variables:**
- `SUPABASE_URL` / `SUPABASE_KEY`

**External Services:**
- **Google Sheets:** Read follow-up calendar data

**Key Express Routes:**
- `GET /api/calendar/followups?officer=...` — Retrieve follow-up calendar events (requires isAuthenticated)

**Key Features:**
- Quota handling (429 error with Retry-After header)
- Officer-based filtering (admin can filter by officer, officers see own)

---

## 8. Demo Sessions Module
**File:** `backend/modules/demoSessions/demoSessionsRoutes.js`

**Purpose:** Manage demo session invitations and scheduling.

**Environment Variables:**
- `SUPABASE_URL` / `SUPABASE_KEY`

**External Services:**
- **Supabase:** demo_sessions, demo_session_invites, crm_leads, officer_xp_events, officer_xp_summary tables

**Key Express Routes:**
- `GET /api/demo-sessions/sessions?batch=...` — List demo sessions for a batch (requires isAdminOrOfficer)
- `POST /api/demo-sessions/sessions` — Create/ensure demo session (requires isAdminOrOfficer)
- `GET /api/demo-sessions/leads/:crmLeadId` — List demo invites for a lead (requires isAdminOrOfficer)
- `GET /api/demo-sessions/invites?sessionId=...&officerId=...` — List invites for a session (requires isAdminOrOfficer)
- `POST /api/demo-sessions/invite` — Invite a lead to a demo session (requires isAdminOrOfficer)
- `PATCH /api/demo-sessions/invites/:id` — Update demo invite (attendance, status, etc.) (requires isAdminOrOfficer)
- `DELETE /api/demo-sessions/invites/:id` — Delete a demo invite (requires isAdminOrOfficer)
- `GET /api/demo-sessions/invites/:id/reminders` — List reminders for an invite (requires isAdminOrOfficer)
- `POST /api/demo-sessions/invites/:id/reminders` — Add a reminder to an invite (requires isAdminOrOfficer)

**Key Features:**
- XP award on attendance marked (+30 for "Attended")
- XP deduplication by invite ID
- Reminder scheduling
- Officer assignment tracking

---

## 9. Analytics Module
**File:** `backend/modules/analytics/analyticsRoutes.js`

**Purpose:** Placeholder for future analytics and reporting functionality.

**Environment Variables:** None

**External Services:** None

**Key Express Routes:**
- `GET /api/analytics` — Returns 501 Not Implemented placeholder

**Status:** Not yet implemented

---

## 10. XP Routes & Service
**Files:** 
- `backend/modules/xp/xpRoutes.js` (routes)
- `backend/modules/xp/xpService.js` (service logic)

**Purpose:** Gamification system for officers - XP awards, leaderboard, and trend tracking.

**Environment Variables:**
- `SUPABASE_URL` / `SUPABASE_KEY`

**External Services:**
- **Supabase:** officer_xp_events, officer_xp_summary, crm_lead_followups tables
- **Supabase Auth:** listUsers() for user metadata

**Key Express Routes:**
- `GET /api/xp/leaderboard` — Get all officers ranked by XP (requires isAdminOrOfficer)
- `GET /api/xp/me` — Get personal XP summary + recent events (requires isAuthenticated)
- `GET /api/xp/trend?days=30` — Get personal XP trend over time (requires isAuthenticated)
- `GET /api/xp/global-trend?days=30` — Get global XP trend for all officers (requires isAdmin)
- `POST /api/xp/cron/overdue` — Trigger overdue followup penalty (requires isAdmin)

**XP Events (from xpService.js):**
- `lead_contacted` +2 — Lead status changed from 'New'
- `followup_completed` +1/+2 — Followup marked complete (+2 if answered=yes)
- `registration_received` +40 — New registration submission
- `payment_received` +100 — Payment confirmed
- `demo_attended` +30 — Demo session invite marked 'Attended'
- `attendance_on_time` +1 — Check-in before 10:00 AM (SL time)
- `checklist_completed` +2 — Daily checklist snapshot saved
- `report_submitted` +2 — Daily report slot submitted
- `lead_responded_fast` +2 — First followup within 1h of lead assignment
- `followup_overdue` -5 — Followup overdue 1+ day (daily cron)

**Key Service Functions:**
- `awardXP()` — Award XP for an event
- `awardXPOnce()` — Deduped XP award (only once per referenceId)
- `getLeaderboard()` — Ranked officer list
- `getMyXP()` — Personal XP + rank
- `getXPTrend()` — Daily XP totals (last N days)
- `getGlobalXPTrend()` — Combined XP trend for all
- `penaliseOverdueFollowups()` — Daily cron to deduct XP for overdue followups
- Sri Lanka timezone offset (UTC+5:30) applied throughout

---

## 11. Contacts Module
**File:** `backend/modules/contacts/contactsRoutes.js`

**Purpose:** Manage saved contacts with sync to Google Contacts and derivation from CRM leads.

**Environment Variables:**
- `SUPABASE_URL` / `SUPABASE_KEY`

**External Services:**
- **Supabase:** contacts, crm_leads, program_batches, programs tables

**Key Express Routes:**
- `POST /api/contacts/from-lead/:leadId` — Save contact from existing CRM lead (requires isAuthenticated)
- `GET /api/contacts/by-source?source_type=...&source_id=...` — Get contact by source (requires isAuthenticated)
- `GET /api/contacts?q=...&batch=...` — List contacts with search and batch filtering (requires isAuthenticated)
- `PUT /api/contacts/:id` — Update contact fields (requires isAuthenticated)
- `DELETE /api/contacts/:id` — Delete a contact (requires isAuthenticated)

**Key Features:**
- Automatic display name generation: `{OfficeInitial}/{ProgramLetter}/B{BatchNo} {Name}`
- Program-to-letter mapping (Psychology→P, IT&AI→I, Business→B, etc.)
- Officer assignment resolution via user ID or name
- Batch and program number extraction
- Role-based authorization (officers see only their assigned contacts)
- Source tracking (crm_leads table links)

---

## 12. Batch Setup Module
**File:** `backend/modules/batchSetup/batchSetupRoutes.js`

**Purpose:** Admin configuration for batch-specific settings (payments, demos, general).

**Environment Variables:**
- `SUPABASE_URL` / `SUPABASE_KEY`

**External Services:**
- **Supabase:** program_batches, batch_payment_plans, demo_session_config tables

**Key Express Routes:**
- `GET /api/batch-setup?programId=...&batchId=...&batchName=...` — Get batch configuration (requires isAdmin)
- `PUT /api/batch-setup` — Save batch configuration (requires isAdmin)

**Key Features:**
- Structured batch setup (general, payments, demo sections)
- Payment plan configuration
- Demo session settings storage

---

## 13. WhatsApp Module
**File:** `backend/modules/whatsapp/whatsappRoutes.js`

**Purpose:** Send WhatsApp messages and track conversation history.

**Environment Variables:**
- `WHATSAPP_PHONE_NUMBER_ID` — Meta Business Account phone number ID
- `WHATSAPP_ACCESS_TOKEN` — Meta API access token
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — Webhook verification token
- `WHATSAPP_APP_SECRET` — Webhook signature secret
- `WHATSAPP_BROCHURE_PDF_URL` — URL to brochure PDF
- `WHATSAPP_BROCHURE_FILENAME` — Display name for brochure
- `WHATSAPP_DEFAULT_COUNTRY_CODE` — Default country code (e.g., +94 for Sri Lanka)
- `WHATSAPP_DISPLAY_PHONE_NUMBER` — Display phone number

**External Services:**
- **Meta WhatsApp API:** Send text, images, documents
- **Supabase:** whatsapp_logs, crm_leads, user_leads tables (via logMessage, etc.)

**Key Express Routes:**
- `GET /api/whatsapp/leads/:leadPhone/history` — Get chat history for a lead (requires isAuthenticated)
- `POST /api/whatsapp/leads/:leadPhone/messages` — Send text message (requires isAuthenticated)
- `POST /api/whatsapp/leads/:leadPhone/attachments` — Send image or document (requires isAuthenticated)
- `POST /api/whatsapp/leads/:leadPhone/brochure` — Send brochure PDF (requires isAuthenticated)
- `GET /api/whatsapp/inbox/conversations?search=...` — List conversations (requires isAuthenticated)
- `GET /api/whatsapp/inbox/threads/:leadPhone` — Get thread for a lead (requires isAuthenticated)
- `GET /api/whatsapp/admin/chats?search=...` — Search all chats (requires isAdmin)
- `GET /api/whatsapp/webhook` — Meta webhook verification
- `POST /api/whatsapp/webhook` — Meta webhook for incoming messages and status updates

**Key Features:**
- Phone number normalization to E.164 format
- Message logging (inbound, outbound, status updates)
- Officer access control (see only assigned leads)
- Image vs. document auto-detection
- HMAC webhook signature verification
- Brochure auto-fallback to `/public/brochure.pdf`

---

## 14. Google Module
**File:** `backend/modules/google/googleRoutes.js`

**Purpose:** Google OAuth integration and Google Contacts sync.

**Environment Variables:**
- `GOOGLE_CLIENT_ID` — OAuth client ID
- `GOOGLE_CLIENT_SECRET` — OAuth client secret
- `GOOGLE_OAUTH_REDIRECT_URI` — OAuth redirect URI
- `SESSION_SECRET` — Secret for state signing (fallback: config.server.sessionSecret)
- `APP_URL` — Base URL for returnTo calculation

**External Services:**
- **Google OAuth 2.0:** User consent and token exchange
- **Google People API:** Read/write contacts
- **Supabase:** google_integrations table

**Key Express Routes:**
- `GET /api/google/oauth/connect-url` — Get OAuth consent URL as JSON (requires isAuthenticated)
- `GET /api/google/oauth/connect` — Redirect to OAuth consent (legacy, requires isAuthenticated)
- `GET /api/google/oauth/callback` — OAuth callback, token exchange and storage
- `GET /api/google/status` — Check if Google is connected (requires isAuthenticated)
- `POST /api/google/disconnect` — Disconnect Google account (requires isAuthenticated)
- `POST /api/google/contacts/sync` — Bulk sync contacts to Google (requires isAuthenticated)
- `POST /api/google/contacts/sync/:contactId` — Sync single contact to Google (requires isAuthenticated)

**Key Features:**
- State signing/verification for CSRF protection (10-minute expiry)
- Refresh token storage and refresh on expiry
- Atomic upsert (create or update) to Google Contacts
- Fallback from update to create if contact deleted in Google (404 handling)
- ETag support for optimistic concurrency
- Authorization check (officers sync only their assigned contacts)
- Dual auth support (Supabase user_id or legacy username)
- Email auto-fetch from Google userinfo endpoint

---

## Summary Table

| Module | Status | Primary Purpose | Auth Required | DB Tables Used |
|--------|--------|-----------------|----------------|-----------------|
| Registrations | ✅ Active | Registration intake & enrollment | isAdminOrOfficer | registrations, payments, students, programs |
| Payments | ✅ Active | Payment tracking & confirmation | isAdmin/isAdminOrOfficer | payments, registrations, receipts |
| Receipts | ✅ Active | PDF receipt generation | isAdmin | payments, registrations, receipts |
| Students | ✅ Active | Student enrollment list | isAdmin | students, registrations |
| Admissions | ⏳ Planned | Student admissions | None | None (placeholder) |
| Calendar Tasks | ✅ Active | Task management | isAuthenticated | calendar_tasks |
| Follow-up Calendar | ✅ Active | Follow-up calendar | isAuthenticated | Google Sheets |
| Demo Sessions | ✅ Active | Demo scheduling | isAdminOrOfficer | demo_sessions, demo_session_invites, crm_leads |
| Analytics | ⏳ Planned | Reporting | None | None (placeholder) |
| XP (Routes + Service) | ✅ Active | Gamification | isAuthenticated/isAdmin | officer_xp_events, officer_xp_summary, crm_lead_followups |
| Contacts | ✅ Active | Contact management | isAuthenticated | contacts, crm_leads, program_batches, programs |
| Batch Setup | ✅ Active | Batch configuration | isAdmin | program_batches, batch_payment_plans |
| WhatsApp | ✅ Active | Message sending | isAuthenticated | whatsapp_logs, crm_leads, user_leads |
| Google | ✅ Active | Google Contacts sync | isAuthenticated | google_integrations, contacts |
