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

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk?version=4.0';
import Gst from 'gi://Gst';

import {APPLICATION_ID, RENDERER_OBJECT_PATH} from '../constants.js';

// [major, minor, micro, nano]
const gstVersion = Gst.version();
console.log(`GStreamer version: ${gstVersion.join('.')}`);

// [major, minor, micro]
const gtkVersion = [
    Gtk.get_major_version(),
    Gtk.get_minor_version(),
    Gtk.get_micro_version(),
];
console.log(`Gtk version: ${gtkVersion.join('.')}`);

const isGstVersionAtLeast = (major: number, minor: number): boolean =>
    gstVersion[0] > major || (gstVersion[0] === major && gstVersion[1] >= minor);


let GstPlay: any = null;
try {
    // GstPlay is available from GStreamer 1.20+
    GstPlay = ((await import('gi://GstPlay')) as any).default;
} catch (e) {
    console.error(e);
    console.warn('GstPlay, or the typelib is not installed. Renderer will fallback to GtkMediaFile!');
}
const haveGstPlay = GstPlay !== null;


let GstAudio: any = null;
try {
    // Might not be pre-installed on some distributions
    GstAudio = ((await import('gi://GstAudio')) as any).default;
} catch (e) {
    console.error(e);
    console.warn('GstAudio, or the typelib is not installed.');
}
const haveGstAudio = GstAudio !== null;

// Use glsinkbin for Gst 1.24+
const useGstGL = isGstVersionAtLeast(1, 24);

let extSettings: Gio.Settings | null = null;
const extSchemaId = 'io.github.jeffshee.hanabi-extension';
const settingsSchemaSource = Gio.SettingsSchemaSource.get_default();
if (settingsSchemaSource?.lookup(extSchemaId, false))
    extSettings = Gio.Settings.new(extSchemaId);

const preferClappersink = extSettings?.get_boolean('prefer-clappersink') ?? false;
const forceMediaFile = extSettings?.get_boolean('force-mediafile') ?? false;
const isEnableVADecoders = extSettings?.get_boolean('enable-va') ?? false;
const isEnableNvSl = extSettings?.get_boolean('enable-nvsl') ?? false;

const isEnableGraphicsOffload = extSettings?.get_boolean('enable-graphics-offload') ?? false;

let codePath = 'src';
let contentFit = extSettings?.get_int('content-fit') ?? Gtk.ContentFit.CONTAIN;

let mute = extSettings?.get_boolean('mute') ?? false;
let nohide = false;
let videoPath = extSettings?.get_string('video-path') ?? '';
let volume = (extSettings?.get_int('volume') ?? 50) / 100.0;
let randomStartPosition = extSettings?.get_boolean('random-start-position') ?? false;
let changeWallpaper = extSettings?.get_boolean('change-wallpaper') ?? true;
let changeWallpaperDirectoryPath = extSettings?.get_string('change-wallpaper-directory-path') ?? '';
let changeWallpaperMode = extSettings?.get_int('change-wallpaper-mode') ?? 0;
let changeWallpaperInterval = extSettings?.get_int('change-wallpaper-interval') ?? 15;
let windowDimension = {width: 1920, height: 1080};
let windowed = false;
const fullscreened = true;
let isDebugMode = extSettings?.get_boolean('debug-mode') ?? true;
let changeWallpaperTimerId: number | null = null;

const HanabiRendererWindow = GObject.registerClass(
    {GTypeName: 'HanabiRendererWindow'},
    class HanabiRendererWindow extends Gtk.ApplicationWindow {
        _setup(widget: Gtk.Widget, gdkMonitor: Gdk.Monitor): void {
            const cssProvider = new Gtk.CssProvider();
            cssProvider.load_from_file(
                Gio.File.new_for_path(
                    GLib.build_filenamev([codePath, 'renderer', 'stylesheet.css'])
                )
            );
            Gtk.StyleContext.add_provider_for_display(
                Gdk.Display.get_default()!,
                cssProvider,
                Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
            );
            this.set_child(widget);
            if (!windowed) {
                if (fullscreened) {
                    this.fullscreen_on_monitor(gdkMonitor);
                } else {
                    const geometry = gdkMonitor.get_geometry();
                    this.set_size_request(geometry.width, geometry.height);
                }
            }
        }
    }
);

type HanabiRendererWindow = InstanceType<typeof HanabiRendererWindow>;

const HanabiRenderer = GObject.registerClass(
    {GTypeName: 'HanabiRenderer'},
    class HanabiRenderer extends Gtk.Application {
        private hanabiWindows: HanabiRendererWindow[];
        private pictures: Gtk.Picture[];
        private sharedPaintable: Gdk.Paintable | null;
        private gstImplName: string;
        private playing: boolean;
        private randomStartPending: boolean;

        private play: any;

        private adapter: any;
        private media: Gtk.MediaFile | null;

        private dbus: any;
        private display: Gdk.Display | null;
        private monitors: Gdk.Monitor[];

        constructor(props?: Partial<Gtk.Application.ConstructorProps>) {
            super({
                application_id: APPLICATION_ID,
                flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE,
                ...props,
            });

            GLib.log_set_debug_enabled(isDebugMode);

            this.hanabiWindows = [];
            this.pictures = [];
            this.sharedPaintable = null;
            this.gstImplName = '';
            this.playing = false;
            this.randomStartPending = true;
            this.play = null;
            this.adapter = null;
            this.media = null;
            this.dbus = null;
            this.display = null;
            this.monitors = [];

            this.exportDbus();
            this.setupGst();

            this.connect('activate', (app: this) => {
                this.display = Gdk.Display.get_default();
                this.monitors = this.display
                    ? Array.from({length: this.display.get_monitors().get_n_items()},
                        (_, i) => this.display!.get_monitors().get_item(i) as Gdk.Monitor)
                    : [];

                if (!app.activeWindow) {
                    this.buildUI();
                    this.hanabiWindows.forEach(window => window.present());
                }
            });

            this.connect('command-line', (_app: this, commandLine: Gio.ApplicationCommandLine) => {
                const argv = commandLine.get_arguments();
                if (this.parseArgs(argv)) {
                    this.activate();
                    commandLine.set_exit_status(0);
                } else {
                    commandLine.set_exit_status(1);
                }
            });

            extSettings?.connect('changed', (settings: Gio.Settings, key: string) => {
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
                case 'random-start-position':
                    randomStartPosition = settings.get_boolean(key);
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
                    contentFit = settings.get_int(key);
                    this.pictures.forEach(picture =>
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

        private parseArgs(argv: string[]): boolean {
            let lastCommand: string | null = null;
            for (const arg of argv) {
                if (!lastCommand) {
                    switch (arg) {
                    case '-M':
                    case '--mute':
                        mute = true;
                        console.debug(`mute = ${mute}`);
                        break;
                    case '-N':
                    case '--nohide':
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
                    const data = arg.split(':');
                    windowDimension = {
                        width: parseInt(data[0]),
                        height: parseInt(data[1]),
                    };
                    console.debug(`windowed = ${windowed}, windowDimension = ${JSON.stringify(windowDimension)}`);
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

        private setupGst(): void {
            // Software libav decoders have "primary" rank; set Nvidia higher for NVDEC.
            this.setPluginDecodersRank('nvcodec', Gst.Rank.PRIMARY + 1, isEnableNvSl);

            // Legacy vaapidecodebin has rank "primary + 2"; VA needs to be higher.
            if (isEnableVADecoders)
                this.setPluginDecodersRank('va', Gst.Rank.PRIMARY + 3);
        }

        private setPluginDecodersRank(
            pluginName: string,
            rank: number,
            useStateless = false
        ): void {
            const gstRegistry = Gst.Registry.get();
            const features = gstRegistry.get_feature_list_by_plugin(pluginName);

            for (const feature of features) {
                const featureName = feature.get_name();
                if (!featureName)
                    continue;

                if (!featureName.endsWith('dec') && !featureName.endsWith('postproc'))
                    continue;

                const isStateless = featureName.includes('sl');
                if (isStateless !== useStateless)
                    continue;

                const oldRank = feature.get_rank();
                if (rank === oldRank)
                    continue;

                feature.set_rank(rank);
                console.debug(`changed rank: ${oldRank} -> ${rank} for ${featureName}`);
            }
        }

        private buildUI(): void {
            this.monitors.forEach((gdkMonitor, index) => {
                let widget: Gtk.Widget | null = this.getWidgetFromSharedPaintable();

                if (index > 0 && !widget)
                    return;

                if (!widget) {
                    if (!forceMediaFile && haveGstPlay) {
                        let sink: any = null;
                        if (preferClappersink)
                            sink = Gst.ElementFactory.make('clappersink', 'clappersink');

                        if (!sink)
                            sink = Gst.ElementFactory.make('gtk4paintablesink', 'gtk4paintablesink');

                        if (sink)
                            widget = this.getWidgetFromSink(sink);
                    }

                    if (!widget)
                        widget = this.getGtkStockWidget();
                }

                if (!widget)
                    return;

                const geometry = gdkMonitor.get_geometry();
                const state = {
                    position: [geometry.x, geometry.y],
                    keepAtBottom: true,
                    keepMinimized: true,
                    keepPosition: true,
                };
                const windowTitle = nohide
                    ? `Hanabi Renderer #${index} (using ${this.gstImplName})`
                    : `@${APPLICATION_ID}!${JSON.stringify(state)}|${index}`;

                const window = new HanabiRendererWindow({
                    application: this,
                    decorated: !!nohide,
                    default_height: windowDimension.height,
                    default_width: windowDimension.width,
                    title: windowTitle,
                });
                window._setup(widget, gdkMonitor);
                this.hanabiWindows.push(window);
            });
            console.log(`using ${this.gstImplName} for video output`);
        }

        private getWidgetFromSharedPaintable(): Gtk.Widget | null {
            if (this.sharedPaintable) {
                const picture = new Gtk.Picture({
                    paintable: this.sharedPaintable,
                    hexpand: true,
                    vexpand: true,
                });

                picture.set_content_fit(contentFit);
                this.pictures.push(picture);

                if (isEnableGraphicsOffload) {
                    const offload = Gtk.GraphicsOffload['new'](picture);
                    offload.set_enabled(Gtk.GraphicsOffloadEnabled.ENABLED);
                    return offload;
                }

                return picture;
            }
            return null;
        }


        private getWidgetFromSink(sink: any): Gtk.Widget | null {
            this.gstImplName = sink.name as string;

            let widget: Gtk.Widget | null = null;

            if (sink.widget) {
                if (sink.widget instanceof Gtk.Picture) {
                    // Workaround for clappersink: piggyback sink.widget inside a Box.
                    this.sharedPaintable = (sink.widget as Gtk.Picture).paintable;
                    const box = new Gtk.Box();
                    box.append(sink.widget as Gtk.Widget);
                    box.append(this.getWidgetFromSharedPaintable()!);
                    (sink.widget as Gtk.Widget).hide();
                    widget = box;
                } else {
                    widget = sink.widget as Gtk.Widget;
                }
            } else if (sink.paintable) {
                this.sharedPaintable = sink.paintable as Gdk.Paintable;
                widget = this.getWidgetFromSharedPaintable();
            }

            if (!widget)
                return null;

            if (useGstGL) {
                const glsink = Gst.ElementFactory.make('glsinkbin', 'glsinkbin');
                if (glsink) {
                    this.gstImplName = `glsinkbin + ${this.gstImplName}`;

                    glsink.set_property('sink', sink);
                    sink = glsink;
                }
            }

            this.play = GstPlay.Play.new(
                GstPlay.PlayVideoOverlayVideoRenderer.new_with_sink(null, sink)
            );
            this.adapter = GstPlay.PlaySignalAdapter.new(this.play);

            this.adapter.connect('end-of-stream', (adapter: {play: {seek(t: number): void}}) =>
                adapter.play.seek(0)
            );
            this.adapter.connect('warning', (_adapter: any, err: GLib.Error) =>
                console.warn(err)
            );
            this.adapter.connect('error', (_adapter: any, err: GLib.Error) =>
                console.error(err)
            );

            let stateSignal: number | null = this.adapter.connect(
                'state-changed',
                (_adapter: any, state: number) => {
                    if (state >= GstPlay.PlayState.PAUSED) {
                        this.setVolume(volume);
                        this.setMute(mute);
                        if (stateSignal !== null) {
                            this.adapter.disconnect(stateSignal);
                            stateSignal = null;
                        }
                    }
                }
            );

            this.adapter.connect('state-changed', (_adapter: any, state: number) => {
                this.playing = state === GstPlay.PlayState.PLAYING;
                this.dbus.emit_signal(
                    'isPlayingChanged',
                    new GLib.Variant('(b)', [this.playing])
                );
            });

            this.adapter.connect('state-changed', (_adapter: any, state: number) => {
                if (state >= GstPlay.PlayState.PAUSED)
                    this.maybeSeekRandomGst();
            });

            const file = Gio.File.new_for_path(videoPath);
            this.play.set_uri(file.get_uri());

            this.markRandomStartPending();
            this.setPlay();
            this.setAutoWallpaper();

            return widget;
        }

        private getGtkStockWidget(): Gtk.Widget {
            this.gstImplName = 'GtkMediaFile';

            this.media = Gtk.MediaFile.new_for_filename(videoPath);
            this.media.set({loop: true});

            this.media.connect('notify::prepared', () => {
                this.setVolume(volume);
                this.setMute(mute);
                this.maybeSeekRandomMedia();
            });

            this.media.connect('notify::playing', (media: Gtk.MediaFile) => {
                this.playing = media.get_playing();
                this.dbus.emit_signal(
                    'isPlayingChanged',
                    new GLib.Variant('(b)', [this.playing])
                );
            });

            this.sharedPaintable = this.media;
            const widget = this.getWidgetFromSharedPaintable()!;

            this.markRandomStartPending();
            this.setPlay();
            this.setAutoWallpaper();

            return widget;
        }

        private exportDbus(): void {
            const dbusXml = `
            <node>
                <interface name="${APPLICATION_ID}">
                    <method name="setPlay"/>
                    <method name="setPause"/>
                    <property name="isPlaying" type="b" access="read"/>
                    <signal name="isPlayingChanged">
                        <arg name="isPlaying" type="b"/>
                    </signal>
                </interface>
            </node>`;

            this.dbus = Gio.DBusExportedObject.wrapJSObject(dbusXml, this);
            this.dbus.export(Gio.DBus.session, RENDERER_OBJECT_PATH);
        }

        setVolume(_volume: number): void {
            const player = this.play ?? this.media;
            if (!player)
                return;

            if (this.play) {
                if (haveGstAudio) {
                    _volume = GstAudio.StreamVolume.convert_volume(
                        GstAudio.StreamVolumeFormat.CUBIC,
                        GstAudio.StreamVolumeFormat.LINEAR,
                        _volume
                    ) as number;
                } else {
                    _volume = Math.pow(_volume, 3);
                }
            }

            // GObject property workaround: reset to a different value first to
            // force the notify signal even when the new value equals the current one.
            if (player.volume === _volume)
                player.volume = null;
            player.volume = _volume;
        }

        setMute(_mute: boolean): void {
            if (this.play) {
                if (this.play.mute === _mute)
                    this.play.mute = !_mute;
                this.play.mute = _mute;
            } else if (this.media) {
                if (this.media.muted === _mute)
                    this.media.muted = !_mute;
                this.media.muted = _mute;
            }
        }

        setFilePath(_videoPath: string): void {
            const file = Gio.File.new_for_path(_videoPath);
            if (this.play) {
                this.play.set_uri(file.get_uri());
            } else if (this.media) {
                this.media.stream_unprepared();
                this.media.file = file;
            }
            this.markRandomStartPending();
            this.setPlay();
        }

        setPlay(): void {
            if (this.play)
                this.play.play();
            else if (this.media)
                this.media.play();
        }

        setPause(): void {
            if (this.play)
                this.play.pause();
            else if (this.media)
                this.media.pause();
        }

        setAutoWallpaper(): void {
            let currentIndex = 0;
            let videoPaths: string[] = [];
            const dir = Gio.File.new_for_path(changeWallpaperDirectoryPath);

            if (dir.query_file_type(Gio.FileQueryInfoFlags.NONE, null) !== Gio.FileType.DIRECTORY)
                return;

            const enumerator = dir.enumerate_children(
                'standard::*',
                Gio.FileQueryInfoFlags.NONE,
                null
            );

            let fileInfo: Gio.FileInfo | null;
            while ((fileInfo = enumerator.next_file(null))) {
                if (fileInfo.get_content_type()?.startsWith('video/')) {
                    const file = dir.get_child(fileInfo.get_name());
                    const path = file.get_path();
                    if (path)
                        videoPaths.push(path);
                }
            }
            if (videoPaths.length === 0)
                return;
            videoPaths = videoPaths.sort();

            const getRandomIndex = (actualIndex: number, videosLength: number): number => {
                if (videosLength <= 1)
                    return actualIndex;
                let newIndex: number;
                do
                    newIndex = Math.floor(Math.random() * videosLength);
                while (newIndex === actualIndex);
                return newIndex;
            };

            const operation = (): boolean => {
                console.debug(`setAutoWallpaper operation, interval: ${changeWallpaperInterval} min`);
                if (this.playing) {
                    extSettings!.set_string('video-path', videoPaths[currentIndex]);

                    if (changeWallpaperMode === 0)
                        currentIndex = (currentIndex + 1) % videoPaths.length;
                    else if (changeWallpaperMode === 1)
                        currentIndex = (currentIndex - 1 + videoPaths.length) % videoPaths.length;
                    else if (changeWallpaperMode === 2)
                        currentIndex = getRandomIndex(currentIndex, videoPaths.length);
                }
                return true;
            };

            if (changeWallpaperTimerId) {
                GLib.source_remove(changeWallpaperTimerId);
                changeWallpaperTimerId = null;
            }
            if (changeWallpaper) {
                operation();
                changeWallpaperTimerId = GLib.timeout_add_seconds(
                    GLib.PRIORITY_DEFAULT,
                    changeWallpaperInterval * 60,
                    operation
                );
            }
        }

        get isPlaying(): boolean {
            return this.playing;
        }

        private markRandomStartPending(): void {
            this.randomStartPending = true;
        }

        private maybeSeekRandomGst(): void {
            if (!this.play || !randomStartPosition || !this.randomStartPending)
                return;

            const duration = Number(this.play.get_duration());
            if (!duration || duration <= 0) {
                this.randomStartPending = false;
                return;
            }

            const maxPosition = Math.max(duration - Number(Gst.SECOND ?? 1_000_000_000), 0);
            const position = Math.floor(Math.random() * (maxPosition + 1));
            this.play.seek(position);
            this.randomStartPending = false;
        }

        private maybeSeekRandomMedia(): void {
            if (!this.media || !randomStartPosition || !this.randomStartPending)
                return;

            const duration = this.media.get_duration();
            if (!duration || duration <= 0) {
                this.randomStartPending = false;
                return;
            }

            const maxPosition = Math.max(duration - GLib.USEC_PER_SEC, 0);
            const position = Math.floor(Math.random() * (maxPosition + 1));
            this.media.seek(position);
            this.randomStartPending = false;
        }
    }
);

Gst.init([]);

const renderer = new HanabiRenderer();
renderer.run(ARGV);
