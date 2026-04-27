# CRM Payment Workflow

## Overview

Each student registration has **rows in the `payments` Supabase table** — one row per installment and one row for the registration fee. Payments are stored, displayed, and confirmed separately per row.

---

## API Routing (Critical)

All `/registrations/*` API calls from the frontend are routed by `public/frontend/services/apiService.js` **directly to the Supabase Edge Function**, NOT the Vercel backend.

```
Frontend → apiService.js → EDGE: https://xddaxiwyszynjyrizkmc.supabase.co/functions/v1/crm-registrations
```

> **Any payment logic changes must be made in:**
> `supabase/functions/crm-registrations/index.ts`
> Then deployed with: `supabase functions deploy crm-registrations`

The Vercel backend (`backend/modules/registrations/registrationsRoutes.js`) handles this route too but **is never called by the frontend for payments** — it is dead code for this flow.

---

## Payments Table Structure

Table: `payments` in Supabase

| Column | Description |
|---|---|
| `id` | UUID primary key |
| `registration_id` | FK to `registrations` |
| `installment_no` | `0` = Registration Fee, `1` = 1st installment, `2..N` = subsequent installments |
| `amount` | Amount in LKR |
| `payment_date` | Date of payment |
| `payment_plan` | Plan name string |
| `payment_plan_id` | FK to `batch_payment_plans` |
| `slip_received` / `receipt_received` | Boolean flags |
| `is_confirmed` | Whether admin has confirmed this payment |
| `batch_name`, `program_id`, `program_name`, `registration_name` | Denormalised snapshot |

### `installment_no` sentinel values
- **`0`** → Registration Fee row
- **`1`** → First installment (the one the officer fills in when saving payment received)
- **`2..N`** → Placeholder rows auto-created, filled in later

---

## Payment Save Flow (POST `/:id/payments`)

**Function:** `handleAddPayment()` in `supabase/functions/crm-registrations/index.ts`

**Triggered by:** Officer or admin clicking "Save Payment" on a registration.

### Steps

1. **Parse body** — `payment_method`, `payment_plan`, `payment_date`, `amount`, `reg_fee_amount`, `reg_fee_date`
2. **Load registration row** — snapshots `name`, `batch_name`, `program_id`, `program_name`
3. **Load plan config** from `batch_payment_plans` — gets `installment_count` and `plan_id`
4. **Load due dates** from `batch_payment_installments` for the plan
5. **Upsert installment #1 row** — if a row with `installment_no=1` exists, update it; otherwise insert it
6. **Create placeholder rows 2..N** — inserts empty rows (`amount=0`) for each remaining installment if they don't already exist
7. **Upsert reg fee row (`installment_no=0`)** — always, unconditionally. Uses `reg_fee_amount` from body (or 0 as placeholder). Strict null check used to avoid `Number(null)===0` false match.
8. **Sync CRM lead status** → `Enrolled`
9. **Award XP** (+100) to assigned officer (non-fatal, best-effort)

---

## Frontend Pages

### Admin — `public/frontend/pages/registrations/registrationsPage.js`
- Opens a registration modal with a "Payment received" toggle
- Has a yellow **Registration Fee** section (date + amount fields) shown for non-early-bird plans
- Plan `<option>` elements carry `data-reg-fee` and `data-early-bird` attributes populated from `/api/payment-setup/batches/:batchName`
- On save: sends `reg_fee_amount` and `reg_fee_date` alongside installment fields
- On prefill: finds `installment_no=1` for the main form, `installment_no=0` (with strict null check) for reg fee fields

### Officer — `public/frontend/pages/registrations/myRegistrationsPage.js`
- Simpler version of the same flow
- Sends `reg_fee_amount` from `data-reg-fee` attribute on the selected plan option

### Payments — `public/frontend/pages/payments/paymentsPage.js`
- Displays all payment rows across all registrations
- `installment_no=0` displayed as **"Registration Fee"** everywhere (strict null check required)
- Filter `reg_fee_only` matches rows where `installment_no === 0` (with null guard)
- Modal header uses `=== 0 && !== null` check to label correctly

---

## Payments Admin Summary (GET — Vercel backend)

Routes in `backend/modules/payments/paymentsRoutes.js` **are** used for:
- `GET /api/payments/admin/summary` — admin payments list with filters
- `GET /api/payments/coordinator/summary` — coordinator-scoped list
- `POST /api/payments/:id/confirm` — confirm a payment row
- `POST /api/payments/:id/unconfirm` — unconfirm a payment row

These query the `payments` table directly via the service role client. The `reg_fee` type filter uses strict null check: `r.installment_no !== null && r.installment_no !== undefined && Number(r.installment_no) === 0`.

---

## Key Gotchas

| Gotcha | Detail |
|---|---|
| `Number(null) === 0` is `true` in JS | Always guard with `!== null && !== undefined` before comparing `installment_no === 0` |
| Payment logic lives in the Edge Function | Changes to Vercel `registrationsRoutes.js` for the POST payment endpoint have no effect |
| Reg fee row is always inserted | Even if `reg_fee_amount=0` — it's a placeholder row, amount updated when confirmed |
| `existingFirst` fallback | `find(installment_no=1) ?? rows[0]` — if no row with `installment_no=1` exists, updates the first row; avoids duplicates on re-save |
