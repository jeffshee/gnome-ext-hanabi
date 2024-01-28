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

const applicationId = 'io.github.jeffshee.HanabiRenderer';
const logger = new Logger.Logger('autoPause');


export class AutoPause {
    constructor(extension) {
        this._settings = extension.getSettings();
        this._playbackState = extension.getPlaybackState();
        this._workspaceManager = null;
        this._activeWorkspace = null;
        this._states = {
            maximizedOnAnyMonitor: false,
            fullscreenOnAnyMonitor: false,
            maximizedOrFullscreenOnAllMonitors: false,
        };
        this.conditions = {
            pauseOnMaximize: this._settings.get_boolean('pause-on-maximize'),
            pauseOnFullscreen: this._settings.get_boolean('pause-on-fullscreen'),
            pauseOnMaximizeOrFullscreenOnAllMonitors: this._settings.get_boolean('pause-on-maximize-fullscreen-all-monitors'),
        };
        // signals ids
        this._windows = [];
        this._windowAddedId = null;
        this._windowRemovedId = null;
        this._activeWorkspaceChangedId = null;

        this._settings.connect('changed::pause-on-maximize', () => {
            this.conditions.pauseOnMaximize = this._settings.get_boolean('pause-on-maximize');
            this.update();
        });

        this._settings.connect('changed::pause-on-fullscreen', () => {
            this.conditions.pauseOnFullscreen = this._settings.get_boolean('pause-on-fullscreen');
            this.update();
        });

        this._settings.connect('changed::pause-on-maximize-fullscreen-all-monitors', () => {
            this.conditions.pauseOnMaximizeOrFullscreenOnAllMonitors = this._settings.get_boolean('pause-on-maximize-fullscreen-all-monitors');
            this.update();
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

        // Initial check
        this.update();
    }

    update() {
        // All conditions is false, skip update
        if (Object.values(this.conditions).every(cond => !cond)) {
            this._playbackState.autoPlay();
            return;
        }

        // Filter out renderer windows and minimized windows
        let metaWindows = this._windows.map(({metaWindow}) => metaWindow).filter(
            metaWindow => !metaWindow.title?.includes(applicationId) && !metaWindow.minimized
        );

        const monitors = Main.layoutManager.monitors;

        this._states.maximizedOnAnyMonitor = metaWindows.some(metaWindow => metaWindow.get_maximized() === Meta.MaximizeFlags.BOTH);
        this._states.fullscreenOnAnyMonitor = metaWindows.some(metaWindow => metaWindow.fullscreen);

        const monitorsWithMaximizedOrFullscreen = metaWindows.reduce((acc, metaWindow) => {
            if (metaWindow.get_maximized() === Meta.MaximizeFlags.BOTH || metaWindow.fullscreen)
                acc[metaWindow.get_monitor()] = true;
            return acc;
        }, {});

        this._states.maximizedOrFullscreenOnAllMonitors = monitors.every(
            monitor => monitorsWithMaximizedOrFullscreen[monitor.index]
        );

        logger.debug(this._states);

        if (this.conditions.pauseOnMaximizeOrFullscreenOnAllMonitors && this._states.maximizedOrFullscreenOnAllMonitors) {
            this._playbackState.autoPause();
            return;
        } else {
            if (this.conditions.pauseOnMaximize && this._states.maximizedOnAnyMonitor) {
                this._playbackState.autoPause();
                return;
            }
            if (this.conditions.pauseOnFullscreen && this._states.fullscreenOnAnyMonitor) {
                this._playbackState.autoPause();
                return;
            }
        }
        this._playbackState.autoPlay();
    }

    _windowAdded(metaWindow, update = true) {
        // Not need to track renderer window
        if (metaWindow.title?.includes(applicationId))
            return;

        let signals = [];
        signals.push(
            metaWindow.connect('notify::maximized-horizontally', () => {
                logger.debug('maximized-horizontally changed');
                this.update();
            }));
        signals.push(
            metaWindow.connect('notify::maximized-vertically', () => {
                logger.debug('maximized-vertically changed');
                this.update();
            }));
        signals.push(
            metaWindow.connect('notify::fullscreen', () => {
                logger.debug('fullscreen changed');
                this.update();
            }));
        signals.push(
            metaWindow.connect('notify::minimized', () => {
                logger.debug('minimized changed');
                this.update();
            })
        );
        this._windows.push(
            {
                metaWindow,
                signals,
            }
        );
        logger.debug(`Window ${metaWindow.title} added`);
        if (update)
            this.update();
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
        this.update();
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

        this.update();
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
