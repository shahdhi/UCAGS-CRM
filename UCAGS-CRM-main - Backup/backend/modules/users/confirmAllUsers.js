/**
 * Quick script to confirm all pending users
 */

require('dotenv').config();
const { confirmAllPendingUsers } = require('./confirmUser');

console.log('Starting user confirmation...\n');

confirmAllPendingUsers()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
