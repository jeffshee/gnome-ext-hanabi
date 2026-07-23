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

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Gio from 'gi://Gio';
import UPower from 'gi://UPowerGlib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Logger} from './logger.js';
import {DBusWrapper, MprisWrapper, UPowerWrapper} from './dbus.js';
import {APPLICATION_ID} from './constants.js';
import type {PlaybackState} from './playbackState.js';
import type HanabiExtension from './extension.js';

const logger = new Logger('autoPause');

export class AutoPause {
    private playbackState: PlaybackState;
    private modules: AutoPauseModule[];

    constructor(extension: HanabiExtension) {
        this.playbackState = extension.getPlaybackState();

        const settings = extension.getSettings();
        this.modules = [
            new PauseOnMaximizeOrFullscreenModule(settings),
            new PauseOnFocusModule(settings),
            new PauseOnBatteryModule(settings),
            new PauseOnMprisPlayingModule(settings),
        ];
        this.modules.forEach(module =>
            module.connect('updated', () => this.eval())
        );
    }

    enable(): void {
        this.modules.forEach(module => module.enable());
    }

    eval(): void {
        if (this.modules.some(module => module.shouldAutoPause()))
            this.playbackState.autoPause();
        else
            this.playbackState.autoPlay();
    }

    disable(): void {
        this.modules.forEach(module => module.disable());
    }
}

// ---------------------------------------------------------------------------
// Base class
// ---------------------------------------------------------------------------

const AutoPauseModule = GObject.registerClass(
    {
        Signals: {updated: {}},
    },
    class AutoPauseModule extends GObject.Object {
        protected settings: Gio.Settings;
        protected logger: Logger;

        constructor(settings: Gio.Settings, moduleName?: string) {
            super();
            this.settings = settings;
            this.logger = moduleName
                ? new Logger(`autoPause::${moduleName}`)
                : logger;
        }

        enable(): void { }

        protected update(): void {
            this.emit('updated');
        }

        shouldAutoPause(): boolean {
            return false;
        }

        disable(): void { }
    }
);

type AutoPauseModule = InstanceType<typeof AutoPauseModule>;

// ---------------------------------------------------------------------------
// Pause On Maximize Or Fullscreen
// ---------------------------------------------------------------------------

const PauseOnMaximizeOrFullscreenMode = Object.freeze({
    never: 0,
    anyMonitor: 1,
    allMonitors: 2,
});

interface WindowEntry {
    metaWindow: Meta.Window;
    signals: number[];
}

const PauseOnMaximizeOrFullscreenModule = GObject.registerClass(
    class PauseOnMaximizeOrFullscreenModule extends AutoPauseModule {
        private states: {
            maximizedOrFullscreenOnAnyMonitor: boolean;
            maximizedOrFullscreenOnAllMonitors: boolean;
        };

        private conditions: { pauseOnMaximizeOrFullscreen: number };
        private workspaceManager: Meta.WorkspaceManager | null;
        private activeWorkspace: Meta.Workspace | null;
        private activeWorkspaceChangedId: number | null;
        private windows: WindowEntry[];
        private windowAddedId: number | null;
        private windowRemovedId: number | null;

        constructor(settings: Gio.Settings) {
            super(settings, 'maximizeOrFullscreen');
            this.states = {
                maximizedOrFullscreenOnAnyMonitor: false,
                maximizedOrFullscreenOnAllMonitors: false,
            };
            this.conditions = {
                pauseOnMaximizeOrFullscreen: this.settings.get_int(
                    'pause-on-maximize-or-fullscreen'
                ),
            };
            this.settings.connect(
                'changed::pause-on-maximize-or-fullscreen',
                () => {
                    this.conditions.pauseOnMaximizeOrFullscreen =
                        this.settings.get_int('pause-on-maximize-or-fullscreen');
                    this.update();
                }
            );

            this.workspaceManager = null;
            this.activeWorkspace = null;
            this.activeWorkspaceChangedId = null;
            this.windows = [];
            this.windowAddedId = null;
            this.windowRemovedId = null;
        }

        override enable(): void {
            this.workspaceManager = global.workspace_manager;
            this.activeWorkspace = this.workspaceManager.get_active_workspace();
            this.activeWorkspaceChangedId = this.workspaceManager.connect(
                'active-workspace-changed',
                (wm: Meta.WorkspaceManager) => this.onActiveWorkspaceChanged(wm)
            );

            this.activeWorkspace
                .list_windows()
                .forEach(w => this.onWindowAdded(w, false));
            this.windowAddedId = this.activeWorkspace.connect(
                'window-added',
                (_workspace: Meta.Workspace, window: Meta.Window) => this.onWindowAdded(window)
            );
            this.windowRemovedId = this.activeWorkspace.connect(
                'window-removed',
                (_workspace: Meta.Workspace, window: Meta.Window) => this.onWindowRemoved(window)
            );

            this.update();
        }

        private onWindowAdded(metaWindow: Meta.Window, doUpdate = true): void {
            if (metaWindow.title?.includes(APPLICATION_ID) || metaWindow.skip_taskbar)
                return;

            const signals: number[] = [];
            signals.push(metaWindow.connect('notify::maximized-horizontally', () => {
                this.logger.debug('maximized-horizontally changed');
                this.update();
            }));
            signals.push(metaWindow.connect('notify::maximized-vertically', () => {
                this.logger.debug('maximized-vertically changed');
                this.update();
            }));
            signals.push(metaWindow.connect('notify::fullscreen', () => {
                this.logger.debug('fullscreen changed');
                this.update();
            }));
            signals.push(metaWindow.connect('notify::minimized', () => {
                this.logger.debug('minimized changed');
                this.update();
            }));
            this.windows.push({metaWindow, signals});
            this.logger.debug(`Window ${metaWindow.title} added`);
            if (doUpdate)
                this.update();
        }

        private onWindowRemoved(metaWindow: Meta.Window): void {
            if (metaWindow.title?.includes(APPLICATION_ID) || metaWindow.skip_taskbar)
                return;

            this.windows = this.windows.filter(window => {
                if (window.metaWindow === metaWindow) {
                    window.signals.forEach(signal => metaWindow.disconnect(signal));
                    return false;
                }
                return true;
            });
            this.logger.debug(`Window ${metaWindow.title} removed`);
            this.update();
        }

        private onActiveWorkspaceChanged(workspaceManager: Meta.WorkspaceManager): void {
            this.windows.forEach(({metaWindow, signals}) => {
                signals.forEach(signal => metaWindow.disconnect(signal));
            });
            this.windows = [];

            if (this.windowAddedId && this.activeWorkspace) {
                this.activeWorkspace.disconnect(this.windowAddedId);
                this.windowAddedId = null;
            }
            if (this.windowRemovedId && this.activeWorkspace) {
                this.activeWorkspace.disconnect(this.windowRemovedId);
                this.windowRemovedId = null;
            }
            this.activeWorkspace = null;

            this.activeWorkspace = workspaceManager.get_active_workspace();
            this.logger.debug(
                `Active workspace changed to ${this.activeWorkspace.workspace_index}`
            );

            this.activeWorkspace
                .list_windows()
                .forEach(w => this.onWindowAdded(w, false));
            this.windowAddedId = this.activeWorkspace.connect(
                'window-added',
                (_workspace: Meta.Workspace, window: Meta.Window) => this.onWindowAdded(window)
            );
            this.windowRemovedId = this.activeWorkspace.connect(
                'window-removed',
                (_workspace: Meta.Workspace, window: Meta.Window) => this.onWindowRemoved(window)
            );

            this.update();
        }

        override update(): void {
            const metaWindows = this.windows
                .map(({metaWindow}) => metaWindow)
                .filter(w => !w.title?.includes(APPLICATION_ID) && !w.minimized);

            const monitors = Main.layoutManager.monitors;

            this.states.maximizedOrFullscreenOnAnyMonitor =
                metaWindows.some(w => w.is_maximized() || w.fullscreen);

            const monitorsWithMaximized = metaWindows.reduce<Record<number, boolean>>(
                (acc, w) => {
                    if (w.is_maximized() || w.fullscreen)
                        acc[w.get_monitor()] = true;
                    return acc;
                },
                {}
            );
            this.states.maximizedOrFullscreenOnAllMonitors = monitors.every(
                monitor => monitorsWithMaximized[monitor.index]
            );

            super.update();
        }

        override shouldAutoPause(): boolean {
            let res = false;
            if (
                this.conditions.pauseOnMaximizeOrFullscreen ===
                PauseOnMaximizeOrFullscreenMode.anyMonitor &&
                this.states.maximizedOrFullscreenOnAnyMonitor
            )
                res = true;
            if (
                this.conditions.pauseOnMaximizeOrFullscreen ===
                PauseOnMaximizeOrFullscreenMode.allMonitors &&
                this.states.maximizedOrFullscreenOnAllMonitors
            )
                res = true;
            this.logger.debug('shouldAutoPause:', res);
            return res;
        }

        override disable(): void {
            this.workspaceManager?.disconnect(this.activeWorkspaceChangedId!);
            this.windows.forEach(({metaWindow, signals}) =>
                signals.forEach(signal => metaWindow.disconnect(signal))
            );
            this.activeWorkspace?.disconnect(this.windowAddedId!);
            this.activeWorkspace?.disconnect(this.windowRemovedId!);

            this.workspaceManager = null;
            this.activeWorkspace = null;
            this.activeWorkspaceChangedId = null;
            this.windows = [];
            this.windowAddedId = null;
            this.windowRemovedId = null;
        }
    }
);

// ---------------------------------------------------------------------------
// Pause On Window Focus
// ---------------------------------------------------------------------------

const PauseOnFocusModule = GObject.registerClass(
    class PauseOnFocusModule extends AutoPauseModule {
        private states: { windowFocused: boolean };
        private conditions: { pauseOnFocus: boolean };
        private display: Meta.Display | null;
        private focusWindowChangedId: number | null;
        private trackedWindow: Meta.Window | null;
        private appearsFocusedId: number | null;

        constructor(settings: Gio.Settings) {
            super(settings, 'focus');
            this.states = {windowFocused: false};
            this.conditions = {
                pauseOnFocus: this.settings.get_boolean('pause-on-focus'),
            };
            this.settings.connect('changed::pause-on-focus', () => {
                this.conditions.pauseOnFocus = this.settings.get_boolean('pause-on-focus');
                this.update();
            });

            this.display = null;
            this.focusWindowChangedId = null;
            this.trackedWindow = null;
            this.appearsFocusedId = null;
        }

        override enable(): void {
            this.display = global.display;
            this.focusWindowChangedId = this.display.connect(
                'notify::focus-window',
                () => {
                    this.logger.debug('focus-window changed');
                    this.trackFocusWindow();
                    this.update();
                }
            );
            this.trackFocusWindow();
            this.update();
        }

        private trackFocusWindow(): void {
            if (this.appearsFocusedId && this.trackedWindow) {
                this.trackedWindow.disconnect(this.appearsFocusedId);
                this.appearsFocusedId = null;
                this.trackedWindow = null;
            }

            const focusWindow = this.display?.focus_window;
            if (focusWindow) {
                this.trackedWindow = focusWindow;
                this.appearsFocusedId = focusWindow.connect(
                    'notify::appears-focused',
                    () => {
                        this.logger.debug(`appears-focused changed: ${focusWindow.appears_focused} for ${focusWindow.title}`);
                        this.update();
                    }
                );
            }
        }

        override update(): void {
            const focusWindow = this.display?.focus_window;
            this.states.windowFocused =
                focusWindow !== null &&
                focusWindow !== undefined &&
                focusWindow.appears_focused &&
                !focusWindow.minimized &&
                !(focusWindow.title?.includes(APPLICATION_ID) ?? false) &&
                !focusWindow.skip_taskbar;

            this.logger.debug(
                `Window focused: ${this.states.windowFocused}, title: ${focusWindow?.title}, appears_focused: ${focusWindow?.appears_focused}`
            );
            super.update();
        }

        override shouldAutoPause(): boolean {
            const res = this.conditions.pauseOnFocus && this.states.windowFocused;
            this.logger.debug('shouldAutoPause:', res);
            return res;
        }

        override disable(): void {
            if (this.focusWindowChangedId && this.display)
                this.display.disconnect(this.focusWindowChangedId);
            if (this.appearsFocusedId && this.trackedWindow)
                this.trackedWindow.disconnect(this.appearsFocusedId);
            this.trackedWindow = null;
            this.display = null;
            this.focusWindowChangedId = null;
            this.appearsFocusedId = null;
        }
    }
);

// ---------------------------------------------------------------------------
// Pause On Battery
// ---------------------------------------------------------------------------

const PauseOnBatteryMode = Object.freeze({
    never: 0,
    lowBattery: 1,
    always: 2,
});

const PauseOnBatteryModule = GObject.registerClass(
    class PauseOnBatteryModule extends AutoPauseModule {
        private states: { onBattery: boolean; lowBattery: boolean };
        private conditions: { pauseOnBattery: number; lowBatteryThreshold: number };
        private upower: UPowerWrapper;

        constructor(settings: Gio.Settings) {
            super(settings, 'battery');
            this.states = {onBattery: false, lowBattery: false};
            this.conditions = {
                pauseOnBattery: this.settings.get_int('pause-on-battery'),
                lowBatteryThreshold: this.settings.get_int('low-battery-threshold'),
            };
            this.settings.connect('changed::pause-on-battery', () => {
                this.conditions.pauseOnBattery = this.settings.get_int('pause-on-battery');
                this.update();
            });
            this.settings.connect('changed::low-battery-threshold', () => {
                this.conditions.lowBatteryThreshold = this.settings.get_int('low-battery-threshold');
                this.update();
            });

            this.upower = new UPowerWrapper();
        }

        override enable(): void {
            this.upower.proxy.connect(
                'g-properties-changed',
                (_proxy: Gio.DBusProxy, properties: GLib.Variant) => {
                    const payload = properties.deep_unpack<Record<string, unknown>>();
                    if (!('State' in payload) && !('Percentage' in payload))
                        return;
                    this.logger.debug(
                        `State ${payload['State']}, Percentage ${payload['Percentage']}`
                    );
                    this.update();
                }
            );
            this.update();
        }

        override update(): void {
            const state = this.upower.getState();
            const percentage = this.upower.getPercentage();

            this.states.onBattery =
                state === UPower.DeviceState.PENDING_DISCHARGE ||
                state === UPower.DeviceState.DISCHARGING;
            this.states.lowBattery =
                this.states.onBattery &&
                percentage <= this.conditions.lowBatteryThreshold;

            super.update();
        }

        override shouldAutoPause(): boolean {
            let res = false;
            if (
                this.conditions.pauseOnBattery === PauseOnBatteryMode.lowBattery &&
                this.states.lowBattery
            )
                res = true;
            if (
                this.conditions.pauseOnBattery === PauseOnBatteryMode.always &&
                this.states.onBattery
            )
                res = true;
            this.logger.debug('shouldAutoPause:', res);
            return res;
        }

        override disable(): void { }
    }
);

// ---------------------------------------------------------------------------
// Pause On MPRIS Playing
// ---------------------------------------------------------------------------

interface MediaPlayerEntry {
    playbackStatus: string;
    mpris: MprisWrapper;
    mprisPropertiesChangedId: number;
}

const PauseOnMprisPlayingModule = GObject.registerClass(
    class PauseOnMprisPlayingModule extends AutoPauseModule {
        private states: { mprisPlaying: boolean };
        private conditions: { pauseOnMprisPlaying: boolean };
        private dbus: DBusWrapper;
        private mediaPlayers: Record<string, MediaPlayerEntry>;

        constructor(settings: Gio.Settings) {
            super(settings, 'mpris');
            this.states = {mprisPlaying: false};
            this.conditions = {
                pauseOnMprisPlaying: this.settings.get_boolean('pause-on-mpris-playing'),
            };
            this.settings.connect('changed::pause-on-mpris-playing', () => {
                this.conditions.pauseOnMprisPlaying =
                    this.settings.get_boolean('pause-on-mpris-playing');
                this.update();
            });

            this.dbus = new DBusWrapper();
            this.mediaPlayers = {};
        }

        override enable(): void {
            const mprisNames = this.queryMprisNames();
            mprisNames.forEach(mprisName => {
                this.logger.debug('Media Player found:', mprisName);
                const mpris = new MprisWrapper(mprisName);
                const playbackStatus = mpris.getPlaybackStatus();
                const handler = this.mprisPropertiesChangedFactory(mprisName);
                const mprisPropertiesChangedId = mpris.proxy.connect(
                    'g-properties-changed',
                    handler
                );
                this.mediaPlayers[mprisName] = {playbackStatus, mpris, mprisPropertiesChangedId};
            });
            this.logger.debug(this.stringifyMediaPlayers());


            this.dbus.proxy.connectSignal(
                'NameOwnerChanged',
                (
                    _proxy: Gio.DBusProxy,
                    _sender: string,
                    [name, oldOwner, newOwner]: [string, string, string]
                ) => {
                    if (!name.startsWith('org.mpris.MediaPlayer2.'))
                        return;
                    const mprisName = name;
                    if (oldOwner === '') {
                        this.logger.debug('Media Player created:', mprisName);
                        const mpris = new MprisWrapper(mprisName);
                        const playbackStatus = mpris.getPlaybackStatus();
                        const handler = this.mprisPropertiesChangedFactory(mprisName);
                        const mprisPropertiesChangedId = mpris.proxy.connect(
                            'g-properties-changed',
                            handler
                        );
                        this.mediaPlayers[mprisName] = {playbackStatus, mpris, mprisPropertiesChangedId};
                    } else if (newOwner === '') {
                        this.logger.debug('Media Player destroyed:', mprisName);
                        const {mpris, mprisPropertiesChangedId} = this.mediaPlayers[mprisName];
                        mpris.proxy.disconnect(mprisPropertiesChangedId);
                        delete this.mediaPlayers[mprisName];
                    }
                    this.logger.debug(this.stringifyMediaPlayers());
                    this.update();
                }
            );

            this.update();
        }

        private queryMprisNames(): string[] {
            try {
                const [names] = this.dbus.listNames();
                return names.filter(name => name.startsWith('org.mpris.MediaPlayer2.'));
            } catch (e) {
                this.logger.error('Error:', (e as Error).message);
            }
            return [];
        }

        private mprisPropertiesChangedFactory(
            mprisName: string
        ): (_proxy: Gio.DBusProxy, properties: GLib.Variant) => void {
            return (_proxy, properties) => {
                const payload = properties.deep_unpack<Record<string, GLib.Variant>>();
                if (!('PlaybackStatus' in payload))
                    return;
                this.mediaPlayers[mprisName].playbackStatus =
                    payload['PlaybackStatus'].deep_unpack() as string;
                this.logger.debug(this.stringifyMediaPlayers());
                this.update();
            };
        }

        private stringifyMediaPlayers(): string {
            const summary = Object.fromEntries(
                Object.entries(this.mediaPlayers).map(([key, value]) => [
                    key,
                    {playbackStatus: value.playbackStatus},
                ])
            );
            return JSON.stringify(summary, null, 2);
        }

        override update(): void {
            this.states.mprisPlaying = Object.values(this.mediaPlayers).some(
                p => p.playbackStatus === 'Playing'
            );
            super.update();
        }

        override shouldAutoPause(): boolean {
            const res = this.conditions.pauseOnMprisPlaying && this.states.mprisPlaying;
            this.logger.debug('shouldAutoPause:', res);
            return res;
        }

        override disable(): void {
            Object.values(this.mediaPlayers).forEach(({mpris, mprisPropertiesChangedId}) =>
                mpris.proxy.disconnect(mprisPropertiesChangedId)
            );
            this.mediaPlayers = {};
        }
    }
);
