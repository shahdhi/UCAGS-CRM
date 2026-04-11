# Code Analysis Summary

## Files Reviewed

### 1. backend/modules/paymentSetup/batchPaymentSetupRoutes.js
**Purpose**: Manages batch payment configuration (methods and plans with installments)

**Key Endpoints**:
- `GET /api/payment-setup/batches/:batchName` - Read payment methods, plans, and installments for a batch
- `PUT /api/payment-setup/batches/:batchName` - Configure payment methods and plans with installment details

**Key Data Structures**:
- **Payment Methods**: Simple list of method names (e.g., "Bank Transfer", "Cash")
- **Payment Plans**: Define `plan_name`, `installment_count`, and `due_dates[]`
- **Installments**: Created from plans, stored with `installment_no`, `plan_id`, `batch_name`, and `due_date`

**Key Operations**:
- Validates plan names and installment counts
- Creates placeholder installment records (installments 2..N) only when needed
- One plan can have multiple installments with different due dates
- Uses `batch_payment_installments` table with `installment_no` (1-based)

---

### 2. backend/modules/payments/paymentsRoutes.js
**Purpose**: Manages payment records and provides payment summaries for admin/coordinator roles

**Key Endpoints**:
- `GET /api/payments/admin/summary` - Summary of payments grouped by registration (one row per registration)
- `GET /api/payments/coordinator/summary` - Same but restricted to coordinator's batch
- `GET /api/payments/admin/registration/:registrationId` - All payment records for a specific registration
- `PUT /api/payments/admin/:id` - Update payment fields (amount, date, method, plan, slip/receipt status)
- `POST /api/payments/admin/:id/confirm` - Confirm payment and create receipt
- `POST /api/payments/admin/:id/unconfirm` - Undo payment confirmation

**Payment Schema** (from code):
```
{
  id, registration_id, program_id, batch_name,
  payment_plan, payment_method,
  installment_no, installment_due_date,
  amount, payment_date,
  slip_received, receipt_received, receipt_no,
  is_confirmed, confirmed_at, confirmed_by,
  email_sent, whatsapp_sent,
  created_at
}
```

**Key Logic**:
- **Current Installment Selection**: Sorted by `installment_no` ascending, then by `created_at`
  - Default: first unpaid (not `is_confirmed`) record, or first record if all paid
  - Can filter by specific installment (e.g., `type=installment_1`) or `full_payment`
- **Status Computation**: Compares today's date against window_start_date and window_end_date
  - window_start_date = registration's created_at (for installment 1) or previous installment's due_date
  - window_end_date = current installment's due_date or payment_date
  - Status: `upcoming` → `due` → `overdue` → `completed` (when confirmed)
- **Multiple Payments Per Registration**: One registration can have multiple payment records (one per installment)
- **Confirmation Flow**: Automatically creates receipt record and generates receipt_no via DB trigger

---

### 3. backend/core/batches/batchSheetsCache.js
**Purpose**: Caches Google Sheets tab/sheet names per batch to reduce API quota usage

**Key Functions**:
- `getCachedSheets(batchName)` - Retrieves cached sheet names
- `setCachedSheets(batchName, sheets)` - Updates cache with upsert

**Storage**:
- Uses `batch_sheets` table with columns: `batch_name`, `sheets` (text array), `updated_at`
- No direct relationship to payments; purely for caching metadata

---

## Search Results: 'registration_fee' and 'installment'

### 'registration_fee'
**Result**: No matches found in any backend files.

This suggests:
- No explicit "registration_fee" field in the payment system
- Fees may be handled as payment amounts or within program/batch metadata
- Could be stored in registration payload or not yet implemented

### 'installment' Usage Locations

1. **batchPaymentSetupRoutes.js** (14 occurrences)
   - Line 49-57: Query `batch_payment_installments` table
   - Lines 85, 117: Validate and store `installment_count` in plans
   - Lines 129-137: Generate installment placeholder records with `installment_no` (1..N)

2. **paymentsRoutes.js** (27 occurrences)
   - Lines 76-78: Comments about installment filtering in summary endpoint
   - Lines 120-154: Admin summary algorithm sorting/filtering by `installment_no`
   - Lines 252-275: Coordinator summary using same algorithm
   - Lines 259-265: Type filter `installment_1`, `installment_2`, etc. for filtering specific installments

3. **dashboardRoutes.js** (11 occurrences)
   - Lines 146-152, 418-419, 557-558: Query payments with `installment_no = 1` (first installment only)
   - Used to track "first payment" metrics for dashboard

4. **registrationsRoutes.js** (19 occurrences)
   - Lines 384-412: Query `batch_payment_plans` for `installment_count`
   - Lines 423-434: Create first payment record with `installment_no = 1`
   - Lines 464-481: Generate placeholder records (2..N) when plan is multi-installment
   - Lines 212-225: Query payments with `installment_no` to track payment status

5. **receiptsRoutes.js** (1 occurrence)
   - Line 523-524: Use `installment_no` to generate receipt description (e.g., "1st Installment", "2nd Installment")

---

## Key Architecture Insights

### Payment Flow
1. **Batch Setup**: Admin configures payment plans with installment counts and due dates
2. **Registration**: When user registers, first payment record created with `installment_no=1`
3. **Placeholder Creation**: If plan has N installments, placeholder records created for 2..N
4. **Payment Processing**: Each installment tracked separately; user can pay one or multiple
5. **Confirmation**: Admin confirms payment → system auto-generates receipt

### Data Model
- **One Registration**: Can have multiple payment records (one per installment)
- **Installment Number**: Sequential 1-based number matching plan's `installment_count`
- **Due Date**: Comes from batch plan configuration
- **Status**: Computed on-the-fly based on confirmation and due dates

### No 'registration_fee' Concept
- System uses `payment_plan` and `payment_method` fields
- Individual amounts stored in `amount` field per payment record
- No explicit registration fee vs. course fee distinction visible in code
