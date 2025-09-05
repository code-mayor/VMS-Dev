#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔄 Resetting database with proper password hashes...\n');

async function resetDatabase() {
  const dbPath = path.join(__dirname, '../onvif_vms.db');
  
  try {
    // Check if database exists
    if (fs.existsSync(dbPath)) {
      console.log('🗑️  Removing existing database...');
      fs.unlinkSync(dbPath);
      console.log('✅ Existing database removed');
    } else {
      console.log('ℹ️  No existing database found');
    }

    console.log('\n🏗️  Database will be recreated on next server startup');
    console.log('🔐 New database will use properly generated bcrypt hashes');
    
    console.log('\n📋 NEXT STEPS:');
    console.log('1. Restart the backend server: cd server && npm run dev');
    console.log('2. The database will be recreated automatically');
    console.log('3. Try logging in with: admin@local.dev / admin123');
    
    console.log('\n✅ Database reset complete!');
    
  } catch (error) {
    console.error('❌ Error resetting database:', error);
    process.exit(1);
  }
}

resetDatabase();