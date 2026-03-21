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
 * LaunchSubprocess in the DING extension.
 */

import Meta from 'gi://Meta';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';

import * as Logger from './logger.js';

const logger = new Logger.Logger();
const rendererLogger = new Logger.Logger('renderer');

// Get GNOME Shell major version
const shellVersion = parseInt(Config.PACKAGE_VERSION.split('.')[0]);

export class LaunchSubprocess {
    constructor(flags = Gio.SubprocessFlags.NONE) {

        this._flags =
            flags |
            Gio.SubprocessFlags.STDOUT_PIPE |
            Gio.SubprocessFlags.STDERR_MERGE;

        this.cancellable = new Gio.Cancellable();
        this._launcher = new Gio.SubprocessLauncher({flags: this._flags});

        // For GNOME Shell < 49, initialize WaylandClient in constructor

        this.subprocess = null;
        this.running = false;
    }

    spawnv(argv) {

        this._waylandClient = Meta.WaylandClient.new_subprocess(global.context, this._launcher, argv);
        this.subprocess = this._waylandClient.get_subprocess();

        // This is for GLib 2.68 or greater
        if (this._launcher.close)
            this._launcher.close();

        this._launcher = null;
        if (this.subprocess) {
            // Read STDOUT and STDERR from the renderer
            this._dataInputStream = Gio.DataInputStream.new(
                this.subprocess.get_stdout_pipe()
            );
            this.read_output();
            this.subprocess.wait_async(this.cancellable, () => {
                this.running = false;
                this._dataInputStream = null;
                this.cancellable = null;
            });
            this.running = true;
        }
        return this.subprocess;
    }

    set_cwd(cwd) {
        this._launcher.set_cwd(cwd);
    }

    read_output() {
        if (!this._dataInputStream)
            return;

        this._dataInputStream.read_line_async(
            GLib.PRIORITY_DEFAULT,
            this.cancellable,
            (object, res) => {
                try {
                    const [output, length] = object.read_line_finish_utf8(res);
                    if (length)
                        rendererLogger.log(output);
                } catch (e) {
                    if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        return;
                    logger.trace(e);
                }

                this.read_output();
            }
        );
    }

    /**
     * Queries whether the passed window belongs to the launched subprocess or not.
     *
     * @param {MetaWindow} window The window to check.
     */
    query_window_belongs_to(window) {
        if (!this.running)
            return false;

        try {
            return this._waylandClient.owns_window(window);
        } catch (e) {
            logger.trace(e);
            return false;
        }
    }

    query_pid_of_program() {
        if (!this.running)
            return 0;

        const pid = this.subprocess.get_identifier();
        return pid ? parseInt(pid) : 0;
    }

}
