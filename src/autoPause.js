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

import GObject from 'gi://GObject';
import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import * as Logger from './logger.js';
import * as DBus from './dbus.js';
import UPower from 'gi://UPowerGlib';

const applicationId = 'io.github.jeffshee.HanabiRenderer';
const logger = new Logger.Logger('autoPause');

export class AutoPause {
    constructor(extension) {
        this._playbackState = extension.getPlaybackState();

        // Modules
        this.modules = [];
        this.modules.push(new PauseOnMaximizeOrFullscreenModule(extension));
        this.modules.push(new PauseOnBatteryModule(extension));
        this.modules.push(new PauseOnMprisPlayingModule(extension));
        this.modules.forEach(module => module.connect('updated', () => this.eval()));
    }

    enable() {
        this.modules.forEach(module => module.enable());
    }

    eval() {
        if (this.modules.some(module => module.shouldAutoPause()))
            this._playbackState.autoPause();
        else
            this._playbackState.autoPlay();
    }

    disable() {
        this.modules.forEach(module => module.disable());
    }
}


/**
 * Auto Pause Modules
 */

const AutoPauseModule = GObject.registerClass({
    Signals: {
        'updated': {},
    },
}, class AutoPauseModule extends GObject.Object {
    constructor(extension, moduleName) {
        super();
        this._settings = extension.getSettings();
        this.name = moduleName;
        this._logger = moduleName ? new Logger.Logger(`autoPause::${moduleName}`) : logger;
    }

    enable() {}

    _update() {
        this.emit('updated');
    }

    shouldAutoPause() {
        return false;
    }

    disable() {}
});


/**
 * Pause On Maximize Or Fullscreen
 */

const PauseOnMaximizeOrFullscreenMode = Object.freeze({
    never: 0,
    anyMonitor: 1,
    allMonitors: 2,
});

const PauseOnMaximizeOrFullscreenModule = GObject.registerClass(
    class PauseOnMaximizeOrFullscreenModule extends AutoPauseModule {
        constructor(extension) {
            super(extension, 'maximizeOrFullscreen');
            this.states = {
                maximizedOrFullscreenOnAnyMonitor: false,
                maximizedOrFullscreenOnAllMonitors: false,
            };
            this.conditions = {
                pauseOnMaximizeOrFullscreen: this._settings.get_int('pause-on-maximize-or-fullscreen'),
            };
            this._settings.connect('changed::pause-on-maximize-or-fullscreen', () => {
                this.conditions.pauseOnMaximizeOrFullscreen = this._settings.get_int('pause-on-maximize-or-fullscreen');
                this._update();
            });

            this._workspaceManager = null;
            this._activeWorkspace = null;
            this._activeWorkspaceChangedId = null;
            this._windows = []; // [{metaWindow, signals: [...]}, ...]
            this._windowAddedId = null;
            this._windowRemovedId = null;
        }

        enable() {
            this._workspaceManager = global.workspace_manager;
            this._activeWorkspace = this._workspaceManager.get_active_workspace();
            this._activeWorkspaceChangedId = this._workspaceManager.connect('active-workspace-changed', this._activeWorkspaceChanged.bind(this));

            this._activeWorkspace.list_windows().forEach(
                metaWindow => this._windowAdded(metaWindow, false)
            );
            this._windowAddedId = this._activeWorkspace.connect('window-added', (_workspace, window) => this._windowAdded(window));
            this._windowRemovedId = this._activeWorkspace.connect('window-removed', (_workspace, window) => this._windowRemoved(window));

            this._update();
        }

        _windowAdded(metaWindow, doUpdate = true) {
            // Not need to track renderer window or skip taskbar window
            if (metaWindow.title?.includes(applicationId) | metaWindow.skip_taskbar)
                return;

            let signals = [];
            signals.push(
                metaWindow.connect('notify::maximized-horizontally', () => {
                    this._logger.debug('maximized-horizontally changed');
                    this._update();
                }));
            signals.push(
                metaWindow.connect('notify::maximized-vertically', () => {
                    this._logger.debug('maximized-vertically changed');
                    this._update();
                }));
            signals.push(
                metaWindow.connect('notify::fullscreen', () => {
                    this._logger.debug('fullscreen changed');
                    this._update();
                }));
            signals.push(
                metaWindow.connect('notify::minimized', () => {
                    this._logger.debug('minimized changed');
                    this._update();
                })
            );
            this._windows.push(
                {
                    metaWindow,
                    signals,
                }
            );
            this._logger.debug(`Window ${metaWindow.title} added`);
            if (doUpdate)
                this._update();
        }

        _windowRemoved(metaWindow) {
            if (metaWindow.title?.includes(applicationId) | metaWindow.skip_taskbar)
                return;

            this._windows = this._windows.filter(window => {
                if (window.metaWindow === metaWindow) {
                    window.signals.forEach(signal => metaWindow.disconnect(signal));
                    return false;
                }
                return true;
            });
            this._logger.debug(`Window ${metaWindow.title} removed`);
            this._update();
        }

        _activeWorkspaceChanged(workspaceManager) {
            this._windows.forEach(({metaWindow, signals}) => {
                signals.forEach(signal => metaWindow.disconnect(signal));
            });
            this._windows = [];

            if (this._windowAddedId) {
                this._activeWorkspace.disconnect(this._windowAddedId);
                this._windowAddedId = null;
            }
            if (this._windowRemovedId) {
                this._activeWorkspace.disconnect(this._windowRemovedId);
                this._windowRemovedId = null;
            }
            this._activeWorkspace = null;

            this._activeWorkspace = workspaceManager.get_active_workspace();
            this._logger.debug(`Active workspace changed to ${this._activeWorkspace.workspace_index}`);

            this._activeWorkspace.list_windows().forEach(
                metaWindow => this._windowAdded(metaWindow, false)
            );
            this._windowAddedId = this._activeWorkspace.connect('window-added', (_workspace, window) => this._windowAdded(window));
            this._windowRemovedId = this._activeWorkspace.connect('window-removed', (_workspace, window) => this._windowRemoved(window));

            this._update();
        }

        _update() {
            // Filter out renderer windows and minimized windows
            let metaWindows = this._windows.map(({metaWindow}) => metaWindow).filter(
                metaWindow => !metaWindow.title?.includes(applicationId) && !metaWindow.minimized
            );

            const monitors = Main.layoutManager.monitors;

            this.states.maximizedOrFullscreenOnAnyMonitor = metaWindows.some(metaWindow =>
                metaWindow.get_maximize_flags() === Meta.MaximizeFlags.BOTH || metaWindow.fullscreen);

            let monitorsWithMaximizedOrFullscreen = metaWindows.reduce((acc, metaWindow) => {
                if (metaWindow.get_maximize_flags() === Meta.MaximizeFlags.BOTH || metaWindow.fullscreen)
                    acc[metaWindow.get_monitor()] = true;
                return acc;
            }, {});

            this.states.maximizedOrFullscreenOnAllMonitors = monitors.every(
                monitor => monitorsWithMaximizedOrFullscreen[monitor.index]
            );

            super._update();
        }

        shouldAutoPause() {
            let res = false;
            if (this.conditions.pauseOnMaximizeOrFullscreen === PauseOnMaximizeOrFullscreenMode.anyMonitor &&
                this.states.maximizedOrFullscreenOnAnyMonitor)
                res = true;

            if (this.conditions.pauseOnMaximizeOrFullscreen === PauseOnMaximizeOrFullscreenMode.allMonitors &&
                this.states.maximizedOrFullscreenOnAllMonitors)
                res = true;

            this._logger.debug('shouldAutoPause:', res);
            return res;
        }

        disable() {
            this._workspaceManager?.disconnect(this._activeWorkspaceChangedId);
            this._windows.forEach(({metaWindow, signals}) => {
                signals.forEach(signal => metaWindow.disconnect(signal));
            });
            this._activeWorkspace?.disconnect(this._windowAddedId);
            this._activeWorkspace?.disconnect(this._windowRemovedId);

            this._workspaceManager = null;
            this._activeWorkspace = null;
            this._activeWorkspaceChangedId = null;
            this._windows = [];
            this._windowAddedId = null;
            this._windowRemovedId = null;
        }
    }
);


/**
 * Pause On Battery
 */

const PauseOnBatteryMode = Object.freeze({
    never: 0,
    lowBattery: 1,
    always: 2,
});

const PauseOnBatteryModule = GObject.registerClass(
    class PauseOnBatteryModule extends AutoPauseModule {
        constructor(extension) {
            super(extension, 'battery');
            this.states = {
                onBattery: false,
                lowBattery: false,
            };
            this.conditions = {
                pauseOnBattery: this._settings.get_int('pause-on-battery'),
                lowBatteryThreshold: this._settings.get_int('low-battery-threshold'),
            };
            this._settings.connect('changed::pause-on-battery', () => {
                this.conditions.pauseOnBattery = this._settings.get_int('pause-on-battery');
                this._update();
            });
            this._settings.connect('changed::low-battery-threshold', () => {
                this.conditions.lowBatteryThreshold = this._settings.get_int('low-battery-threshold');
                this._update();
            });

            this._upower = new DBus.UPowerWrapper();
        }

        enable() {
            this._upower.proxy.connect('g-properties-changed', (_proxy, properties) => {
                let payload = properties.deep_unpack();
                if (!payload.hasOwnProperty('State') && !payload.hasOwnProperty('Percentage'))
                    return;
                this._logger.debug(`State ${payload.State}, Percentage ${payload.Percentage}`);
                this._update();
            });

            this._update();
        }

        _update() {
            let state = this._upower.getState();
            let percentage = this._upower.getPercentage();

            this.states.onBattery = state === UPower.DeviceState.PENDING_DISCHARGE || state === UPower.DeviceState.DISCHARGING;
            this.states.lowBattery = this.states.onBattery && percentage <= this.conditions.lowBatteryThreshold;

            super._update();
        }

        shouldAutoPause() {
            let res = false;
            if (this.conditions.pauseOnBattery === PauseOnBatteryMode.lowBattery && this.states.lowBattery)
                res = true;

            if (this.conditions.pauseOnBattery === PauseOnBatteryMode.always && this.states.onBattery)
                res = true;

            this._logger.debug('shouldAutoPause:', res);
            return res;
        }

        disable() {

        }
    }
);


/**
 * Pause On MPRIS Playing
 */

const PauseOnMprisPlayingModule = GObject.registerClass(
    class PauseOnMprisPlayingModule extends AutoPauseModule {
        constructor(extension) {
            super(extension, 'mpris');
            this.states = {
                mprisPlaying: false,
            };
            this.conditions = {
                pauseOnMprisPlaying: this._settings.get_boolean('pause-on-mpris-playing'),
            };
            this._settings.connect('changed::pause-on-mpris-playing', () => {
                this.conditions.pauseOnMprisPlaying = this._settings.get_boolean('pause-on-mpris-playing');
                this._update();
            });

            this._dbus = new DBus.DBusWrapper();
            this._mediaPlayers = {}; // {$mprisName: {playbackStatus, mpris, mprisPropertiesChangedId}, ...}
        }

        enable() {
            let mprisNames = this._queryMprisNames();
            mprisNames.forEach(mprisName => {
                this._logger.debug('Media Player found:', mprisName);
                let mpris = new DBus.MprisWrapper(mprisName);
                let playbackStatus = mpris.getPlaybackStatus();
                let _mprisPropertiesChanged = this._mprisPropertiesChangedFactory(mprisName);
                let mprisPropertiesChangedId = mpris.proxy.connect('g-properties-changed', _mprisPropertiesChanged);
                this._mediaPlayers[mprisName] = {
                    playbackStatus, mpris, mprisPropertiesChangedId,
                };
            });
            this._logger.debug(this._stringifyMediaPlayers());

            this._dbus.proxy.connectSignal('NameOwnerChanged', (_proxy, _sender, [name, oldOwner, newOwner]) => {
                if (name.startsWith('org.mpris.MediaPlayer2.')) {
                    let mprisName = name;
                    if (oldOwner === '') {
                        this._logger.debug('Media Player created:', mprisName);
                        let mpris = new DBus.MprisWrapper(mprisName);
                        let playbackStatus = mpris.getPlaybackStatus();
                        let _mprisPropertiesChanged = this._mprisPropertiesChangedFactory(mprisName);
                        let mprisPropertiesChangedId = mpris.proxy.connect('g-properties-changed', _mprisPropertiesChanged);
                        this._mediaPlayers[mprisName] = {
                            playbackStatus, mpris, mprisPropertiesChangedId,
                        };
                    } else if (newOwner === '') {
                        this._logger.debug('Media Player destroyed:', mprisName);
                        let mpris = this._mediaPlayers[mprisName].mpris;
                        let mprisPropertiesChangedId = this._mediaPlayers[mprisName].mprisPropertiesChangedId;
                        mpris.proxy.disconnect(mprisPropertiesChangedId);
                        delete this._mediaPlayers[mprisName];
                    }
                    this._logger.debug(this._stringifyMediaPlayers());
                    this._update();
                }
            });

            this._update();
        }

        _queryMprisNames() {
            try {
                // let ret = this._dbus.listNames();
                // let [names] =  ret.deep_unpack();
                let [names] = this._dbus.listNames();
                return names.filter(name => name.startsWith('org.mpris.MediaPlayer2.'));
            } catch (e) {
                this._logger.error('Error:', e.message);
            }
            return null;
        }

        _mprisPropertiesChangedFactory(mprisName) {
            let thisRef = this;
            /**
             *
             * @param _proxy
             * @param properties
             */
            function _mprisPropertiesChanged(_proxy, properties) {
                let payload = properties.deep_unpack();
                if (!payload.hasOwnProperty('PlaybackStatus'))
                    return;
                thisRef._mediaPlayers[mprisName].playbackStatus = payload.PlaybackStatus.deep_unpack();
                thisRef._logger.debug(thisRef._stringifyMediaPlayers());
                thisRef._update();
            }
            return _mprisPropertiesChanged;
        }

        _stringifyMediaPlayers() {
            let string = Object.entries(this._mediaPlayers).reduce((acc, [key, value]) => {
                acc[key] = {playbackStatus: value.playbackStatus};
                return acc;
            }, {});

            return JSON.stringify(string, null, 2);
        }

        _update() {
            this.states.mprisPlaying = Object.values(this._mediaPlayers).some(
                properties => properties.playbackStatus === 'Playing'
            );

            super._update();
        }

        shouldAutoPause() {
            let res = false;
            if (this.conditions.pauseOnMprisPlaying && this.states.mprisPlaying)
                res = true;

            this._logger.debug('shouldAutoPause:', res);
            return res;
        }

        disable() {
            Object.values(this._mediaPlayers).forEach(
                mediaPlayer => {
                    let mpris = mediaPlayer.mpris;
                    let mprisPropertiesChangedId = mediaPlayer.mprisPropertiesChangedId;
                    mpris.proxy.disconnect(mprisPropertiesChangedId);
                }
            );
            this._mediaPlayers = {};
        }
    }
);
