/**
 * Copyright (C) 2023 Jeff Shee (jeffshee8969@gmail.com)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import GLib from 'gi://GLib';

import * as DBus from './dbus.js';
import * as Logger from './logger.js';

// Debounce window for the renderer/state-machine mismatch corrector.
// GStreamer can rapidly oscillate between PAUSED and PLAYING while a hardware
// decoder pipeline is warming up (especially right after suspend/resume). If
// we react to every isPlayingChanged immediately, our forced setPlay/setPause
// calls amplify that oscillation and the video can stay frozen for tens of
// seconds. Only act on a mismatch that has remained stable for this long.
const MISMATCH_DEBOUNCE_MS = 1500;


/**
 * Ref: https://kentcdodds.com/blog/implementing-a-simple-state-machine-library-in-javascript
 *
 * @param stateMachineDefinition
 */
function createMachine(stateMachineDefinition) {
    const machine = {
        value: stateMachineDefinition.initialState,
        transition(currentState, event) {
            const currentStateDefinition = stateMachineDefinition[currentState];
            const destinationTransition = currentStateDefinition.transitions[event];
            if (!destinationTransition)
                return null;

            const destinationState = destinationTransition.target;
            const destinationStateDefinition =
          stateMachineDefinition[destinationState];

            destinationTransition.action();
            currentStateDefinition.actions.onExit();
            destinationStateDefinition.actions.onEnter();

            machine.value = destinationState;

            return machine.value;
        },
    };
    return machine;
}

export class PlaybackState {
    constructor() {
        this._logger = new Logger.Logger('playbackState');
        this._renderer = new DBus.RendererWrapper();
        // When true, the isPlayingChanged mismatch handler is suppressed.
        // Used during startup and wake-from-sleep to let the renderer start
        // playing without being immediately force-paused.
        this.suppressMismatch = false;
        // GLib source id for the debounced mismatch corrector (0 = none).
        this._mismatchTimeoutId = 0;
        this._machineDefinition = {
            initialState: 'playing',
            playing: {
                actions: {
                    onEnter: () => {
                        this._renderer.setPlay();
                    },
                    onExit() {},
                },
                transitions: {
                    // userPlay: {},
                    // autoPlay: {},
                    userPause: {
                        target: 'pausedByUser',
                        action: () => {
                            this._logger.debug('playing -> pausedByUser');
                        },
                    },
                    autoPause: {
                        target: 'pausedByAuto',
                        action: () => {
                            this._logger.debug('playing -> pausedByAuto');
                        },
                    },
                },
            },
            pausedByUser: {
                actions: {
                    onEnter: () => {
                        this._renderer.setPause();
                    },
                    onExit() {},
                },
                transitions: {
                    userPlay: {
                        target: 'playing',
                        action: () => {
                            this._logger.debug('pausedByUser -> playing');
                        },
                    },
                    // autoPlay: {},
                    // userPause: {},
                    autoPause: {
                        target: 'paused',
                        action: () => {
                            this._logger.debug('pausedByUser -> paused');
                        },
                    },
                },
            },
            pausedByAuto: {
                actions: {
                    onEnter: () => {
                        this._renderer.setPause();
                    },
                    onExit() {},
                },
                transitions: {
                    // userPlay: {},
                    autoPlay: {
                        target: 'playing',
                        action: () => {
                            this._logger.debug('pausedByAuto -> playing');
                        },
                    },
                    userPause: {
                        target: 'paused',
                        action: () => {
                            this._logger.debug('pausedByAuto -> paused');
                        },
                    },
                    // autoPause: {},
                },
            },
            paused: {
                actions: {
                    onEnter() {},
                    onExit() {},
                },
                transitions: {
                    userPlay: {
                        target: 'pausedByAuto',
                        action: () => {
                            this._logger.debug('paused -> pausedByAuto');
                        },
                    },
                    autoPlay: {
                        target: 'pausedByUser',
                        action: () => {
                            this._logger.debug('paused -> pausedByUser');
                        },
                    },
                    // userPause: {},
                    // autoPause: {},
                },
            },
        };
        // Note: we do NOT install an `isPlayingChanged` corrector that fights
        // the renderer when its reported state diverges from ours. The signal
        // is reported by GStreamer's state-changed callback in the renderer,
        // which can fire transient PAUSED reports while the pipeline is
        // mid-recovery (very common after suspend/resume with hardware video
        // decode). Any auto-correction here re-sends setPlay()/setPause() into
        // a recovering pipeline on a fixed cadence and creates a self-
        // sustaining play/pause loop. The state machine here is the single
        // source of truth for what we WANT; what the renderer momentarily
        // REPORTS is best-effort and only used for UI labels.
        // Initialize
        this.reset();
    }

    sync() {
        if (this.getCurrentState() === 'playing') {
            this._renderer.setPlay();
        } else {
            this._renderer.setPause();
        }
    }

    getCurrentState() {
        return this._machine.value;
    }

    reset() {
        this._machine = createMachine(this._machineDefinition);
    }

    userPlay() {
        this._machine.transition(this.getCurrentState(), 'userPlay');
    }

    autoPlay() {
        this._machine.transition(this.getCurrentState(), 'autoPlay');
    }

    userPause() {
        this._machine.transition(this.getCurrentState(), 'userPause');
    }

    autoPause() {
        this._machine.transition(this.getCurrentState(), 'autoPause');
    }
}
