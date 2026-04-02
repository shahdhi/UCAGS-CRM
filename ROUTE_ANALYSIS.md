# Backend Route Analysis Summary

## 1. leadsRoutes.js
| Endpoint | HTTP Method | Supabase/External | Complexity |
|----------|-------------|------------------|-----------|
| `/api/leads` | GET | Supabase (crm_leads) + Google Sheets | Medium |
| `/api/leads/batches` | GET | Google Sheets API | Medium |
| `/api/leads/batches-all` | GET | Google Sheets API | Medium |
| `/api/leads/stats` | GET | Supabase (crm_leads) | Simple |
| `/api/leads/:id` | GET | Supabase (crm_leads) | Simple |
| `/api/leads` | POST | Supabase (crm_leads) | Simple |
| `/api/leads/:id` | PUT | Supabase (crm_leads) + Google Sheets | Medium |
| `/api/leads/:id` | DELETE | Supabase (crm_leads) | Simple |

## 2. userLeadsRoutes.js
| Endpoint | HTTP Method | Supabase/External | Complexity |
|----------|-------------|------------------|-----------|
| `/api/user-leads/:userName` | GET | Google Sheets (user sheets) | Medium |
| `/api/user-leads/:userName` | POST | Google Sheets (user sheets) | Medium |
| `/api/user-leads` | GET | Google Sheets (all user sheets) | Medium |

## 3. notificationsRoutes.js
| Endpoint | HTTP Method | Supabase/External | Complexity |
|----------|-------------|------------------|-----------|
| `/api/notifications` | GET | Supabase (notifications) | Simple |
| `/api/notifications` | POST | Supabase (notifications) | Simple |
| `/api/notifications/mark-all-read` | POST | Supabase (notifications) | Simple |
| `/api/notifications/settings` | GET | Supabase (notification_settings) | Simple |
| `/api/notifications/settings` | PUT | Supabase (notification_settings) | Simple |
| `/api/notifications/purge` | POST | Supabase (notifications) + Cron | Simple |

## 4. paymentsRoutes.js
| Endpoint | HTTP Method | Supabase/External | Complexity |
|----------|-------------|------------------|-----------|
| `/api/payments/admin/summary` | GET | Supabase (payments, registrations) + XP Service | Medium |
| `/api/payments/coordinator/summary` | GET | Supabase (payments, registrations, program_batches) + XP | Medium |
| `/api/payments/coordinator/registration/:id` | GET | Supabase (payments, registrations) | Simple |
| `/api/payments/coordinator/:id` | PUT | Supabase (payments, program_batches) | Simple |
| `/api/payments/admin/registration/:id` | GET | Supabase (payments) | Simple |
| `/api/payments/admin` | GET | Supabase (payments, registrations) | Simple |
| `/api/payments/admin/:id` | PUT | Supabase (payments) | Simple |
| `/api/payments/admin/:id/confirm` | POST | Supabase (payments, receipts, registrations) + XP + CRM Leads | Complex |
| `/api/payments/admin/:id/unconfirm` | POST | Supabase (payments, receipts, registrations) + CRM Leads | Complex |

## 5. batchPaymentSetupRoutes.js
| Endpoint | HTTP Method | Supabase/External | Complexity |
|----------|-------------|------------------|-----------|
| `/api/payment-setup/batches/:batchName` | GET | Supabase (batch_payment_methods, batch_payment_plans, batch_payment_installments) | Simple |
| `/api/payment-setup/batches/:batchName` | PUT | Supabase (batch_payment_methods, batch_payment_plans, batch_payment_installments) | Medium |

## 6. programsRoutes.js
| Endpoint | HTTP Method | Supabase/External | Complexity |
|----------|-------------|------------------|-----------|
| `/api/programs/public` | GET | Supabase (programs) | Simple |
| `/api/programs/coordinator-batches` | GET | Supabase (program_batches, programs) | Simple |
| `/api/programs/sidebar` | GET | Supabase (programs, program_batches) | Simple |
| `/api/programs` | GET | Supabase (programs, program_batches) | Simple |
| `/api/programs/:programId` | DELETE | Supabase (programs, program_batches, crm_leads, batches, batch_officer_sheets) | Medium |
| `/api/programs` | POST | Supabase (programs) | Simple |
| `/api/programs/:programId/batches` | POST | Supabase (program_batches) | Simple |
| `/api/programs/:programId/batches/:batchId` | DELETE | Supabase (program_batches, crm_leads, batches, batch_officer_sheets) | Medium |
| `/api/programs/:programId/batches/:batchId/current` | PUT | Supabase (program_batches) | Simple |
| `/api/programs/:programId/current-batch` | GET | Supabase (program_batches) | Simple |

## 7. receiptsRoutes.js
| Endpoint | HTTP Method | Supabase/External | Complexity |
|----------|-------------|------------------|-----------|
| `/api/receipts/generate` | POST | None (PDF generation only) | Medium |
| `/api/receipts/next-number` | GET | Supabase (receipts, payments) | Simple |
| `/api/receipts/version` | GET | None (debug endpoint) | Simple |
| `/api/receipts/payment/:paymentId` | GET | Supabase (payments, registrations) + PDF generation | Medium |

## 8. registrationsRoutes.js
| Endpoint | HTTP Method | Supabase/External | Complexity |
|----------|-------------|------------------|-----------|
| `/api/registrations/intake` | POST | Supabase (registrations, payments, program_batches, programs) + Google Sheets + Notifications + CRM Leads + XP | Complex |
| `/api/registrations/my` | GET | Supabase (registrations, payments, program_batches) | Simple |
| `/api/registrations/admin` | GET | Supabase (registrations, payments, program_batches) | Simple |
| `/api/registrations/admin/:id/assign` | PUT | Supabase (registrations) | Simple |
| `/api/registrations/:id/payments` | POST | Supabase (payments, registrations, batch_payment_plans, batch_payment_installments) + CRM Leads | Medium |
| `/api/registrations/:id/payments` | DELETE | Supabase (payments) | Simple |
| `/api/registrations/:id/payments` | GET | Supabase (payments) | Simple |
| `/api/registrations/admin/:id/enroll` | POST | Supabase (registrations, students) | Medium |
| `/api/registrations/admin/:id` | DELETE | Supabase (registrations, payments) | Simple |
| `/api/registrations/admin/export-sheet` | POST | Supabase (registrations) + Google Sheets | Complex |

## 9. reportsRoutes.js
| Endpoint | HTTP Method | Supabase/External | Complexity |
|----------|-------------|------------------|-----------|
| `/api/reports/daily/schedule` | GET | Supabase (daily_reports_config) | Simple |
| `/api/reports/daily/submit` | POST | Supabase (daily_reports) + Notifications | Medium |
| `/api/reports/daily/overview` | GET | Supabase (daily_reports, auth users) | Simple |
| `/api/reports/daily` | GET | Supabase (daily_reports) | Simple |
| `/api/reports/daily/schedule` | PUT | Supabase (daily_reports_config) | Simple |
| `/api/reports/daily-checklist` | GET | Supabase (auth users) | Simple |
| `/api/reports/daily-checklist/snapshot` | POST | Supabase (daily_checklist_snapshots) | Simple |
| `/api/reports/daily-checklist/call-recording` | PUT | Supabase (daily_checklist_call_recordings) | Simple |
| `/api/reports/daily/remind` | POST | Supabase (daily_reports) + Notifications + Cron | Medium |
| `/api/reports/daily/:id` | PUT | Supabase (daily_reports) | Simple |

## 10. studentsRoutes.js
| Endpoint | HTTP Method | Supabase/External | Complexity |
|----------|-------------|------------------|-----------|
| `/api/students/admin` | GET | Supabase (students) | Simple |
| `/api/students/admin/:id` | DELETE | Supabase (students, registrations) | Simple |

## 11. usersRoutes.js
| Endpoint | HTTP Method | Supabase/External | Complexity |
|----------|-------------|------------------|-----------|
| `/api/users/officers` | GET | Supabase (auth users) | Simple |
| `/api/users` | GET | Supabase (auth users) | Simple |
| `/api/users` | POST | Supabase (auth users) + Google Sheets (user leads + attendance) | Complex |
| `/api/users/:id` | DELETE | Supabase (auth users) | Simple |
| `/api/users/:id` | PUT | Supabase (auth users) | Simple |
| `/api/users/:id/confirm-email` | POST | Supabase (auth users) | Simple |
| `/api/users/migrate-default-roles` | POST | Supabase (auth users) | Simple |
| `/api/users/:id/roles` | PUT | Supabase (auth users) | Simple |
| `/api/users/:id/password` | PUT | Supabase (auth users) | Simple |

## 12. whatsappRoutes.js
| Endpoint | HTTP Method | Supabase/External | Complexity |
|----------|-------------|------------------|-----------|
| `/api/whatsapp/leads/:leadPhone/history` | GET | Supabase (whatsapp_logs) + Lead Access Check | Simple |
| `/api/whatsapp/leads/:leadPhone/messages` | POST | WhatsApp Cloud API + Supabase (whatsapp_logs) | Complex |
| `/api/whatsapp/leads/:leadPhone/attachments` | POST | WhatsApp Cloud API + Supabase (whatsapp_logs) | Complex |
| `/api/whatsapp/leads/:leadPhone/brochure` | POST | WhatsApp Cloud API + Supabase (whatsapp_logs) | Complex |
| `/api/whatsapp/inbox/conversations` | GET | Supabase (whatsapp_logs, user leads) | Medium |
| `/api/whatsapp/inbox/threads/:leadPhone` | GET | Supabase (whatsapp_logs, user leads) | Medium |
| `/api/whatsapp/admin/chats` | GET | Supabase (whatsapp_logs) | Simple |
| `/api/whatsapp/webhook` | GET | WhatsApp Cloud API (verification) | Simple |
| `/api/whatsapp/webhook` | POST | WhatsApp Cloud API (receive + log) | Medium |

## 13. whatsappContainersRoutes.js
| Endpoint | HTTP Method | Supabase/External | Complexity |
|----------|-------------|------------------|-----------|
| `/api/whatsapp/containers/mappings` | GET | Supabase (whatsapp_containers_mappings) | Simple |
| `/api/whatsapp/containers/mappings` | POST | Supabase (whatsapp_containers_mappings) | Simple |
| `/api/whatsapp/containers/setup-default` | POST | Supabase (whatsapp_containers_mappings) | Simple |

## 14. xpRoutes.js
| Endpoint | HTTP Method | Supabase/External | Complexity |
|----------|-------------|------------------|-----------|
| `/api/xp/leaderboard` | GET | Supabase (xp_events, auth users) | Medium |
| `/api/xp/me` | GET | Supabase (xp_events) | Simple |
| `/api/xp/trend` | GET | Supabase (xp_events) | Simple |
| `/api/xp/global-trend` | GET | Supabase (xp_events) | Simple |
| `/api/xp/cron/overdue` | POST | Supabase (registrations, payments, xp_events) | Medium |

---

## Summary Statistics

**Total Endpoints:** 87

### By Complexity:
- **Simple** (only Supabase queries): 44 endpoints
- **Medium** (some logic/orchestration): 31 endpoints  
- **Complex** (external APIs/Google/WhatsApp): 12 endpoints

### By External Service:
- **Supabase Only:** 44 endpoints
- **Google Sheets:** 8 endpoints (Leads, User Leads, Registrations export, User sheet/attendance creation)
- **WhatsApp Cloud API:** 6 endpoints (send messages, brochure, webhook)
- **PDF Generation:** 2 endpoints (Receipt generation)
- **Notifications & XP (internal):** Multiple endpoints across modules

### Key Integration Points:
1. **Supabase:** Core data store (tables: registrations, payments, programs, leads, students, users, notifications, etc.)
2. **Google Sheets:** User leads, batch leads, registrations export, staff personal sheets
3. **WhatsApp Cloud API:** Message sending, status tracking, webhook receiving
4. **Internal Services:** XP tracking, Notifications, CRM Lead status sync, Attendance
