# Installation Guide for NixOS

Add to your flake inputs:

```nix
hanabi = {
  url = "github:jeffshee/gnome-ext-hanabi";
  inputs.nixpkgs.follows = "nixpkgs";
};
```

## Enable Extension

```nix
{ inputs, pkgs, ... }:
let hanabi = inputs.hanabi.packages.${pkgs.stdenv.hostPlatform.system}.default;
in {
  home.packages = [ hanabi ];

  dconf.settings."org/gnome/shell".enabled-extensions = [
    hanabi.passthru.extensionUuid
  ];

  # Optional: prefer clappersink over gtk4paintablesink for better perf
  # dconf.settings."io/github/jeffshee/hanabi-extension" = {
  #   prefer-clappersink = true;
  # };
}
```

Or `environment.systemPackages` if not using home-manager.

## Update

```bash
nix flake lock --update-input hanabi
```
