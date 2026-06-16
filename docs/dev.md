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
