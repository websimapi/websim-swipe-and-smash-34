export default class GameTimer {
    constructor(duration, element, onEnd) {
        this.duration = duration;
        this.element = element;
        this.onEnd = onEnd;

        this.value = duration;
        this.interval = null;
        this.isPaused = false;
    }

    start() {
        this.interval = setInterval(() => {
            if (this.isPaused) return;

            this.value--;
            this.element.textContent = this.value;
            if (this.value <= 0) {
                this.onEnd();
            }
        }, 1000);
    }

    reset() {
        this.value = this.duration;
        this.element.textContent = this.value;
    }

    pause() {
        this.isPaused = true;
    }

    resume() {
        this.isPaused = false;
    }

    stop() {
        clearInterval(this.interval);
        this.interval = null;
    }
}

