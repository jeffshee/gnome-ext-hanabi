#!/usr/bin/env gjs

/**
 * Copyright (C) 2024 Jeff Shee (jeffshee8969@gmail.com)
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

imports.gi.versions.Gtk = '4.0';
const {GObject, Gtk, Gio, GLib, Gdk, Gst} = imports.gi;

// [major, minor, micro, nano]
const gstVersion = Gst.version();
console.log(`GStreamer version: ${gstVersion.join('.')}`);

// [major, minor, micro]
const gtkVersion = [Gtk.get_major_version(), Gtk.get_minor_version(), Gtk.get_micro_version()];
console.log(`Gtk version: ${gtkVersion.join('.')}`);

const isGstVersionAtLeast = (major, minor) => {
    return gstVersion[0] > major || (gstVersion[0] === major && gstVersion[1] >= minor);
};

const isGtkVersionAtLeast = (major, minor) => {
    return gtkVersion[0] > major || (gtkVersion[0] === major && gtkVersion[1] >= minor);
};

let GstPlay = null;
// GstPlay is available from GStreamer 1.20+
try {
    GstPlay = imports.gi.GstPlay;
} catch (e) {
    console.error(e);
    console.warn('GstPlay, or the typelib is not installed. Renderer will fallback to GtkMediaFile!');
}
const haveGstPlay = GstPlay !== null;

let GstAudio = null;
// Might not pre-installed on some distributions
try {
    GstAudio = imports.gi.GstAudio;
} catch (e) {
    console.error(e);
    console.warn('GstAudio, or the typelib is not installed.');
}
const haveGstAudio = GstAudio !== null;

// ContentFit is available from Gtk 4.8+
const haveContentFit = isGtkVersionAtLeast(4, 8);

// Use glsinkbin for Gst 1.24+
const useGstGL = isGstVersionAtLeast(1, 24);

const applicationId = 'io.github.jeffshee.HanabiRenderer';

let extSettings = null;
const extSchemaId = 'io.github.jeffshee.hanabi-extension';
let settingsSchemaSource = Gio.SettingsSchemaSource.get_default();
if (settingsSchemaSource.lookup(extSchemaId, false))
    extSettings = Gio.Settings.new(extSchemaId);

const forceGtk4PaintableSink = extSettings
    ? extSettings.get_boolean('force-gtk4paintablesink')
    : false;
const forceMediaFile = extSettings
    ? extSettings.get_boolean('force-mediafile')
    : false;

const isEnableVADecoders = extSettings
    ? extSettings.get_boolean('enable-va')
    : false;
const isEnableNvSl = extSettings
    ? extSettings.get_boolean('enable-nvsl')
    : false;

// Support for dmabus and graphics offload is available from Gtk 4.14+
const isEnableGraphicsOffload = extSettings
    ? extSettings.get_boolean('enable-graphics-offload')
    : false;
const haveGraphicsOffload = isGtkVersionAtLeast(4, 14) && isEnableGraphicsOffload;

let codePath = 'src';
let contentFit = null;
if (haveContentFit) {
    contentFit = extSettings
        ? extSettings.get_int('content-fit')
        : Gtk.ContentFit.CONTAIN;
}
let mute = extSettings ? extSettings.get_boolean('mute') : false;
let nohide = false;
let videoPath = extSettings ? extSettings.get_string('video-path') : '';
let volume = extSettings ? extSettings.get_int('volume') / 100.0 : 0.5;
let changeWallpaper = extSettings ? extSettings.get_boolean('change-wallpaper') : true;
let changeWallpaperDirectoryPath = extSettings ? extSettings.get_string('change-wallpaper-directory-path') : '';
let changeWallpaperMode = extSettings ? extSettings.get_int('change-wallpaper-mode') : 0;
let changeWallpaperInterval = extSettings ? extSettings.get_int('change-wallpaper-interval') : 15;
let windowDimension = {width: 1920, height: 1080};
let windowed = false;
let fullscreened = true;
let isDebugMode = extSettings ? extSettings.get_boolean('debug-mode') : true;
let changeWallpaperTimerId = null;


const HanabiRenderer = GObject.registerClass(
    {
        GTypeName: 'HanabiRenderer',
    },
    class HanabiRenderer extends Gtk.Application {
        constructor() {
            super({
                application_id: applicationId,
                flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE,
            });

            GLib.log_set_debug_enabled(isDebugMode);

            this._hanabiWindows = [];
            this._pictures = [];
            this._sharedPaintable = null;
            this._gstImplName = '';
            this._isPlaying = false;
            this._exportDbus();
            this._setupGst();

            this.connect('activate', app => {
                this._display = Gdk.Display.get_default();
                this._monitors = this._display ? [...this._display.get_monitors()] : [];

                let activeWindow = app.activeWindow;
                if (!activeWindow) {
                    this._buildUI();
                    this._hanabiWindows.forEach(window => {
                        window.present();
                    });
                }
            });

            this.connect('command-line', (app, commandLine) => {
                let argv = commandLine.get_arguments();
                if (this._parseArgs(argv)) {
                    this.activate();
                    commandLine.set_exit_status(0);
                } else {
                    commandLine.set_exit_status(1);
                }
            });

            extSettings?.connect('changed', (settings, key) => {
                switch (key) {
                case 'video-path':
                    videoPath = settings.get_string(key);
                    this.setFilePath(videoPath);
                    break;
                case 'mute':
                    mute = settings.get_boolean(key);
                    this.setMute(mute);
                    break;
                case 'volume':
                    volume = settings.get_int(key) / 100.0;
                    this.setVolume(volume);
                    break;
                case 'change-wallpaper':
                    changeWallpaper = settings.get_boolean(key);
                    this.setAutoWallpaper();
                    break;
                case 'change-wallpaper-interval':
                    changeWallpaperInterval = settings.get_int(key);
                    this.setAutoWallpaper();
                    break;
                case 'change-wallpaper-directory-path':
                    changeWallpaperDirectoryPath = settings.get_string(key);
                    this.setAutoWallpaper();
                    break;
                case 'change-wallpaper-mode':
                    changeWallpaperMode = settings.get_int(key);
                    break;
                case 'content-fit':
                    if (!haveContentFit)
                        return;
                    contentFit = settings.get_int(key);
                    this._pictures.forEach(picture =>
                        picture.set_content_fit(contentFit)
                    );
                    break;
                case 'debug-mode':
                    isDebugMode = settings.get_boolean(key);
                    GLib.log_set_debug_enabled(isDebugMode);
                    break;
                }
            });
        }

        _parseArgs(argv) {
            let lastCommand = null;
            for (let arg of argv) {
                if (!lastCommand) {
                    switch (arg) {
                    case '-M':
                    case '--mute':
                        mute = true;
                        console.debug(`mute = ${mute}`);
                        break;
                    case '-N':
                    case '--nohide':
                        // Launch renderer in standalone mode without hiding
                        nohide = true;
                        console.debug(`nohide = ${nohide}`);
                        break;
                    case '-W':
                    case '--windowed':
                    case '-P':
                    case '--codepath':
                    case '-F':
                    case '--filepath':
                    case '-V':
                    case '--volume':
                        lastCommand = arg;
                        break;
                    default:
                        console.error(`Argument ${arg} not recognized. Aborting.`);
                        return false;
                    }
                    continue;
                }
                switch (lastCommand) {
                case '-W':
                case '--windowed': {
                    windowed = true;
                    let data = arg.split(':');
                    windowDimension = {
                        width: parseInt(data[0]),
                        height: parseInt(data[1]),
                    };
                    console.debug(
                        `windowed = ${windowed}, windowConfig = ${windowDimension}`
                    );
                    break;
                }
                case '-P':
                case '--codepath':
                    codePath = arg;
                    console.debug(`codepath = ${codePath}`);
                    break;
                case '-F':
                case '--filepath':
                    videoPath = arg;
                    console.debug(`filepath = ${videoPath}`);
                    break;
                case '-V':
                case '--volume':
                    volume = Math.max(0.0, Math.min(1.0, parseFloat(arg)));
                    console.debug(`volume = ${volume}`);
                    break;
                }
                lastCommand = null;
            }
            return true;
        }

        _setupGst() {
            // Software libav decoders have "primary" rank, set Nvidia higher
            // to use NVDEC hardware acceleration.
            this._setPluginDecodersRank(
                'nvcodec',
                Gst.Rank.PRIMARY + 1,
                isEnableNvSl
            );

            // Legacy "vaapidecodebin" have rank "primary + 2",
            // we need to set VA higher then that to be used
            if (isEnableVADecoders)
                this._setPluginDecodersRank('va', Gst.Rank.PRIMARY + 3);
        }

        _setPluginDecodersRank(pluginName, rank, useStateless = false) {
            let gstRegistry = Gst.Registry.get();
            let features = gstRegistry.get_feature_list_by_plugin(pluginName);

            for (let feature of features) {
                let featureName = feature.get_name();

                if (
                    !featureName.endsWith('dec') &&
                    !featureName.endsWith('postproc')
                )
                    continue;

                let isStateless = featureName.includes('sl');

                if (isStateless !== useStateless)
                    continue;

                let oldRank = feature.get_rank();

                if (rank === oldRank)
                    continue;

                feature.set_rank(rank);
                console.debug(`changed rank: ${oldRank} -> ${rank} for ${featureName}`);
            }
        }

        _buildUI() {
            this._monitors.forEach((gdkMonitor, index) => {
                let widget = this._getWidgetFromSharedPaintable();

                // Avoid creating another instance if we couldn't get the shared paintable
                if (index > 0 && !widget)
                    return;

                if (!widget) {
                    if (!forceMediaFile && haveGstPlay) {
                        let sink = null;
                        if (!forceGtk4PaintableSink) {
                            // Try to find "clappersink" for best performance
                            sink = Gst.ElementFactory.make(
                                'clappersink',
                                'clappersink'
                            );
                        }

                        // Try "gtk4paintablesink" from gstreamer-rs plugins as 2nd best choice
                        if (!sink) {
                            sink = Gst.ElementFactory.make(
                                'gtk4paintablesink',
                                'gtk4paintablesink'
                            );
                        }

                        if (sink)
                            widget = this._getWidgetFromSink(sink);
                    }

                    if (!widget)
                        widget = this._getGtkStockWidget();
                }

                let geometry = gdkMonitor.get_geometry();
                let state = {
                    position: [geometry.x, geometry.y],
                    keepAtBottom: true,
                    keepMinimized: true,
                    keepPosition: true,
                };
                let window = new HanabiRendererWindow(
                    this,
                    nohide
                        ? `Hanabi Renderer #${index} (using ${this._gstImplName})`
                        : `@${applicationId}!${JSON.stringify(state)}|${index}`,
                    widget,
                    gdkMonitor
                );

                this._hanabiWindows.push(window);
            });
            console.log(`using ${this._gstImplName} for video output`);
        }

        _getWidgetFromSharedPaintable() {
            if (this._sharedPaintable) {
                let picture = new Gtk.Picture({
                    paintable: this._sharedPaintable,
                    hexpand: true,
                    vexpand: true,
                });

                if (haveContentFit)
                    picture.set_content_fit(contentFit);
                this._pictures.push(picture);

                if (haveGraphicsOffload) {
                    let offload = Gtk.GraphicsOffload.new(picture);
                    offload.set_enabled(Gtk.GraphicsOffloadEnabled.ENABLED);
                    return offload;
                }

                return picture;
            }
            return null;
        }

        _getWidgetFromSink(sink) {
            this._gstImplName = sink.name;

            // If sink already offers GTK widget, use it.
            // Otherwise use GtkPicture with paintable from sink.
            let widget = null;

            if (sink.widget) {
                if (sink.widget instanceof Gtk.Picture) {
                    // Workaround for clappersink.
                    // We use a Gtk.Box here to piggyback the sink.widget from clappersink,
                    // otherwise the sink.widget will spawn a window for itself.
                    // This workaround is only needed for the first window.
                    this._sharedPaintable = sink.widget.paintable;
                    let box = new Gtk.Box();
                    box.append(sink.widget);
                    box.append(this._getWidgetFromSharedPaintable());
                    // Hide the sink.widget to show our Gtk.Picture only
                    sink.widget.hide();
                    widget = box;
                } else {
                    // Just in case clappersink doesn't use GtkPicture internally anymore
                    widget = sink.widget;
                }
            } else if (sink.paintable) {
                this._sharedPaintable = sink.paintable;
                widget = this._getWidgetFromSharedPaintable();
            }

            if (!widget)
                return null;

            if (useGstGL) {
                let glsink = Gst.ElementFactory.make(
                    'glsinkbin',
                    'glsinkbin'
                );
                if (glsink) {
                    this._gstImplName = `glsinkbin + ${this._gstImplName}`;
                    glsink.set_property('sink', sink);
                    sink = glsink;
                }
            }
            this._play = GstPlay.Play.new(
                GstPlay.PlayVideoOverlayVideoRenderer.new_with_sink(null, sink)
            );
            this._adapter = GstPlay.PlaySignalAdapter.new(this._play);

            // Loop video
            this._adapter.connect('end-of-stream', adapter =>
                adapter.play.seek(0)
            );

            // Error handling
            this._adapter.connect('warning', (_adapter, err) => console.warn(err));
            this._adapter.connect('error', (_adapter, err) => console.error(err));

            // Set the volume and mute after paused state, otherwise it won't work.
            // Use paused or greater, as some states might be skipped.
            let stateSignal = this._adapter.connect(
                'state-changed',
                (adapter, state) => {
                    if (state >= GstPlay.PlayState.PAUSED) {
                        this.setVolume(volume);
                        this.setMute(mute);

                        this._adapter.disconnect(stateSignal);
                        stateSignal = null;
                    }
                }
            );
            // Monitor playing state.
            this._adapter.connect(
                'state-changed',
                (adapter, state) => {
                    // Monitor playing state.
                    this._isPlaying = state === GstPlay.PlayState.PLAYING;
                    this._dbus.emit_signal('isPlayingChanged', new GLib.Variant('(b)', [this._isPlaying]));
                }
            );

            let file = Gio.File.new_for_path(videoPath);
            this._play.set_uri(file.get_uri());

            this.setPlay();
            this.setAutoWallpaper();

            return widget;
        }

        _getGtkStockWidget() {
            this._gstImplName = 'GtkMediaFile';

            // The constructor of MediaFile doesn't work in gjs.
            // Have to call the `new_for_xxx` function here.
            this._media = Gtk.MediaFile.new_for_filename(videoPath);
            this._media.set({
                loop: true,
            });
            // Set the volume and mute after prepared, otherwise it won't work.
            this._media.connect('notify::prepared', () => {
                this.setVolume(volume);
                this.setMute(mute);
            });
            // Monitor playing state.
            this._media.connect('notify::playing', media => {
                this._isPlaying = media.get_playing();
                this._dbus.emit_signal('isPlayingChanged', new GLib.Variant('(b)', [this._isPlaying]));
            });

            this._sharedPaintable = this._media;
            let widget = this._getWidgetFromSharedPaintable();

            this.setPlay();
            this.setAutoWallpaper();

            return widget;
        }

        _exportDbus() {
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

            this._dbus = Gio.DBusExportedObject.wrapJSObject(
                dbusXml,
                this
            );
            this._dbus.export(
                Gio.DBus.session,
                '/io/github/jeffshee/HanabiRenderer'
            );
        }

        _unexportDbus() {
            this._dbus.unexport();
        }


        /**
         * These workarounds are needed because get_volume() and get_muted() can be wrong in some cases.
         * If the current value is equal to the new value, the changes will be skipped.
         * Avoid this behavior by resetting the current value to null before setting the new value.
         *
         * @param _volume
         */
        setVolume(_volume) {
            let player = this._play != null ? this._play : this._media;

            // GstPlay uses linear volume
            if (this._play) {
                if (haveGstAudio) {
                    _volume = GstAudio.StreamVolume.convert_volume(
                        GstAudio.StreamVolumeFormat.CUBIC,
                        GstAudio.StreamVolumeFormat.LINEAR,
                        _volume
                    );
                } else {
                    _volume = Math.pow(_volume, 3);
                }
            }

            if (player.volume === _volume)
                player.volume = null;
            player.volume = _volume;
        }

        setMute(_mute) {
            if (this._play) {
                if (this._play.mute === _mute)
                    this._play.mute = !_mute;
                this._play.mute = _mute;
            } else if (this._media) {
                if (this._media.muted === _mute)
                    this._media.muted = !_mute;
                this._media.muted = _mute;
            }
        }

        setFilePath(_videoPath) {
            let file = Gio.File.new_for_path(_videoPath);
            if (this._play) {
                this._play.set_uri(file.get_uri());
            } else if (this._media) {
                // Reset the stream when switching the file,
                // otherwise `play()` is not playing for some reason.
                this._media.stream_unprepared();
                this._media.file = file;
            }
            this.setPlay();
        }

        setPlay() {
            if (this._play)
                this._play.play();
            else if (this._media)
                this._media.play();
        }

        setPause() {
            if (this._play)
                this._play.pause();
            else if (this._media)
                this._media.pause();
        }

        setAutoWallpaper() {
            // Index to keep track of the current video
            let currentIndex = 0;
            let videoPaths = [];
            let dir = Gio.File.new_for_path(changeWallpaperDirectoryPath);
            // Check if dir exists and is a directory
            if (dir.query_file_type(Gio.FileQueryInfoFlags.NONE, null) !== Gio.FileType.DIRECTORY)
                return;

            let enumerator = dir.enumerate_children(
                'standard::*',
                Gio.FileQueryInfoFlags.NONE,
                null
            );

            // Get files to push into array
            let fileInfo;
            while ((fileInfo = enumerator.next_file(null))) {
                if (fileInfo.get_content_type().startsWith('video/')) {
                    let file = dir.get_child(fileInfo.get_name());
                    videoPaths.push(file.get_path());
                }
            }
            if (videoPaths.length === 0)
                return;
            videoPaths = videoPaths.sort();

            let getRandomIndex = (actualIndex, videosLength) => {
                if (videosLength <= 1)
                    return actualIndex;

                let newIndex;
                do
                    newIndex = Math.floor(Math.random() * videosLength);
                while (newIndex === actualIndex);
                return newIndex;
            };

            let operation = () => {
                console.debug(`setAutoWallpaper operation, interval: ${changeWallpaperInterval} min`);
                // Avoid changing the wallpaper if it's paused to avoid unexpected playback resume.
                if (this._isPlaying) {
                    extSettings.set_string('video-path', videoPaths[currentIndex]);

                    if (changeWallpaperMode === 0)
                        currentIndex = (currentIndex + 1) % videoPaths.length;
                    else if (changeWallpaperMode === 1)
                        currentIndex = (currentIndex - 1 + videoPaths.length) % videoPaths.length;
                    else if (changeWallpaperMode === 2)
                        currentIndex = getRandomIndex(currentIndex, videoPaths.length);
                }

                // return true to be called again.
                return true;
            };

            // Remove the current timer
            if (changeWallpaperTimerId) {
                GLib.source_remove(changeWallpaperTimerId);
                changeWallpaperTimerId = null;
            }
            // Reset the timer accordingly
            if (changeWallpaper) {
                operation();
                changeWallpaperTimerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, changeWallpaperInterval * 60, operation);
            }
        }

        get isPlaying() {
            return this._isPlaying;
        }
    }
);

const HanabiRendererWindow = GObject.registerClass(
    {
        GTypeName: 'HanabiRendererWindow',
    },
    class HanabiRendererWindow extends Gtk.ApplicationWindow {
        constructor(application, title, widget, gdkMonitor) {
            super({
                application,
                decorated: !!nohide,
                default_height: windowDimension.height,
                default_width: windowDimension.width,
                title,
            });

            // Load CSS with custom style
            let cssProvider = new Gtk.CssProvider();
            cssProvider.load_from_file(
                Gio.File.new_for_path(
                    GLib.build_filenamev([codePath, 'renderer', 'stylesheet.css'])
                )
            );

            Gtk.StyleContext.add_provider_for_display(
                Gdk.Display.get_default(),
                cssProvider,
                Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
            );

            this.set_child(widget);
            if (!windowed) {
                if (fullscreened) {
                    this.fullscreen_on_monitor(gdkMonitor);
                } else {
                    let geometry = gdkMonitor.get_geometry();
                    let [width, height] = [geometry.width, geometry.height];
                    this.set_size_request(width, height);
                }
            }
        }
    }
);

Gst.init(null);

let renderer = new HanabiRenderer();
renderer.run(ARGV);
