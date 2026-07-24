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
import Cogl from 'gi://Cogl';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';

import {Logger} from './logger.js';

const logger = new Logger('roundedCorners');
// Uniform setters fire on every redraw/animation frame; wait for this quiet
// period (ms) so only the final value is logged instead of every change.
const LOG_DEBOUNCE_MS = 250;

// Adapted from the Mutter project.
// See <https://gitlab.gnome.org/GNOME/mutter/-/blob/main/src/compositor/meta-background-content.c>.
const fragmentShaderDeclarations = [
    'uniform vec4 bounds;           // x, y: top left; z, w: bottom right     \n',
    'uniform float clip_radius;                                               \n',
    'uniform vec2 pixel_step;                                                 \n',
    'uniform float border_stroke;                                             \n',
    'uniform vec4 border_color;                                               \n',
    '                                                                         \n',
    'float                                                                    \n',
    'rounded_rect_coverage (vec2 p)                                           \n',
    '{                                                                        \n',
    '  float center_left  = bounds.x + clip_radius;                           \n',
    '  float center_right = bounds.z - clip_radius;                           \n',
    '  float center_x;                                                        \n',
    '                                                                         \n',
    '  if (p.x < center_left)                                                 \n',
    '    center_x = center_left;                                              \n',
    '  else if (p.x > center_right)                                           \n',
    '    center_x = center_right;                                             \n',
    '  else                                                                   \n',
    '    return 1.0; // The vast majority of pixels exit early here           \n',
    '                                                                         \n',
    '  float center_top    = bounds.y + clip_radius;                          \n',
    '  float center_bottom = bounds.w - clip_radius;                          \n',
    '  float center_y;                                                        \n',
    '                                                                         \n',
    '  if (p.y < center_top)                                                  \n',
    '    center_y = center_top;                                               \n',
    '  else if (p.y > center_bottom)                                          \n',
    '    center_y = center_bottom;                                            \n',
    '  else                                                                   \n',
    '    return 1.0;                                                          \n',
    '                                                                         \n',
    '  vec2 delta = p - vec2 (center_x, center_y);                            \n',
    '  float dist_squared = dot (delta, delta);                               \n',
    '                                                                         \n',
    '  // Fully outside the circle                                            \n',
    '  float outer_radius = clip_radius + 0.5;                                \n',
    '  if (dist_squared >= (outer_radius * outer_radius))                     \n',
    '    return 0.0;                                                          \n',
    '                                                                         \n',
    '  // Fully inside the circle                                             \n',
    '  float inner_radius = clip_radius - 0.5;                                \n',
    '  if (dist_squared <= (inner_radius * inner_radius))                     \n',
    '    return 1.0;                                                          \n',
    '                                                                         \n',
    '  // Only pixels on the edge of the curve need expensive antialiasing    \n',
    '  return outer_radius - sqrt (dist_squared);                             \n',
    '}                                                                        \n',
].join('');

const fragmentShaderCode = [
    'vec2 texture_coord;                                                      \n',
    '                                                                         \n',
    'texture_coord = cogl_tex_coord0_in.xy / pixel_step;                      \n',
    '                                                                         \n',
    'bool inside = texture_coord.x >= bounds.x && texture_coord.x <= bounds.z \n',
    '           && texture_coord.y >= bounds.y && texture_coord.y <= bounds.w;\n',
    '                                                                         \n',
    '// border stroke for debug purposes                                      \n',
    'bool on_border = border_stroke > 0.0 && inside && (                      \n',
    '    texture_coord.x < bounds.x + border_stroke ||                        \n',
    '    texture_coord.x > bounds.z - border_stroke ||                        \n',
    '    texture_coord.y < bounds.y + border_stroke ||                        \n',
    '    texture_coord.y > bounds.w - border_stroke);                         \n',
    '                                                                         \n',
    'if (on_border)                                                           \n',
    '    cogl_color_out = border_color;                                       \n',
    'else if (clip_radius > 0.0 && !inside)                                   \n',
    '    cogl_color_out = vec4 (0.0);                                         \n',
    'else if (clip_radius > 0.0)                                              \n',
    '    cogl_color_out *= rounded_rect_coverage (texture_coord);             \n',
].join('');

// Port of mutter's _clutter_actor_box_enlarge_for_effects: the stable, padded
// quantization applied to the paint box before it becomes the offscreen
// texture. Returns the enlarged box origin.
function enlargeForEffects(
    x1: number,
    y1: number,
    width: number,
    height: number
): [number, number] {
    if (width <= 0 || height <= 0)
        return [x1, y1];
    const x2 = Math.ceil(x1 + width + 0.75);
    const y2 = Math.ceil(y1 + height + 0.75);
    return [x2 - Math.round(width) - 3, y2 - Math.round(height) - 3];
}

// Replicates ClutterOffscreenEffect's fbo_offset: the offscreen texture's
// origin in actor-local coordinates, typically (-2, -2). See
// clutter_offscreen_effect_pre_paint in clutter-offscreen-effect.c.
function getFboOffset(actor: Clutter.Actor): [number, number] {
    const volume = actor.get_paint_volume();
    if (volume) {
        const origin = volume.get_origin();
        const [x1, y1] = enlargeForEffects(
            origin.x,
            origin.y,
            volume.get_width(),
            volume.get_height()
        );
        return [Math.trunc(x1), Math.trunc(y1)];
    }
    const box = actor.get_allocation_box();
    const [x1, y1] = enlargeForEffects(
        box.x1,
        box.y1,
        box.x2 - box.x1,
        box.y2 - box.y1
    );
    return [Math.trunc(x1 - box.x1), Math.trunc(y1 - box.y1)];
}

export const RoundedCornersEffect = GObject.registerClass(
    class RoundedCornersEffect extends Shell.GLSLEffect {
        // Pending debounced log timers, keyed by label.
        private logTimeouts = new Map<string, number>();

        // Uniform values in actor-local logical pixels, as set by callers.
        private bounds = [0, 0, 0, 0];
        private clipRadius = 0;
        private borderStroke = 0;
        private uniformsDirty = true;

        // Actor-to-texture mapping the uniforms were last uploaded for.
        private textureWidth = 0;
        private textureHeight = 0;
        private textureScale = 0;
        private textureOffsetX = 0;
        private textureOffsetY = 0;

        // Logs `label: ...args` only once the value stops changing for LOG_DEBOUNCE_MS.
        private debugDebounced(label: string, ...args: unknown[]): void {
            const pending = this.logTimeouts.get(label);
            if (pending)
                GLib.source_remove(pending);
            this.logTimeouts.set(
                label,
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, LOG_DEBOUNCE_MS, () => {
                    this.logTimeouts.delete(label);
                    logger.debug(`${label}:`, ...args);
                    return GLib.SOURCE_REMOVE;
                })
            );
        }

        vfunc_build_pipeline(): void {
            this.add_glsl_snippet(
                Cogl.SnippetHook.FRAGMENT,
                fragmentShaderDeclarations,
                fragmentShaderCode,
                false
            );
        }

        // The shader compares texture coordinates (converted to texture pixels
        // via pixel_step) against bounds/clip_radius/border_stroke, so those
        // uniforms must be expressed in pixels of the offscreen texture this
        // effect renders into. mutter sizes that texture from the actor's paint
        // box, not its allocation, and the relation between the two varies
        // across mutter versions (e.g. Clutter.Clone paint volumes changed in
        // 50.2, commit d26ac38b) and monitor scales (the texture uses the
        // ceiled resource scale). Instead of predicting the size, read the
        // actual texture at paint time and mirror mutter's actor-to-texture
        // mapping: texture_px = (logical_px - fbo_offset) * resource_scale.
        vfunc_paint_target(node: Clutter.PaintNode, paintContext: Clutter.PaintContext): void {
            this.updateUniforms();
            super.vfunc_paint_target(node, paintContext);
        }

        private updateUniforms(): void {
            const texture = this.get_texture();
            const actor = this.get_actor();
            if (!texture || !actor)
                return;

            const width = texture.get_width();
            const height = texture.get_height();
            // The same ceiled scale mutter uses to size and paint the texture.
            const scale = actor.get_resource_scale();
            const [offsetX, offsetY] = getFboOffset(actor);

            if (!this.uniformsDirty &&
                width === this.textureWidth &&
                height === this.textureHeight &&
                scale === this.textureScale &&
                offsetX === this.textureOffsetX &&
                offsetY === this.textureOffsetY)
                return;

            this.uniformsDirty = false;
            this.textureWidth = width;
            this.textureHeight = height;
            this.textureScale = scale;
            this.textureOffsetX = offsetX;
            this.textureOffsetY = offsetY;
            this.debugDebounced('textureMapping', width, height, scale, offsetX, offsetY);

            this.set_uniform_float(
                this.get_uniform_location('pixel_step'),
                2,
                [1.0 / width, 1.0 / height]
            );
            const [x1, y1, x2, y2] = this.bounds;
            this.set_uniform_float(
                this.get_uniform_location('bounds'),
                4,
                [
                    (x1 - offsetX) * scale,
                    (y1 - offsetY) * scale,
                    (x2 - offsetX) * scale,
                    (y2 - offsetY) * scale,
                ]
            );
            this.set_uniform_float(
                this.get_uniform_location('clip_radius'),
                1,
                [this.clipRadius * scale]
            );
            this.set_uniform_float(
                this.get_uniform_location('border_stroke'),
                1,
                [this.borderStroke * scale]
            );
        }

        setBounds(bounds: number[]): void {
            this.debugDebounced('bounds', ...bounds);
            this.bounds = bounds;
            this.uniformsDirty = true;
        }

        setClipRadius(clipRadius: number): void {
            this.debugDebounced('clipRadius', clipRadius);
            this.clipRadius = clipRadius;
            this.uniformsDirty = true;
        }

        setBorderStroke(stroke: number): void {
            this.debugDebounced('borderStroke', stroke);
            this.borderStroke = stroke;
            this.uniformsDirty = true;
        }

        setBorderColor(color: number[]): void {
            this.debugDebounced('borderColor', ...color);
            this.set_uniform_float(
                this.get_uniform_location('border_color'),
                4,
                color
            );
        }
    }
);

export type RoundedCornersEffect = InstanceType<typeof RoundedCornersEffect>;
