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

import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import * as Logger from './logger.js';
import * as DBus from './dbus.js';
import UPower from 'gi://UPowerGlib';

const applicationId = 'io.github.jeffshee.HanabiRenderer';
const logger = new Logger.Logger('autoPause');

const pauseOnBatteryMode = Object.freeze({
    never: 0,
    lowBattery: 1,
    always: 2,
});

export class AutoPause {
    constructor(extension) {
        this._settings = extension.getSettings();
        this._playbackState = extension.getPlaybackState();
        this._workspaceManager = null;
        this._activeWorkspace = null;
        this._upower = new DBus.UPowerDBus();
        this.states = {
            maximizedOnAnyMonitor: false,
            fullscreenOnAnyMonitor: false,
            maximizedOrFullscreenOnAllMonitors: false,
            onBattery: false,
            lowBattery: false,
        };
        this.conditions = {
            pauseOnMaximize: this._settings.get_boolean('pause-on-maximize'),
            pauseOnFullscreen: this._settings.get_boolean('pause-on-fullscreen'),
            pauseOnMaximizeOrFullscreenOnAllMonitors: this._settings.get_boolean('pause-on-maximize-fullscreen-all-monitors'),
            pauseOnBattery: this._settings.get_int('pause-on-battery'),
            lowBatteryThreshold: this._settings.get_int('low-battery-threshold'),
        };
        // signals ids
        this._windows = [];
        this._windowAddedId = null;
        this._windowRemovedId = null;
        this._activeWorkspaceChangedId = null;

        this._settings.connect('changed::pause-on-maximize', () => {
            this.conditions.pauseOnMaximize = this._settings.get_boolean('pause-on-maximize');
            this.updateWindowState();
        });

        this._settings.connect('changed::pause-on-fullscreen', () => {
            this.conditions.pauseOnFullscreen = this._settings.get_boolean('pause-on-fullscreen');
            this.updateWindowState();
        });

        this._settings.connect('changed::pause-on-maximize-fullscreen-all-monitors', () => {
            this.conditions.pauseOnMaximizeOrFullscreenOnAllMonitors = this._settings.get_boolean('pause-on-maximize-fullscreen-all-monitors');
            this.updateWindowState();
        });

        this._settings.connect('changed::pause-on-battery', () => {
            this.conditions.pauseOnBattery = this._settings.get_int('pause-on-battery');
            this.updateBatteryState();
        });

        this._settings.connect('changed::low-battery-threshold', () => {
            this.conditions.lowBatteryThreshold = this._settings.get_int('low-battery-threshold');
            this.updateBatteryState();
        });
    }

    enable() {
        this._workspaceManager = global.workspace_manager;
        this._activeWorkspace = this._workspaceManager.get_active_workspace();
        this._activeWorkspaceChangedId = this._workspaceManager.connect('active-workspace-changed', this._activeWorkspaceChanged.bind(this));

        this._activeWorkspace.list_windows().forEach(
            metaWindow => this._windowAdded(metaWindow, false)
        );
        this._windowAddedId = this._activeWorkspace.connect('window-added', (_workspace, window) => this._windowAdded(window));
        this._windowRemovedId = this._activeWorkspace.connect('window-removed', (_workspace, window) => this._windowRemoved(window));

        this._upower.getProxy().connect('g-properties-changed', (_proxy, properties) => {
            let payload = properties.deep_unpack();
            if (!payload.hasOwnProperty('State') && !payload.hasOwnProperty('Percentage'))
                return;
            logger.debug(payload);
            this.updateBatteryState();
        });

        // Initial update
        this.updateWindowState();
        this.updateBatteryState();
    }

    _windowAdded(metaWindow, doUpdate = true) {
        // Not need to track renderer window
        if (metaWindow.title?.includes(applicationId))
            return;

        let signals = [];
        signals.push(
            metaWindow.connect('notify::maximized-horizontally', () => {
                logger.debug('maximized-horizontally changed');
                this.updateWindowState();
            }));
        signals.push(
            metaWindow.connect('notify::maximized-vertically', () => {
                logger.debug('maximized-vertically changed');
                this.updateWindowState();
            }));
        signals.push(
            metaWindow.connect('notify::fullscreen', () => {
                logger.debug('fullscreen changed');
                this.updateWindowState();
            }));
        signals.push(
            metaWindow.connect('notify::minimized', () => {
                logger.debug('minimized changed');
                this.updateWindowState();
            })
        );
        this._windows.push(
            {
                metaWindow,
                signals,
            }
        );
        logger.debug(`Window ${metaWindow.title} added`);
        if (doUpdate)
            this.updateWindowState();
    }

    _windowRemoved(metaWindow) {
        this._windows = this._windows.filter(window => {
            if (window.metaWindow === metaWindow) {
                window.signals.forEach(signal => metaWindow.disconnect(signal));
                return false;
            }
            return true;
        });
        logger.debug(`Window ${metaWindow.title} removed`);
        this.updateWindowState();
    }

    _activeWorkspaceChanged(workspaceManager) {
        this._windows.forEach(({metaWindow, signals}) => {
            signals.forEach(signal => metaWindow.disconnect(signal));
        });
        this._windows = [];

        if (this._windowAddedId) {
            this._activeWorkspace.disconnect(this._windowAddedId);
            this._windowAddedId = null;
        }
        if (this._windowRemovedId) {
            this._activeWorkspace.disconnect(this._windowRemovedId);
            this._windowRemovedId = null;
        }
        this._activeWorkspace = null;

        this._activeWorkspace = workspaceManager.get_active_workspace();
        logger.debug(`Active workspace changed to ${this._activeWorkspace.workspace_index}`);

        this._activeWorkspace.list_windows().forEach(
            metaWindow => this._windowAdded(metaWindow, false)
        );
        this._windowAddedId = this._activeWorkspace.connect('window-added', (_workspace, window) => this._windowAdded(window));
        this._windowRemovedId = this._activeWorkspace.connect('window-removed', (_workspace, window) => this._windowRemoved(window));

        this.updateWindowState();
    }

    updateWindowState() {
        // Filter out renderer windows and minimized windows
        let metaWindows = this._windows.map(({metaWindow}) => metaWindow).filter(
            metaWindow => !metaWindow.title?.includes(applicationId) && !metaWindow.minimized
        );

        const monitors = Main.layoutManager.monitors;

        this.states.maximizedOnAnyMonitor = metaWindows.some(metaWindow => metaWindow.get_maximized() === Meta.MaximizeFlags.BOTH);
        this.states.fullscreenOnAnyMonitor = metaWindows.some(metaWindow => metaWindow.fullscreen);

        const monitorsWithMaximizedOrFullscreen = metaWindows.reduce((acc, metaWindow) => {
            if (metaWindow.get_maximized() === Meta.MaximizeFlags.BOTH || metaWindow.fullscreen)
                acc[metaWindow.get_monitor()] = true;
            return acc;
        }, {});

        this.states.maximizedOrFullscreenOnAllMonitors = monitors.every(
            monitor => monitorsWithMaximizedOrFullscreen[monitor.index]
        );

        this._checkConditions();
    }

    updateBatteryState() {
        let state = this._upower.getState();
        let percentage = this._upower.getPercentage();
        logger.debug(`State ${state}`);
        logger.debug(`Percentage ${percentage}`);

        this.states.onBattery = state === UPower.DeviceState.PENDING_DISCHARGE || state === UPower.DeviceState.DISCHARGING;
        this.states.lowBattery = this.states.onBattery && percentage <= this.conditions.lowBatteryThreshold;

        this._checkConditions();
    }

    _checkConditions() {
        logger.debug(this.states);

        if (this.conditions.pauseOnMaximizeOrFullscreenOnAllMonitors && this.states.maximizedOrFullscreenOnAllMonitors) {
            this._playbackState.autoPause();
            return;
        }
        if (this.conditions.pauseOnMaximize && this.states.maximizedOnAnyMonitor) {
            this._playbackState.autoPause();
            return;
        }
        if (this.conditions.pauseOnFullscreen && this.states.fullscreenOnAnyMonitor) {
            this._playbackState.autoPause();
            return;
        }
        if (this.conditions.pauseOnBattery === pauseOnBatteryMode.lowBattery && this.states.lowBattery) {
            this._playbackState.autoPause();
            return;
        }
        if (this.conditions.pauseOnBattery === pauseOnBatteryMode.always && this.states.onBattery) {
            this._playbackState.autoPause();
            return;
        }

        this._playbackState.autoPlay();
    }

    disable() {
        if (this._workspaceManager && this._activeWorkspaceChangedId)
            this._workspaceManager.disconnect(this._activeWorkspaceChangedId);
        this._activeWorkspace = null;

        this._windows.forEach(({metaWindow, signals}) => {
            signals.forEach(signal => metaWindow.disconnect(signal));
        });
        this._windows = [];

        if (this._activeWorkspace && this._windowAddedId) {
            this._activeWorkspace.disconnect(this._windowAddedId);
            this._windowAddedId = null;
        }
        if (this._activeWorkspace && this._windowRemovedId) {
            this._activeWorkspace.disconnect(this._windowRemovedId);
            this._windowRemovedId = null;
        }
        this._activeWorkspace = null;
    }
}
