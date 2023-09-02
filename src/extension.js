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

/* exported init */

const {Meta, Gio, GLib} = imports.gi;
const Gettext = imports.gettext;

const Main = imports.ui.main;

const Config = imports.misc.config;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const GnomeShellOverride = Me.imports.gnomeShellOverride;
const Launcher = Me.imports.launcher;
const WindowManager = Me.imports.windowManager;
const PanelMenu = Me.imports.panelMenu;

const extSettings = ExtensionUtils.getSettings(
    'io.github.jeffshee.hanabi-extension'
);

const getVideoPath = () => {
    return extSettings.get_string('video-path');
};

const getShowPanelMenu = () => {
    return extSettings.get_boolean('show-panel-menu');
};

const getStartupDelay = () => {
    return extSettings.get_int('startup-delay');
};

let data = {};

class Extension {
    constructor() {
        this.old_hasOverview = Main.sessionMode.hasOverview;
    }

    enable() {
        this.panelMenu = new PanelMenu.HanabiPanelMenu();
        if (getShowPanelMenu())
            this.panelMenu.enable();

        extSettings?.connect('changed::show-panel-menu', () => {
            if (getShowPanelMenu())
                this.panelMenu.enable();
            else
                this.panelMenu.disable();
        });

        /**
         * Other overrides
         */

        // Disable startup animation (workaround for issue #65)
        if (Main.layoutManager._startingUp) {
            Main.sessionMode.hasOverview = false;
            Main.layoutManager.connect('startup-complete', () => {
                Main.sessionMode.hasOverview = this.old_hasOverview;
            });
            // handle Ubuntu's method
            if (Main.layoutManager.startInOverview)
                Main.layoutManager.startInOverview = false;
        }

        if (!data.GnomeShellOverride) {
            data.GnomeShellOverride =
                new GnomeShellOverride.GnomeShellOverride();
        }

        if (!data.manager)
            data.manager = new WindowManager.WindowManager();

        // If the desktop is still starting up, wait until it is ready
        if (Main.layoutManager._startingUp) {
            data.startupPreparedId = Main.layoutManager.connect(
                'startup-complete',
                () => {
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, getStartupDelay(), () => {
                        innerEnable(true);
                        return false;
                    });
                }
            );
        } else {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, getStartupDelay(), () => {
                innerEnable(false);
                return false;
            });
        }
    }

    disable() {
        if (getShowPanelMenu())
            this.panelMenu.disable();

        data.isEnabled = false;
        Main.sessionMode.hasOverview = this.old_hasOverview;
        killCurrentProcess();
        data.GnomeShellOverride.disable();
        data.manager.disable();
    }
}

/**
 *
 */
function init() {
    ExtensionUtils.initTranslations(Me.metadata.uuid);

    data.isEnabled = false;
    data.launchRendererId = 0;
    data.currentProcess = null;
    data.reloadTime = 100;
    data.GnomeShellVersion = parseInt(Config.PACKAGE_VERSION.split('.')[0]);

    data.GnomeShellOverride = null;
    data.manager = null;

    /**
     * Ensures that there aren't "rogue" processes.
     * This is a safeguard measure for the case of Gnome Shell being relaunched
     *  (for example, under X11, with Alt+F2 and R), to kill any old renderer instance.
     * That's why it must be here, in init(), and not in enable() or disable()
     * (disable already guarantees thag the current instance is killed).
     */
    doKillAllOldRendererProcesses();
    return new Extension();
}

/**
 * The true code that configures everything and launches the renderer
 *
 * @param removeId
 */
function innerEnable(removeId) {
    if (removeId) {
        Main.layoutManager.disconnect(data.startupPreparedId);
        data.startupPreparedId = null;
    }

    data.GnomeShellOverride.enable();
    data.manager.enable();

    data.isEnabled = true;
    if (data.launchRendererId)
        GLib.source_remove(data.launchRendererId);

    launchRenderer();
}

/**
 * Kills the current renderer
 */
function killCurrentProcess() {
    // If a reload was pending, kill it and program a new reload
    if (data.launchRendererId) {
        GLib.source_remove(data.launchRendererId);
        data.launchRendererId = 0;
        if (data.isEnabled) {
            data.launchRendererId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                data.reloadTime,
                () => {
                    data.launchRendererId = 0;
                    launchRenderer();
                    return false;
                }
            );
        }
    }

    // kill the renderer. It will be reloaded automatically.
    if (data.currentProcess && data.currentProcess.subprocess) {
        data.currentProcess.cancellable.cancel();
        data.currentProcess.subprocess.send_signal(15);
    }
}

/**
 * This function checks all the processes in the system,
 * and kills those that are a desktop manager from the current user (but not others).
 * This allows to avoid having several ones in case gnome shell resets, or other odd cases.
 * It requires the /proc virtual filesystem, but doesn't fail if it doesn't exist.
 */
function doKillAllOldRendererProcesses() {
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
                    ExtensionUtils.getCurrentExtension().path,
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

/**
 * Launches the renderer, passing to it the path where it is stored and the video path to play.
 * It also monitors it, to relaunch it in case it dies or is killed.
 * Finally, it reads STDOUT and STDERR and redirects them to the journal, to help to debug it.
 */
function launchRenderer() {
    // Launch prefs window for first-time user
    let videoPath = getVideoPath();
    if (videoPath === '')
        ExtensionUtils.openPrefs();

    data.reloadTime = 100;
    let argv = [];
    argv.push(
        GLib.build_filenamev([
            ExtensionUtils.getCurrentExtension().path,
            'renderer',
            'renderer.js',
        ])
    );
    // The path. Allows the program to find translations, settings and modules.
    argv.push('-P');
    argv.push(ExtensionUtils.getCurrentExtension().path);
    // The video path.
    argv.push('-F');
    argv.push(videoPath);

    data.currentProcess = new Launcher.LaunchSubprocess();
    data.currentProcess.set_cwd(GLib.get_home_dir());
    data.currentProcess.spawnv(argv);
    data.manager.set_wayland_client(data.currentProcess);

    /**
     * If the renderer dies, wait 100ms and relaunch it, unless the exit status is different than zero,
     * in which case it will wait one second. This is done this way to avoid relaunching the renderer
     * too fast if it has a bug that makes it fail continuously, avoiding filling the journal too fast.
     */
    data.currentProcess.subprocess.wait_async(null, (obj, res) => {
        obj.wait_finish(res);
        if (!data.currentProcess || obj !== data.currentProcess.subprocess)
            return;

        if (obj.get_if_exited()) {
            let retval = obj.get_exit_status();
            if (retval !== 0)
                data.reloadTime = 1000;
        } else {
            data.reloadTime = 1000;
        }
        data.currentProcess = null;
        data.manager.set_wayland_client(null);
        if (data.isEnabled) {
            if (data.launchRendererId)
                GLib.source_remove(data.launchRendererId);

            data.launchRendererId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                data.reloadTime,
                () => {
                    data.launchRendererId = 0;
                    launchRenderer();
                    return false;
                }
            );
        }
    });
}
