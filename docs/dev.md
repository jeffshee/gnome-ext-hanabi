# Development

Common development tasks are available via `make`:

| Command         | Description                                      |
| --------------- | ------------------------------------------------ |
| `make build`    | Build the TypeScript sources                     |
| `make typecheck`| Type-check without emitting                      |
| `make install`  | Build and install the extension                  |
| `make enable`   | Enable the extension                             |
| `make disable`  | Disable the extension                            |
| `make lint`     | Run ESLint                                       |
| `make lint-fix` | Run ESLint with auto-fix                         |
| `make log`      | Follow the GNOME Shell log                       |
| `make pot`      | Regenerate the translation template              |
| `make merge-po` | Regenerate `.pot` and merge into all `.po` files |

Run `make help` to see all available targets.

## Release

Pushing a `v*` tag triggers the [`build.yml`](../.github/workflows/build.yml)
workflow, which builds the zip and publishes a GitHub Release with it attached.

1. Bump `version:` in [`meson.build`](../meson.build) (a plain integer,
   incremented by 1 — GNOME uses it to detect updates), commit, and merge.
2. Tag the release commit and push:

   ```bash
   git tag -a v1.0.0 -m "Release 1.0.0"
   git push origin v1.0.0
   ```

To re-cut, delete the tag (and its Release) first:

```bash
git tag -d v1.0.0                    # local
git push origin :refs/tags/v1.0.0    # remote
```

Install the published zip with:

```bash
gnome-extensions install hanabi-extension@jeffshee.github.io.shell-extension.zip
```

## License Headers

License headers in `src/` are managed with [licensure](https://github.com/chasinglogic/licensure). Configuration is in [`.licensure.yml`](../.licensure.yml).

To check that all files have correct headers:

```bash
licensure --project --check
```

To apply or update headers in-place:

```bash
licensure --project --in-place
```
