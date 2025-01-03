# Installation Guide for Fedora 40

## 1. System update (recommended)

```bash
sudo dnf upgrade
```

## 2. Install multimedia codecs (should be preinstalled)

```bash
sudo dnf group install Multimedia
```

Reference: [Fedora Docs](https://docs.fedoraproject.org/en-US/quick-docs/installing-plugins-for-playing-movies-and-music/)

## 3. Install dependencies

```bash
sudo dnf install meson git
```

## 4. Install clapper (optional, better performance)

```bash
sudo dnf install clapper
```

## 5. Install Hanabi Extension

Check GNOME Version in Settings > System > About > System Details and then [Refer to the README](https://github.com/jeffshee/gnome-ext-hanabi)
