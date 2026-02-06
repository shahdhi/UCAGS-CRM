#!/usr/bin/env node

/**
 * Password Hash Generator for UCAGS CRM
 * 
 * Usage: node scripts/generate-password.js [password]
 * If no password provided, generates a random one
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Get password from command line or generate random
const password = process.argv[2] || generateRandomPassword();

// Generate hash
const hash = bcrypt.hashSync(password, 10);

console.log('\n=================================');
console.log('UCAGS CRM - Password Hash Generator');
console.log('=================================\n');
console.log('Plain Password:', password);
console.log('\nBcrypt Hash:', hash);
console.log('\n=================================');
console.log('IMPORTANT: Store the hash in your');
console.log('Officers sheet or .env file.');
console.log('Keep the plain password secure!');
console.log('=================================\n');

/**
 * Generate a random secure password
 */
function generateRandomPassword(length = 16) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  const values = crypto.randomBytes(length);
  
  for (let i = 0; i < length; i++) {
    password += charset[values[i] % charset.length];
  }
  
  return password;
}
