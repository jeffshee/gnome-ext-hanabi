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

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';
import Graphene from 'gi://Graphene';
import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Logger} from './logger.js';
import {RoundedCornersEffect} from './roundedCornersEffect.js';
import {APPLICATION_ID} from './constants.js';

const logger = new Logger('wallpaper');
// Ref: https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/layout.js
const BACKGROUND_FADE_ANIMATION_TIME = 1000;
// Interval for polling until the renderer window appears (ms).
const RENDERER_POLL_INTERVAL_MS = 1000;

export const LiveWallpaper = GObject.registerClass(
    class LiveWallpaper extends St.Widget {
        // Background actor we sit on, and values derived from it.
        private backgroundActor: Meta.BackgroundActor;
        // Meta.BackgroundGroup normally, or an St.Widget (with style_class) on the lock screen.
        private metaBackgroundGroup: Clutter.Actor | null;
        private monitorIndex: number;

        // Injected dependencies.
        private settings: Gio.Settings;
        // Returns all window actors unfiltered (renderer windows are hidden from the
        // public get_window_actors by GnomeShellOverride); injected so getRenderer can find them.
        private getWindowActors: () => Meta.WindowActor[];

        // Lifecycle bookkeeping, cleaned up on destroy.
        private isDisposed = false;
        private rendererPollTimeoutId = 0;
        private settingsChangedIds: number[] = [];

        // The wallpaper clone and its source-destroy handler.
        private wallpaper: Clutter.Clone | null = null;
        private sourceDestroyId: number | null = null;

        // Rendering effect and monitor geometry, set up in the constructor.
        private roundedCornersEffect!: RoundedCornersEffect;
        private display!: Meta.Display;
        private monitorScale!: number;
        private monitorWidth!: number;
        private monitorHeight!: number;

        constructor(
            backgroundActor: Meta.BackgroundActor,
            settings: Gio.Settings,
            getWindowActors: () => Meta.WindowActor[]
        ) {
            super({
                layout_manager: new Clutter.BinLayout(),
                width: backgroundActor.width,
                height: backgroundActor.height,
                x_expand: true,
                y_expand: true,
                opacity: 0,
            });
            this.backgroundActor = backgroundActor;
            this.metaBackgroundGroup = backgroundActor.get_parent();
            this.monitorIndex = this.backgroundActor.monitor;
            this.settings = settings;
            this.getWindowActors = getWindowActors;

            this.connect('destroy', () => {
                this.isDisposed = true;
                if (this.rendererPollTimeoutId) {
                    GLib.source_remove(this.rendererPollTimeoutId);
                    this.rendererPollTimeoutId = 0;
                }
                for (const id of this.settingsChangedIds)
                    this.settings.disconnect(id);
                this.settingsChangedIds = [];
                if (this.wallpaper) {
                    if (this.sourceDestroyId) {
                        this.wallpaper.source?.disconnect(this.sourceDestroyId);
                        this.sourceDestroyId = null;
                    }
                    this.wallpaper.set_source(null);
                    this.wallpaper.destroy();
                    this.wallpaper = null;
                }
            });

            this.display = this.backgroundActor.meta_display;
            this.monitorScale = this.display.get_monitor_scale(this.monitorIndex);
            const {width, height} = Main.layoutManager.monitors[this.monitorIndex];
            this.monitorWidth = width;
            this.monitorHeight = height;

            backgroundActor.layout_manager = new Clutter.BinLayout();
            backgroundActor.add_child(this);

            this.roundedCornersEffect = new RoundedCornersEffect();
            this.backgroundActor.add_effect(this.roundedCornersEffect);

            this.setPixelStep(this.backgroundActor.width, this.backgroundActor.height);
            this.setRoundedClipRadius(0.0);
            this.setBorderStroke(0);
            this.setBorderColor([1.0, 0.0, 0.0, 1.0]);

            this.settingsChangedIds.push(
                this.settings.connect('changed::border-stroke', () => {
                    this.setBorderStroke(this.settings.get_int('border-stroke'));
                    this.backgroundActor?.queue_redraw();
                })
            );
            for (const key of ['bounds-inset-x1', 'bounds-inset-y1', 'bounds-inset-x2', 'bounds-inset-y2']) {
                this.settingsChangedIds.push(
                    this.settings.connect(`changed::${key}`, () => {
                        this.applyBounds();
                        this.backgroundActor?.queue_redraw();
                    })
                );
            }
            this.setRoundedClipBounds(0, 0, this.backgroundActor.width, this.backgroundActor.height);

            this.connect('notify::allocation', () => {
                if (!this.wallpaper)
                    return;
                try {
                    this.setPixelStep(this.width, this.height);
                    this.applyBounds();
                    const stroke = this.settings.get_int('border-stroke');
                    this.roundedCornersEffect.setBorderStroke(stroke * this.monitorScale);
                } catch (e) {
                    logError(e as object, 'LiveWallpaper notify::allocation');
                }
            });

            this.applyWallpaper();
        }

        isLockScreen(): boolean {
            const group = this.metaBackgroundGroup as (Clutter.Actor & { style_class?: string }) | null;
            return group?.style_class?.includes('screen-shield-background') ?? false;
        }

        private applyBounds(): void {
            const workArea = Main.layoutManager.getWorkAreaForMonitor(this.monitorIndex);
            const monitor = Main.layoutManager.monitors[this.monitorIndex];
            const panelOffset = (workArea.y - monitor.y) / monitor.height * this.backgroundActor.height;
            const ix1 = this.settings.get_int('bounds-inset-x1');
            const iy1 = this.settings.get_int('bounds-inset-y1');
            const ix2 = this.settings.get_int('bounds-inset-x2');
            const iy2 = this.settings.get_int('bounds-inset-y2');
            this.roundedCornersEffect.setBounds(
                [ix1, panelOffset + iy1, this.width - ix2, this.height - iy2]
                    .map(e => e * this.monitorScale)
            );
        }

        setPixelStep(width: number, height: number): void {
            if (this.isDisposed)
                return;
            this.roundedCornersEffect.setPixelStep([
                1.0 / (width * this.monitorScale),
                1.0 / (height * this.monitorScale),
            ]);
        }

        setRoundedClipRadius(radius: number): void {
            if (this.isDisposed)
                return;
            this.roundedCornersEffect.setClipRadius(radius * this.monitorScale);
        }

        setRoundedClipBounds(x1: number, y1: number, x2: number, y2: number): void {
            if (this.isDisposed)
                return;
            this.roundedCornersEffect.setBounds(
                [x1, y1, x2, y2].map(e => e * this.monitorScale)
            );
        }

        setBorderStroke(stroke: number): void {
            if (this.isDisposed)
                return;
            this.roundedCornersEffect.setBorderStroke(stroke);
        }

        setBorderColor(color: number[]): void {
            if (this.isDisposed)
                return;
            this.roundedCornersEffect.setBorderColor(color);
        }

        private applyWallpaper(): void {
            if (this.isDisposed)
                return;
            logger.debug('Applying wallpaper...');
            const operation = (): boolean => {
                if (this.isDisposed) {
                    logger.debug('LiveWallpaper disposed, stopping wallpaper operation');
                    return false;
                }

                const renderer = this.getRenderer();
                if (renderer) {
                    this.wallpaper = new Clutter.Clone({
                        source: renderer,
                        pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
                    });
                    this.wallpaper.connect('destroy', () => {
                        this.wallpaper = null;
                    });
                    this.sourceDestroyId = this.wallpaper.source!.connect(
                        'destroy',
                        () => {
                            if (this.wallpaper)
                                this.wallpaper.destroy();
                            if (!this.isDisposed)
                                this.applyWallpaper();
                        }
                    );
                    this.add_child(this.wallpaper);
                    this.fade();
                    logger.debug('Wallpaper applied');
                    this.rendererPollTimeoutId = 0;
                    return false;
                } else {
                    return true;
                }
            };

            if (operation()) {
                this.rendererPollTimeoutId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    RENDERER_POLL_INTERVAL_MS,
                    operation
                );
            }
        }

        private getRenderer(): Clutter.Actor | null {
            // Renderer windows are hidden from the public get_window_actors, so use the
            // injected unfiltered accessor to find them.
            const hanabiWindowActors = this.getWindowActors().filter(
                actor => actor.meta_window?.title?.includes(APPLICATION_ID)
            );

            const numMonitors = global.display.get_n_monitors();
            if (hanabiWindowActors.length < numMonitors) {
                logger.debug(
                    `Hanabi windows (${hanabiWindowActors.length}) < monitors (${numMonitors}), rejecting`
                );
                return null;
            }

            const monitorIndices = hanabiWindowActors.map(actor => actor.meta_window!.get_monitor());
            const uniqueMonitorIndices = new Set(monitorIndices);
            if (uniqueMonitorIndices.size !== monitorIndices.length) {
                logger.debug('Non-unique monitor indices detected, rejecting');
                return null;
            }

            const monitorIndex = this.backgroundActor.monitor;
            const renderer = hanabiWindowActors.find(
                actor => actor.meta_window!.get_monitor() === monitorIndex
            );

            if (!renderer) {
                logger.debug(
                    `No renderer found for monitor ${monitorIndex}. Found actors for monitors: ${monitorIndices}`
                );
            }

            return renderer ?? null;
        }

        private fade(visible = true): void {
            if (this.isDisposed)
                return;
            this.ease({
                opacity: visible ? 255 : 0,
                duration: BACKGROUND_FADE_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
    }
);

export type LiveWallpaper = InstanceType<typeof LiveWallpaper>;
