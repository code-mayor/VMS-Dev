const { getDatabase } = require('./init');
const { logger } = require('../utils/logger');

// Save discovered device
async function saveDiscoveredDevice(deviceData) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    
    // Check if device already exists
    db.get('SELECT id FROM devices WHERE id = ?', [deviceData.id], (err, existingDevice) => {
      if (err) {
        reject(err);
        return;
      }

      const capabilities = JSON.stringify(deviceData.capabilities || {});
      const ptzPresets = JSON.stringify(deviceData.ptz_presets || {});

      if (existingDevice) {
        // Update existing device
        db.run(
          `UPDATE devices SET 
           name = ?, ip_address = ?, port = ?, endpoint = ?, 
           manufacturer = ?, model = ?, hardware = ?, location = ?,
           onvif_profile = ?, types = ?, scopes = ?, capabilities = ?,
           ptz_presets = ?, status = ?, last_seen = ?, updated_at = ?
           WHERE id = ?`,
          [
            deviceData.name,
            deviceData.ip_address,
            deviceData.port,
            deviceData.endpoint,
            deviceData.manufacturer,
            deviceData.model,
            deviceData.hardware,
            deviceData.location,
            deviceData.onvif_profile,
            deviceData.types,
            deviceData.scopes,
            capabilities,
            ptzPresets,
            deviceData.status,
            deviceData.last_seen,
            now,
            deviceData.id
          ],
          (err) => {
            if (err) {
              reject(err);
            } else {
              logger.debug(`Updated existing device: ${deviceData.id}`);
              resolve(deviceData);
            }
          }
        );
      } else {
        // Insert new device
        db.run(
          `INSERT INTO devices (
           id, name, ip_address, port, endpoint, username, password,
           manufacturer, model, hardware, location, onvif_profile,
           types, scopes, capabilities, ptz_presets, status,
           recording_enabled, motion_detection_enabled, last_seen,
           discovered_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            deviceData.id,
            deviceData.name,
            deviceData.ip_address,
            deviceData.port,
            deviceData.endpoint,
            null, // username - to be set during authentication
            null, // password - to be set during authentication
            deviceData.manufacturer,
            deviceData.model,
            deviceData.hardware,
            deviceData.location,
            deviceData.onvif_profile,
            deviceData.types,
            deviceData.scopes,
            capabilities,
            ptzPresets,
            deviceData.status,
            1, // recording_enabled
            1, // motion_detection_enabled
            deviceData.last_seen,
            deviceData.discovered_at,
            now,
            now
          ],
          (err) => {
            if (err) {
              reject(err);
            } else {
              logger.info(`Saved new device: ${deviceData.name} (${deviceData.ip_address})`);
              resolve(deviceData);
            }
          }
        );
      }
    });
  });
}

// Get all devices
async function getAllDevices() {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    
    db.all('SELECT * FROM devices ORDER BY created_at DESC', [], (err, devices) => {
      if (err) {
        reject(err);
        return;
      }

      // Parse JSON fields
      const parsedDevices = devices.map(device => ({
        ...device,
        capabilities: JSON.parse(device.capabilities || '{}'),
        ptz_presets: JSON.parse(device.ptz_presets || '{}'),
        recording_enabled: Boolean(device.recording_enabled),
        motion_detection_enabled: Boolean(device.motion_detection_enabled)
      }));

      resolve(parsedDevices);
    });
  });
}

// Get device by ID
async function getDeviceById(deviceId) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    
    db.get('SELECT * FROM devices WHERE id = ?', [deviceId], (err, device) => {
      if (err) {
        reject(err);
        return;
      }

      if (!device) {
        resolve(null);
        return;
      }

      // Parse JSON fields
      const parsedDevice = {
        ...device,
        capabilities: JSON.parse(device.capabilities || '{}'),
        ptz_presets: JSON.parse(device.ptz_presets || '{}'),
        recording_enabled: Boolean(device.recording_enabled),
        motion_detection_enabled: Boolean(device.motion_detection_enabled)
      };

      resolve(parsedDevice);
    });
  });
}

// Update device status
async function updateDeviceStatus(deviceId, status, lastSeen = null) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    
    db.run(
      'UPDATE devices SET status = ?, last_seen = ?, updated_at = ? WHERE id = ?',
      [status, lastSeen || now, now, deviceId],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      }
    );
  });
}

// Delete device
async function deleteDevice(deviceId) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    
    // Start transaction to delete related records
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      // Delete related streams
      db.run('DELETE FROM streams WHERE device_id = ?', [deviceId]);
      
      // Delete related recordings
      db.run('DELETE FROM recordings WHERE device_id = ?', [deviceId]);
      
      // Delete related motion events
      db.run('DELETE FROM motion_events WHERE device_id = ?', [deviceId]);
      
      // Delete device
      db.run('DELETE FROM devices WHERE id = ?', [deviceId], function(err) {
        if (err) {
          db.run('ROLLBACK');
          reject(err);
        } else {
          db.run('COMMIT');
          resolve(this.changes > 0);
        }
      });
    });
  });
}

// Search devices
async function searchDevices(searchTerm) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const searchPattern = `%${searchTerm}%`;
    
    db.all(
      `SELECT * FROM devices 
       WHERE name LIKE ? OR ip_address LIKE ? OR manufacturer LIKE ? OR model LIKE ?
       ORDER BY created_at DESC`,
      [searchPattern, searchPattern, searchPattern, searchPattern],
      (err, devices) => {
        if (err) {
          reject(err);
          return;
        }

        // Parse JSON fields
        const parsedDevices = devices.map(device => ({
          ...device,
          capabilities: JSON.parse(device.capabilities || '{}'),
          ptz_presets: JSON.parse(device.ptz_presets || '{}'),
          recording_enabled: Boolean(device.recording_enabled),
          motion_detection_enabled: Boolean(device.motion_detection_enabled)
        }));

        resolve(parsedDevices);
      }
    );
  });
}

module.exports = {
  saveDiscoveredDevice,
  getAllDevices,
  getDeviceById,
  updateDeviceStatus,
  deleteDevice,
  searchDevices
};