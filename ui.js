import confetti from 'confetti';

export default class UI {
    constructor(callbacks) {
        this.scoreElement = document.getElementById('score');
        this.comboDisplay = document.getElementById('combo-display');
        this.smashValueElement = document.getElementById('smash-value');
        this.smashFluidElement = document.getElementById('smash-fluid');
        this.timerElement = document.getElementById('timer');
        this.gameBoardContainer = document.getElementById('game-board-container');

        this.comboTimeout = null;

        this.setupEventListeners(callbacks);
    }

    setupEventListeners({ onStartGame }) {
        document.getElementById('start-button').addEventListener('click', onStartGame);
    }

    updateScore(score) {
        this.scoreElement.textContent = score;
    }

    updateTimer(value) {
        this.timerElement.textContent = value;
    }

    updateSmash(value, progress) {
        this.smashValueElement.textContent = value;
        const fillPercentage = progress * 100;
        this.smashFluidElement.style.height = `${fillPercentage}%`;
    }

    updateCombo(count, isRainbowMode) {
        if (count < 2) {
            if (!isRainbowMode) {
                this.comboDisplay.classList.remove('visible');
            }
            return;
        }

        this.comboDisplay.textContent = `Combo x${count}`;
        this.comboDisplay.classList.add('visible');

        clearTimeout(this.comboTimeout);
        if (!isRainbowMode) {
            this.comboTimeout = setTimeout(() => {
                this.comboDisplay.classList.remove('visible');
            }, 1500);
        }
    }

    showStartOverlay(show) {
        document.getElementById('start-overlay').classList.toggle('hidden', !show);
    }

    toggleRainbowMode(enabled) {
        this.gameBoardContainer.classList.toggle('rainbow-mode', enabled);
        this.comboDisplay.classList.toggle('rainbow', enabled);
        if(enabled) {
            clearTimeout(this.comboTimeout);
        } else {
            this.comboDisplay.classList.remove('visible');
        }
    }

    showConfetti() {
        confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 }
        });
    }

    fillAndResetSmash(onComplete) {
        // Animate fill, update value, then animate empty
        this.smashFluidElement.style.transition = 'height 0.3s ease-in';
        this.smashFluidElement.style.height = '100%';

        setTimeout(() => {
            onComplete(); // This will update the smash value

            setTimeout(() => {
                this.smashFluidElement.style.transition = 'height 0.5s ease-out';
                this.updateSmash(this.smashValueElement.textContent, 0); // uses current value, resets progress
            }, 200); // Wait a moment before draining
        }, 300); // Duration of the fill animation
    }
}