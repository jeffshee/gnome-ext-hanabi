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
        this._workspaces = new Set();
        this._windows = new Set();
        this._active_workspace = null;
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
        const workspaceManager = global.workspace_manager;
        this._active_workspace = workspaceManager.get_active_workspace();
        for (let i = 0; i < workspaceManager.get_n_workspaces(); i++) {
            let workspace = workspaceManager.get_workspace_by_index(i);
            this._workspaces.add(workspace);
        }

        global.get_window_actors().forEach(actor => this._windows.add(actor.meta_window));

        this._workspaces.forEach(workspace => this._workspaceAdded(workspaceManager, workspace));
        this._windows.forEach(window => this._windowAdded(window));

        workspaceManager.connect('workspace-added', this._workspaceAdded.bind(this));
        workspaceManager.connect('workspace-removed', this._workspaceRemoved.bind(this));
        workspaceManager.connect('active-workspace-changed', this._activeWorkspaceChanged.bind(this));

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
        let metaWindows = this._active_workspace.list_windows().filter(
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

    _monitorWindow(metaWindow) {
        // Not need to monitor renderer window
        if (metaWindow.title?.includes(applicationId))
            return;
        metaWindow.connect('notify::maximized-horizontally', () => {
            logger.debug('maximized-horizontally changed');
            this.update();
        });
        metaWindow.connect('notify::maximized-vertically', () => {
            logger.debug('maximized-vertically changed');
            this.update();
        });
        metaWindow.connect('notify::fullscreen', () => {
            logger.debug('fullscreen changed');
            this.update();
        });
        metaWindow.connect('notify::minimized', () => {
            logger.debug('minimized changed');
            this.update();
        });
    }

    _monitorWorkspace(workspace) {
        workspace.connect('window-added', (_workspace, window) => this._windowAdded(window));
        workspace.connect('window-removed', (_workspace, window) => this._windowRemoved(window));
    }

    _windowAdded(window) {
        this._windows.add(window);
        this._monitorWindow(window);
        logger.debug(`Window ${window.title} added`);
        this.update();
    }

    _windowRemoved(window) {
        this._windows.delete(window);
        logger.debug(`Window ${window.title} removed`);
        this.update();
    }

    _workspaceAdded(workspaceManager, index) {
        let workspace = workspaceManager.get_workspace_by_index(index);
        this._workspaces.add(workspace);
        this._monitorWorkspace(workspace);
        logger.debug(`Workspace ${index} added`);
    }

    _workspaceRemoved(_workspaceManager, index) {
        this._workspaces.forEach(workspace => {
            if (workspace.workspace_index === index)
                this._workspaces.delete(workspace);
        });
        logger.debug(`Workspace ${index} removed`);
    }

    _activeWorkspaceChanged(workspaceManager) {
        this._active_workspace = workspaceManager.get_active_workspace();
        logger.debug(`Active workspace changed to ${this._active_workspace.workspace_index}`);
        this.update();
    }

    disable() {
        // TODO
    }
}
