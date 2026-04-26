/**
 * Copyright (C) 2026
 *
 * Media key handling for Hanabi.
 *
 * Modern GNOME no longer lets third-party Shell extensions grab the XF86Audio
 * keys directly (gnome-settings-daemon owns those bindings) and the legacy
 * `org.gnome.SettingsDaemon.MediaKeys` consumer-registration API has been
 * removed. The supported way to receive those keys is to expose an MPRIS
 * (Media Player Remote Interfacing Specification) server.
 *
 * gnome-settings-daemon dispatches Play/Pause/Next/Previous to the most-
 * recently-active MPRIS player. When another player (Spotify, YT Music, a
 * browser, etc.) is currently `Playing`, gsd routes the keys to it; when
 * nothing else is active, it routes the keys to us, and we control the live
 * wallpaper:
 *   - PlayPause -> toggle wallpaper playback,
 *   - Next      -> next wallpaper in the configured directory,
 *   - Previous  -> previous wallpaper.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Logger from './logger.js';

const MPRIS_BUS_NAME = 'org.mpris.MediaPlayer2.hanabi';
const MPRIS_OBJECT_PATH = '/org/mpris/MediaPlayer2';
const MPRIS_ROOT_IFACE = 'org.mpris.MediaPlayer2';
const MPRIS_PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player';

const MPRIS_XML = `
<node>
  <interface name="org.mpris.MediaPlayer2">
    <method name="Raise"/>
    <method name="Quit"/>
    <property name="CanQuit" type="b" access="read"/>
    <property name="CanRaise" type="b" access="read"/>
    <property name="HasTrackList" type="b" access="read"/>
    <property name="Identity" type="s" access="read"/>
    <property name="DesktopEntry" type="s" access="read"/>
    <property name="SupportedUriSchemes" type="as" access="read"/>
    <property name="SupportedMimeTypes" type="as" access="read"/>
  </interface>
  <interface name="org.mpris.MediaPlayer2.Player">
    <method name="Next"/>
    <method name="Previous"/>
    <method name="Pause"/>
    <method name="PlayPause"/>
    <method name="Stop"/>
    <method name="Play"/>
    <method name="Seek">
      <arg direction="in" type="x" name="Offset"/>
    </method>
    <method name="SetPosition">
      <arg direction="in" type="o" name="TrackId"/>
      <arg direction="in" type="x" name="Position"/>
    </method>
    <method name="OpenUri">
      <arg direction="in" type="s" name="Uri"/>
    </method>
    <signal name="Seeked">
      <arg type="x" name="Position"/>
    </signal>
    <property name="PlaybackStatus" type="s" access="read"/>
    <property name="LoopStatus" type="s" access="readwrite"/>
    <property name="Rate" type="d" access="readwrite"/>
    <property name="Shuffle" type="b" access="readwrite"/>
    <property name="Metadata" type="a{sv}" access="read"/>
    <property name="Volume" type="d" access="readwrite"/>
    <property name="Position" type="x" access="read"/>
    <property name="MinimumRate" type="d" access="read"/>
    <property name="MaximumRate" type="d" access="read"/>
    <property name="CanGoNext" type="b" access="read"/>
    <property name="CanGoPrevious" type="b" access="read"/>
    <property name="CanPlay" type="b" access="read"/>
    <property name="CanPause" type="b" access="read"/>
    <property name="CanSeek" type="b" access="read"/>
    <property name="CanControl" type="b" access="read"/>
  </interface>
</node>`;

export class MediaKeys {
    constructor(extension) {
        this._logger = new Logger.Logger('mediaKeys');
        this._extension = extension;
        this._settings = extension.getSettings();
        this._playbackState = extension.getPlaybackState();

        this._ownerId = 0;
        this._connection = null;
        this._rootRegId = 0;
        this._playerRegId = 0;
        this._enabled = false;
        this._nodeInfo = null;

        // Cached list of video paths in `change-wallpaper-directory-path`.
        // We MUST NOT do filesystem IO inside MPRIS property getters: the
        // GNOME Shell media-controls indicator calls GetAll/CanGoNext/etc.
        // synchronously on the Shell main thread, and any slow IO there
        // freezes the entire UI for several seconds.
        this._videoPathsCache = null;
        this._videoPathsCacheDir = null;
        this._dirMonitor = null;
        this._dirMonitorChangedId = 0;
        this._refreshTimeoutId = 0;
        this._dirChangedSettingsId = 0;
    }

    enable() {
        if (this._enabled)
            return;
        this._enabled = true;

        try {
            this._nodeInfo = Gio.DBusNodeInfo.new_for_xml(MPRIS_XML);
        } catch (e) {
            this._logger.warn(`Failed to parse MPRIS XML: ${e}`);
            this._enabled = false;
            return;
        }

        this._ownerId = Gio.bus_own_name(
            Gio.BusType.SESSION,
            MPRIS_BUS_NAME,
            Gio.BusNameOwnerFlags.NONE,
            (connection, _name) => this._onBusAcquired(connection),
            () => {},
            (_connection, _name) => {
                this._logger.warn('Lost MPRIS bus name');
            }
        );

        // Watch the wallpaper directory setting and the directory itself so
        // the cache stays fresh without doing IO in property getters.
        this._dirChangedSettingsId = this._settings.connect(
            'changed::change-wallpaper-directory-path',
            () => this._scheduleRefresh()
        );
        this._scheduleRefresh();
    }

    disable() {
        if (!this._enabled)
            return;
        this._enabled = false;

        if (this._dirChangedSettingsId) {
            this._settings.disconnect(this._dirChangedSettingsId);
            this._dirChangedSettingsId = 0;
        }
        this._teardownDirMonitor();
        if (this._refreshTimeoutId) {
            GLib.source_remove(this._refreshTimeoutId);
            this._refreshTimeoutId = 0;
        }
        this._videoPathsCache = null;
        this._videoPathsCacheDir = null;

        if (this._connection) {
            if (this._rootRegId) {
                this._connection.unregister_object(this._rootRegId);
                this._rootRegId = 0;
            }
            if (this._playerRegId) {
                this._connection.unregister_object(this._playerRegId);
                this._playerRegId = 0;
            }
            this._connection = null;
        }

        if (this._ownerId) {
            Gio.bus_unown_name(this._ownerId);
            this._ownerId = 0;
        }

        this._nodeInfo = null;
    }

    /**
     * Notify subscribers that PlaybackStatus changed.
     */
    /**
     * MPRIS dispatch in gnome-settings-daemon routes media keys to the
     * player that most recently transitioned to Playing. We deliberately
     * never report ourselves as Playing and never emit PropertiesChanged,
     * so a real media player (Spotify, browsers, etc.) will always be
     * preferred when one is active. When nothing else is playing, we are
     * the only registered MPRIS player and the keys fall through to us.
     */
    notifyPlaybackStatusChanged() {
        // Intentionally a no-op. See class comment.
    }

    _onBusAcquired(connection) {
        if (!this._enabled)
            return;
        this._connection = connection;

        const rootIface = this._nodeInfo.lookup_interface(MPRIS_ROOT_IFACE);
        const playerIface = this._nodeInfo.lookup_interface(MPRIS_PLAYER_IFACE);

        try {
            this._rootRegId = connection.register_object(
                MPRIS_OBJECT_PATH,
                rootIface,
                this._rootMethodCall.bind(this),
                this._rootGetProperty.bind(this),
                null
            );
        } catch (e) {
            this._logger.warn(`Failed to register MPRIS root: ${e}`);
        }

        try {
            this._playerRegId = connection.register_object(
                MPRIS_OBJECT_PATH,
                playerIface,
                this._playerMethodCall.bind(this),
                this._playerGetProperty.bind(this),
                this._playerSetProperty.bind(this)
            );
        } catch (e) {
            this._logger.warn(`Failed to register MPRIS player: ${e}`);
        }
    }

    // --- org.mpris.MediaPlayer2 ---------------------------------------------

    _rootMethodCall(_conn, _sender, _path, _iface, method, _params, invocation) {
        switch (method) {
        case 'Raise':
        case 'Quit':
            invocation.return_value(null);
            break;
        default:
            invocation.return_error_literal(
                Gio.dbus_error_quark(),
                Gio.DBusError.UNKNOWN_METHOD,
                `Unknown method ${method}`
            );
        }
    }

    _rootGetProperty(_conn, _sender, _path, _iface, prop) {
        switch (prop) {
        case 'CanQuit':
        case 'CanRaise':
        case 'HasTrackList':
            return GLib.Variant.new_boolean(false);
        case 'Identity':
            return GLib.Variant.new_string('Hanabi');
        case 'DesktopEntry':
            return GLib.Variant.new_string('hanabi-extension');
        case 'SupportedUriSchemes':
        case 'SupportedMimeTypes':
            return GLib.Variant.new_strv([]);
        }
        return null;
    }

    // --- org.mpris.MediaPlayer2.Player --------------------------------------

    _playerMethodCall(_conn, _sender, _path, _iface, method, _params, invocation) {
        switch (method) {
        case 'PlayPause':
            this._togglePlayPause();
            break;
        case 'Play':
            this._playbackState.userPlay();
            this._playbackState.sync();
            this.notifyPlaybackStatusChanged();
            break;
        case 'Pause':
        case 'Stop':
            this._playbackState.userPause();
            this._playbackState.sync();
            this.notifyPlaybackStatusChanged();
            break;
        case 'Next':
            this._setNextWallpaper();
            break;
        case 'Previous':
            this._setPreviousWallpaper();
            break;
        case 'Seek':
        case 'SetPosition':
        case 'OpenUri':
            // No-op; we report CanSeek=false.
            break;
        default:
            invocation.return_error_literal(
                Gio.dbus_error_quark(),
                Gio.DBusError.UNKNOWN_METHOD,
                `Unknown method ${method}`
            );
            return;
        }
        invocation.return_value(null);
    }

    _playerGetProperty(_conn, _sender, _path, _iface, prop) {
        switch (prop) {
        case 'PlaybackStatus':
            // Always advertise Paused regardless of the wallpaper's actual
            // state, so we don't outrank real media players in gsd's
            // most-recently-active arbitration.
            return GLib.Variant.new_string('Paused');
        case 'LoopStatus':
            return GLib.Variant.new_string('None');
        case 'Rate':
        case 'MinimumRate':
        case 'MaximumRate':
            return GLib.Variant.new_double(1.0);
        case 'Shuffle':
            return GLib.Variant.new_boolean(false);
        case 'Metadata': {
            const trackId = '/io/github/jeffshee/hanabi/track/0';
            const dict = {
                'mpris:trackid': GLib.Variant.new_object_path(trackId),
            };
            const path = this._settings.get_string('video-path');
            if (path) {
                const title = GLib.path_get_basename(path);
                dict['xesam:title'] = GLib.Variant.new_string(title);
            }
            return new GLib.Variant('a{sv}', dict);
        }
        case 'Volume':
            return GLib.Variant.new_double(1.0);
        case 'Position':
            return GLib.Variant.new_int64(0);
        case 'CanGoNext':
        case 'CanGoPrevious':
            // Always advertise true; do not block in this getter.
            return GLib.Variant.new_boolean(true);
        case 'CanPlay':
        case 'CanPause':
        case 'CanControl':
            return GLib.Variant.new_boolean(true);
        case 'CanSeek':
            return GLib.Variant.new_boolean(false);
        }
        return null;
    }

    _playerSetProperty() {
        // Read-only / ignored.
        return false;
    }

    // --- helpers ------------------------------------------------------------

    _getPlaybackStatusString() {
        return this._playbackState.getCurrentState() === 'playing'
            ? 'Playing'
            : 'Paused';
    }

    _togglePlayPause() {
        if (this._playbackState.getCurrentState() === 'playing')
            this._playbackState.userPause();
        else
            this._playbackState.userPlay();
        this._playbackState.sync();
        this.notifyPlaybackStatusChanged();
    }

    _hasWallpaperLibrary() {
        return (this._videoPathsCache?.length ?? 0) > 1;
    }

    _scheduleRefresh() {
        if (this._refreshTimeoutId)
            return;
        // Defer the refresh off the hot path; do it as a low-priority idle.
        this._refreshTimeoutId = GLib.idle_add(GLib.PRIORITY_LOW, () => {
            this._refreshTimeoutId = 0;
            this._refreshVideoPaths();
            return GLib.SOURCE_REMOVE;
        });
    }

    _refreshVideoPaths() {
        const dirPath = this._settings.get_string('change-wallpaper-directory-path');
        this._videoPathsCacheDir = dirPath;
        this._videoPathsCache = this._enumerateVideoPaths(dirPath);
        this._setupDirMonitor(dirPath);
    }

    _setupDirMonitor(dirPath) {
        this._teardownDirMonitor();
        if (!dirPath)
            return;
        try {
            const dir = Gio.File.new_for_path(dirPath);
            this._dirMonitor = dir.monitor_directory(
                Gio.FileMonitorFlags.NONE,
                null
            );
            this._dirMonitorChangedId = this._dirMonitor.connect('changed', () => {
                this._scheduleRefresh();
            });
        } catch (e) {
            this._dirMonitor = null;
        }
    }

    _teardownDirMonitor() {
        if (this._dirMonitor) {
            if (this._dirMonitorChangedId) {
                this._dirMonitor.disconnect(this._dirMonitorChangedId);
                this._dirMonitorChangedId = 0;
            }
            try {
                this._dirMonitor.cancel();
            } catch (e) {
                // ignore
            }
            this._dirMonitor = null;
        }
    }

    _enumerateVideoPaths(dirPath) {
        if (!dirPath)
            return [];
        const dir = Gio.File.new_for_path(dirPath);
        let info;
        try {
            info = dir.query_info(
                'standard::type',
                Gio.FileQueryInfoFlags.NONE,
                null
            );
        } catch (e) {
            return [];
        }
        if (info.get_file_type() !== Gio.FileType.DIRECTORY)
            return [];

        let enumerator;
        try {
            enumerator = dir.enumerate_children(
                'standard::name,standard::content-type',
                Gio.FileQueryInfoFlags.NONE,
                null
            );
        } catch (e) {
            return [];
        }
        const paths = [];
        let child;
        while ((child = enumerator.next_file(null))) {
            const ct = child.get_content_type();
            if (ct && ct.startsWith('video/'))
                paths.push(dir.get_child(child.get_name()).get_path());
        }
        try {
            enumerator.close(null);
        } catch (e) {
            // ignore
        }
        return paths.sort();
    }

    _getVideoPaths() {
        // Prefer cached list. If the directory setting changed since the
        // cache was populated, fall back to a direct enumeration once and
        // schedule a refresh; this path is only reached from key-press
        // handlers, never from MPRIS property getters.
        const dirPath = this._settings.get_string('change-wallpaper-directory-path');
        if (this._videoPathsCache && dirPath === this._videoPathsCacheDir)
            return this._videoPathsCache;
        const paths = this._enumerateVideoPaths(dirPath);
        this._videoPathsCache = paths;
        this._videoPathsCacheDir = dirPath;
        return paths;
    }

    _setNextWallpaper() {
        const videoPaths = this._getVideoPaths();
        if (videoPaths.length === 0)
            return;
        const current = this._settings.get_string('video-path');
        const idx = videoPaths.findIndex(p => p === current);
        const next = idx === -1 ? 0 : (idx + 1) % videoPaths.length;
        this._settings.set_string('video-path', videoPaths[next]);
    }

    _setPreviousWallpaper() {
        const videoPaths = this._getVideoPaths();
        if (videoPaths.length === 0)
            return;
        const current = this._settings.get_string('video-path');
        const idx = videoPaths.findIndex(p => p === current);
        const prev = idx === -1
            ? 0
            : (idx - 1 + videoPaths.length) % videoPaths.length;
        this._settings.set_string('video-path', videoPaths[prev]);
    }
}
