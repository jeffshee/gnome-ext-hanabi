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
 * Special thanks to the black magic of DING extension.
 * Especially the ManageWindow class that gives superpower to Wayland windows.
 * That is one of the most crucial parts for this extension to work.
 * Also, the replaceMethod function is very convenient and helpful.
 * Without them, I don't know how to get started.
 */


/* exported init */

const {Meta, Gio, GLib, St} = imports.gi;
const Gettext = imports.gettext;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Config = imports.misc.config;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const GnomeShellOverride = Me.imports.gnomeShellOverride;
const Launcher = Me.imports.launcher;
const WindowManager = Me.imports.windowManager;

const extSettings = ExtensionUtils.getSettings(
    'io.github.jeffshee.hanabi-extension'
);

const Domain = Gettext.domain(Me.metadata.uuid);
const _ = Domain.gettext;
const ngettext = Domain.ngettext;

const getVideoPath = () => {
    return extSettings.get_string('video-path');
};

const getMute = () => {
    return extSettings.get_boolean('mute');
};

const setMute = mute => {
    return extSettings.set_boolean('mute', mute);
};

const getStartupDelay = () => {
    return extSettings.get_int('startup-delay');
};

// This object will contain all the global variables
let data = {};

class Extension {
    constructor() {
        // https://github.com/fthx/no-overview/blob/main/extension.js
        this.old_hasOverview = Main.sessionMode.hasOverview;
    }

    enable() {
        this._isPlaying = false;

        /**
         * Dbus
         */
        const dbusXml = `
        <node>
            <interface name="io.github.jeffshee.HanabiRenderer">
                <method name="setPlay"/>
                <method name="setPause"/>
                <property name="isPlaying" type="b" access="read"/>
                <signal name="isPlayingChanged">
                    <arg name="isPlaying" type="b"/>
                </signal>
            </interface>
        </node>`;

        const rendererProxy = Gio.DBusProxy.makeProxyWrapper(dbusXml);
        this.proxy = rendererProxy(Gio.DBus.session,
            'io.github.jeffshee.HanabiRenderer', '/io/github/jeffshee/HanabiRenderer');

        /**
         * Panel menu
         */
        const indicatorName = `${Me.metadata.name} Indicator`;
        this._indicator = new PanelMenu.Button(0.0, indicatorName, false);

        const menu = new PopupMenu.PopupMenu(
            this._indicator, // sourceActor
            0.5, // arrowAlignment
            St.Side.BOTTOM // arrowSide
        );

        this._indicator.setMenu(menu);

        const icon = new St.Icon({
            gicon: Gio.icon_new_for_string(
                GLib.build_filenamev([
                    ExtensionUtils.getCurrentExtension().path,
                    'hanabi-symbolic.svg',
                ])
            ),
            style_class: 'system-status-icon',
        });

        this._indicator.add_child(icon);

        Main.panel.addToStatusArea(indicatorName, this._indicator);

        /**
         * Play/Pause
         */
        const playPause = new PopupMenu.PopupMenuItem(
            this._isPlaying ? _('Pause') : _('Play')
        );

        playPause.connect('activate', () => {
            this.proxy.call(
                this._isPlaying ? 'setPause' : 'setPlay', // method_name
                null, // parameters
                Gio.DBusCallFlags.NO_AUTO_START, // flags
                -1, // timeout_msec
                null, // cancellable
                null // callback
            );
        }
        );

        this.proxy.connectSignal(
            'isPlayingChanged',
            (_proxy, _sender, [isPlaying]) => {
                this._isPlaying = isPlaying;
                playPause.label.set_text(
                    this._isPlaying ? _('Pause') : _('Play')
                );
            }
        );

        menu.addMenuItem(playPause);

        /**
         * Mute/unmute audio
         */
        const muteAudio = new PopupMenu.PopupMenuItem(
            getMute() ? _('Unmute Audio') : _('Mute Audio')
        );

        muteAudio.connect('activate', () => {
            setMute(!getMute());
        });

        extSettings?.connect('changed', (settings, key) => {
            if (key === 'mute') {
                muteAudio.label.set_text(
                    getMute() ? _('Unmute Audio') : _('Mute Audio')
                );
            }
        });

        menu.addMenuItem(muteAudio);

        /**
         * Preferences
         */
        menu.addAction(_('Preferences'), () => {
            ExtensionUtils.openPrefs();
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
        this._indicator.destroy();
        this._indicator = null;

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
