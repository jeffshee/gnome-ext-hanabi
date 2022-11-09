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
const { Gtk, Gio, GLib, Gdk, GdkX11, Gst, GstAudio } = imports.gi;

let GstPlay = null;

// GstPlay is available from GStreamer 1.20+
try { GstPlay = imports.gi.GstPlay; } catch(e) {};
const haveGstPlay = (GstPlay != null);

const applicationId = "io.github.jeffshee.hanabi_renderer";
const isDebugMode = true;
const waitTime = 500;

let display = null;
let windowed = false;
let windowConfig = { width: 1920, height: 1080 }
let codePath = "";
let filePath = "";
let volume = 1.0;
let muted = false;
let nohide = false;

let lastCommand = null;
let errorFound = false;
let window = null;

function debug(...args) {
    if (isDebugMode)
        print(...args)
}

function parseCommandLine(argv) {
    for (let arg of argv) {
        if (!lastCommand) {
            switch (arg) {
                case '-M':
                case '--muted':
                    muted = true;
                    debug(`muted = ${muted}`);
                    break;
                case '-N':
                case '--nohide':
                    // Launch renderer in standalone mode without hiding
                    nohide = true
                    debug(`nohide = ${nohide}`);
                    break;
                case '-D':
                case '--display':
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
                    print(`Argument ${arg} not recognized. Aborting.`);
                    errorFound = true;
                    break;
            }
            continue;
        }
        switch (lastCommand) {
            case '-D':
            case '--display':
                let displayIndex = parseInt(arg);
                debug(`display = ${displayIndex}`);
                let displays = Gdk.DisplayManager.get().list_displays();
                if (displayIndex >= displays.length) {
                    print("Invalid display. Aborting.");
                    errorFound = true;
                }
                display = displays[displayIndex];
                break;
            case '-W':
            case '--windowed':
                windowed = true;
                let data = arg.split(":");
                windowConfig = {
                    width: parseInt(data[0]),
                    height: parseInt(data[1]),
                }
                debug(`windowed = ${windowed}, windowConfig = ${windowConfig}`);
                break;
            case '-P':
            case '--codepath':
                codePath = arg;
                debug(`codepath = ${codePath}`);
                break;
            case '-F':
            case '--filepath':
                filePath = arg;
                debug(`filepath = ${filePath}`);
                break;
            case '-V':
            case '--volume':
                volume = Math.max(0.0, Math.min(1.0, parseFloat(arg)));
                debug(`volume = ${volume}`);
                break;
        }
        lastCommand = null;
        if (errorFound)
            break;
    }
}

class VideoWallpaperWindow {
    constructor(app) {
        this._app = app;
        this._window = null;
        this._label = null;

        if (!display)
            display = Gdk.Display.get_default();

        // Load CSS with custom style
        let cssProvider = new Gtk.CssProvider();
        cssProvider.load_from_file(Gio.File.new_for_path(GLib.build_filenamev([codePath, "stylesheet.css"])));
        Gtk.StyleContext.add_provider_for_display(display, cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    }

    _buildUI() {
        this._window = new Gtk.ApplicationWindow({
            application: this._app,
            title: nohide? "Hanabi Renderer": `@${applicationId}!0,0;H`,
            defaultHeight: windowConfig.height,
            defaultWidth: windowConfig.width,
            fullscreened: !windowed,
            display: display,
            decorated: nohide? true : false ,
        });

        // Transparent* (opacity=0.01) window background
        this._windowContext = this._window.get_style_context();
        this._windowContext.add_class("desktopwindow");

        let widget = null;

        if (haveGstPlay) {
            // Try to find "clappersink" for best performance
            let sink = Gst.ElementFactory.make('clappersink', 'clappersink');

            // Try "gtk4paintablesink" from gstreamer-rs plugins as 2nd best choice
            if (!sink)
                sink = Gst.ElementFactory.make('gtk4paintablesink', 'gtk4paintablesink');

            if (sink) {
                widget = this._getWidgetFromSink(sink);

                if (widget && nohide)
                    this._window.title += ` - ${sink.name}`;
            }
        }

        if (!widget)
            widget = this._getGtkStockWidget();

        this._window.set_child(widget);
    }

    _getWidgetFromSink(sink)
    {
        // If sink already offers GTK widget, use it.
        // Otherwise use GtkPicture with paintable from sink.
        const widget = (sink.widget)
            ? sink.widget
            : (sink.paintable)
            ? new Gtk.Picture({ paintable: sink.paintable })
            : null;

        if (!widget)
            return null;

        this._play = new GstPlay.Play({
            video_renderer: new GstPlay.PlayVideoOverlayVideoRenderer({
                video_sink: sink,
            }),
        });
        this._adapter = GstPlay.PlaySignalAdapter.new(this._play);

        // Loop video
        this._adapter.connect('end-of-stream', (adapter) => adapter.play.seek(0));

        // Error handling
        this._adapter.connect('warning', (adapter, err) => logError(err));
        this._adapter.connect('error', (adapter, err) => logError(err));

        // Set the volume and muted after paused state, otherwise it won't work.
        // Use paused or greater, as some states might be skipped.
        let stateSignal = this._adapter.connect('state-changed', (adapter, state) => {
            if (state >= GstPlay.PlayState.PAUSED) {
                this.setVolume(volume);
                this.setMuted(muted);

                this._adapter.disconnect(stateSignal);
                stateSignal = null;
            }
        });

        const file = Gio.File.new_for_path(filePath);
        this._play.set_uri(file.get_uri());

        debug(`using ${sink.name} for video output`);

        this._play.play();

        return widget;
    }

    _getGtkStockWidget()
    {
        // The constructor of MediaFile doesn't work in gjs.
        // Have to call the `new_for_xxx` function here.
        this._media = Gtk.MediaFile.new_for_filename(filePath);
        this._media.set({
            loop: true,
        })
        // Set the volume and muted after prepared, otherwise it won't work.
        this._media.connect("notify::prepared", () => {
            this.setVolume(volume);
            this.setMuted(muted)
        })
        const widget = new Gtk.Picture({
            paintable: this._media,
        });

        debug(`using GtkMedia for video output`);

        this._media.play();

        return widget;
    }

    /**
     * These workarounds are needed because get_volume() and get_muted() can be wrong in some cases.
     * If the current value is equal to the new value, the changes will be skipped. 
     * Avoid this behavior by resetting the current value to null before setting the new value.
     */
    setVolume(volume) {
        const player = (this._play != null)
            ? this._play
            : this._media;

        // GstPlay uses linear volume
        if (this._play) {
            volume = GstAudio.StreamVolume.convert_volume (
                GstAudio.StreamVolumeFormat.CUBIC,
                GstAudio.StreamVolumeFormat.LINEAR, volume);
        }

        if (player.volume == volume)
            player.volume = null;
        player.volume = volume;
    }

    setMuted(muted) {
        if (this._play) {
            if (this._play.mute == muted)
                this._play.mute = !muted;
            this._play.mute = muted;
        } else if (this._media) {
            if (this._media.muted == muted)
                this._media.muted = !muted;
            this._media.muted = muted;
        }
    }

    getWidget() {
        this._buildUI();
        return this._window;
    }

    showWallpaper() {
        this._window.child.visible = true;
    }

    hideWallpaper() {
        this._window.child.visible = false;
    }
}

const renderer = new Gtk.Application({
    application_id: applicationId,
    flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE,
});

renderer.connect("activate", (app) => {
    let activeWindow = app.activeWindow;

    if (!activeWindow) {
        window = new VideoWallpaperWindow(app);
        activeWindow = window.getWidget();
    }

    if (nohide) {
        activeWindow.present();
    } else {
        /**
         * Hiding mechanism of the renderer
         * 
         * TBH I'm not too fond of the current hiding approach. 
         * It is too hacky, and I'm afraid it might break someday.
         * The idea though is simple; skip the taskbar + minimize the window (problematic). 
         * Then the window should look like it doesn't exist at all.
         * It is very important to make sure that the compositor **actually** draws the hidden window properly. 
         * Otherwise, the window preview (shown as background by gnome-extension) will not be animated.
         * 
         * Based on my experiments,
         * 1. Minimize > show: preview not animated
         * 2. Show > minimize: preview not animated
         * 3. Minimize > present: window moved to front, minimize not work, preview animated
         * 4. Present > minimize: window moved to front, minimize work (glitch), preview animated (glitch if preview is created too early)
         * 5. Opacity=0 > present > (500ms delay) > minimize > opacity=1: 
         *       minimize work, preview animated (glitch if preview is created too early)
         */

        // Hide the content at first
        window.hideWallpaper();
        activeWindow.present();

        // Skip taskbar (X11 only)
        let isUsingX11 = (display && display.constructor.$gtype.name === 'GdkX11Display');
        if (isUsingX11) {
            // No such method under Wayland. Instead it is done by gnome-extension.
            activeWindow.get_native().get_surface().set_skip_taskbar_hint(true);
        }
        // Add a timeout for glitch workaround...
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, waitTime, () => {
            window.showWallpaper();
            activeWindow.minimize();
            // if (!windowed)
            //     activeWindow.fullscreen();
            return false;
        });
    }
});

renderer.connect("command-line", (app, commandLine) => {
    let argv = [];
    argv = commandLine.get_arguments();
    parseCommandLine(argv);
    if (!errorFound) {
        renderer.activate();
        commandLine.set_exit_status(0);
    }
    else
        commandLine.set_exit_status(1);
});

Gst.init(null);

renderer.run(ARGV);

if (!errorFound) {
    0;
} else {
    1;
}