# Installation Guide for Ubuntu 23.04

## 1. System update (recommended)

```bash
sudo apt update && sudo apt upgrade
```

## 2. Install multimedia codecs

```bash
sudo apt install -y ubuntu-restricted-extras
```

## 3. Install dependencies

```bash
# Build time dependencies (Git, Meson)
sudo apt install git meson

# GTK4 media backend
sudo apt install libgtk-4-media-gstreamer

# GstPlay and GstAudio
sudo apt install gir1.2-gst-plugins-base-1.0 gir1.2-gst-plugins-bad-1.0
```

## 4. Install clapper (optional, better performance)

```bash
sudo apt install clapper
```

## 5. Install Hanabi Extension

Refer to the README
