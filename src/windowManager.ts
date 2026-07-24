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

// Adapted from ManageWindow and EmulateX11WindowType in the DING extension.

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {Logger} from './logger.js';
import {APPLICATION_ID, HOTARU_APPLICATION_ID} from './constants.js';
import type {WaylandSubprocess} from './waylandSubprocess.js';

const logger = new Logger('windowManager');

interface WindowState {
    position: [number, number];
    keepAtBottom: boolean;
    keepMinimized: boolean;
    keepPosition: boolean;
}

// Hotaru's compact window-title params: p = position, b = keep at bottom,
// m = keep minimized, k = keep position. Must match hotaru's HanabiParams
// serialization.
interface HotaruWindowState {
    p: [number, number];
    b: boolean;
    m: boolean;
    k: boolean;
}

interface ManagedMetaWindow extends Meta.Window {
    managed: ManagedWindow | null;
    unmanagedId: number | null;
}

class ManagedWindow {
    private window: Meta.Window;
    private signals: number[] = [];
    private states: WindowState = {
        position: [0, 0],
        keepAtBottom: false,
        keepMinimized: false,
        keepPosition: false,
    };

    private isDisposed = false;

    constructor(window: Meta.Window) {
        this.window = window;

        this.signals.push(
            window.connect('notify::title', () => {
                if (this.isDisposed)
                    return;
                this.parseTitle();
            })
        );

        this.signals.push(
            window.connect_after('shown', () => {
                if (this.isDisposed)
                    return;
                if (this.states.keepMinimized)
                    this.window.minimize();
            })
        );

        this.signals.push(
            window.connect_after('raised', () => {
                if (this.isDisposed)
                    return;
                if (this.states.keepAtBottom)
                    this.window.lower();
            })
        );

        this.signals.push(
            window.connect('notify::above', () => {
                if (this.isDisposed)
                    return;
                if (this.states.keepAtBottom && this.window.above)
                    this.window.unmake_above();
            })
        );

        this.signals.push(
            window.connect('notify::minimized', () => {
                if (this.isDisposed)
                    return;
                if (this.states.keepMinimized && !this.window.minimized)
                    this.window.minimize();
            })
        );

        this.signals.push(
            window.connect('position-changed', () => {
                if (this.isDisposed)
                    return;
                if (this.states.keepPosition) {
                    const [x, y] = this.states.position;
                    this.window.move_frame(true, x, y);
                }
            })
        );

        this.parseTitle();
    }

    private parseTitle(): void {
        const title = this.window.title;
        if (title?.startsWith(`@${HOTARU_APPLICATION_ID}!`)) {
            const json = title
                .replace(`@${HOTARU_APPLICATION_ID}!`, '')
                .split('|')[0];
            try {
                const v2 = JSON.parse(json) as Partial<HotaruWindowState>;
                this.states = {
                    position: v2.p ?? this.states.position,
                    keepAtBottom: v2.b ?? this.states.keepAtBottom,
                    keepMinimized: v2.m ?? this.states.keepMinimized,
                    keepPosition: v2.k ?? this.states.keepPosition,
                };
            } catch (e) {
                logger.trace(e);
            }
        } else if (title?.startsWith(`@${APPLICATION_ID}!`)) {
            const json = title.replace(`@${APPLICATION_ID}!`, '').split('|')[0];
            try {
                const newState = JSON.parse(json) as Partial<WindowState>;
                this.states = {...this.states, ...newState};
            } catch (e) {
                logger.trace(e);
            }
        }
        this.refresh();
    }

    private refresh(): void {
        if (this.states.keepAtBottom && this.window.above)
            this.window.unmake_above();
        if (this.states.keepMinimized && !this.window.minimized)
            this.window.minimize();
        if (this.states.keepPosition) {
            const [x, y] = this.states.position;
            this.window.move_frame(true, x, y);
        }
    }

    disconnect(): void {
        this.isDisposed = true;
        this.signals.forEach(signal => this.window.disconnect(signal));
    }
}

export class WindowManager {
    private windows: Set<ManagedMetaWindow>;
    private waylandClient: WaylandSubprocess | null;
    private mapId: number | null;

    constructor() {
        this.windows = new Set();
        this.waylandClient = null;
        this.mapId = null;
    }

    setWaylandClient(client: WaylandSubprocess | null): void {
        this.waylandClient = client;
    }

    enable(): void {
        this.mapId = global.window_manager.connect_after(
            'map',
            (_wm: Shell.WM, windowActor: Meta.WindowActor) => {
                const window = windowActor.get_meta_window();
                if (
                    window &&
                    this.waylandClient &&
                    this.waylandClient.queryWindowBelongsTo(window)
                )
                    this.manageWindow(window);
            }
        );
    }

    disable(): void {
        this.windows.forEach(window => this.releaseWindow(window));
        this.windows.clear();

        if (this.mapId !== null) {
            global.window_manager.disconnect(this.mapId);
            this.mapId = null;
        }
    }

    private manageWindow(window: Meta.Window): void {
        const managedWindow = window as ManagedMetaWindow;
        managedWindow.managed = new ManagedWindow(managedWindow);
        this.windows.add(managedWindow);
        managedWindow.unmanagedId = managedWindow.connect('unmanaged', (unmanagedWindow: ManagedMetaWindow) => {
            this.releaseWindow(unmanagedWindow);
            this.windows.delete(unmanagedWindow);
        });
    }

    private releaseWindow(window: ManagedMetaWindow): void {
        if (window.unmanagedId !== null) {
            window.disconnect(window.unmanagedId);
            window.unmanagedId = null;
        }
        window.managed?.disconnect();
        window.managed = null;
    }
}
