// Copyright (C) 2026 Jeff Shee <jeffshee8969@gmail.com> and contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
//
// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {RendererWrapper} from './dbus.js';
import {Logger} from './logger.js';

type StateName = 'playing' | 'pausedByUser' | 'pausedByAuto' | 'paused';
type EventName = 'userPlay' | 'userPause' | 'autoPlay' | 'autoPause';

interface StateTransition {
    target: StateName;
    action: () => void;
}

interface StateDefinition {
    actions: {onEnter: () => void; onExit: () => void};
    transitions: Partial<Record<EventName, StateTransition>>;
}

type StateMachineDefinition = {
    initialState: StateName;
} & Record<StateName, StateDefinition>;

interface StateMachine {
    value: StateName;
    transition(currentState: StateName, event: EventName): StateName | null;
}

function createMachine(def: StateMachineDefinition): StateMachine {
    const machine: StateMachine = {
        value: def.initialState,
        transition(currentState, event) {
            const currentStateDef = def[currentState];
            const destinationTransition = currentStateDef.transitions[event];
            if (!destinationTransition)
                return null;

            const destinationState = destinationTransition.target;
            const destinationStateDef = def[destinationState];

            destinationTransition.action();
            currentStateDef.actions.onExit();
            destinationStateDef.actions.onEnter();

            machine.value = destinationState;
            return machine.value;
        },
    };
    return machine;
}

export class PlaybackState {
    private logger = new Logger('playbackState');
    private renderer = new RendererWrapper();
    private machineDefinition: StateMachineDefinition;
    private machine!: StateMachine;
    private isPlayingSignalId: number | null = null;
    private unexpectedStopTimerId = 0;

    constructor() {
        this.machineDefinition = {
            initialState: 'playing',
            playing: {
                actions: {
                    onEnter: () => void this.renderer.setPlay(),
                    onExit() {},
                },
                transitions: {
                    userPause: {
                        target: 'pausedByUser',
                        action: () => this.logger.debug('playing -> pausedByUser'),
                    },
                    autoPause: {
                        target: 'pausedByAuto',
                        action: () => this.logger.debug('playing -> pausedByAuto'),
                    },
                },
            },
            pausedByUser: {
                actions: {
                    onEnter: () => void this.renderer.setPause(),
                    onExit() {},
                },
                transitions: {
                    userPlay: {
                        target: 'playing',
                        action: () => this.logger.debug('pausedByUser -> playing'),
                    },
                    autoPause: {
                        target: 'paused',
                        action: () => this.logger.debug('pausedByUser -> paused'),
                    },
                },
            },
            pausedByAuto: {
                actions: {
                    onEnter: () => void this.renderer.setPause(),
                    onExit() {},
                },
                transitions: {
                    autoPlay: {
                        target: 'playing',
                        action: () => this.logger.debug('pausedByAuto -> playing'),
                    },
                    userPause: {
                        target: 'paused',
                        action: () => this.logger.debug('pausedByAuto -> paused'),
                    },
                },
            },
            paused: {
                actions: {onEnter() {}, onExit() {}},
                transitions: {
                    userPlay: {
                        target: 'pausedByAuto',
                        action: () => this.logger.debug('paused -> pausedByAuto'),
                    },
                    autoPlay: {
                        target: 'pausedByUser',
                        action: () => this.logger.debug('paused -> pausedByUser'),
                    },
                },
            },
        };

        this.isPlayingSignalId = this.renderer.proxy.connectSignal(
            'isPlayingChanged',
            (_proxy: Gio.DBusProxy, _sender: string, [isPlaying]: [boolean]) => {
                if (isPlaying) {
                    if (this.unexpectedStopTimerId) {
                        GLib.source_remove(this.unexpectedStopTimerId);
                        this.unexpectedStopTimerId = 0;
                    }
                    if (this.getCurrentState() !== 'playing')
                        void this.renderer.setPause();
                } else if (!isPlaying && this.getCurrentState() === 'playing') {
                    // Renderer stopped unexpectedly while state machine says 'playing'.
                    // This can happen when:
                    //   - autoPause briefly triggered setPause before our fix
                    //   - GStreamer transient error that isn't self-recovered
                    //   - setFilePath / URI change goes through a STOPPED state briefly
                    // Schedule a recovery setPlay() with debounce to avoid restart loops.
                    if (this.unexpectedStopTimerId)
                        GLib.source_remove(this.unexpectedStopTimerId);
                    this.unexpectedStopTimerId = GLib.timeout_add(
                        GLib.PRIORITY_DEFAULT,
                        1000,
                        () => {
                            this.unexpectedStopTimerId = 0;
                            if (this.getCurrentState() === 'playing')
                                void this.renderer.setPlay();
                            return GLib.SOURCE_REMOVE;
                        }
                    );
                }
            }
        );
        this.reset();
    }

    getCurrentState(): StateName {
        return this.machine.value;
    }

    reset(): void {
        this.machine = createMachine(this.machineDefinition);
    }

    userPlay(): void {
        this.machine.transition(this.getCurrentState(), 'userPlay');
    }

    autoPlay(): void {
        this.machine.transition(this.getCurrentState(), 'autoPlay');
    }

    userPause(): void {
        this.machine.transition(this.getCurrentState(), 'userPause');
    }

    autoPause(): void {
        this.machine.transition(this.getCurrentState(), 'autoPause');
    }

    destroy(): void {
        if (this.unexpectedStopTimerId) {
            GLib.source_remove(this.unexpectedStopTimerId);
            this.unexpectedStopTimerId = 0;
        }
        if (this.isPlayingSignalId) {
            this.renderer.proxy.disconnectSignal(this.isPlayingSignalId);
            this.isPlayingSignalId = null;
        }
    }
}
