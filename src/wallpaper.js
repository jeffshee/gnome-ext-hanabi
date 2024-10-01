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
import St from 'gi://St';
import Graphene from 'gi://Graphene';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import * as Logger from './logger.js';
import * as RoundedCornersEffect from './roundedCornersEffect.js';

const applicationId = 'io.github.jeffshee.HanabiRenderer';
const logger = new Logger.Logger();
// Ref: https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/layout.js
const BACKGROUND_FADE_ANIMATION_TIME = 1000;

const CUSTOM_BACKGROUND_BOUNDS_PADDING = 2;

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
            this._metaBackgroundGroup = backgroundActor.get_parent();
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

            backgroundActor.layout_manager = new Clutter.BinLayout();
            backgroundActor.add_child(this);

            this._wallpaper = null;
            this._applyWallpaper();

            this._roundedCornersEffect =
                new RoundedCornersEffect.RoundedCornersEffect();
            this._backgroundActor.add_effect(this._roundedCornersEffect);

            this.setPixelStep(this._monitorWidth, this._monitorHeight);
            this.setRoundedClipRadius(0.0);
            this.setRoundedClipBounds(0, 0, this._monitorWidth, this._monitorHeight);

            this.connect('notify::height', () => {
                let heightOffset = this.height - this._metaBackgroundGroup.get_parent().height;
                this._roundedCornersEffect.setBounds(
                    [
                        CUSTOM_BACKGROUND_BOUNDS_PADDING,
                        CUSTOM_BACKGROUND_BOUNDS_PADDING + heightOffset,
                        this.width,
                        this.height,
                    ].map(e => e * this._monitorScale)
                );
            });
        }

        setPixelStep(width, height) {
            this._roundedCornersEffect.setPixelStep([
                1.0 / (width * this._monitorScale),
                1.0 / (height * this._monitorScale),
            ]);
        }

        setRoundedClipRadius(radius) {
            this._roundedCornersEffect.setClipRadius(
                radius * this._monitorScale
            );
        }

        setRoundedClipBounds(x1, y1, x2, y2) {
            this._roundedCornersEffect.setBounds(
                [x1, y1, x2, y2].map(e => e * this._monitorScale)
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

        _fade(visible = true) {
            this.ease({
                opacity: visible ? 255 : 0,
                duration: BACKGROUND_FADE_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
    }
);
