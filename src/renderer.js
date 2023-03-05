#!/usr/bin/env gjs

/**
 * Copyright (C) 2022 Jeff Shee (jeffshee8969@gmail.com)
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

imports.gi.versions.Gtk = "4.0";
imports.gi.versions.GdkX11 = "4.0";
const { GObject, Gtk, Gio, GLib, Gdk, GdkX11, Gst, GstAudio } = imports.gi;

let GstPlay = null;
// GstPlay is available from GStreamer 1.20+
try {
    GstPlay = imports.gi.GstPlay;
} catch (e) {}
const haveGstPlay = GstPlay != null;

const applicationId = "io.github.jeffshee.hanabi-renderer";

let extSettings = null;
const extSchemaId = "io.github.jeffshee.hanabi-extension";
const settingsSchemaSource = Gio.SettingsSchemaSource.get_default();
if (settingsSchemaSource.lookup(extSchemaId, false)) {
    extSettings = Gio.Settings.new(extSchemaId);
}

const isDebugMode = extSettings ? extSettings.get_boolean("debug-mode") : true;
const forceMediaFile = extSettings
    ? extSettings.get_boolean("force-mediafile")
    : false;

const isEnableVADecoders = extSettings
    ? extSettings.get_boolean("enable-va")
    : false;
const isEnableNvSl = extSettings
    ? extSettings.get_boolean("enable-nvsl")
    : false;

let codePath = "";
/**
 * Gtk.ContentFit
 * https://gjs-docs.gnome.org/gtk40~4.0/gtk.contentfit
 * FILL=0 (stretched)
 * CONTAIN=1 (scaled)
 * COVER=2 (zoom)
 * SCALE_DOWN=3 (centered+scaled)
 */
let contentFit = extSettings
    ? extSettings.get_int("content-fit")
    : Gtk.ContentFit.CONTAIN;
let mute = extSettings ? extSettings.get_boolean("mute") : false;
let nohide = false;
let videoPath = extSettings ? extSettings.get_string("video-path") : "";
let volume = extSettings ? extSettings.get_int("volume") / 100.0 : 0.5;
let windowDimension = { width: 1920, height: 1080 };
let windowed = false;

function debug(...args) {
    if (isDebugMode) print(...args);
}

const HanabiRenderer = GObject.registerClass(
    {
        GTypeName: "HanabiRenderer",
    },
    class HanabiRenderer extends Gtk.Application {
        constructor() {
            super({
                application_id: applicationId,
                flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE,
            });

            this._hanabiWindows = [];
            this._pictures = [];
            this._sharedPaintable = null;
            this._gstImplName = "";
            this._setupGst();

            this.connect("activate", (app) => {
                this._display = Gdk.Display.get_default();
                this._monitors = [...this._display?.get_monitors()];

                let activeWindow = app.activeWindow;
                if (!activeWindow) {
                    this._buildUI();
                    this._hanabiWindows.forEach((window) => {
                        window.present();
                    });
                }
            });

            this.connect("command-line", (app, commandLine) => {
                const argv = commandLine.get_arguments();
                if (this._parseArgs(argv)) {
                    this.activate();
                    commandLine.set_exit_status(0);
                } else commandLine.set_exit_status(1);
            });

            extSettings?.connect("changed", (settings, key) => {
                switch (key) {
                    case "video-path":
                        videoPath = settings.get_string(key);
                        this.setFilePath(videoPath);
                        break;
                    case "mute":
                        mute = settings.get_boolean(key);
                        this.setMute(mute);
                        break;
                    case "volume":
                        volume = settings.get_int(key) / 100.0;
                        this.setVolume(volume);
                        break;
                    case "content-fit":
                        contentFit = settings.get_int(key);
                        this._pictures.forEach((picture) =>
                            picture.set_content_fit(contentFit)
                        );
                }
            });
        }

        _parseArgs(argv) {
            let lastCommand = null;
            for (const arg of argv) {
                if (!lastCommand) {
                    switch (arg) {
                        case "-M":
                        case "--mute":
                            mute = true;
                            debug(`mute = ${mute}`);
                            break;
                        case "-N":
                        case "--nohide":
                            // Launch renderer in standalone mode without hiding
                            nohide = true;
                            debug(`nohide = ${nohide}`);
                            break;
                        case "-W":
                        case "--windowed":
                        case "-P":
                        case "--codepath":
                        case "-F":
                        case "--filepath":
                        case "-V":
                        case "--volume":
                            lastCommand = arg;
                            break;
                        default:
                            print(`Argument ${arg} not recognized. Aborting.`);
                            return false;
                    }
                    continue;
                }
                switch (lastCommand) {
                    case "-W":
                    case "--windowed":
                        windowed = true;
                        let data = arg.split(":");
                        windowDimension = {
                            width: parseInt(data[0]),
                            height: parseInt(data[1]),
                        };
                        debug(
                            `windowed = ${windowed}, windowConfig = ${windowDimension}`
                        );
                        break;
                    case "-P":
                    case "--codepath":
                        codePath = arg;
                        debug(`codepath = ${codePath}`);
                        break;
                    case "-F":
                    case "--filepath":
                        videoPath = arg;
                        debug(`filepath = ${videoPath}`);
                        break;
                    case "-V":
                    case "--volume":
                        volume = Math.max(0.0, Math.min(1.0, parseFloat(arg)));
                        debug(`volume = ${volume}`);
                        break;
                }
                lastCommand = null;
            }
            return true;
        }

        _setupGst() {
            // Software libav decoders have "primary" rank, set Nvidia higher
            // to use NVDEC hardware acceleration
            this._setPluginDecodersRank(
                "nvcodec",
                Gst.Rank.PRIMARY + 1,
                isEnableNvSl
            );

            // Legacy "vaapidecodebin" have rank "primary + 2",
            // we need to set VA higher then that to be used
            if (isEnableVADecoders)
                this._setPluginDecodersRank("va", Gst.Rank.PRIMARY + 3);
        }

        _setPluginDecodersRank(pluginName, rank, useStateless = false) {
            const gstRegistry = Gst.Registry.get();
            const features = gstRegistry.get_feature_list_by_plugin(pluginName);

            for (let feature of features) {
                const featureName = feature.get_name();

                if (
                    !featureName.endsWith("dec") &&
                    !featureName.endsWith("postproc")
                )
                    continue;

                const isStateless = featureName.includes("sl");

                if (isStateless != useStateless) continue;

                const oldRank = feature.get_rank();

                if (rank == oldRank) continue;

                feature.set_rank(rank);
                debug(`changed rank: ${oldRank} -> ${rank} for ${featureName}`);
            }
        }

        _buildUI() {
            this._monitors.forEach((gdkMonitor, index) => {
                let widget = this._getWidgetFromSharedPaintable();

                // Avoid creating another instance if we couldn't get the shared paintable
                if (index > 0 && !widget) return;

                if (!widget) {
                    if (!forceMediaFile && haveGstPlay) {
                        // Try to find "clappersink" for best performance
                        let sink = Gst.ElementFactory.make(
                            "clappersink",
                            "clappersink"
                        );

                        // Try "gtk4paintablesink" from gstreamer-rs plugins as 2nd best choice
                        if (!sink)
                            sink = Gst.ElementFactory.make(
                                "gtk4paintablesink",
                                "gtk4paintablesink"
                            );

                        if (sink) {
                            widget = this._getWidgetFromSink(sink);
                        }
                    }

                    if (!widget) widget = this._getGtkStockWidget();
                }

                const window = new HanabiRendererWindow(
                    this,
                    nohide
                        ? `Hanabi Renderer #${index} (using ${this._gstImplName})`
                        : `@${applicationId}!0,0;BM|${index}`,
                    widget,
                    gdkMonitor
                );

                this._hanabiWindows.push(window);
            });
            debug(`using ${this._gstImplName} for video output`);
        }

        _getWidgetFromSharedPaintable() {
            if (this._sharedPaintable) {
                this._pictures.push(
                    new Gtk.Picture({
                        paintable: this._sharedPaintable,
                        content_fit: contentFit,
                    })
                );
                return this._pictures.at(-1);
            }
            return null;
        }

        _getWidgetFromSink(sink) {
            this._gstImplName = sink.name;

            // If sink already offers GTK widget, use it.
            // Otherwise use GtkPicture with paintable from sink.
            let widget = null;

            if (sink.widget) {
                // Workaround for clappersink.
                // We use a Gtk.Box here to piggyback the sink.widget from clappersink,
                // otherwise the sink.widget will spawn a window for itself.
                // This workaround is only needed for the first window.
                this._sharedPaintable = sink.widget.paintable;
                const box = new Gtk.Box();
                box.append(sink.widget);
                box.append(this._getWidgetFromSharedPaintable());
                // Hide the sink.widget to show our Gtk.Picture only
                sink.widget.hide();
                widget = box;
            } else if (sink.paintable) {
                this._sharedPaintable = sink.paintable;
                widget = this._getWidgetFromSharedPaintable();
            }

            if (!widget) return null;

            this._play = GstPlay.Play.new(
                GstPlay.PlayVideoOverlayVideoRenderer.new_with_sink(null, sink)
            );
            this._adapter = GstPlay.PlaySignalAdapter.new(this._play);

            // Loop video
            this._adapter.connect("end-of-stream", (adapter) =>
                adapter.play.seek(0)
            );

            // Error handling
            this._adapter.connect("warning", (adapter, err) => logError(err));
            this._adapter.connect("error", (adapter, err) => logError(err));

            // Set the volume and mute after paused state, otherwise it won't work.
            // Use paused or greater, as some states might be skipped.
            let stateSignal = this._adapter.connect(
                "state-changed",
                (adapter, state) => {
                    if (state >= GstPlay.PlayState.PAUSED) {
                        this.setVolume(volume);
                        this.setMute(mute);

                        this._adapter.disconnect(stateSignal);
                        stateSignal = null;
                    }
                }
            );

            const file = Gio.File.new_for_path(videoPath);
            this._play.set_uri(file.get_uri());

            this._play.play();

            return widget;
        }

        _getGtkStockWidget() {
            this._gstImplName = "GtkMediaFile";

            // The constructor of MediaFile doesn't work in gjs.
            // Have to call the `new_for_xxx` function here.
            this._media = Gtk.MediaFile.new_for_filename(videoPath);
            this._media.set({
                loop: true,
            });
            // Set the volume and mute after prepared, otherwise it won't work.
            this._media.connect("notify::prepared", () => {
                this.setVolume(volume);
                this.setMute(mute);
            });

            this._sharedPaintable = this._media;
            const widget = this._getWidgetFromSharedPaintable();

            this._media.play();

            return widget;
        }

        /**
         * These workarounds are needed because get_volume() and get_muted() can be wrong in some cases.
         * If the current value is equal to the new value, the changes will be skipped.
         * Avoid this behavior by resetting the current value to null before setting the new value.
         */
        setVolume(volume) {
            const player = this._play != null ? this._play : this._media;

            // GstPlay uses linear volume
            if (this._play) {
                volume = GstAudio.StreamVolume.convert_volume(
                    GstAudio.StreamVolumeFormat.CUBIC,
                    GstAudio.StreamVolumeFormat.LINEAR,
                    volume
                );
            }

            if (player.volume == volume) player.volume = null;
            player.volume = volume;
        }

        setMute(mute) {
            if (this._play) {
                if (this._play.mute == mute) this._play.mute = !mute;
                this._play.mute = mute;
            } else if (this._media) {
                if (this._media.muted == mute) this._media.muted = !mute;
                this._media.muted = mute;
            }
        }

        setFilePath(filePath) {
            const file = Gio.File.new_for_path(filePath);
            if (this._play) {
                this._play.set_uri(file.get_uri());
                this._play.play();
            } else if (this._media) {
                // Reset the stream when switching the file,
                // otherwise `play()` is not playing for some reason.
                this._media.stream_unprepared();
                this._media.file = file;
                this._media.play();
            }
        }
    }
);

const HanabiRendererWindow = GObject.registerClass(
    {
        GTypeName: "HanabiRendererWindow",
    },
    class HanabiRendererWindow extends Gtk.ApplicationWindow {
        constructor(application, title, widget, gdkMonitor) {
            super({
                application,
                decorated: nohide ? true : false,
                default_height: windowDimension.height,
                default_width: windowDimension.width,
                title,
            });

            this.set_child(widget);
            if (!windowed) this.fullscreen_on_monitor(gdkMonitor);
        }
    }
);

Gst.init(null);

const renderer = new HanabiRenderer();
renderer.run(ARGV);
