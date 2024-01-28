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

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';
import Graphene from 'gi://Graphene';

import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import * as Logger from './logger.js';
import * as RoundedCornersEffect from './roundedCornersEffect.js';

const applicationId = 'io.github.jeffshee.HanabiRenderer';
const logger = new Logger.Logger();

/**
 * The widget that holds the window preview of the renderer.
 */
export const LiveWallpaper = GObject.registerClass(
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
                opacity: 0,
            });
            this._backgroundActor = backgroundActor;
            this._monitorIndex = backgroundActor.monitor;

            /**
             * _monitorScale is fractional scale factor
             * _monitorWidth and _monitorHeight are scaled resolution
             * e.g. if the physical reolution = (2240, 1400) and fractional scale factor = 1.25,
             * then the scaled resolution would be (2240/1.25, 1400/1.25) = (1792, 1120).
             */
            this._display = backgroundActor.meta_display;
            this._monitorScale = this._display.get_monitor_scale(
                this._monitorIndex
            );
            let {width, height} =
                Main.layoutManager.monitors[this._monitorIndex];
            this._monitorWidth = width;
            this._monitorHeight = height;

            this._metaBackgroundGroup = backgroundActor.get_parent();
            this._metaBackgroundGroup.add_child(this);
            this._wallpaper = null;

            this.connect('destroy', this._onDestroy.bind(this));
            this._applyWallpaper();

            this._roundedCornersEffect =
                new RoundedCornersEffect.RoundedCornersEffect();
            this.add_effect(this._roundedCornersEffect);

            /**
             * Refs for each parameter of RoundedCornersEffect:
             * - pixel-step
             * https://gitlab.gnome.org/GNOME/mutter/-/blob/3528b54378b60fdb7692dcd849c61dccfeeb805f/src/compositor/meta-background-content.c#L582-585
             * - rounded-clip-radius
             * https://gitlab.gnome.org/GNOME/mutter/-/blob/3528b54378b60fdb7692dcd849c61dccfeeb805f/src/compositor/meta-background-content.c#L507
             * - rounded-clip-bounds
             * https://gitlab.gnome.org/GNOME/mutter/-/blob/3528b54378b60fdb7692dcd849c61dccfeeb805f/src/compositor/meta-background-content.c#L487-505
             */
            this._roundedCornersEffect.setPixelStep([
                1.0 / (this._monitorWidth * this._monitorScale),
                1.0 / (this._monitorHeight * this._monitorScale),
            ]);
            this.setRoundedClipRadius(0.0);
            const rect = new Graphene.Rect();
            rect.origin.x = 0;
            rect.origin.y = 0;
            rect.size.width = this._monitorWidth;
            rect.size.height = this._monitorHeight;
            this.setRoundedClipBounds(rect);
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
                ].map(e => e * this._monitorScale)
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
             * As a workaround, we calculate the ratio based on the height, then use it to calculate width.
             * It is safe to assume that the ratio of wallpaper is a constant (e.g. 16:9) in our case.
             */
            let ratio = this.allocation.get_height() / this._monitorHeight;
            this._wallpaper.height = this._monitorHeight * ratio;
            this._wallpaper.width = this._monitorWidth * ratio;
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
