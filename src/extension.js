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

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as GnomeShellOverride from './gnomeShellOverride.js';
import * as Launcher from './launcher.js';
import * as WindowManager from './windowManager.js';
import * as PlaybackState from './playbackState.js';
import * as AutoPause from './autoPause.js';
import * as PanelMenu from './panelMenu.js';

export default class HanabiExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this.isEnabled = false;
        this.launchRendererId = 0;
        this.currentProcess = null;
        this.reloadTime = 100;

        /**
         * This is a safeguard measure for the case of Gnome Shell being relaunched
         *  (for example, under X11, with Alt+F2 and R), to kill any old renderer process.
         */
        this.killAllProcesses();
    }

    enable() {
        this.settings = this.getSettings();
        this.playbackState = new PlaybackState.PlaybackState();

        /**
         * Panel Menu
         */
        this.panelMenu = new PanelMenu.HanabiPanelMenu(this);
        if (this.settings.get_boolean('show-panel-menu'))
            this.panelMenu.enable();

        this.settings.connect('changed::show-panel-menu', () => {
            if (this.settings.get_boolean('show-panel-menu'))
                this.panelMenu.enable();
            else
                this.panelMenu.disable();
        });

        /**
         * Disable startup animation (Workaround for issue #65)
         */
        this.old_hasOverview = Main.sessionMode.hasOverview;

        if (Main.layoutManager._startingUp) {
            Main.sessionMode.hasOverview = false;
            Main.layoutManager.connect('startup-complete', () => {
                Main.sessionMode.hasOverview = this.old_hasOverview;
            });
            // Handle Ubuntu's method
            if (Main.layoutManager.startInOverview)
                Main.layoutManager.startInOverview = false;
        }

        /**
         * Other overrides
         */
        this.override = new GnomeShellOverride.GnomeShellOverride();
        this.manager = new WindowManager.WindowManager();
        this.autoPause = new AutoPause.AutoPause(this);

        // If the desktop is still starting up, wait until it is ready
        if (Main.layoutManager._startingUp) {
            this.startupCompleteId = Main.layoutManager.connect(
                'startup-complete',
                () => {
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, this.settings.get_int('startup-delay'), () => {
                        Main.layoutManager.disconnect(this.startupCompleteId);
                        this.startupCompleteId = null;
                        this.innerEnable();
                        return false;
                    });
                }
            );
        } else {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, this.settings.get_int('startup-delay'), () => {
                this.innerEnable();
                return false;
            });
        }
    }

    innerEnable() {
        this.override.enable();
        this.manager.enable();
        this.autoPause.enable();

        this.isEnabled = true;
        if (this.launchRendererId)
            GLib.source_remove(this.launchRendererId);

        this.launchRenderer();
    }

    getPlaybackState() {
        return this.playbackState;
    }

    launchRenderer() {
        // Launch preferences dialog for first-time user
        let videoPath = this.settings.get_string('video-path');
        // TODO: check if the path is exist or not instead
        if (videoPath === '')
            this.openPreferences();

        this.reloadTime = 100;
        const argv = [];
        argv.push(
            GLib.build_filenamev([
                this.path,
                'renderer',
                'renderer.js',
            ])
        );
        // TODO: recheck `-P` argument
        argv.push('-P', this.path);
        argv.push('-F', videoPath);

        this.currentProcess = new Launcher.LaunchSubprocess();
        this.currentProcess.set_cwd(GLib.get_home_dir());
        this.currentProcess.spawnv(argv);
        this.manager.set_wayland_client(this.currentProcess);

        /**
         * If the renderer dies, wait 100ms and relaunch it, unless the exit status is different than zero,
         * in which case it will wait one second. This is done this way to avoid relaunching the renderer
         * too fast if it has a bug that makes it fail continuously, avoiding filling the journal too fast.
         */
        this.currentProcess.subprocess.wait_async(null, (obj, res) => {
            obj.wait_finish(res);
            if (!this.currentProcess || obj !== this.currentProcess.subprocess)
                return;

            if (obj.get_if_exited()) {
                let retval = obj.get_exit_status();
                if (retval !== 0)
                    this.reloadTime = 1000;
            } else {
                this.reloadTime = 1000;
            }
            this.currentProcess = null;
            this.manager.set_wayland_client(null);
            if (this.isEnabled) {
                if (this.launchRendererId)
                    GLib.source_remove(this.launchRendererId);

                this.launchRendererId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    this.reloadTime,
                    () => {
                        this.launchRendererId = 0;
                        this.launchRenderer();
                        return false;
                    }
                );
            }
        });
    }

    disable() {
        this.settings = null;
        this.panelMenu.disable();
        Main.sessionMode.hasOverview = this.old_hasOverview;
        this.override.disable();
        this.manager.disable();
        this.autoPause.disable();

        this.isEnabled = false;
        this.killCurrentProcess();
    }

    killCurrentProcess() {
        // If a reload was pending, kill it and schedule a new reload.
        if (this.launchRendererId) {
            GLib.source_remove(this.launchRendererId);
            this.launchRendererId = 0;
            if (this.isEnabled) {
                this.launchRendererId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    this.reloadTime,
                    () => {
                        this.launchRendererId = 0;
                        this.launchRenderer();
                        return false;
                    }
                );
            }
        }

        // Kill the renderer. It will be reloaded automatically.
        if (this.currentProcess && this.currentProcess.subprocess) {
            this.currentProcess.cancellable.cancel();
            this.currentProcess.subprocess.send_signal(15);
        }
    }

    killAllProcesses() {
        let procFolder = Gio.File.new_for_path('/proc');
        if (!procFolder.query_exists(null))
            return;

        let fileEnum = procFolder.enumerate_children(
            'standard::*',
            Gio.FileQueryInfoFlags.NONE,
            null
        );
        let info;
        while ((info = fileEnum.next_file(null))) {
            let filename = info.get_name();
            if (!filename)
                break;

            let processPath = GLib.build_filenamev(['/proc', filename, 'cmdline']);
            let processUser = Gio.File.new_for_path(processPath);
            if (!processUser.query_exists(null))
                continue;

            let [binaryData, etag_] = processUser.load_bytes(null);
            let contents = '';
            let readData = binaryData.get_data();
            for (let i = 0; i < readData.length; i++) {
                if (readData[i] < 32)
                    contents += ' ';
                else
                    contents += String.fromCharCode(readData[i]);
            }
            let path =
                `gjs ${
                    GLib.build_filenamev([
                        this.path,
                        'renderer',
                        'renderer.js',
                    ])}`;
            if (contents.startsWith(path)) {
                let proc = new Gio.Subprocess({argv: ['/bin/kill', filename]});
                proc.init(null);
                proc.wait(null);
            }
        }
    }
}
