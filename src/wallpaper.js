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


/* exported LiveWallpaper */

const {Clutter, GLib, GObject, Meta, St, Shell, Graphene} = imports.gi;

const Background = imports.ui.background;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const Workspace = imports.ui.workspace;
const WorkspaceThumbnail = imports.ui.workspaceThumbnail;

const Me = ExtensionUtils.getCurrentExtension();
const RoundedCornersEffect = Me.imports.roundedCornersEffect;
const Logger = Me.imports.logger;

const applicationId = 'io.github.jeffshee.HanabiRenderer';
const extSettings = ExtensionUtils.getSettings(
    'io.github.jeffshee.hanabi-extension'
);
const logger = new Logger.Logger();

/**
 * The widget that holds the window preview of the renderer.
 */
var LiveWallpaper = GObject.registerClass(
    class LiveWallpaper extends St.Widget {
        constructor(backgroundActor) {
            super({
                layout_manager: new Clutter.BinLayout(),
                //
                x: backgroundActor.x,
                y: backgroundActor.y,
                width: backgroundActor.width,
                height: backgroundActor.height,
                // Layout manager will allocate extra space for the actor, if possible.
                x_expand: true,
                y_expand: true,
                // backgroundActor's z_position is 0. Positive values = nearer to the user.
                z_position: backgroundActor.z_position + 1,
                opacity: 0,
            });
            this._backgroundActor = backgroundActor;
            this._monitorIndex = backgroundActor.monitor;
            this._display = backgroundActor.meta_display;
            let {height, width} =
                Main.layoutManager.monitors[this._monitorIndex];
            this._monitorHeight = height;
            this._monitorWidth = width;
            this._metaBackgroundGroup = backgroundActor.get_parent();
            this._metaBackgroundGroup.add_child(this);
            this._wallpaper = null;

            this.connect('destroy', this._onDestroy.bind(this));
            this._applyWallpaper();

            this._roundedCornersEffect =
                new RoundedCornersEffect.RoundedCornersEffect();
            this.add_effect(this._roundedCornersEffect);

            this._monitorScale = this._display.get_monitor_scale(
                this._monitorIndex
            );

            this.setRoundedClipRadius(0.0);
            const rect = new Graphene.Rect();
            rect.origin.x = 0;
            rect.origin.y = 0;
            rect.size.width = this._monitorWidth;
            rect.size.height = this._monitorHeight;
            this.setRoundedClipBounds(rect);
            // TODO: Not sure if monitorScale is needed.
            // What is this? Well, OpenGL texture coordinates are [0.0, 1.0],
            // but we do bound and radius calculation with pixels, so we need a
            // way to convert coordinates into pixels.
            // NOTE: I currently don't know why, but I need monitor width and
            // height here, not actor width and height, one reason maybe that
            // our actor actually takes the whole screen and we use monitor
            // width and height in the bound rect.
            this._roundedCornersEffect.setPixelStep([
                1.0 / this._monitorWidth,
                1.0 / this._monitorHeight,
            ]);
        }

        setRoundedClipRadius(radius) {
            this._roundedCornersEffect.setClipRadius(
                radius * this._monitorScale
            );
        }

        setRoundedClipBounds(rect) {
            this._roundedCornersEffect.setBounds(
                [
                    rect.origin.x,
                    rect.origin.y,
                    rect.origin.x + rect.size.width,
                    rect.origin.y + rect.size.height,
                ].map(e => {
                    return e * this._monitorScale;
                })
            );
        }

        _applyWallpaper() {
            logger.debug('Applying wallpaper...');
            const operation = () => {
                const renderer = this._getRenderer();
                if (renderer) {
                    this._wallpaper = new Clutter.Clone({
                        source: renderer,
                        // The point around which the scaling and rotation transformations occur.
                        pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
                    });
                    this._wallpaper.connect('destroy', () => {
                        this._wallpaper = null;
                    });
                    this.add_child(this._wallpaper);
                    this._fade();
                    logger.debug('Wallpaper applied');
                    // Stop the timeout.
                    return false;
                } else {
                    // Keep waiting.
                    return true;
                }
            };

            // Perform intial operation without timeout
            if (operation())
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, operation);
        }

        _getRenderer() {
            let windowActors = [];
            windowActors = global.get_window_actors(false);

            // Find renderer by `applicationId` and monitor index.
            const findRenderer = monitor => {
                return windowActors.find(
                    window =>
                        window.meta_window.title?.includes(applicationId) &&
                        window.meta_window.title?.endsWith(
                            `|${monitor}`
                        )
                );
            };

            let renderer = findRenderer(this._monitorIndex);

            return renderer ? renderer : null;
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

            const laterType = Meta.LaterType.BEFORE_REDRAW;
            const sourceFunction = () => {
                this._resize();

                this._laterId = 0;
                return GLib.SOURCE_REMOVE;
            };
            const laters = global.compositor?.get_laters();
            if (laters)
                laters.add(laterType, sourceFunction);
            else
                Meta.later_add(laterType, sourceFunction);
        }

        _onDestroy() {
            const laters = global.compositor?.get_laters();
            if (laters)
                laters.remove(this._laterId);
            else
                Meta.later_remove(this._laterId);

            this._laterId = 0;
        }
    }
);
