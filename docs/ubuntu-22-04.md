# Installation Guide for Ubuntu/Pop!\_OS 22.04

_Note: Pop!\_OS has a heavily customized GNOME Shell, your mileage may vary._

## 1. System update (recommended)

```bash
sudo apt update && sudo apt upgrade
```

## 2. Install multimedia codecs

```bash
sudo apt install -y ubuntu-restricted-extras
```

Reference: [https://support.system76.com/articles/codecs/](https://support.system76.com/articles/codecs/)

## 3. Install dependencies

```bash
# Build time dependencies (Git, Meson)
sudo apt install git meson

# GTK4 media backend
sudo apt install libgtk-4-media-gstreamer

# GstPlay and GstAudio
sudo apt install gir1.2-gst-plugins-base-1.0 gir1.2-gst-plugins-bad-1.0
```

## 4. Build Clapper from source (optional, better performance)

```bash
# Build dependencies
sudo apt install libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev libgstreamer-plugins-good1.0-dev libgstreamer-plugins-bad1.0-dev libgtk-4-dev

# Build & install
git clone https://github.com/Rafostar/clapper.git
cd clapper
meson builddir --prefix=/usr/local
sudo meson install -C builddir
```

Reference: [https://github.com/Rafostar/clapper](https://github.com/Rafostar/clapper)

## 5. Install Hanabi Extension

Refer to the README
