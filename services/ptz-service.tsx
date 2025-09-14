class PTZService {
    private baseUrl = 'http://localhost:3001/api/ptz';

    async moveCamera(deviceId: string, direction: string, speed: number = 5) {
        try {
            const response = await fetch(`${this.baseUrl}/${deviceId}/move`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ direction, speed })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'PTZ move failed');
            }

            return await response.json();
        } catch (error) {
            console.error('PTZ move error:', error);
            throw error;
        }
    }

    async zoomCamera(deviceId: string, direction: 'in' | 'out', speed: number = 5) {
        try {
            const response = await fetch(`${this.baseUrl}/${deviceId}/zoom`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ direction, speed })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'PTZ zoom failed');
            }

            return await response.json();
        } catch (error) {
            console.error('PTZ zoom error:', error);
            throw error;
        }
    }

    async stopCamera(deviceId: string) {
        try {
            const response = await fetch(`${this.baseUrl}/${deviceId}/stop`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'PTZ stop failed');
            }

            return await response.json();
        } catch (error) {
            console.error('PTZ stop error:', error);
            throw error;
        }
    }

    async goToHome(deviceId: string) {
        try {
            const response = await fetch(`${this.baseUrl}/${deviceId}/home`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'PTZ home failed');
            }

            return await response.json();
        } catch (error) {
            console.error('PTZ home error:', error);
            throw error;
        }
    }

    async goToPreset(deviceId: string, presetToken: string) {
        try {
            const response = await fetch(`${this.baseUrl}/${deviceId}/preset`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ presetToken })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'PTZ preset failed');
            }

            return await response.json();
        } catch (error) {
            console.error('PTZ preset error:', error);
            throw error;
        }
    }

    async getPresets(deviceId: string) {
        try {
            const response = await fetch(`${this.baseUrl}/${deviceId}/presets`);

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to get presets');
            }

            const data = await response.json();
            return data.presets || [];
        } catch (error) {
            console.error('Get presets error:', error);
            return [];
        }
    }
}

export const ptzService = new PTZService();
export { PTZService };