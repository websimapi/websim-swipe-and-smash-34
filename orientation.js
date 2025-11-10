export default class OrientationHandler {
    constructor(indicatorElement, onOrientationChange) {
        this.indicatorElement = indicatorElement;
        this.onOrientationChange = onOrientationChange || (() => {});
        this.updateIndicator(); // Set initial color
    }

    async requestPermission() {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permissionState = await DeviceOrientationEvent.requestPermission();
                if (permissionState === 'granted') {
                    this.setupListener();
                } else {
                    console.warn('Permission for device orientation not granted. Falling back to screen.orientation API.');
                    this.setupListener(true); // Fallback
                }
            } catch (error) {
                console.error('Error requesting device orientation permission:', error);
                this.setupListener(true); // Fallback on error
            }
        } else {
            // For browsers that don't require permission or don't have the API
            this.setupListener();
        }
    }

    setupListener(useScreenApi = false) {
        if (!useScreenApi && window.DeviceOrientationEvent) {
             window.addEventListener('deviceorientation', (event) => this.updateIndicator(event));
        } else if (window.screen && window.screen.orientation) {
            try {
                 window.screen.orientation.addEventListener('change', () => this.updateIndicator());
            } catch(e) {
                console.warn("screen.orientation.addEventListener is not supported, falling back to onchange");
                window.screen.orientation.onchange = () => this.updateIndicator();
            }
        } else {
            // Fallback for older browsers/devices
            window.addEventListener('orientationchange', () => this.updateIndicator());
        }
    }

    updateIndicator(event) {
        let color = '#ccc'; // Default color
        let orientationType = 'unknown';

        if (event && typeof event.beta === 'number' && typeof event.gamma === 'number') {
            const { beta, gamma } = event;
            const threshold = 45;

            // Determine if it's primarily landscape or portrait by seeing which angle is more pronounced
            if (Math.abs(gamma) > Math.abs(beta)) {
                // Landscape mode
                if (gamma > threshold) {
                    orientationType = 'landscape-secondary'; // Rotated right (yellow)
                } else if (gamma < -threshold) {
                    orientationType = 'landscape-primary'; // Rotated left (green)
                }
            } else {
                // Portrait mode
                if (beta > threshold && beta < 135) {
                    orientationType = 'portrait-primary'; // Upright (blue)
                } else if (beta < -threshold && beta > -135) {
                    orientationType = 'portrait-secondary'; // Upside down (red)
                }
            }
        } else {
             // Fallback to screen.orientation if gyroscope data is not available
            orientationType = window.screen.orientation ? window.screen.orientation.type : this.getLegacyOrientation();
        }

        switch (orientationType) {
            case 'portrait-primary':
                color = '#4285F4'; // Blue
                break;
            case 'landscape-primary':
                color = '#34A853'; // Green
                break;
            case 'portrait-secondary':
                color = '#EA4335'; // Red
                break;
            case 'landscape-secondary':
                color = '#FBBC05'; // Yellow
                break;
        }
        
        if (this.indicatorElement) {
            this.indicatorElement.style.backgroundColor = color;
        }

        this.onOrientationChange(orientationType);
    }

    getLegacyOrientation() {
        if (typeof window.orientation === 'undefined') return 'portrait-primary'; // Default for desktop
        
        if (window.orientation === 0) {
            return 'portrait-primary';
        } else if (window.orientation === 90) {
            return 'landscape-primary';
        } else if (window.orientation === 180) {
            return 'portrait-secondary';
        } else if (window.orientation === -90 || window.orientation === 270) {
            return 'landscape-secondary';
        }
        return 'portrait-primary';
    }
}