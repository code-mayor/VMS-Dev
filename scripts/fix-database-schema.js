#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

console.log('🔧 Fixing ONVIF VMS Database Schema...');

const dbPath = path.join(__dirname, '../server/onvif_vms.db');
console.log(`📁 Database path: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  } else {
    console.log('✅ Database connected successfully');
  }
});

const fixDatabaseSchema = async () => {
  try {
    console.log('\n🔄 Starting database schema fixes...');

    // Step 1: Get current schema
    console.log('\n📋 Current devices table schema:');
    const currentSchema = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(devices)", (err, columns) => {
        if (err) reject(err);
        else resolve(columns);
      });
    });

    currentSchema.forEach(col => {
      console.log(`  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
    });

    // Step 2: Add missing columns
    const columnsToAdd = [
      { name: 'discovered_at', sql: 'discovered_at DATETIME' },
      { name: 'last_seen', sql: 'last_seen DATETIME' },
      { name: 'recording_enabled', sql: 'recording_enabled INTEGER DEFAULT 0' },
      { name: 'motion_detection_enabled', sql: 'motion_detection_enabled INTEGER DEFAULT 0' }
    ];

    const existingColumns = currentSchema.map(col => col.name);
    
    console.log('\n🔧 Adding missing columns...');
    for (const column of columnsToAdd) {
      if (!existingColumns.includes(column.name)) {
        try {
          await new Promise((resolve, reject) => {
            db.run(`ALTER TABLE devices ADD COLUMN ${column.sql}`, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          console.log(`✅ Added column: ${column.name}`);
        } catch (error) {
          console.log(`⚠️ Column ${column.name} might already exist: ${error.message}`);
        }
      } else {
        console.log(`✅ Column ${column.name} already exists`);
      }
    }

    // Step 3: Fix existing data
    console.log('\n🔧 Fixing existing device data...');
    
    // Update NULL discovered_at/last_seen with current timestamp
    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE devices 
        SET discovered_at = COALESCE(discovered_at, datetime('now')),
            last_seen = COALESCE(last_seen, datetime('now'))
        WHERE discovered_at IS NULL OR last_seen IS NULL
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✅ Updated timestamp fields');

    // Ensure capabilities is valid JSON
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

    // Step 4: Verify the fix by checking current device count
    const deviceCount = await new Promise((resolve, reject) => {
      db.get("SELECT COUNT(*) as count FROM devices", (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });

    console.log(`\n📊 Current devices in database: ${deviceCount}`);

    // Step 5: Show final schema
    console.log('\n📋 Final devices table schema:');
    const finalSchema = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(devices)", (err, columns) => {
        if (err) reject(err);
        else resolve(columns);
      });
    });

    finalSchema.forEach(col => {
      console.log(`  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
    });

    console.log('\n✅ Database schema fix completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Restart your backend server: cd server && npm run dev');
    console.log('2. Test ONVIF discovery again');
    console.log('3. Your Honeywell camera should now be saved to the database');

  } catch (error) {
    console.error('❌ Database schema fix failed:', error);
    process.exit(1);
  } finally {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      } else {
        console.log('\n👋 Database connection closed');
      }
    });
  }
};

// Run the fix
fixDatabaseSchema();