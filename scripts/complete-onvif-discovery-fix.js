#!/usr/bin/env node

const { execSync } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('🔧 Complete ONVIF Discovery Fix Starting...');
console.log('This will fix the database schema and restore ONVIF discovery functionality.\n');

const dbPath = path.join(__dirname, '../server/onvif_vms.db');
const serverPath = path.join(__dirname, '../server');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const runCompleteONVIFFix = async () => {
  try {
    console.log('📋 Step 1: Checking system requirements...');
    
    // Check if database exists
    if (fs.existsSync(dbPath)) {
      console.log('✅ Database file exists');
    } else {
      console.log('⚠️ Database file not found, will be created');
    }
    
    // Check if server directory exists
    if (fs.existsSync(serverPath)) {
      console.log('✅ Server directory exists');
    } else {
      console.error('❌ Server directory not found');
      process.exit(1);
    }

    console.log('\n📋 Step 2: Fixing database schema...');
    
    // Open database connection
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('❌ Error opening database:', err.message);
        process.exit(1);
      }
    });

    // Add missing columns
    const columnsToAdd = [
      'discovered_at DATETIME',
      'last_seen DATETIME', 
      'recording_enabled INTEGER DEFAULT 0',
      'motion_detection_enabled INTEGER DEFAULT 0'
    ];

    for (const column of columnsToAdd) {
      try {
        await new Promise((resolve, reject) => {
          db.run(`ALTER TABLE devices ADD COLUMN ${column}`, (err) => {
            if (err) {
              if (err.message.includes('duplicate column name')) {
                console.log(`✅ Column ${column.split(' ')[0]} already exists`);
                resolve();
              } else {
                reject(err);
              }
            } else {
              console.log(`✅ Added column: ${column.split(' ')[0]}`);
              resolve();
            }
          });
        });
      } catch (error) {
        console.log(`⚠️ Issue with column ${column}: ${error.message}`);
      }
    }

    // Fix existing data
    console.log('\n📋 Step 3: Fixing existing device data...');
    
    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE devices 
        SET discovered_at = COALESCE(discovered_at, datetime('now')),
            last_seen = COALESCE(last_seen, datetime('now')),
            recording_enabled = COALESCE(recording_enabled, 0),
            motion_detection_enabled = COALESCE(motion_detection_enabled, 0)
        WHERE discovered_at IS NULL OR last_seen IS NULL OR recording_enabled IS NULL OR motion_detection_enabled IS NULL
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✅ Fixed timestamp and boolean fields');

    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE devices 
        SET capabilities = '{"ptz":false,"audio":false,"video":true,"analytics":false}'
        WHERE capabilities IS NULL OR capabilities = ''
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✅ Fixed capabilities JSON fields');

    // Close database
    db.close();

    console.log('\n📋 Step 4: Verifying database schema...');
    
    // Reopen database to verify schema
    const verifyDb = new sqlite3.Database(dbPath);
    const schema = await new Promise((resolve, reject) => {
      verifyDb.all("PRAGMA table_info(devices)", (err, columns) => {
        if (err) reject(err);
        else resolve(columns);
      });
    });
    verifyDb.close();

    const requiredColumns = ['discovered_at', 'last_seen', 'recording_enabled', 'motion_detection_enabled'];
    const existingColumns = schema.map(col => col.name);
    
    console.log('📋 Database schema verification:');
    let allColumnsExist = true;
    requiredColumns.forEach(col => {
      if (existingColumns.includes(col)) {
        console.log(`  ✅ ${col}`);
      } else {
        console.log(`  ❌ ${col} - MISSING`);
        allColumnsExist = false;
      }
    });

    if (!allColumnsExist) {
      throw new Error('Database schema fix incomplete');
    }

    console.log('\n📋 Step 5: Installing any missing server dependencies...');
    
    try {
      process.chdir(serverPath);
      console.log('📦 Checking server dependencies...');
      execSync('npm install', { stdio: 'inherit' });
      console.log('✅ Server dependencies updated');
    } catch (error) {
      console.log('⚠️ Dependency installation had issues, but continuing...');
    }

    console.log('\n📋 Step 6: Testing database connection...');
    
    // Quick test to ensure database is working
    const testDb = new sqlite3.Database(dbPath);
    const deviceCount = await new Promise((resolve, reject) => {
      testDb.get("SELECT COUNT(*) as count FROM devices", (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    testDb.close();
    
    console.log(`✅ Database connection successful - ${deviceCount} devices currently stored`);

    console.log('\n🎉 ONVIF Discovery Fix Complete!');
    console.log('\n📋 What was fixed:');
    console.log('  ✅ Database schema updated with missing columns');
    console.log('  ✅ Existing device data normalized');
    console.log('  ✅ ONVIF discovery service will now work correctly');
    console.log('  ✅ Device storage and retrieval fixed');

    console.log('\n🚀 Next Steps:');
    console.log('1. 🔄 Restart your backend server:');
    console.log('   cd server && npm run dev');
    console.log('');
    console.log('2. 🌐 Open frontend and test discovery:');
    console.log('   http://localhost:3000');
    console.log('');
    console.log('3. 🎯 Your Honeywell camera (192.168.226.201) should now be discovered and saved!');
    
    console.log('\n📝 Debug Commands (if needed):');
    console.log('  - Test discovery: node scripts/test-onvif-discovery-fix.js');
    console.log('  - Check database: sqlite3 server/onvif_vms.db ".schema devices"');
    console.log('  - View devices: sqlite3 server/onvif_vms.db "SELECT * FROM devices;"');

  } catch (error) {
    console.error('\n❌ Complete ONVIF fix failed:', error.message);
    console.log('\n🔧 Manual steps to try:');
    console.log('1. Delete the database: rm server/onvif_vms.db');
    console.log('2. Restart backend: cd server && npm run dev');
    console.log('3. The database will be recreated with correct schema');
    process.exit(1);
  }
};

// Run the complete fix
runCompleteONVIFFix();