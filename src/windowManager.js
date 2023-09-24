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

/**
 * Credit:
 * This code draws significant inspiration from the implementation of
 * ManageWindow and EmulateX11WindowType in the DING extension.
 */

import Meta from 'gi://Meta';

import * as Logger from './logger.js';

const applicationId = 'io.github.jeffshee.HanabiRenderer';
const logger = new Logger.Logger();

class ManagedWindow {
    constructor(window) {
        this._window = window;
        this._signals = [];
        this._states = {
            position: [0, 0],
            keepAtBottom: false,
            keepMinimized: false,
            keepPosition: false,
        };

        this._signals.push(
            window.connect('notify::title', () => {
                this._parseTitle();
            })
        );

        this._signals.push(
            // TODO: `connect` or `connect_after`?
            window.connect_after('shown', () => {
                if (this._states.keepMinimized)
                    this._window.minimize();
            })
        );

        this._signals.push(
            // TODO: `connect` or `connect_after`?
            window.connect_after('raised', () => {
                if (this._states.keepAtBottom)
                    this._window.lower();
            })
        );

        this._signals.push(
            window.connect('notify::above', () => {
                if (this._states.keepAtBottom && this._window.above)
                    this._window.unmake_above();
            })
        );

        this._signals.push(
            window.connect('notify::minimized', () => {
                if (this._states.keepMinimized && !this._window.minimized)
                    this._window.minimize();
            })
        );

        this._signals.push(
            window.connect('position-changed', () => {
                if (this._states.keepPosition) {
                    const [x, y] = this._states.position;
                    this._window.move_frame(true, x, y);
                }
            })
        );
        this._parseTitle();
    }

    _parseTitle() {
        const title = this._window.title;
        if (title && title.startsWith(`@${applicationId}!`)) {
            // TODO: revise syntax, remove split
            const json = title.replace(`@${applicationId}!`, '').split('|')[0];
            try {
                const newState = JSON.parse(json);
                this._states = {...this._states, ...newState};
            } catch (e) {
                logger.trace(e);
            }
        }
        this._refresh();
    }

    _refresh() {
        if (this._states.keepAtBottom && this._window.above)
            this._window.unmake_above();
        if (this._states.keepMinimized && !this._window.minimized)
            this._window.minimize();
        if (this._states.keepPosition) {
            const [x, y] = this._states.position;
            this._window.move_frame(true, x, y);
        }
    }

    disconnect() {
        this._signals.forEach(signal => {
            this._window.disconnect(signal);
        });

        this._window = null;
    }
}

export class WindowManager {
    constructor() {
        this._isX11 = !Meta.is_wayland_compositor();
        this._windows = new Set();
        this._waylandClient = null;
    }

    set_wayland_client(client) {
        this._waylandClient = client;
    }

    enable() {
        this._mapId = global.window_manager.connect_after(
            'map',
            (_wm, windowActor) => {
                const window = windowActor.get_meta_window();
                if (this._waylandClient && this._waylandClient.query_window_belongs_to(window))
                    this.addWindow(window);

                if (this._isX11) {
                    let appid = window.get_gtk_application_id();
                    let windowpid = window.get_pid();
                    let mypid = this._waylandClient.query_pid_of_program();
                    if (appid === applicationId && windowpid === mypid)
                        this.addWindow(window);
                }
            }
        );
    }

    disable() {
        this._windows.forEach(window => {
            this._clearWindow(window);
        });
        this._windows.clear();

        if (this._mapId)
            global.window_manager.disconnect(this._mapId);
    }

    addWindow(window) {
        if (window.get_meta_window) {
            // MetaWindowActor => MetaWindow
            window = window.get_meta_window();
        }

        window.managed = new ManagedWindow(window);
        this._windows.add(window);
        window.managed._unmanagedId = window.connect(
            'unmanaged',
            _window => {
                this._clearWindow(_window);
                this._windowList.delete(_window);
            }
        );
    }

    _clearWindow(window) {
        window.disconnect(window.managed._unmanagedId);
        window.managed.disconnect();
        window.managed = null;
    }
}
