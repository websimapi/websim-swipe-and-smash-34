import Board from './board.js';
import InputHandler from './input.js';
import Replay from './replay.js';
import { playSound, pauseBackgroundMusic, resumeBackgroundMusic, stopBackgroundMusic, playBackgroundMusic } from './audio.js';
import * as recorder from './recorder.js';
import OrientationHandler from './orientation.js';
import GameTimer from './timer.js';
import UI from './ui.js';

const config = {
    boardSize: 10,
    candyTypes: [
        'candy_red.png',
        'candy_blue.png',
        'candy_green.png',
        'candy_yellow.png',
        'candy_purple.png',
        'candy_orange.png'
    ],
    pointsPerCandy: 10,
    timerDuration: 15,
    initialSmashValue: 0
};

const POSITIVE_FEEDBACK_SOUNDS = [
    'nice_swipe.mp3',
    'tasty_trio.mp3',
    'good_move.mp3'
];

const ORIENTATIONS = ['portrait-primary', 'landscape-primary', 'portrait-secondary', 'landscape-secondary'];

function getOrientationColor(orientation) {
    switch (orientation) {
        case 'portrait-primary': return '#4285F4'; // Blue
        case 'landscape-primary': return '#34A853'; // Green
        case 'portrait-secondary': return '#EA4335'; // Red
        case 'landscape-secondary': return '#FBBC05'; // Yellow
        default: return '#ccc';
    }
}

function getOrientationRotation(orientation) {
    switch (orientation) {
        case 'portrait-primary': return 0;
        case 'landscape-primary': return 90; // Rotated right
        case 'portrait-secondary': return 180;
        case 'landscape-secondary': return 270; // Rotated left (use 270 for simpler math)
        default: return 0;
    }
}

function getIndicatorPosition(orientation) {
    switch (orientation) {
        case 'portrait-primary': return { top: '-5px', left: '-5px', right: 'auto', bottom: 'auto' };
        case 'landscape-primary': return { top: '-5px', right: '-5px', left: 'auto', bottom: 'auto' };
        case 'portrait-secondary': return { bottom: '-5px', right: '-5px', top: 'auto', left: 'auto' };
        case 'landscape-secondary': return { bottom: '-5px', left: '-5px', top: 'auto', right: 'auto' };
        default: return { top: '-5px', left: '-5px', right: 'auto', bottom: 'auto' };
    }
}

class Game {
    constructor() {
        this.board = new Board(config.boardSize, config.candyTypes, this.onMatch.bind(this), this.getNewCandyType.bind(this));
        this.score = 0;
        this.scoreElement = document.getElementById('score');
        this.isProcessing = false;
        this.isGameStarted = false;

        this.comboCount = 0;
        this.smashValue = config.initialSmashValue;
        this.smashProgress = 0; // 0, 0.5
        this.orientationIndicator = document.getElementById('orientation-indicator');
        this.orientationHandler = new OrientationHandler(this.orientationIndicator, this.onOrientationChange.bind(this));
        this.timer = new GameTimer(config.timerDuration, document.getElementById('timer'), this.onTimerEnd.bind(this));
        this.ui = new UI({ onStartGame: this.onStartGame.bind(this) });
        
        // Replay logic is now in its own class
        this.replay = new Replay(this, config);
        this.isRecordingStarted = false;
        
        this.inputHandler = new InputHandler(this.board.boardElement, this.onSwap.bind(this), this.onSmash.bind(this));
        
        this.requiredOrientation = 'portrait-primary';
        this.currentOrientation = null;
        this.requiredOrientationIndicator = document.getElementById('required-orientation-indicator');
        this.orientationRuleInterval = null;

        this.ui.updateScore(0);
        this.ui.updateSmash(this.smashValue, this.smashProgress);
        this.initializeBoard();
    }

    initializeBoard() {
        // Pre-generate initial state so we can record it before the game starts
        const initialState = [];
        for (let r = 0; r < config.boardSize; r++) {
            initialState[r] = [];
            for (let c = 0; c < config.boardSize; c++) {
                initialState[r][c] = this.getNewCandyType(true); // isInitial is true
            }
        }
        this.board.initialize(initialState);
    }

    getNewCandyType(isInitial = false) {
        const type = config.candyTypes[Math.floor(Math.random() * config.candyTypes.length)];
        
        // Only record new candies after the game has officially started
        // and the initial board state has been recorded.
        if (!isInitial && this.isRecordingStarted) {
            recorder.recordAction({ type: 'newCandy', candyType: type });
        }
        return type;
    }

    async onStartGame() {
        await this.orientationHandler.requestPermission();
        this.startGame();
    }

    startGame() {
        if (this.isGameStarted) return;
        this.isGameStarted = true;

        this.ui.showStartOverlay(false);
        
        playBackgroundMusic();
        recorder.startRecording(this.board.grid);
        this.isRecordingStarted = true;
        
        // Record the initial cascade as an action for the replay.
        recorder.recordAction({ type: 'initialCascade' });

        this.timer.start();
        
        this.changeRequiredOrientation(); // Set initial required orientation
        this.orientationRuleInterval = setInterval(this.changeRequiredOrientation.bind(this), 15000);

        this.inputHandler.enable();
        
        // Process any matches that exist at the start of the game
        setTimeout(async () => {
            this.isProcessing = true;
            await this.board.processMatches(false, null);
            this.isProcessing = false;
        }, 500); // Small delay for visual clarity
    }

    onOrientationChange(newOrientation) {
        if (this.currentOrientation === newOrientation) return;
        this.currentOrientation = newOrientation;
        
        const color = getOrientationColor(newOrientation);
        this.board.boardElement.style.borderColor = color;
        
        const pos = getIndicatorPosition(newOrientation);
        Object.assign(this.orientationIndicator.style, pos);

        if (this.isRecordingStarted) {
            recorder.recordAction({ type: 'currentOrientationChange', orientation: newOrientation });
        }
        this.checkOrientationMatch();
    }

    checkOrientationMatch() {
        if (!this.isGameStarted) return;
        const isMatch = this.currentOrientation === this.requiredOrientation;
        
        if (isMatch) {
            this.inputHandler.enable();
        } else {
            this.inputHandler.disable();
        }
    }
    
    changeRequiredOrientation() {
        const possibleOrientations = ORIENTATIONS.filter(o => o !== this.requiredOrientation);
        this.requiredOrientation = possibleOrientations[Math.floor(Math.random() * possibleOrientations.length)];
        this.requiredOrientationIndicator.style.backgroundColor = getOrientationColor(this.requiredOrientation);
        
        const requiredPos = getIndicatorPosition(this.requiredOrientation);
        Object.assign(this.requiredOrientationIndicator.style, requiredPos);

        if (this.isRecordingStarted) {
            recorder.recordAction({ type: 'orientationChange', orientation: this.requiredOrientation });
        }

        const rotation = getOrientationRotation(this.requiredOrientation);
        // this.ui.gameBoardContainer.style.transform = `rotate(${rotation}deg)`; // No longer rotating container
        
        // Rotate each candy individually so it appears facing the new "up"
        this.board.boardElement.querySelectorAll('.candy').forEach(candy => {
            // Preserve existing transforms like scale, and add rotation
            const currentTransform = candy.style.transform;
            const existingTransforms = currentTransform.replace(/rotate\([^)]+\)/g, '').trim();
            candy.style.transform = `${existingTransforms} rotate(${rotation}deg)`;
        });
        
        // Combo display still needs its own rotation, but relative to the already rotating container
        this.ui.comboDisplay.style.transform = `translate(-50%, -50%) rotate(0deg) scale(0.8)`;
        this.inputHandler.setRotation(rotation);

        this.checkOrientationMatch();
    }

    onTimerEnd() {
        if (this.smashValue > 0) {
            this.smashValue--;
            this.ui.updateSmash(this.smashValue, this.smashProgress);
        } else {
            // Game over / round over condition
            recorder.resetRecording();
            this.isRecordingStarted = false;
        }
        this.smashProgress = 0; // Reset progress if timer runs out
        this.ui.updateSmash(this.smashValue, this.smashProgress);
        this.timer.reset();
    }

    pauseTimer() {
        this.timer.pause();
    }

    resumeTimer() {
        this.timer.resume();
    }

    // Add BGM control methods for the replay module to call
    pauseMainBGM() {
        pauseBackgroundMusic();
    }

    resumeMainBGM() {
        resumeBackgroundMusic();
    }

    // removed function updateComboUI() {}

    // removed function updateSmashUI() {}

    // removed function updateScore() {}

    onMatch(matchedCandies, isPlayerMove) {
        if (this.isRainbowMode) {
            clearTimeout(this.rainbowComboTimeout);
        }

        playSound('match.mp3');
        recorder.recordSound('match.mp3');
        this.score += matchedCandies.length * config.pointsPerCandy;
        this.ui.updateScore(this.score);
        
        this.comboCount++;
        if (this.isRecordingStarted) recorder.recordAction({ type: 'comboUpdate', count: this.comboCount });
        this.ui.updateCombo(this.comboCount, this.isRainbowMode);

        if (this.comboCount >= 7 && !this.isRainbowMode) {
            this.startRainbowMode();
        }

        if (this.isRainbowMode) {
            this.rainbowComboTimeout = setTimeout(() => this.endRainbowMode(), 3500);
        }

        // Audio feedback
        if (this.comboCount === 6) {
            playSound('combo_6.mp3');
            recorder.recordSound('combo_6.mp3');
        } else if (this.comboCount === 7) {
            playSound('combo_7.mp3');
            recorder.recordSound('combo_7.mp3');
        } else if (this.comboCount > 2) {
             playSound('crunch_combo.mp3');
             recorder.recordSound('crunch_combo.mp3');
        } else if (isPlayerMove) {
            const randomSound = POSITIVE_FEEDBACK_SOUNDS[Math.floor(Math.random() * POSITIVE_FEEDBACK_SOUNDS.length)];
            playSound(randomSound);
            recorder.recordSound(randomSound);
        }
        
        if (isPlayerMove) {
            this.smashProgress += 0.5;
            this.ui.updateSmash(this.smashValue, this.smashProgress);

            if (this.smashProgress >= 1) {
                this.ui.fillAndResetSmash(() => {
                    if (this.smashValue < 12) {
                        this.smashValue++;
                    }
                    this.smashProgress = 0;
                });
            }
            
            this.timer.reset();
        }

        if (matchedCandies.length >= 5) {
            this.ui.showConfetti();
        }
    }

    startRainbowMode() {
        this.isRainbowMode = true;
        this.ui.toggleRainbowMode(true);
        playSound('smash_success.mp3');
        recorder.recordSound('smash_success.mp3');
        recorder.recordAction({ type: 'startRainbow' });
    }

    endRainbowMode() {
        this.isRainbowMode = false;
        this.ui.toggleRainbowMode(false);
        this.comboCount = 0;
        if (this.isRecordingStarted) recorder.recordAction({ type: 'comboUpdate', count: this.comboCount });
        clearTimeout(this.rainbowComboTimeout);
        this.rainbowComboTimeout = null;
        recorder.recordAction({ type: 'endRainbow' });
    }

    async onSmash(candy) {
        if (this.isProcessing || this.smashValue <= 0) return;
        this.isProcessing = true;
        this.pauseTimer();

        const r = parseInt(candy.dataset.row);
        const c = parseInt(candy.dataset.col);
        const candiesToSmash = new Set();
        let smashCost = 0;

        if (this.smashValue >= 7 && this.smashValue <= 12) {
            // 3x3 area centered on the candy
            for (let i = r - 1; i <= r + 1; i++) {
                for (let j = c - 1; j <= c + 1; j++) {
                    if (this.board.isValid(i, j) && this.board.grid[i][j]) {
                        candiesToSmash.add(this.board.grid[i][j]);
                    }
                }
            }
            smashCost = 3;
        } else if (this.smashValue >= 4 && this.smashValue <= 6) {
            // 2x2 area starting from the candy (top-left)
            for (let i = r; i <= r + 1; i++) {
                for (let j = c; j <= c + 1; j++) {
                    if (this.board.isValid(i, j) && this.board.grid[i][j]) {
                        candiesToSmash.add(this.board.grid[i][j]);
                    }
                }
            }
            smashCost = 2;
        } else if (this.smashValue >= 1 && this.smashValue <= 3) {
            candiesToSmash.add(candy);
            smashCost = 1;
        }

        if (this.smashValue < smashCost || smashCost === 0) {
            this.isProcessing = false;
            this.resumeTimer();
            return;
        }
        
        const smashedCoords = Array.from(candiesToSmash).map(c => ({
            r: parseInt(c.dataset.row),
            c: parseInt(c.dataset.col)
        }));
        if (this.isRecordingStarted) recorder.recordAction({ type: 'smash', smashed: smashedCoords });

        this.smashValue -= smashCost;
        this.ui.updateSmash(this.smashValue, this.smashProgress);
        playSound('smash.mp3');
        recorder.recordSound('smash.mp3');
        
        // Pass a flag to indicate this is a smash action
        await this.board.smashCandies(Array.from(candiesToSmash));

        this.isProcessing = false;
        this.resumeTimer();
    }

    async onSwap(candy1, candy2) {
        if (this.isProcessing) return;
        this.isProcessing = true;
        this.pauseTimer();
        if (!this.isRainbowMode) {
            this.comboCount = 0; // Reset combo on new player move, unless in rainbow mode
            if (this.isRecordingStarted) recorder.recordAction({ type: 'comboUpdate', count: this.comboCount });
        }
        
        const r1 = parseInt(candy1.dataset.row);
        const c1 = parseInt(candy1.dataset.col);
        const r2 = parseInt(candy2.dataset.row);
        const c2 = parseInt(candy2.dataset.col);
        
        const candy1Powerup = candy1.dataset.powerup;
        const candy2Powerup = candy2.dataset.powerup;

        if (candy1Powerup === 'rainbow' || candy2Powerup === 'rainbow') {
            const rainbowCandy = candy1Powerup === 'rainbow' ? candy1 : candy2;
            const otherCandy = candy1Powerup === 'rainbow' ? candy2 : candy1;
            
            if (this.isRecordingStarted) {
                recorder.recordAction({
                    type: 'activateRainbow',
                    rainbowCandy: { r: parseInt(rainbowCandy.dataset.row), c: parseInt(rainbowCandy.dataset.col) },
                    otherCandy: { r: parseInt(otherCandy.dataset.row), c: parseInt(otherCandy.dataset.col) }
                });
            }
            
            // We don't need to swap visually, just activate
            await this.board.activateRainbowPowerup(rainbowCandy, otherCandy);
            this.isProcessing = false;
            this.resumeTimer();
            return;
        }
        
        if (this.isRecordingStarted) recorder.recordAction({ type: 'swap', from: { r: r1, c: c1 }, to: { r: r2, c: c2 } });
        
        await this.board.swapCandies(candy1, candy2);
        const isValidSwap = await this.board.processMatches(false, [candy1, candy2]);

        if (!isValidSwap && this.comboCount < 6) {
            // If no matches, swap back, unless in high-combo mode
            await this.board.swapCandies(candy1, candy2);
        }
        
        this.isProcessing = false;
        this.resumeTimer();
    }
}

window.addEventListener('load', () => {
    new Game();
});