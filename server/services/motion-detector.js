const EventEmitter = require('events');
const { logger } = require('../utils/logger');

class MotionDetectionService extends EventEmitter {
    constructor() {
        super();
        this.detectors = new Map(); // deviceId -> detector instance
        this.config = {
            sensitivity: 75,
            minConfidence: 0.6,
            detectionInterval: 500, // ms
            cooldownPeriod: 5000, // ms between alerts
            enableObjectDetection: true,
            enableHumanDetection: true,
            enableAnimalDetection: true,
            enableVehicleDetection: true,
            maxConcurrentDetections: 50, // For handling 5000+ cameras
            batchSize: 10,
            workerPoolSize: 10
        };
        this.lastAlertTime = new Map(); // deviceId -> timestamp
        this.detectionQueue = [];
        this.activeDetections = 0;

        // Categories for object classification
        this.objectCategories = {
            human: ['person'],
            animal: ['bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe'],
            vehicle: ['bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat'],
            furniture: ['chair', 'couch', 'potted plant', 'bed', 'dining table', 'toilet'],
            electronics: ['tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone'],
            food: ['banana', 'apple', 'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake'],
            other: ['bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'frisbee', 'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket']
        };

        this.startProcessingQueue();
    }

    startProcessingQueue() {
        setInterval(() => {
            this.processDetectionQueue();
        }, 100);
    }

    async processDetectionQueue() {
        if (this.activeDetections >= this.config.maxConcurrentDetections) return;

        const batch = this.detectionQueue.splice(0, this.config.batchSize);
        if (batch.length === 0) return;

        this.activeDetections += batch.length;

        await Promise.all(batch.map(async (task) => {
            try {
                await this.processFrame(task);
            } catch (error) {
                logger.error(`Motion detection error for device ${task.deviceId}:`, error);
            } finally {
                this.activeDetections--;
            }
        }));
    }

    async startDetection(deviceId, streamUrl, options = {}) {
        if (this.detectors.has(deviceId)) {
            logger.warn(`Motion detection already active for device ${deviceId}`);
            return;
        }

        const detector = {
            deviceId,
            streamUrl,
            enabled: true,
            config: { ...this.config, ...options },
            frameBuffer: null,
            previousFrame: null,
            detectionCount: 0,
            lastDetection: null
        };

        this.detectors.set(deviceId, detector);
        logger.info(`✅ Started motion detection for device ${deviceId}`);
        logger.info(`   Config: sensitivity=${detector.config.sensitivity}, minConfidence=${detector.config.minConfidence}`);
        logger.info(`   Object Detection: ${detector.config.enableObjectDetection ? 'Enabled' : 'Disabled'}`);

        // Start frame capture and analysis
        this.captureFrames(deviceId);
    }

    stopDetection(deviceId) {
        if (!this.detectors.has(deviceId)) return;

        const detector = this.detectors.get(deviceId);
        detector.enabled = false;
        this.detectors.delete(deviceId);

        logger.info(`Stopped motion detection for device ${deviceId}`);
    }

    async captureFrames(deviceId) {
        const detector = this.detectors.get(deviceId);
        if (!detector || !detector.enabled) return;

        // Add to processing queue instead of processing immediately
        this.detectionQueue.push({
            deviceId,
            timestamp: Date.now(),
            streamUrl: detector.streamUrl
        });

        // Schedule next capture
        setTimeout(() => {
            if (this.detectors.has(deviceId)) {
                this.captureFrames(deviceId);
            }
        }, detector.config.detectionInterval);
    }

    async processFrame(task) {
        const { deviceId, timestamp } = task;
        const detector = this.detectors.get(deviceId);
        if (!detector) return;

        // Simulate frame capture (in production, this would capture from stream)
        const frame = await this.simulateFrameCapture(deviceId);

        // Basic motion detection
        const motionDetected = this.detectMotion(detector, frame);

        if (motionDetected) {
            const detectionResult = {
                deviceId,
                timestamp: new Date().toISOString(),
                type: 'motion',
                confidence: this.calculateConfidence(detector, frame),
                objects: []
            };

            // Object detection if enabled
            if (this.config.enableObjectDetection) {
                try {
                    const predictions = await this.detectObjects(frame);
                    detectionResult.objects = this.classifyObjects(predictions);
                } catch (error) {
                    logger.error(`Object detection failed for device ${deviceId}:`, error);
                }
            }

            // Check cooldown period
            const lastAlert = this.lastAlertTime.get(deviceId) || 0;
            const timeSinceLastAlert = Date.now() - lastAlert;

            if (timeSinceLastAlert > detector.config.cooldownPeriod) {
                this.lastAlertTime.set(deviceId, Date.now());

                // Emit motion event
                this.emit('motion', {
                    ...detectionResult,
                    deviceId,
                    alertLevel: this.determineAlertLevel(detectionResult),
                    summary: this.generateAlertSummary(detectionResult.objects)
                });

                // Store in database
                await this.storeMotionEvent(detectionResult);

                detector.detectionCount++;
                detector.lastDetection = detectionResult;
            }
        }

        // Update previous frame for next comparison
        detector.previousFrame = frame;
    }

    detectMotion(detector, currentFrame) {
        if (!detector.previousFrame) {
            detector.previousFrame = currentFrame;
            return false;
        }

        // Simple frame difference calculation (placeholder)
        // In production, use proper computer vision techniques
        const diff = this.calculateFrameDifference(detector.previousFrame, currentFrame);
        return diff > (detector.config.sensitivity / 100);
    }

    calculateFrameDifference(frame1, frame2) {
        // Simulate frame difference calculation
        // In production, use actual pixel comparison
        return Math.random(); // Random value for simulation
    }

    calculateConfidence(detector, frame) {
        // Calculate confidence based on motion intensity
        // In production, use actual motion vectors
        return Math.floor(60 + Math.random() * 40); // 60-100% confidence
    }

    async detectObjects(frame) {
        // Simulate object detection (in production, use TensorFlow.js or similar)
        const mockPredictions = [];

        if (Math.random() > 0.5) {
            mockPredictions.push({
                class: 'person',
                score: 0.85,
                bbox: [100, 100, 200, 300]
            });
        }

        if (Math.random() > 0.7) {
            mockPredictions.push({
                class: 'cat',
                score: 0.75,
                bbox: [300, 200, 100, 100]
            });
        }

        if (Math.random() > 0.8) {
            mockPredictions.push({
                class: 'car',
                score: 0.90,
                bbox: [400, 300, 300, 200]
            });
        }

        return mockPredictions;
    }

    classifyObjects(predictions) {
        const classified = {
            living: {
                human: [],
                animal: []
            },
            nonLiving: {
                vehicle: [],
                furniture: [],
                electronics: [],
                other: []
            }
        };

        predictions.forEach(pred => {
            const obj = {
                class: pred.class,
                confidence: pred.score,
                bbox: pred.bbox
            };

            // Classify based on category
            for (const [category, classes] of Object.entries(this.objectCategories)) {
                if (classes.includes(pred.class)) {
                    if (category === 'human') {
                        classified.living.human.push(obj);
                    } else if (category === 'animal') {
                        classified.living.animal.push(obj);
                    } else if (category === 'vehicle') {
                        classified.nonLiving.vehicle.push(obj);
                    } else if (category === 'furniture') {
                        classified.nonLiving.furniture.push(obj);
                    } else if (category === 'electronics') {
                        classified.nonLiving.electronics.push(obj);
                    } else {
                        classified.nonLiving.other.push(obj);
                    }
                    break;
                }
            }
        });

        return classified;
    }

    generateAlertSummary(objects) {
        if (!objects) return 'General motion detected';

        const summaryParts = [];

        if (objects.living?.human?.length > 0) {
            summaryParts.push(`${objects.living.human.length} person(s)`);
        }

        if (objects.living?.animal?.length > 0) {
            const animals = objects.living.animal.map(a => a.class).join(', ');
            summaryParts.push(`animal(s): ${animals}`);
        }

        if (objects.nonLiving?.vehicle?.length > 0) {
            summaryParts.push(`${objects.nonLiving.vehicle.length} vehicle(s)`);
        }

        return summaryParts.length > 0
            ? `Detected: ${summaryParts.join(', ')}`
            : 'Motion detected';
    }

    determineAlertLevel(detection) {
        // Determine alert severity based on detected objects
        if (detection.objects?.living?.human?.length > 0) {
            return 'high';
        } else if (detection.objects?.living?.animal?.length > 0) {
            return 'medium';
        } else if (detection.objects?.nonLiving?.vehicle?.length > 0) {
            return 'medium';
        } else {
            return 'low';
        }
    }

    async storeMotionEvent(detection) {
        // Store in database (implement based on your DB connection)
        try {
            const eventId = `motion-${detection.deviceId}-${Date.now()}`;

            // This would be replaced with actual DB storage
            logger.info(`Stored motion event ${eventId} for device ${detection.deviceId}`);

            return eventId;
        } catch (error) {
            logger.error('Failed to store motion event:', error);
        }
    }

    async simulateFrameCapture(deviceId) {
        // Simulate frame capture
        // In production, extract frame from video stream
        return {
            deviceId,
            timestamp: Date.now(),
            width: 1920,
            height: 1080,
            data: Buffer.alloc(1920 * 1080 * 3) // RGB data
        };
    }

    updateConfig(deviceId, config) {
        const detector = this.detectors.get(deviceId);
        if (detector) {
            detector.config = { ...detector.config, ...config };
            logger.info(`Updated motion detection config for device ${deviceId}`);
        }
    }

    getStatistics(deviceId) {
        const detector = this.detectors.get(deviceId);
        if (!detector) return null;

        return {
            deviceId,
            enabled: detector.enabled,
            detectionCount: detector.detectionCount,
            lastDetection: detector.lastDetection,
            config: detector.config
        };
    }

    getAllStatistics() {
        const stats = [];
        this.detectors.forEach((detector, deviceId) => {
            stats.push(this.getStatistics(deviceId));
        });
        return stats;
    }

    // Batch operations for handling many cameras
    async startBatchDetection(deviceIds, options = {}) {
        const results = [];

        for (const batch of this.chunkArray(deviceIds, this.config.batchSize)) {
            const batchResults = await Promise.all(
                batch.map(deviceId => this.startDetection(deviceId, `stream-${deviceId}`, options))
            );
            results.push(...batchResults);
        }

        return results;
    }

    stopAllDetections() {
        this.detectors.forEach((detector, deviceId) => {
            this.stopDetection(deviceId);
        });
    }

    chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
}

// Singleton instance
let motionDetectionService = null;

module.exports = {
    getMotionDetectionService: () => {
        if (!motionDetectionService) {
            motionDetectionService = new MotionDetectionService();
        }
        return motionDetectionService;
    },
    MotionDetectionService
};