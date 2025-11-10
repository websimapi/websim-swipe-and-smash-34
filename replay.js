import Board from './board.js';
import * as recorder from './recorder.js';
import { playSound, playBackgroundMusic } from './audio.js';

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
        case 'landscape-primary': return 90;
        case 'portrait-secondary': return 180;
        case 'landscape-secondary': return 270; // Use 270 instead of -90 for consistency
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

export default class Replay {
    constructor(game, config) {
        this.game = game;
        this.config = config;
        this.replayTimeouts = [];
        this.replayBgmControl = null;
        this.controlsTimeout = null;
        this.comboTimeout = null;
        this.state = {
            isPlaying: false,
            isPaused: false,
            pauseTime: 0,
            startTime: 0,
            actions: [],
            currentReplayBoard: null,
            lastRequiredOrientation: 'portrait-primary',
            lastCurrentOrientation: 'portrait-primary',
        };

        this.setupUI();
    }

    setupUI() {
        document.getElementById('clip-button').addEventListener('click', () => this.show());
        document.getElementById('close-replay-button').addEventListener('click', () => this.hide());
        document.getElementById('replay-container').addEventListener('click', () => this.handleContainerClick());
    }

    handleContainerClick() {
        if (!this.state.isPlaying) return;

        if (this.state.isPaused) {
            this.resume();
        } else {
            this.pause();
        }
    }

    updateReplayOrientation() {
        const requiredIndicator = document.getElementById('replay-required-orientation-indicator');
        const currentIndicator = document.getElementById('replay-orientation-indicator');
        const board = document.getElementById('replay-board');
        const container = document.getElementById('replay-container');
        const combo = document.getElementById('replay-combo-display');

        const rotation = getOrientationRotation(this.state.lastRequiredOrientation);
        
        if (container) {
            // container.style.transform = `rotate(${rotation}deg)`; // No longer rotating container
        }

        if (requiredIndicator) {
            requiredIndicator.style.backgroundColor = getOrientationColor(this.state.lastRequiredOrientation);
            const requiredPos = getIndicatorPosition(this.state.lastRequiredOrientation);
            Object.assign(requiredIndicator.style, requiredPos);
        }
         if (currentIndicator) {
            currentIndicator.style.backgroundColor = getOrientationColor(this.state.lastCurrentOrientation);
            const currentPos = getIndicatorPosition(this.state.lastCurrentOrientation);
            Object.assign(currentIndicator.style, currentPos);
        }

        if (board) {
            board.style.borderColor = getOrientationColor(this.state.lastCurrentOrientation);
            // Rotate candies on replay board
            board.querySelectorAll('.replay-candy').forEach(candy => {
                candy.style.transform = `rotate(${rotation}deg)`;
            });
        }

        if (combo) {
            // Re-apply combo transform based on its state
            const isRainbow = combo.classList.contains('rainbow');
            const isVisible = combo.classList.contains('visible');
            let scale = 'scale(0.8)';
            if (isVisible && !isRainbow) scale = 'scale(1.2)';
            if (isRainbow) scale = 'scale(1)';

            const translate = isRainbow ? 'translate(0, 0)' : 'translate(-50%, -50%)';
            combo.style.transform = `${translate} rotate(0deg) ${scale}`;
        }
    }

    showControls() {
        const playPauseButton = document.getElementById('play-pause-button');
        playPauseButton.classList.add('visible');
        clearTimeout(this.controlsTimeout);
        this.controlsTimeout = setTimeout(() => {
            playPauseButton.classList.remove('visible');
        }, 1000);
    }
    
    show() {
        this.game.pauseTimer();
        this.game.pauseMainBGM();
        if (this.game.isRecordingStarted) {
            recorder.pauseRecording();
        }
        const modal = document.getElementById('replay-modal');
        modal.classList.remove('hidden');
        this.play();
    }

    hide() {
        const modal = document.getElementById('replay-modal');
        modal.classList.add('hidden');
        this.stop(); // Use stop to properly clean up

        // Remove combo display if it exists
        const comboDisplay = document.getElementById('replay-combo-display');
        if (comboDisplay) {
            comboDisplay.remove();
        }

        // Reset orientation on hide
        this.state.lastRequiredOrientation = 'portrait-primary';
        this.state.lastCurrentOrientation = 'portrait-primary';
        this.updateReplayOrientation();

        // Force cleanup of any lingering replay candy elements
        const lingeringCandies = document.querySelectorAll('.replay-candy');
        lingeringCandies.forEach(candy => candy.remove());

        if (this.game.isRecordingStarted) {
            recorder.resumeRecording();
        }
        this.game.resumeMainBGM();
        this.game.resumeTimer();
    }

    async play() {
        const playPauseButton = document.getElementById('play-pause-button');

        const recording = recorder.getRecording();
        if (!recording || !recording.initialState) return;

        this.replayTimeouts.forEach(clearTimeout);
        this.replayTimeouts = [];

        const replayBoardElement = document.getElementById('replay-board');
        replayBoardElement.innerHTML = ''; // Clear previous replay

        const candyQueue = recording.actions.filter(a => a.type === 'newCandy').map(a => a.candyType);
        const replayTypeGenerator = () => {
            const nextType = candyQueue.shift();
            // Fallback, though it shouldn't be needed with proper recording.
            return nextType || this.config.candyTypes[0];
        };

        const replayBoard = new Board(this.config.boardSize, this.config.candyTypes, () => {}, replayTypeGenerator, () => this.state.isPaused);
        replayBoard.boardElement = replayBoardElement;
        replayBoard.setupBoard();

        // Override functions for replay board to tag candies
        replayBoard.createCandy = function(row, col, type, isInitializing = false) {
            return Board.prototype.createCandy.call(this, row, col, type, isInitializing, true);
        };
        replayBoard.fillBoard = function() {
            return Board.prototype.fillBoard.call(this, true);
        };

        replayBoard.initialize(recording.initialState);

        this.state.isPlaying = true;
        this.state.isPaused = false;
        this.state.startTime = performance.now();
        this.state.actions = [...recording.actions];
        this.state.currentReplayBoard = replayBoard; // Store for resume
        this.state.lastRequiredOrientation = 'portrait-primary';
        this.state.lastCurrentOrientation = 'portrait-primary';

        playPauseButton.innerHTML = '&#10074;&#10074;'; // Pause icon
        playPauseButton.classList.remove('visible');
        
        this.showControls(); // Show controls for 1 second at the start

        this.scheduleActions(replayBoard);
    }

    scheduleActions(replayBoard, resumeFromTime = 0) {
        this.replayTimeouts.forEach(clearTimeout);
        this.replayTimeouts = [];

        this.state.actions.forEach(action => {
            if (action.timestamp < resumeFromTime) {
                return; // Skip actions that have already passed
            }

            const delay = action.timestamp - resumeFromTime;

            const timeoutId = setTimeout(async () => {
                if (this.state.isPaused) return;

                if (action.type === 'swap') {
                    const candy1 = replayBoard.grid[action.from.r][action.from.c];
                    const candy2 = replayBoard.grid[action.to.r][action.to.c];
                    if(candy1 && candy2) {
                        await replayBoard.swapCandies(candy1, candy2);
                        const isValid = await replayBoard.processMatches(false, [candy1, candy2]);
                        if(!isValid) {
                             await replayBoard.swapCandies(candy1, candy2);
                        }
                    }
                } else if (action.type === 'activateRainbow') {
                    const rainbowCandy = replayBoard.grid[action.rainbowCandy.r][action.rainbowCandy.c];
                    const otherCandy = replayBoard.grid[action.otherCandy.r][action.otherCandy.c];
                    if (rainbowCandy && otherCandy) {
                        await replayBoard.activateRainbowPowerup(rainbowCandy, otherCandy);
                    }
                } else if (action.type === 'smash') {
                    const candiesToSmash = action.smashed
                        .map(coords => (replayBoard.grid[coords.r] ? replayBoard.grid[coords.r][coords.c] : null))
                        .filter(Boolean);
                    if (candiesToSmash.length > 0) {
                        await replayBoard.smashCandies(candiesToSmash);
                    }
                } else if (action.type === 'initialCascade') {
                    await replayBoard.processMatches(false, null);
                } else if (action.type === 'orientationChange') {
                    this.state.lastRequiredOrientation = action.orientation;
                    this.updateReplayOrientation();
                } else if (action.type === 'currentOrientationChange') {
                    this.state.lastCurrentOrientation = action.orientation;
                    this.updateReplayOrientation();
                } else if (action.type === 'sound') {
                    playSound(action.name);
                } else if (action.type === 'startRainbow') {
                    document.getElementById('replay-board').parentElement.classList.add('rainbow-mode');
                } else if (action.type === 'endRainbow') {
                    document.getElementById('replay-board').parentElement.classList.remove('rainbow-mode');
                } else if (action.type === 'comboUpdate') {
                    this.updateReplayCombo(action.count);
                } else if (action.type === 'startBGM' && !this.replayBgmControl) {
                    this.replayBgmControl = await playBackgroundMusic(true);
                }
            }, delay);

            this.replayTimeouts.push(timeoutId);
        });

        const recordingDuration = this.state.actions.length > 0 ? this.state.actions[this.state.actions.length - 1].timestamp : 0;
        const endTimeout = setTimeout(() => {
            if (!this.state.isPaused) {
                this.hide(); // Hide modal when replay finishes
            }
        }, recordingDuration - resumeFromTime + 2000); // 2 seconds after last action
        this.replayTimeouts.push(endTimeout);
    }

    togglePlayback() {
        if (this.state.isPlaying) {
            if (this.state.isPaused) {
                this.resume();
            } else {
                this.pause();
            }
        }
    }

    pause() {
        if (!this.state.isPlaying || this.state.isPaused) return;

        this.replayTimeouts.forEach(clearTimeout);
        this.replayTimeouts = [];
        this.state.isPaused = true;
        this.state.pauseTime = performance.now() - this.state.startTime;
        if (this.replayBgmControl && this.replayBgmControl.pause) {
            this.replayBgmControl.pause();
        }
        clearTimeout(this.controlsTimeout);

        const playPauseButton = document.getElementById('play-pause-button');
        playPauseButton.innerHTML = '&#9658;'; // Play icon
        playPauseButton.classList.add('visible');
    }

    resume() {
        if (!this.state.isPaused) return;

        this.state.isPaused = false;
        this.state.startTime = performance.now() - this.state.pauseTime;

        if (this.replayBgmControl && this.replayBgmControl.resume) {
            this.replayBgmControl.resume();
        }
        
        this.scheduleActions(this.state.currentReplayBoard, this.state.pauseTime);

        const playPauseButton = document.getElementById('play-pause-button');
        playPauseButton.innerHTML = '&#10074;&#10074;'; // Pause icon
        playPauseButton.classList.remove('visible');
    }

    updateReplayCombo(count) {
        let comboDisplay = document.getElementById('replay-combo-display');
        if (!comboDisplay) {
            comboDisplay = document.createElement('div');
            comboDisplay.id = 'replay-combo-display';
            // Mimic styles from CSS for consistency
            comboDisplay.className = 'combo-display-base';
            document.getElementById('replay-container').appendChild(comboDisplay);
        }

        clearTimeout(this.comboTimeout);

        if (count < 2) {
            comboDisplay.classList.remove('visible', 'rainbow');
            return;
        }
        
        const isRainbow = document.getElementById('replay-container').classList.contains('rainbow-mode');

        comboDisplay.textContent = `Combo x${count}`;
        comboDisplay.classList.add('visible');

        // We need to find the *current* orientation to apply the correct rotation transform.
        const recording = recorder.getRecording();
        let lastOrientation = 'portrait-primary';
        if (recording && recording.actions) {
            const timeSoFar = performance.now() - this.state.startTime;
            const lastOrientationAction = [...recording.actions]
                .reverse()
                .find(a => a.type === 'orientationChange' && a.timestamp <= timeSoFar);
            if (lastOrientationAction) {
                lastOrientation = lastOrientationAction.orientation;
            }
        }
        // This call will correctly rotate the combo display.
        this.updateReplayOrientation();

        if (isRainbow) {
            comboDisplay.classList.add('rainbow');
        } else {
            comboDisplay.classList.remove('rainbow');
        }

        if (!isRainbow) {
            this.comboTimeout = setTimeout(() => {
                comboDisplay.classList.remove('visible');
            }, 1500);
        }
    }

    stop() {
        this.replayTimeouts.forEach(clearTimeout);
        this.replayTimeouts = [];
        if (this.replayBgmControl) {
            this.replayBgmControl.stop();
            this.replayBgmControl = null;
        }
        clearTimeout(this.controlsTimeout);
        clearTimeout(this.comboTimeout);
        this.state = { isPlaying: false, isPaused: false, pauseTime: 0, startTime: 0, actions: [], currentReplayBoard: null, lastRequiredOrientation: 'portrait-primary', lastCurrentOrientation: 'portrait-primary' };

        const playPauseButton = document.getElementById('play-pause-button');
        playPauseButton.innerHTML = '&#9658;'; // Play icon
        playPauseButton.classList.remove('visible');
    }
}