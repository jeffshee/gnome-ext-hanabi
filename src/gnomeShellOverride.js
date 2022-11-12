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

const { Clutter, GLib, GObject, Meta, St, Shell, Graphene } = imports.gi;

const Background = imports.ui.background;
const Main = imports.ui.main;
const Workspace = imports.ui.workspace;
const WorkspaceThumbnail = imports.ui.workspaceThumbnail;
const WindowManager = imports.ui.windowManager;

const isDebugMode = true;
const applicationId = "io.github.jeffshee.hanabi_renderer";

function debug(...args) {
    if (isDebugMode)
        log("[Hanabi]", ...args);
}

var WorkspaceAnimation = null;
try {
    WorkspaceAnimation = imports.ui.workspaceAnimation;
} catch (err) {
    debug("Workspace Animation does not exist");
}

var replaceData = {};

/**
 * This class overrides methods in the Gnome Shell. The new methods
 * need to be defined below the class as seperate functions.
 * The old methods that are overriden can be accesed by relpacedata.old_'name-of-replaced-method'
 * in the new functions.
 */

var GnomeShellOverride = class {
    constructor() {
        this._isX11 = !Meta.is_wayland_compositor();
    }

    _reloadBackgrounds() {
        Main.layoutManager._updateBackgrounds();
    }

    enable() {
        // Live wallpaper
        this.replaceMethod(Background.BackgroundManager, "_createBackgroundActor", new_createBackgroundActor)

        // Hiding mechanism
        this.replaceMethod(Shell.Global, 'get_window_actors', new_get_window_actors);
        this.replaceMethod(Workspace.Workspace, "_isOverviewWindow", new_Workspace__isOverviewWindow, "Workspace");
        this.replaceMethod(WorkspaceThumbnail.WorkspaceThumbnail, "_isOverviewWindow", new_WorkspaceThumbnail__isOverviewWindow, "WorkspaceThumbnail");
        this.replaceMethod(WindowManager.WindowManager, "_shouldAnimateActor", new__shouldAnimateActor);

        this._reloadBackgrounds();
    }

    disable() {
        for (let value of Object.values(replaceData)) {
            if (value[0]) {
                value[1].prototype[value[2]] = value[0];
            }
        }
        replaceData = {};
        this._reloadBackgrounds();
    }

    /**
     * Replaces a method in a class with our own method, and stores the original
     * one in 'replaceData' using 'old_XXXX' (being XXXX the name of the original method),
     * or 'old_classId_XXXX' if 'classId' is defined. This is done this way for the
     * case that two methods with the same name must be replaced in two different
     * classes
     *
     * @param {class} className The class where to replace the method
     * @param {string} methodName The method to replace
     * @param {function} functionToCall The function to call as the replaced method
     * @param {string} [classId] an extra ID to identify the stored method when two
     *                           methods with the same name are replaced in
     *                           two different classes
     */
    replaceMethod(className, methodName, functionToCall, classId) {
        if (classId) {
            replaceData['old_' + classId + '_' + methodName] = [className.prototype[methodName], className, methodName, classId];
        } else {
            replaceData['old_' + methodName] = [className.prototype[methodName], className, methodName];
        }
        className.prototype[methodName] = functionToCall;
    }
}


/**
 * The widget that holds the window preview of the renderer.
 */

var LiveWallpaper = GObject.registerClass(
    class LiveWallpaper extends St.Widget {
        _init(backgroundActor) {
            super._init({
                layout_manager: new Clutter.BinLayout(),
                // Layout manager will allocate extra space for the actor, if possible.
                x_expand: true,
                y_expand: true,
                // backgroundActor's z_position is 0. Positive values = nearer to the user.
                z_position: 1,
                opacity: 0,
            });

            this._backgroundActor = backgroundActor;
            this._monitorIndex = backgroundActor.monitor;
            let { height, width } = Main.layoutManager.monitors[this._monitorIndex];
            this._monitorHeight = height;
            this._monitorWidth = width;
            this._metaBackgroundGroup = backgroundActor.get_parent();
            this._metaBackgroundGroup.add_child(this);
            this._wallpaper = null

            this.connect('destroy', this._onDestroy.bind(this));
            this._applyWallpaper();
        }

        _applyWallpaper() {
            this._wallpaper = new Clutter.Actor({
                layout_manager: new Shell.WindowPreviewLayout(),
                // The point around which the scaling and rotation transformations occur.
                pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
            });

            let renderer = this._getRenderer();
            if (renderer) {
                this._wallpaper.layout_manager.add_window(renderer);
            }
            else {
                debug("renderer == null, retry `_applyWallpaper()` after 100ms");
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                    this._applyWallpaper();
                    return false;
                });
                return;
            }

            this.add_child(this._wallpaper);
            this._fade();
        }

        _getRenderer() {
            let window_actors;
            if (replaceData["old_get_window_actors"]) {
                // `get_window_actors` is replaced.
                window_actors = global.get_window_actors(false);
            } else {
                window_actors = global.get_window_actors();
            }

            if (window_actors && window_actors.length === 0)
                return;

            // Find renderer by `applicationId`.
            let renderer = window_actors.find(window => window.meta_window.title?.includes(applicationId));
            if (renderer) {
                return renderer.meta_window;
            }
        }

        _resize() {
            if (!this._wallpaper || this._wallpaper.width === 0)
                return;

            /**
             * Only `allocation.get_height()` works fine so far. The `allocation.get_width()` gives weird result for some reasons.
             * As a workaround, we calculate the scale based on the height, then use it to calculate width.
             * It is safe to assume that the ratio of wallpaper is a constant (e.g. 16:9) in our case.
             */
            let scale = this.allocation.get_height() / this._monitorHeight;
            this._wallpaper.height = this._monitorHeight * scale;
            this._wallpaper.width = this._monitorWidth * scale;
        }

        _fade(visible = true) {
            this.ease({
                opacity: visible ? 255 : 0,
                duration: Background.FADE_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            this._backgroundActor.ease({
                opacity: visible ? 0 : 255,
                duration: Background.FADE_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }

        vfunc_allocate(box) {
            super.vfunc_allocate(box);

            if (this._laterId)
                return;

            this._laterId = Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
                this._resize();

                this._laterId = 0;
                return GLib.SOURCE_REMOVE;
            });
        }

        _onDestroy() {
            if (this._laterId)
                Meta.later_remove(this._laterId);
            this._laterId = 0;
        }
    }
);

/**
 * New functions used to replace the gnome shell functions are defined below.
 */

/**
 * Method replacement for _createBackgroundActor.
 * It sticks the LiveWallpaper widget to the background actor.
 */

function new_createBackgroundActor() {
    const backgroundActor = replaceData.old__createBackgroundActor[0].call(this);
    const _ = new LiveWallpaper(backgroundActor);

    return backgroundActor;
}

/**
 * Method replacement for WindowManager.WindowManager._shouldAnimateActor.
 * It removes the window animation (minimize, maximize, etc).
 */
function new__shouldAnimateActor(actor, types) {
    if (actor.meta_window.title?.includes(applicationId))
        return false;
    return replaceData.old__shouldAnimateActor[0].apply(this, [actor, types]);
}

/**
 * Below is achived method replacements. Not longer used.
 */

/**
 * Method replacement for Shell.Global.get_window_actors.
 * It removes the renderer window from the list of windows in the Activities mode by default.
 * This behavior can be bypassed when passing `false` to the argument. 
 * (Need to be bypassed in LiveWallpaper._getRendererMetaWindow)
 */

function new_get_window_actors(hideRenderer = true) {
    let windowActors = replaceData.old_get_window_actors[0].call(this);
    if (hideRenderer)
        return windowActors.filter(window => !window.meta_window.title?.includes(applicationId));
    else
        return windowActors;
}

/**
 * Method replacement under X11 for should show window.
 * It removes the desktop window from the window animation.
 */

function new__shouldShowWindow(window) {
    if (window.title?.includes(applicationId)) {
        return false;
    }
    return replaceData.old__shouldShowWindow[0].apply(this, [window,]);
}

/**
 * Similar to skip the taskbar.
 * These remove the window preview in overview, but not the icon in alt+Tab.
 */
function new_Workspace__isOverviewWindow(window) {
    if (window.title?.includes(applicationId)) {
        return false;
    }
    return replaceData.old_Workspace__isOverviewWindow[0].apply(this, [window,]);
}

function new_WorkspaceThumbnail__isOverviewWindow(window) {
    if (window.title?.includes(applicationId)) {
        return false;
    }
    return replaceData.old_WorkspaceThumbnail__isOverviewWindow[0].apply(this, [window,]);
}

