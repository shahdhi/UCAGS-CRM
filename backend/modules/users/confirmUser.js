/**
 * Utility to manually confirm user emails in Supabase
 * Run this script to confirm pending users
 */

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');

async function confirmUserEmail(email) {
  const supabase = getSupabaseAdmin();
  
  if (!supabase) {
    console.error('❌ Supabase admin not configured');
    return;
  }

  try {
    console.log(`\n🔍 Looking for user: ${email}`);
    
    // Get all users
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) throw listError;
    
    // Find the user
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      console.error(`❌ User not found: ${email}`);
      return;
    }
    
    console.log('📋 User found:', {
      id: user.id,
      email: user.email,
      confirmed: !!user.email_confirmed_at,
      created: user.created_at
    });
    
    if (user.email_confirmed_at) {
      console.log('✅ User email is already confirmed!');
      return;
    }
    
    console.log('⏳ Confirming email...');
    
    // Update user to confirm email
    const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
      email_confirm: true
    });
    
    if (error) {
      console.error('❌ Error confirming email:', error);
      return;
    }
    
    console.log('✅ Email confirmed successfully!');
    console.log('📋 Updated user:', {
      id: data.user.id,
      email: data.user.email,
      confirmed: !!data.user.email_confirmed_at,
      confirmed_at: data.user.email_confirmed_at
    });
    
    console.log('\n✅ User can now login without email verification!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function confirmAllPendingUsers() {
  const supabase = getSupabaseAdmin();
  
  if (!supabase) {
    console.error('❌ Supabase admin not configured');
    return;
  }

  try {
    console.log('\n🔍 Finding all unconfirmed users...');
    
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) throw listError;
    
    const unconfirmedUsers = users.filter(u => !u.email_confirmed_at);
    
    console.log(`\n📊 Found ${unconfirmedUsers.length} unconfirmed users`);
    
    if (unconfirmedUsers.length === 0) {
      console.log('✅ All users are already confirmed!');
      return;
    }
    
    for (const user of unconfirmedUsers) {
      console.log(`\n⏳ Confirming: ${user.email}`);
      
      const { error } = await supabase.auth.admin.updateUserById(user.id, {
        email_confirm: true
      });
      
      if (error) {
        console.error(`❌ Failed to confirm ${user.email}:`, error.message);
      } else {
        console.log(`✅ Confirmed: ${user.email}`);
      }
    }
    
    console.log('\n✅ All users confirmed!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Export functions
module.exports = {
  confirmUserEmail,
  confirmAllPendingUsers
};

// If run directly from command line
if (require.main === module) {
  const email = process.argv[2];
  
  if (email) {
    console.log('=== Confirm Single User ===');
    confirmUserEmail(email).then(() => process.exit(0));
  } else {
    console.log('=== Confirm All Pending Users ===');
    confirmAllPendingUsers().then(() => process.exit(0));
  }
}
