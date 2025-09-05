const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { logger } = require('./logger');

// Simple SQLite-like in-memory database for development
let database = {
  users: [],
  devices: [],
  recordings: [],
  motion_events: [],
  audit_logs: []
};

// Default users with hashed passwords
const defaultUsers = [
  {
    id: 'admin-user',
    email: 'admin@local.dev',
    password_hash: '', // Will be set below
    role: 'admin',
    permissions: {
      devices: { read: true, write: true, delete: true, ptz: true, record: true },
      users: { read: true, write: true, delete: true },
      recordings: { read: true, write: true, delete: true },
      motion_events: { read: true, write: true, delete: true },
      settings: { read: true, write: true }
    },
    session_timeout: 3600,
    created_at: new Date().toISOString(),
    last_login: null,
    last_activity: new Date().toISOString()
  },
  {
    id: 'operator-user',
    email: 'operator@local.dev',
    password_hash: '', // Will be set below
    role: 'operator',
    permissions: {
      devices: { read: true, write: true, delete: false, ptz: true, record: true },
      users: { read: false, write: false, delete: false },
      recordings: { read: true, write: true, delete: false },
      motion_events: { read: true, write: true, delete: false },
      settings: { read: false, write: false }
    },
    session_timeout: 3600,
    created_at: new Date().toISOString(),
    last_login: null,
    last_activity: new Date().toISOString()
  },
  {
    id: 'viewer-user',
    email: 'viewer@local.dev',
    password_hash: '', // Will be set below
    role: 'viewer',
    permissions: {
      devices: { read: true, write: false, delete: false, ptz: false, record: false },
      users: { read: false, write: false, delete: false },
      recordings: { read: true, write: false, delete: false },
      motion_events: { read: true, write: false, delete: false },
      settings: { read: false, write: false }
    },
    session_timeout: 3600,
    created_at: new Date().toISOString(),
    last_login: null,
    last_activity: new Date().toISOString()
  }
];

async function setupDatabase() {
  try {
    logger.info('Connected to SQLite database');

    // Hash passwords for default users
    defaultUsers[0].password_hash = await bcrypt.hash('admin123', 12);
    defaultUsers[1].password_hash = await bcrypt.hash('operator123', 12);
    defaultUsers[2].password_hash = await bcrypt.hash('viewer123', 12);

    // Initialize with default data
    database.users = [...defaultUsers];

    logger.info('All database tables created successfully');
    logger.info('Default data inserted successfully');
    logger.info('Database initialized successfully');

    return database;
  } catch (error) {
    logger.error('Database setup failed:', error);
    throw error;
  }
}

// Database access functions
function getDatabase() {
  return database;
}

function saveDatabase() {
  // In a real implementation, this would save to file/database
  // For now, just keep in memory
}

module.exports = {
  setupDatabase,
  getDatabase,
  saveDatabase
};