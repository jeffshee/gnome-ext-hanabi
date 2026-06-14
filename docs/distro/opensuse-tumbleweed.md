# Installation Guide for openSUSE Tumbleweed

## 1. System update (recommended)

```bash
sudo zypper dup
```

## 2. Install multimedia codecs

```bash
sudo zypper install opi
opi codecs
```

Reference: https://en.opensuse.org/SDB:Installing_codecs_from_Packman_repositories

## 3. Install dependencies

```bash
# Build time dependencies (Git, Meson)
sudo zypper install meson git-core

# Typelib of GstPlay and GstAudio
sudo zypper install typelib-1_0-GstPlay-1_0 typelib-1_0-GstAudio-1_0
```

## 4. Install clapper (optional, better performance)

```bash
sudo zypper install clapper
```

## 5. Install Hanabi Extension

Refer to the README
