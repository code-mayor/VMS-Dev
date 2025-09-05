#!/usr/bin/env node

const bcrypt = require('bcryptjs');

console.log('🔐 Generating proper bcrypt password hashes...\n');

async function generateHashes() {
  const passwords = [
    { user: 'admin', email: 'admin@local.dev', password: 'admin123' },
    { user: 'operator', email: 'operator@local.dev', password: 'operator123' },
    { user: 'viewer', email: 'viewer@local.dev', password: 'viewer123' }
  ];

  console.log('🔄 Generating bcrypt hashes with salt rounds 10...\n');

  for (const user of passwords) {
    try {
      const hash = await bcrypt.hash(user.password, 10);
      console.log(`✅ ${user.user.toUpperCase()} (${user.email}):`);
      console.log(`   Password: ${user.password}`);
      console.log(`   Hash: ${hash}`);
      
      // Test the hash immediately
      const isValid = await bcrypt.compare(user.password, hash);
      console.log(`   Verification: ${isValid ? '✅ VALID' : '❌ INVALID'}`);
      console.log('');
    } catch (error) {
      console.error(`❌ Error generating hash for ${user.user}:`, error);
    }
  }

  console.log('🧪 Testing existing hashes from database...\n');
  
  // Test the existing hashes from the database
  const existingHashes = [
    { user: 'admin', password: 'admin123', hash: '$2b$10$8K7qwHGzF5zPjfOVt3/pLuZQGhhS.j7N3zOy6vN0R7UqNtJUBpHgK' },
    { user: 'operator', password: 'operator123', hash: '$2b$10$tH2R1yFjK9zNtJcQkPqHueLmQ3j7oVpNyH6B0kZXs9jR2nJdKLtZe' },
    { user: 'viewer', password: 'viewer123', hash: '$2b$10$kF8H3vN2pLdQ7zR9cMq4xOjY5kP8nT6vL3mR1sQ4wE9yH7bX2cK8u' }
  ];

  for (const user of existingHashes) {
    try {
      const isValid = await bcrypt.compare(user.password, user.hash);
      console.log(`🔍 ${user.user.toUpperCase()} existing hash test:`);
      console.log(`   Password: ${user.password}`);
      console.log(`   Existing Hash: ${user.hash}`);
      console.log(`   Verification: ${isValid ? '✅ VALID' : '❌ INVALID - THIS IS THE PROBLEM!'}`);
      console.log('');
    } catch (error) {
      console.error(`❌ Error testing existing hash for ${user.user}:`, error);
    }
  }

  console.log('📋 SUMMARY:');
  console.log('If the existing hashes show INVALID, that explains the login failures.');
  console.log('The database needs to be updated with proper bcrypt hashes.');
}

generateHashes().catch(console.error);