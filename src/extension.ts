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

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {GnomeShellOverride} from './gnomeShellOverride.js';
import {WaylandSubprocess} from './waylandSubprocess.js';
import {WindowManager} from './windowManager.js';
import {PlaybackState} from './playbackState.js';
import {AutoPause} from './autoPause.js';
import {HanabiPanelMenu} from './panelMenu.js';
import {Logger} from './logger.js';

const logger = new Logger('extension');

// Delay before relaunching the renderer after it exits (ms); longer after a crash.
const RENDERER_RELOAD_DELAY_MS = 100;
const RENDERER_RELOAD_DELAY_ON_ERROR_MS = 1000;
// Debounce for coalescing rapid monitors-changed events (ms).
const MONITORS_CHANGED_DEBOUNCE_MS = 500;

// An emitter paired with a signal handler id, disconnected together in disable().
type SignalConnection = [emitter: { disconnect(id: number): void }, id: number];

export default class HanabiExtension extends Extension {
    private isEnabled = false;

    // Settings and sub-components, created in enable() and torn down in disable().
    private settings: Gio.Settings | null = null;
    private playbackState: PlaybackState | null = null;
    private panelMenu: HanabiPanelMenu | null = null;
    private shellOverride: GnomeShellOverride | null = null;
    private windowManager: WindowManager | null = null;
    private autoPause: AutoPause | null = null;

    // Renderer subprocess and its relaunch timeout.
    private currentProcess: WaylandSubprocess | null = null;
    private launchRendererTimeoutId = 0;
    private reloadTime = RENDERER_RELOAD_DELAY_MS;
    private rendererSuspended = false;

    // Signal connections and the monitors-changed timeout, cleaned up in disable().
    private signalConnections: SignalConnection[] = [];
    private monitorsChangedTimeoutId = 0;

    getPlaybackState(): PlaybackState {
        return this.playbackState!;
    }

    enable(): void {
        logger.debug('Enabling');

        // Clean up any renderer processes orphaned by a previous/crashed session.
        this.killAllProcesses();

        this.settings = this.getSettings();
        this.playbackState = new PlaybackState();

        this.panelMenu = new HanabiPanelMenu(this);
        if (this.settings.get_boolean('show-panel-menu'))
            this.panelMenu.enable();

        const showPanelMenuChangedId = this.settings.connect(
            'changed::show-panel-menu',
            () => {
                if (this.settings!.get_boolean('show-panel-menu'))
                    this.panelMenu!.enable();
                else
                    this.panelMenu!.disable();
            }
        );
        this.signalConnections.push([this.settings, showPanelMenuChangedId]);

        this.shellOverride = new GnomeShellOverride(this.settings);
        this.windowManager = new WindowManager();
        this.autoPause = new AutoPause(this);

        if (Main.layoutManager._startingUp) {
            const startupCompleteId = Main.layoutManager.connect(
                'startup-complete',
                () => {
                    // Issue #65: don't open the overview at login.
                    Main.overview.hide();
                    GLib.timeout_add(
                        GLib.PRIORITY_DEFAULT,
                        this.settings!.get_int('startup-delay'),
                        () => {
                            this.innerEnable();
                            return false;
                        }
                    );
                }
            );
            this.signalConnections.push([Main.layoutManager, startupCompleteId]);
        } else {
            GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                this.settings.get_int('startup-delay'),
                () => {
                    this.innerEnable();
                    return false;
                }
            );
        }
    }

    private innerEnable(): void {
        logger.debug('Activating overrides and starting renderer');
        this.shellOverride!.enable();
        this.windowManager!.enable();
        this.autoPause!.enable();

        const monitorsChangedId = Main.layoutManager.connect(
            'monitors-changed',
            () => {
                if (this.monitorsChangedTimeoutId)
                    GLib.source_remove(this.monitorsChangedTimeoutId);
                this.monitorsChangedTimeoutId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    MONITORS_CHANGED_DEBOUNCE_MS,
                    () => {
                        this.monitorsChangedTimeoutId = 0;
                        this.killCurrentProcess();
                        return GLib.SOURCE_REMOVE;
                    }
                );
            }
        );
        this.signalConnections.push([Main.layoutManager, monitorsChangedId]);

        const sessionModeUpdatedId = Main.sessionMode.connect('updated', () => {
            this.onSessionModeUpdated();
        });
        this.signalConnections.push([Main.sessionMode, sessionModeUpdatedId]);

        const showOnLockScreenChangedId = this.settings!.connect(
            'changed::show-on-lock-screen',
            () => this.onSessionModeUpdated()
        );
        this.signalConnections.push([this.settings!, showOnLockScreenChangedId]);

        this.isEnabled = true;
        if (this.launchRendererTimeoutId)
            GLib.source_remove(this.launchRendererTimeoutId);

        this.launchRenderer();
    }

    private onSessionModeUpdated(): void {
        const isLockScreen = Main.sessionMode.currentMode === 'unlock-dialog';
        const showOnLockScreen = this.settings?.get_boolean('show-on-lock-screen') ?? true;

        if (isLockScreen && !showOnLockScreen)
            this.suspendRenderer();
        else if (!isLockScreen || showOnLockScreen)
            this.resumeRenderer();
    }

    private suspendRenderer(): void {
        if (this.rendererSuspended)
            return;
        logger.debug('Suspending renderer (lock screen)');
        this.rendererSuspended = true;
        if (this.launchRendererTimeoutId) {
            GLib.source_remove(this.launchRendererTimeoutId);
            this.launchRendererTimeoutId = 0;
        }
        if (this.currentProcess?.subprocess)
            this.currentProcess.subprocess.send_signal(15);
    }

    private resumeRenderer(): void {
        if (!this.rendererSuspended)
            return;
        logger.debug('Resuming renderer');
        this.rendererSuspended = false;
        if (this.isEnabled && !this.currentProcess)
            this.launchRenderer();
    }

    private launchRenderer(): void {
        if (!this.settings)
            return;

        const videoPath = this.settings.get_string('video-path');
        if (videoPath === '')
            this.openPreferences();

        logger.debug(`Launching renderer (video: ${videoPath})`);

        this.reloadTime = RENDERER_RELOAD_DELAY_MS;
        const argv: string[] = [];
        argv.push('gjs', '-m', GLib.build_filenamev([this.path, 'renderer', 'renderer.js']));
        argv.push('-P', this.path);
        argv.push('-F', videoPath);

        this.currentProcess = new WaylandSubprocess();
        this.currentProcess.setCwd(GLib.get_home_dir());
        this.currentProcess.spawn(argv);
        this.windowManager!.setWaylandClient(this.currentProcess);

        this.currentProcess.subprocess!.wait_async(null, (obj, res) => {
            obj!.wait_finish(res);
            if (!this.currentProcess || obj !== this.currentProcess.subprocess)
                return;

            if (obj!.get_if_exited()) {
                const retval = obj!.get_exit_status();
                if (retval !== 0)
                    this.reloadTime = RENDERER_RELOAD_DELAY_ON_ERROR_MS;
            } else {
                this.reloadTime = RENDERER_RELOAD_DELAY_ON_ERROR_MS;
            }
            this.currentProcess = null;
            this.windowManager?.setWaylandClient(null);

            if (this.isEnabled && !this.rendererSuspended) {
                logger.debug(`Renderer exited; relaunching in ${this.reloadTime}ms`);

                if (this.launchRendererTimeoutId)
                    GLib.source_remove(this.launchRendererTimeoutId);

                this.launchRendererTimeoutId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    this.reloadTime,
                    () => {
                        this.launchRendererTimeoutId = 0;
                        this.launchRenderer();
                        return false;
                    }
                );
            }
        });
    }

    disable(): void {
        logger.debug('Disabling');

        this.killCurrentProcess();
        this.rendererSuspended = false;

        this.signalConnections.forEach(([emitter, id]) => emitter.disconnect(id));
        this.signalConnections = [];

        this.settings = null;
        this.panelMenu?.disable();
        this.shellOverride?.disable();
        this.windowManager?.disable();
        this.autoPause?.disable();

        if (this.monitorsChangedTimeoutId) {
            GLib.source_remove(this.monitorsChangedTimeoutId);
            this.monitorsChangedTimeoutId = 0;
        }

        this.isEnabled = false;
    }

    private killCurrentProcess(): void {
        if (this.launchRendererTimeoutId) {
            GLib.source_remove(this.launchRendererTimeoutId);
            this.launchRendererTimeoutId = 0;
            if (this.isEnabled) {
                this.launchRendererTimeoutId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    this.reloadTime,
                    () => {
                        this.launchRendererTimeoutId = 0;
                        this.launchRenderer();
                        return false;
                    }
                );
            }
        }

        if (this.currentProcess?.subprocess) {
            logger.debug('Killing current renderer process');
            this.currentProcess.cancellable?.cancel();
            this.currentProcess.subprocess.send_signal(15);
        }
    }

    private killAllProcesses(): void {
        const procFolder = Gio.File.new_for_path('/proc');
        if (!procFolder.query_exists(null))
            return;

        const fileEnum = procFolder.enumerate_children(
            'standard::*',
            Gio.FileQueryInfoFlags.NONE,
            null
        );
        let info: Gio.FileInfo | null;
        while ((info = fileEnum.next_file(null))) {
            const filename = info.get_name();
            if (!filename)
                break;

            const processPath = GLib.build_filenamev(['/proc', filename, 'cmdline']);
            const processUser = Gio.File.new_for_path(processPath);
            if (!processUser.query_exists(null))
                continue;

            const [binaryData] = processUser.load_bytes(null);
            let contents = '';
            const readData = binaryData.get_data();
            if (readData) {
                for (let i = 0; i < readData.length; i++) {
                    if (readData[i] < 32)
                        contents += ' ';
                    else
                        contents += String.fromCharCode(readData[i]);
                }
            }
            const path = `gjs ${GLib.build_filenamev([this.path, 'renderer', 'renderer.js'])}`;
            if (contents.startsWith(path)) {
                logger.debug(`Killing orphaned renderer process (pid ${filename})`);
                const proc = new Gio.Subprocess({argv: ['/bin/kill', filename]});
                proc.init(null);
                proc.wait(null);
            }
        }
    }
}
