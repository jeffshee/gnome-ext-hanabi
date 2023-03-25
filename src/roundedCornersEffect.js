/**
 * Copyright (C) 2022 Alynx Zhou (alynx.zhou@gmail.com)
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

/* exported RoundedCornersEffect */

const {GObject, Shell} = imports.gi;

// This shader is copied from Mutter project.
// See <https://gitlab.gnome.org/GNOME/mutter/-/blob/main/src/compositor/meta-background-content.c>.
const fragmentShaderDeclarations = [
    'uniform vec4 bounds;           // x, y: top left; z, w: bottom right     \n',
    'uniform float clip_radius;                                               \n',
    'uniform vec2 pixel_step;                                                 \n',
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
    'cogl_color_out *= rounded_rect_coverage (texture_coord);                 \n',
].join('');

// A naive pipeline that just updates uniforms.
// TODO: It should be better if we save input value and check whether they are
// the same with previous values before passing into shaders.
var RoundedCornersEffect = GObject.registerClass(
    class RoundedCornersEffect extends Shell.GLSLEffect {
        vfunc_build_pipeline() {
            this.add_glsl_snippet(
                Shell.SnippetHook.FRAGMENT,
                fragmentShaderDeclarations,
                fragmentShaderCode,
                false
            );
        }

        setBounds(bounds) {
            this.set_uniform_float(
                this.get_uniform_location('bounds'),
                4,
                bounds
            );
        }

        setClipRadius(clipRadius) {
            this.set_uniform_float(
                this.get_uniform_location('clip_radius'),
                1,
                [clipRadius]
            );
        }

        setPixelStep(pixelStep) {
            this.set_uniform_float(
                this.get_uniform_location('pixel_step'),
                2,
                pixelStep
            );
        }
    }
);
