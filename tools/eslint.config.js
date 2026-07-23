// SPDX-FileCopyrightText: 2025 Florian Müllner <fmuellner@gnome.org>
// SPDX-License-Identifier: MIT OR LGPL-2.0-or-later

import {defineConfig} from '@eslint/config-helpers';
import gnome from 'eslint-config-gnome';
import tseslint from 'typescript-eslint';

const sharedRules = {
    camelcase: ['error', {
        properties: 'never',
    }],
    'consistent-return': 'error',
    'eqeqeq': ['error', 'smart'],
    'key-spacing': ['error', {
        mode: 'minimum',
        beforeColon: false,
        afterColon: true,
    }],
    'prefer-arrow-callback': 'error',
    'prefer-const': ['error', {
        destructuring: 'all',
    }],
    'jsdoc/require-param-description': 'off',
    'jsdoc/require-jsdoc': ['error', {
        exemptEmptyFunctions: true,
        publicOnly: {
            esm: true,
        },
    }],
};

export default defineConfig([
    {ignores: ['src/_build/**']},
    gnome.configs.recommended,
    gnome.configs.jsdoc,
    {
        rules: sharedRules,
        languageOptions: {
            globals: {
                global: 'readonly',
            },
        },
    },
    // TypeScript files: parse with @typescript-eslint, apply shared rules.
    ...tseslint.configs.recommended,
    {
        files: ['**/*.ts'],
        rules: {
            ...sharedRules,
            // jsdoc rules are JS-oriented; disable for TypeScript.
            'jsdoc/require-jsdoc': 'off',
            // Allow deliberate 'any' for GJS dynamic typing.
            '@typescript-eslint/no-explicit-any': 'off',
            // Allow underscore-prefixed names as intentional unused markers.
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
            }],
        },
        languageOptions: {
            globals: {
                global: 'readonly',
            },
        },
    },
]);
