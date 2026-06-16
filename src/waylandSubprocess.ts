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

// Adapted from LaunchSubprocess in the DING extension.

import Meta from 'gi://Meta';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Logger} from './logger.js';

const logger = new Logger('waylandSubprocess');
const rendererLogger = new Logger('renderer');

export class WaylandSubprocess {
    cancellable = new Gio.Cancellable();
    subprocess: Gio.Subprocess | null = null;
    running = false;
    private flags: Gio.SubprocessFlags;
    private launcher: Gio.SubprocessLauncher | null;
    private waylandClient: Meta.WaylandClient | null = null;
    private dataInputStream: Gio.DataInputStream | null = null;

    constructor(flags: Gio.SubprocessFlags = Gio.SubprocessFlags.NONE) {
        this.flags =
            flags |
            Gio.SubprocessFlags.STDOUT_PIPE |
            Gio.SubprocessFlags.STDERR_MERGE;
        this.launcher = new Gio.SubprocessLauncher({flags: this.flags});
    }

    spawn(argv: string[]): Gio.Subprocess | null {
        this.waylandClient = Meta.WaylandClient.new_subprocess(
            global.context,
            this.launcher!,
            argv
        );
        this.subprocess = this.waylandClient.get_subprocess();

        if (this.launcher?.close)
            this.launcher.close();
        this.launcher = null;

        if (this.subprocess) {
            this.dataInputStream = Gio.DataInputStream.new(
                this.subprocess.get_stdout_pipe()!
            );
            this.readOutput();
            this.subprocess.wait_async(this.cancellable, () => {
                this.running = false;
                this.dataInputStream = null;
                this.cancellable = null!;
            });
            this.running = true;
        }
        return this.subprocess;
    }

    setCwd(cwd: string): void {
        this.launcher?.set_cwd(cwd);
    }

    readOutput(): void {
        if (!this.dataInputStream)
            return;

        this.dataInputStream.read_line_async(
            GLib.PRIORITY_DEFAULT,
            this.cancellable,
            (object, res) => {
                try {
                    const [output, length] = object!.read_line_finish_utf8(res);
                    if (length)
                        rendererLogger.log(output);
                } catch (e) {
                    if ((e as {matches?: (...args: unknown[]) => boolean}).matches?.(
                        Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED
                    ))
                        return;
                    logger.trace(e);
                }
                this.readOutput();
            }
        );
    }

    queryWindowBelongsTo(window: Meta.Window): boolean {
        if (!this.running)
            return false;

        try {
            return this.waylandClient!.owns_window(window);
        } catch (e) {
            logger.trace(e);
            return false;
        }
    }

    queryPidOfProgram(): number {
        if (!this.running)
            return 0;

        const pid = this.subprocess?.get_identifier();
        return pid ? parseInt(pid) : 0;
    }
}
