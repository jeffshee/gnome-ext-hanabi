#!/bin/bash

rm -rf ~/.local/share/gnome-shell/extensions/hanabi-extension@jeffshee.github.io/*
rm -rf .build
mkdir .build
meson --prefix=$HOME/.local/ .build
ninja -C .build install
rm -rf .build
