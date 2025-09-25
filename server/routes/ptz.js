// Production-grade PTZ control routes using 'onvif' package

const express = require('express');
const router = express.Router();
const Onvif = require('onvif');

// Connection and profile caches with TTL
const cameraCache = new Map();
const profileCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Periodic cache cleanup
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cameraCache.entries()) {
        if (entry.expiresAt < now) {
            console.log(`[DEBUG] Cleaning expired cache: ${key}`);
            cameraCache.delete(key);
            profileCache.delete(key);
        }
    }
}, 60 * 1000);

// Normalize device ID to IP format
function normalizeKey(deviceId) {
    return deviceId.replace('onvif-', '').replace(/-/g, '.');
}

// Get device from database
async function getDeviceInfo(deviceId, dbAdapter) {
    const cleanId = normalizeKey(deviceId);
    const query = `
        SELECT * FROM devices 
        WHERE ip_address = ? 
           OR id = ?
           OR REPLACE(ip_address, '.', '-') = ?
           OR CONCAT('onvif-', REPLACE(ip_address, '.', '-')) = ?
        LIMIT 1
    `;

    const device = await dbAdapter.get(query, [
        cleanId,
        deviceId,
        deviceId.replace('onvif-', ''),
        deviceId
    ]);

    if (device) {
        console.log(`[INFO] Device found: ${device.name || device.ip_address}`);
    } else {
        console.warn(`[WARN] Device not found: ${deviceId}`);
    }

    return device;
}

// Create ONVIF camera connection
async function createCameraConnection(device) {
    return new Promise((resolve, reject) => {
        const config = {
            hostname: device.ip_address,
            port: device.port || 80,
            timeout: 10000,
            preserveAddress: true
        };

        // Add credentials if available
        if (device.username || device.rtsp_username) {
            config.username = device.username || device.rtsp_username;
            config.password = device.password || device.rtsp_password || '';
        }

        const camera = new Onvif.Cam(config, (err) => {
            if (err) {
                console.error(`[ERROR] Connection failed for ${device.ip_address}: ${err.message}`);
                return reject(err);
            }
            console.log(`[INFO] Connected to camera ${device.ip_address}`);
            resolve(camera);
        });
    });
}

// Get or create camera connection
async function getCamera(deviceId, dbAdapter) {
    const key = normalizeKey(deviceId);

    // Check cache
    if (cameraCache.has(key)) {
        const entry = cameraCache.get(key);
        if (entry.expiresAt > Date.now()) {
            console.log(`[DEBUG] Using cached connection for ${key}`);
            return entry.camera;
        }
        cameraCache.delete(key);
    }

    const device = await getDeviceInfo(deviceId, dbAdapter);
    if (!device) {
        throw new Error(`Device ${deviceId} not found`);
    }

    const camera = await createCameraConnection(device);

    // Cache with expiry
    cameraCache.set(key, {
        camera,
        expiresAt: Date.now() + CACHE_TTL
    });

    return camera;
}

// Extract profile token from profile object
function extractProfileToken(profile) {
    // Try multiple extraction methods based on ONVIF XML structure
    if (profile.$ && profile.$.token) {
        return profile.$.token;
    }
    if (profile.token) {
        return profile.token;
    }
    if (profile.$ && typeof profile.$ === 'object') {
        // Check for alternative property names
        const attrs = profile.$;
        return attrs.Token || attrs.profileToken || attrs.ProfileToken;
    }
    return null;
}

// Validate if a token looks valid
function isValidToken(token) {
    if (!token || typeof token !== 'string') return false;
    if (token === 'undefined' || token === 'null') return false;
    if (token.length < 1) return false;
    return true;
}

// Get profile token for PTZ operations
async function getProfileToken(camera, deviceId, dbAdapter) {
    const key = normalizeKey(deviceId);

    // Check cache first
    if (profileCache.has(key)) {
        const cached = profileCache.get(key);
        console.log(`[DEBUG] Using cached profile token: ${cached}`);
        return cached;
    }

    const device = await getDeviceInfo(deviceId, dbAdapter);

    // Try stored token if valid
    if (device && device.profile_token && isValidToken(device.profile_token)) {
        console.log(`[INFO] Using stored profile token: ${device.profile_token}`);
        profileCache.set(key, device.profile_token);
        return device.profile_token;
    }

    // Try stored profiles JSON
    if (device && device.onvif_profiles) {
        try {
            const stored = JSON.parse(device.onvif_profiles);
            if (Array.isArray(stored)) {
                for (const profile of stored) {
                    if (profile.token && isValidToken(profile.token)) {
                        console.log(`[INFO] Found token from stored profiles: ${profile.token}`);
                        profileCache.set(key, profile.token);

                        // Update database
                        await dbAdapter.run(
                            'UPDATE devices SET profile_token = ? WHERE id = ?',
                            [profile.token, device.id]
                        ).catch(console.error);

                        return profile.token;
                    }
                }
            }
        } catch (err) {
            console.warn(`[WARN] Invalid stored profiles JSON: ${err.message}`);
        }
    }

    // Query camera for profiles
    return new Promise((resolve, reject) => {
        console.log('[INFO] Querying camera for profiles...');

        camera.getProfiles((err, profiles) => {
            if (err) {
                return reject(new Error(`Failed to get profiles: ${err.message}`));
            }

            if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
                return reject(new Error('No profiles available from camera'));
            }

            console.log(`[INFO] Camera returned ${profiles.length} profiles`);

            let selectedToken = null;
            let selectedPriority = 0; // Higher is better

            // Evaluate each profile
            for (let i = 0; i < profiles.length; i++) {
                const profile = profiles[i];
                const token = extractProfileToken(profile);

                if (!isValidToken(token)) {
                    console.log(`[DEBUG] Profile ${i}: invalid or missing token`);
                    continue;
                }

                // Calculate priority
                let priority = 1; // Base priority for valid token

                if (profile.PTZConfiguration) priority += 2;
                if (profile.ptz && profile.ptz.uri) priority += 3;
                if (i === 0) priority += 1; // Slight preference for first profile

                console.log(`[DEBUG] Profile ${i}: token=${token}, priority=${priority}`);

                if (priority > selectedPriority) {
                    selectedToken = token;
                    selectedPriority = priority;
                }
            }

            if (!selectedToken) {
                return reject(new Error('No valid profile token found'));
            }

            console.log(`[INFO] Selected profile token: ${selectedToken} (priority: ${selectedPriority})`);

            // Cache and store
            profileCache.set(key, selectedToken);

            if (device && dbAdapter) {
                // Store both token and full profiles
                const profilesData = profiles.map(p => ({
                    token: extractProfileToken(p),
                    name: p.name || (p.$ && p.$.name),
                    has_ptz_config: !!p.PTZConfiguration,
                    has_ptz_uri: !!(p.ptz && p.ptz.uri)
                }));

                dbAdapter.run(
                    'UPDATE devices SET profile_token = ?, onvif_profiles = ? WHERE id = ?',
                    [selectedToken, JSON.stringify(profilesData), device.id]
                ).catch(console.error);
            }

            resolve(selectedToken);
        });
    });
}

// Get database adapter
function getDbAdapter(req) {
    return req.app.get('dbAdapter') || req.app.get('dbConnection');
}

// ===================== PTZ ENDPOINTS =====================

// Move camera - FIXED VERSION
router.post('/:deviceId/move', async (req, res) => {
    const { deviceId } = req.params;
    const { direction, speed = 5 } = req.body;
    const dbAdapter = getDbAdapter(req);

    console.log(`[INFO] PTZ move: device=${deviceId}, direction=${direction}, speed=${speed}`);

    try {
        const camera = await getCamera(deviceId, dbAdapter);
        const profileToken = await getProfileToken(camera, deviceId, dbAdapter);

        // CRITICAL FIX: Set activeSource BEFORE any PTZ operation
        camera.activeSource = { profileToken: profileToken };

        const velocity = { x: 0, y: 0, zoom: 0 };
        const normalizedSpeed = Math.min(Math.max(speed / 10, 0.3), 1.0);

        switch (direction?.toLowerCase()) {
            case 'up': velocity.y = normalizedSpeed; break;
            case 'down': velocity.y = -normalizedSpeed; break;
            case 'left': velocity.x = -normalizedSpeed; break;
            case 'right': velocity.x = normalizedSpeed; break;
            case 'upleft':
                velocity.x = -normalizedSpeed;
                velocity.y = normalizedSpeed;
                break;
            case 'upright':
                velocity.x = normalizedSpeed;
                velocity.y = normalizedSpeed;
                break;
            case 'downleft':
                velocity.x = -normalizedSpeed;
                velocity.y = -normalizedSpeed;
                break;
            case 'downright':
                velocity.x = normalizedSpeed;
                velocity.y = -normalizedSpeed;
                break;
            default:
                return res.status(400).json({
                    success: false,
                    error: `Invalid direction: ${direction}`
                });
        }

        await new Promise((resolve, reject) => {
            // The onvif library expects velocity directly, not wrapped in an object
            camera.continuousMove(velocity, (err) => {
                if (err) {
                    console.error(`[ERROR] Move failed: ${err.message}`);
                    return reject(err);
                }
                console.log(`[INFO] Move successful`);
                resolve();
            });
        });

        res.json({
            success: true,
            message: 'Camera moving',
            direction,
            speed
        });

    } catch (error) {
        console.error('[ERROR] PTZ move error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Stop camera - FIXED VERSION
router.post('/:deviceId/stop', async (req, res) => {
    const { deviceId } = req.params;
    const dbAdapter = getDbAdapter(req);

    console.log(`[INFO] PTZ stop: device=${deviceId}`);

    try {
        const camera = await getCamera(deviceId, dbAdapter);
        const profileToken = await getProfileToken(camera, deviceId, dbAdapter);

        // CRITICAL: Set activeSource for the camera
        camera.activeSource = { profileToken: profileToken };

        await new Promise((resolve, reject) => {
            camera.stop({
                panTilt: true,
                zoom: true
            }, (err) => {
                if (err) {
                    console.error(`[ERROR] Stop failed: ${err.message}`);
                    return reject(err);
                }
                console.log(`[INFO] Stop successful`);
                resolve();
            });
        });

        res.json({
            success: true,
            message: 'Camera stopped'
        });

    } catch (error) {
        console.error('[ERROR] PTZ stop error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Zoom camera - FIXED VERSION
router.post('/:deviceId/zoom', async (req, res) => {
    const { deviceId } = req.params;
    const { direction, speed = 3 } = req.body;
    const dbAdapter = getDbAdapter(req);

    console.log(`[INFO] PTZ zoom: device=${deviceId}, direction=${direction}, speed=${speed}`);

    try {
        const camera = await getCamera(deviceId, dbAdapter);
        const profileToken = await getProfileToken(camera, deviceId, dbAdapter);

        // CRITICAL: Set activeSource for the camera
        camera.activeSource = { profileToken: profileToken };

        const normalizedSpeed = Math.min(Math.max(speed / 10, 0.3), 1.0);
        const zoomSpeed = direction === 'in' ? normalizedSpeed : -normalizedSpeed;

        await new Promise((resolve, reject) => {
            // Pass velocity directly, not wrapped in an object with profileToken
            camera.continuousMove({
                x: 0,
                y: 0,
                zoom: zoomSpeed
            }, (err) => {
                if (err) {
                    console.error(`[ERROR] Zoom failed: ${err.message}`);
                    return reject(err);
                }
                console.log(`[INFO] Zoom successful`);
                resolve();
            });
        });

        res.json({
            success: true,
            message: 'Zoom operation successful',
            direction,
            speed
        });

    } catch (error) {
        console.error('[ERROR] PTZ zoom error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Home position - FIXED VERSION
router.post('/:deviceId/home', async (req, res) => {
    const { deviceId } = req.params;
    const dbAdapter = getDbAdapter(req);

    console.log(`[INFO] PTZ home: device=${deviceId}`);

    try {
        const camera = await getCamera(deviceId, dbAdapter);
        const profileToken = await getProfileToken(camera, deviceId, dbAdapter);

        // CRITICAL: Set activeSource for the camera
        camera.activeSource = { profileToken: profileToken };

        await new Promise((resolve, reject) => {
            // Try preset 1 first
            camera.gotoPreset({
                preset: 1
            }, (err) => {
                if (!err) {
                    console.log(`[INFO] Home via preset successful`);
                    return resolve();
                }

                // Fallback to absolute center
                camera.absoluteMove({
                    position: {
                        x: 0,
                        y: 0,
                        zoom: 1
                    }
                }, (err2) => {
                    if (err2) {
                        console.error(`[ERROR] Home failed: ${err2.message}`);
                        return reject(err2);
                    }
                    console.log(`[INFO] Home via absolute successful`);
                    resolve();
                });
            });
        });

        res.json({
            success: true,
            message: 'Camera moved to home position'
        });

    } catch (error) {
        console.error('[ERROR] PTZ home error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get capabilities
router.get('/:deviceId/capabilities', async (req, res) => {
    const { deviceId } = req.params;
    const dbAdapter = getDbAdapter(req);

    try {
        const camera = await getCamera(deviceId, dbAdapter);

        const capabilities = {
            continuousMove: !!camera.continuousMove,
            absoluteMove: !!camera.absoluteMove,
            relativeMove: !!camera.relativeMove,
            stop: !!camera.stop,
            gotoPreset: !!camera.gotoPreset,
            setPreset: !!camera.setPreset,
            removePreset: !!camera.removePreset
        };

        res.json({
            success: true,
            capabilities
        });

    } catch (error) {
        console.error('[ERROR] Capabilities error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get status
router.get('/:deviceId/status', async (req, res) => {
    const { deviceId } = req.params;
    const dbAdapter = getDbAdapter(req);

    try {
        const camera = await getCamera(deviceId, dbAdapter);
        const profileToken = await getProfileToken(camera, deviceId, dbAdapter);

        camera.getStatus({
            profileToken: profileToken
        }, (err, status) => {
            if (err) {
                console.warn(`[WARN] Status unavailable: ${err.message}`);
                return res.json({
                    success: true,
                    status: {
                        position: { x: 0, y: 0, zoom: 1 },
                        moveStatus: 'IDLE'
                    }
                });
            }
            res.json({
                success: true,
                status
            });
        });

    } catch (error) {
        console.error('[ERROR] Status error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get presets
router.get('/:deviceId/presets', async (req, res) => {
    const { deviceId } = req.params;
    const dbAdapter = getDbAdapter(req);

    try {
        const camera = await getCamera(deviceId, dbAdapter);
        const profileToken = await getProfileToken(camera, deviceId, dbAdapter);

        const presets = await new Promise((resolve) => {
            camera.getPresets({
                profileToken: profileToken
            }, (err, presets) => {
                if (err) {
                    console.warn(`[WARN] Presets unavailable: ${err.message}`);
                    resolve([]);
                } else {
                    resolve(presets || []);
                }
            });
        });

        res.json({
            success: true,
            presets,
            count: presets.length
        });

    } catch (error) {
        console.error('[ERROR] Presets error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Go to preset
router.post('/:deviceId/preset/:presetNumber', async (req, res) => {
    const { deviceId, presetNumber } = req.params;
    const dbAdapter = getDbAdapter(req);

    try {
        const camera = await getCamera(deviceId, dbAdapter);
        const profileToken = await getProfileToken(camera, deviceId, dbAdapter);

        await new Promise((resolve, reject) => {
            camera.gotoPreset({
                profileToken: profileToken,
                preset: parseInt(presetNumber)
            }, (err) => {
                if (err) {
                    console.error(`[ERROR] Preset ${presetNumber} failed: ${err.message}`);
                    return reject(err);
                }
                console.log(`[INFO] Moved to preset ${presetNumber}`);
                resolve();
            });
        });

        res.json({
            success: true,
            message: `Moved to preset ${presetNumber}`
        });

    } catch (error) {
        console.error('[ERROR] Preset error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Debug profiles
router.get('/:deviceId/debug-profiles', async (req, res) => {
    const { deviceId } = req.params;
    const dbAdapter = getDbAdapter(req);

    try {
        const camera = await getCamera(deviceId, dbAdapter);

        const profiles = await new Promise((resolve, reject) => {
            camera.getProfiles((err, profs) => {
                if (err) reject(err);
                else resolve(profs || []);
            });
        });

        const analyzed = profiles.map((profile, idx) => ({
            index: idx,
            extractedToken: extractProfileToken(profile),
            hasRootProps: !!profile.$,
            rootProps: profile.$,
            hasPTZConfig: !!profile.PTZConfiguration,
            hasPTZUri: !!(profile.ptz && profile.ptz.uri),
            keys: Object.keys(profile)
        }));

        res.json({
            success: true,
            profileCount: profiles.length,
            profiles: analyzed
        });

    } catch (error) {
        console.error('[ERROR] Debug profiles error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Debug endpoint to test PTZ command format
router.post('/:deviceId/test-command', async (req, res) => {
    const { deviceId } = req.params;
    const { command, params } = req.body;
    const dbAdapter = getDbAdapter(req);

    console.log(`[INFO] Test command: ${command} for device: ${deviceId}`);
    console.log(`[INFO] Parameters:`, JSON.stringify(params));

    try {
        const camera = await getCamera(deviceId, dbAdapter);
        const profileToken = await getProfileToken(camera, deviceId, dbAdapter);

        // Set activeSource
        camera.activeSource = { profileToken: profileToken };

        // Try the command
        await new Promise((resolve, reject) => {
            if (command === 'continuousMove') {
                camera.continuousMove(params, (err) => {
                    if (err) {
                        console.error(`[ERROR] Command failed:`, err);
                        reject(err);
                    } else {
                        console.log(`[INFO] Command successful`);
                        resolve();
                    }
                });
            } else if (command === 'stop') {
                camera.stop(params || {}, (err) => {
                    if (err) {
                        console.error(`[ERROR] Stop failed:`, err);
                        reject(err);
                    } else {
                        console.log(`[INFO] Stop successful`);
                        resolve();
                    }
                });
            } else {
                reject(new Error(`Unknown command: ${command}`));
            }
        });

        res.json({
            success: true,
            message: `Command ${command} executed successfully`
        });

    } catch (error) {
        console.error(`[ERROR] Test command error:`, error);
        res.status(500).json({
            success: false,
            error: error.message,
            details: error.toString()
        });
    }
});

// Clear caches
router.post('/cache/clear', (req, res) => {
    const cameras = cameraCache.size;
    const profiles = profileCache.size;

    cameraCache.clear();
    profileCache.clear();

    console.log(`[INFO] Cleared ${cameras} camera and ${profiles} profile cache entries`);

    res.json({
        success: true,
        message: 'Caches cleared',
        cleared: { cameras, profiles }
    });
});

// Cleanup on shutdown
process.on('SIGINT', () => {
    cameraCache.clear();
    profileCache.clear();
});

process.on('SIGTERM', () => {
    cameraCache.clear();
    profileCache.clear();
});

module.exports = router;