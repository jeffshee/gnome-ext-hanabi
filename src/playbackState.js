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

import * as DBus from './dbus.js';
import * as Logger from './logger.js';


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
        this._renderer.proxy.connectSignal(
            'isPlayingChanged',
            (_proxy, _sender, [isPlaying]) => {
                if (isPlaying && this.getCurrentState() !== 'playing') {
                    // The renderer is playing the media but the current playback state isn't 'playing'
                    // This discrepancy can happen when the shell reload, renderer process reload,
                    // or when the user restarts the playback (e.g. select another video file in prefs).
                    // Pause the renderer if that's the case.
                    this._renderer.setPause();
                }
            }
        );
        // Initialize
        this.reset();
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
