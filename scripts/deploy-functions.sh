#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-functions.sh
# Deploys all Supabase Edge Functions to project: xddaxiwyszynjyrizkmc
# Usage: bash scripts/deploy-functions.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

PROJECT_REF="xddaxiwyszynjyrizkmc"

echo "🔗 Linking to Supabase project: $PROJECT_REF"
supabase link --project-ref "$PROJECT_REF"

echo ""
echo "🚀 Deploying all Edge Functions..."

FUNCTIONS=(
  health
  dashboard
  crm-leads
  crm-followups
  programs
  users
  notifications
  attendance
  reports
  batches
  batch-sync
  registrations
  payments
  receipts
  students
  calendar
  demo-sessions
  xp
  contacts
  batch-setup
  whatsapp
  google
)

for fn in "${FUNCTIONS[@]}"; do
  echo "  → Deploying $fn..."
  supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
done

echo ""
echo "✅ All functions deployed!"
echo ""
echo "📋 Next: set your secrets with:"
echo "   supabase secrets set GOOGLE_SERVICE_ACCOUNT_EMAIL=\"...\""
echo "   supabase secrets set GOOGLE_PRIVATE_KEY=\"-----BEGIN RSA PRIVATE KEY-----\\n...\""
echo "   supabase secrets set WHATSAPP_ACCESS_TOKEN=\"...\""
echo "   supabase secrets set WHATSAPP_PHONE_NUMBER_ID=\"...\""
echo "   supabase secrets set WHATSAPP_APP_SECRET=\"...\""
echo "   supabase secrets set WHATSAPP_WEBHOOK_VERIFY_TOKEN=\"...\""
echo "   supabase secrets set CRON_SECRET=\"...\""
