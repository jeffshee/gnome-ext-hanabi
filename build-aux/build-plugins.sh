#!/bin/bash

GSTCEFSRC_REPO="https://github.com/centricular/gstcefsrc.git"
GST_PLUGIN_RS_REPO="https://gitlab.freedesktop.org/gstreamer/gst-plugins-rs.git"
GST_PLUGIN_RS_REPO_BRANCH="0.10"

if [ -z "$1" ]; then
    echo "Error: Prefix not specified."
    exit 1
fi
PREFIX=$1

# gstcefsrc
git clone --depth 1 $GSTCEFSRC_REPO
cd gstcefsrc || exit 1
cmake -G "Unix Makefiles" -DCMAKE_BUILD_TYPE=Release .
cmake --build .
cmake --install . --prefix="$PREFIX/lib/gstreamer-1.0"
cd ..

# gst-plugin-gtk4
git clone --depth 1 $GST_PLUGIN_RS_REPO -b $GST_PLUGIN_RS_REPO_BRANCH
cd gst-plugins-rs || exit 1
cargo install cargo-c
cargo cbuild -p gst-plugin-gtk4
cargo cinstall -p gst-plugin-gtk4 --prefix="$PREFIX"
