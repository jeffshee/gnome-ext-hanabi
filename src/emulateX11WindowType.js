/**
 * Copyright (C) 2020 Sergio Costas (rastersoft@gmail.com)
 * Copyright (C) 2022 Jeff Shee (jeffshee8969@gmail.com)
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
 * Original code from Sergio Costas's DING extension.
 * Modified by Jeff Shee, for Hanabi extension.
 */

/* exported EmulateX11WindowType */

const {GLib, Meta} = imports.gi;
const Main = imports.ui.main;

// Use applicationId to differentiate between hanabi and DING.
const applicationId = 'io.github.jeffshee.HanabiRenderer';

class ManageWindow {
    /* This class is added to each managed window, and it's used to
       make it behave like an X11 Desktop window.

       Trusted windows will set in the title the characters @!, followed
       by the coordinates where to put the window separated by a colon, and
       ended in semicolon. After that, it can have one or more of these letters

       * B : put this window at the bottom of the screen
       * T : put this window at the top of the screen
       * D : show this window in all desktops
       * H : hide this window from window list
            `minimize()` is guarded now. This will cause the window fails to minimize.
            https://gitlab.gnome.org/GNOME/mutter/-/commit/7ff1c04c8fc6148d5a940601ffa2ea98f04f6548
       * U : keep window unminimized (DING default: enabled)
       * M : keep window minimized
       * | : break the flag checking loop

       Using the title is generally not a problem because the desktop windows
       doesn't have a tittle. But some other windows may have and still need to
       take advantage of this, so adding a single blank space at the end of the
       title is equivalent to @!H, and having two blank spaces at the end of the
       title is equivalent to @!HTD. This allows to take advantage of these flags
       even to decorated windows.
    */

    constructor(window, waylandClient, changedStatusCB) {
        this._isX11 = !Meta.is_wayland_compositor();
        this._waylandClient = waylandClient;
        this._window = window;
        this._signalIDs = [];
        this._changedStatusCB = changedStatusCB;
        this._signalIDs.push(
            window.connect_after('raised', () => {
                if (this._keepAtBottom && !this._keepAtTop)
                    this._window.lower();

                if (this._keepMinimized)
                    this._window.minimize();
            })
        );
        this._signalIDs.push(
            window.connect('position-changed', () => {
                if (this._fixed && this._x !== null && this._y !== null)
                    this._window.move_frame(true, this._x, this._y);
            })
        );
        this._signalIDs.push(
            window.connect('notify::title', () => {
                this._parseTitle();
            })
        );
        this._signalIDs.push(
            window.connect('notify::above', () => {
                if (this._keepAtBottom && this._window.above)
                    this._window.unmake_above();
            })
        );
        this._signalIDs.push(
            window.connect('notify::minimized', () => {
                if (this._keepUnminimized && this._window.minimized)
                    this._window.unminimize();

                if (this._keepMinimized && !this._window.minimized)
                    this._window.minimize();
            })
        );
        this._parseTitle();
    }

    disconnect() {
        for (let signalID of this._signalIDs)
            this._window.disconnect(signalID);

        if (this._keepAtTop)
            this._window.unmake_above();

        this._window = null;
        this._waylandClient = null;
    }

    set_wayland_client(client) {
        this._waylandClient = client;
    }

    _parseTitle() {
        this._x = null;
        this._y = null;
        this._keepAtBottom = false;
        let keepAtTop = this._keepAtTop;
        this._keepAtTop = false;
        this._showInAllDesktops = false;
        this._hideFromWindowList = false;
        this._fixed = false;
        this._keepUnminimized = false;
        this._keepMinimized = false;
        let title = this._window.get_title();
        if (title !== null) {
            if (title.length > 0 && title[title.length - 1] === ' ') {
                if (title.length > 1 && title[title.length - 2] === ' ')
                    title = '@!HTD';
                else
                    title = '@!H';
            }
            let pos = title.search(`@${applicationId}!`);
            if (pos !== -1) {
                let pos2 = title.search(';', pos);
                let coords;
                if (pos2 !== -1) {
                    coords = title
                        .substring(pos + 2 + applicationId.length, pos2)
                        .trim()
                        .split(',');
                } else {
                    coords = title
                        .substring(pos + 2 + applicationId.length)
                        .trim()
                        .split(',');
                }
                try {
                    this._x = parseInt(coords[0]);
                    this._y = parseInt(coords[1]);
                } catch (e) {
                    global.log(`Exception ${e.message}.\n${e.stack}`);
                }
                try {
                    let extraChars = title
                        .substring(pos + 2 + applicationId.length)
                        .trim()
                        .toUpperCase();
                    let breakFlag = false;
                    for (let char of extraChars) {
                        if (breakFlag)
                            break;
                        switch (char) {
                        case 'B':
                            this._keepAtBottom = true;
                            this._keepAtTop = false;
                            break;
                        case 'T':
                            this._keepAtTop = true;
                            this._keepAtBottom = false;
                            break;
                        case 'D':
                            this._showInAllDesktops = true;
                            break;
                        case 'H':
                            this._hideFromWindowList = true;
                            break;
                        case 'F':
                            this._fixed = true;
                            break;
                        case 'U':
                            this._keepUnminimized = true;
                            this._keepMinimized = false;
                            break;
                        case 'M':
                            this._keepMinimized = true;
                            this._keepUnminimized = false;
                            break;
                        case '|':
                            breakFlag = true;
                            break;
                        }
                    }
                } catch (e) {
                    global.log(`Exception ${e.message}.\n${e.stack}`);
                }
            }
            if (!this._isX11 && this._waylandClient) {
                if (this._hideFromWindowList)
                    this._waylandClient.hide_from_window_list(this._window);
                else
                    this._waylandClient.show_in_window_list(this._window);
            }
            if (this._keepAtTop !== keepAtTop) {
                if (this._keepAtTop)
                    this._window.make_above();
                else
                    this._window.unmake_above();
            }
            if (this._keepAtBottom)
                this._window.lower();

            if (this._fixed && this._x !== null && this._y !== null)
                this._window.move_frame(true, this._x, this._y);

            this._changedStatusCB(this);
        }
    }

    refreshState(checkWorkspace) {
        if (checkWorkspace && this._showInAllDesktops) {
            let currentWorkspace =
                global.workspace_manager.get_active_workspace();
            if (!this._window.located_on_workspace(currentWorkspace))
                this._window.change_workspace(currentWorkspace);
        }
        if (this._keepAtBottom)
            this._window.lower();
    }

    get hideFromWindowList() {
        return this._hideFromWindowList;
    }

    get keepAtBottom() {
        return this._keepAtBottom;
    }
}

var EmulateX11WindowType = class {
    /*
     This class makes all the heavy lifting for emulating WindowType.
     Just make one instance of it, call enable(), and whenever a window
     that you want to give "superpowers" is mapped, add it with the
     "addWindow" method. That's all.
     */
    constructor() {
        this._isX11 = !Meta.is_wayland_compositor();
        this._windowList = new Set();
        this._enableRefresh = true;
        this._waylandClient = null;
    }

    set_wayland_client(client) {
        this._waylandClient = client;
        for (let window of this._windowList) {
            if (window.customJS_hanabi)
                window.customJS_hanabi.set_wayland_client(this._waylandClient);
        }
    }

    enable() {
        this._idMap = global.window_manager.connect_after(
            'map',
            (obj, windowActor) => {
                let window = windowActor.get_meta_window();
                if (
                    this._waylandClient &&
                    this._waylandClient.query_window_belongs_to(window)
                )
                    this.addWindow(window);

                if (this._isX11) {
                    let appid = window.get_gtk_application_id();
                    let windowpid = window.get_pid(); // return type is number
                    let mypid = this._waylandClient.query_pid_of_program(); // return type is string
                    if (appid === applicationId && windowpid === parseInt(mypid))
                        this.addWindow(window, windowActor);
                }
                this._refreshWindows(false);
            }
        );
        this._idDestroy = global.window_manager.connect_after(
            'destroy',
            (wm, windowActor) => {
                // if a window is closed, ensure that the desktop doesn't receive the focus
                let window = windowActor.get_meta_window();
                if (
                    window &&
                    window.get_window_type() >= Meta.WindowType.DROPDOWN_MENU
                )
                    return;

                this._refreshWindows(true);
            }
        );
        /* Something odd happens with "stick" when using popup submenus, so
           this implements the same functionality
         */
        this._switchWorkspaceId = global.window_manager.connect(
            'switch-workspace',
            () => {
                this._refreshWindows(true);
            }
        );

        /* But in Overview mode it is paramount to not change the workspace to emulate
           "stick", or the windows will appear
         */
        this._showingId = Main.overview.connect('showing', () => {
            this._enableRefresh = false;
        });

        this._hidingId = Main.overview.connect('hiding', () => {
            this._enableRefresh = true;
            this._refreshWindows(true);
        });
    }

    disable() {
        if (this._activate_window_ID) {
            GLib.source_remove(this._activate_window_ID);
            this._activate_window_ID = null;
        }
        for (let window of this._windowList)
            this._clearWindow(window);

        this._windowList.clear();

        // disconnect signals
        if (this._idMap) {
            global.window_manager.disconnect(this._idMap);
            this._idMap = null;
        }
        if (this._idDestroy) {
            global.window_manager.disconnect(this._idDestroy);
            this._idDestroy = null;
        }
        if (this._switchWorkspaceId) {
            global.window_manager.disconnect(this._switchWorkspaceId);
            this._switchWorkspaceId = null;
        }
        if (this._showingId) {
            Main.overview.disconnect(this._showingId);
            this._showingId = null;
        }
        if (this._hidingId) {
            Main.overview.disconnect(this._hidingId);
            this._hidingId = null;
        }
    }

    addWindow(window) {
        if (window.get_meta_window) {
            // it is a MetaWindowActor
            window = window.get_meta_window();
        }
        window.customJS_hanabi = new ManageWindow(
            window,
            this._waylandClient,
            () => {
                this._refreshWindows(true);
            }
        );
        this._windowList.add(window);
        window.customJS_hanabi.unmanagedID = window.connect(
            'unmanaged',
            _window => {
                this._clearWindow(_window);
                this._windowList.delete(_window);
            }
        );
    }

    _clearWindow(window) {
        window.disconnect(window.customJS_hanabi.unmanagedID);
        window.customJS_hanabi.disconnect();
        window.customJS_hanabi = null;
    }

    _refreshWindows(checkWorkspace) {
        if (!this._activate_window_ID) {
            this._activate_window_ID = GLib.idle_add(GLib.PRIORITY_LOW, () => {
                if (this._enableRefresh) {
                    for (let window of this._windowList)
                        window.customJS_hanabi.refreshState(checkWorkspace);

                    if (checkWorkspace) {
                        // activate the top-most window
                        let windows = global.display.get_tab_list(
                            Meta.TabList.NORMAL_ALL,
                            global.workspace_manager.get_active_workspace()
                        );
                        let anyActive = false;
                        for (let window of windows) {
                            if (
                                (!window.customJS_hanabi ||
                                    !window.customJS_hanabi._keepAtBottom) &&
                                !window.minimized
                            ) {
                                Main.activateWindow(window);
                                anyActive = true;
                                break;
                            }
                        }
                        if (!anyActive) {
                            for (let window of this._windowList) {
                                if (
                                    window.customJS_hanabi &&
                                    window.customJS_hanabi._keepAtBottom &&
                                    !window.minimized
                                ) {
                                    Main.activateWindow(window);
                                    break;
                                }
                            }
                        }
                    }
                }
                this._activate_window_ID = null;
                return GLib.SOURCE_REMOVE;
            });
        }
    }
};
