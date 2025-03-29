<h1 align="center">
  Minipack 🦔
</h1>

<p align="center">
  <strong>Utilities for managing dependencies without build tools</strong>
</p>

> [!NOTE]
>
> Work in progress. Things are most certainly incomplete and/or broken, and will
> definitely change.

Minipack is a lightweight, extensible CLI tool designed to download, unpack, and
manage dependencies from various sources like npm, GitHub, and tarball URLs. It
simplifies handling vendor dependencies by automating extraction, organization,
and cleanup tasks. It doesn't do anything complicated that you couldn't also do
manually—it just makes it a bit more convenient.

Minipack is meant for
[small, self-contained web apps](https://github.com/andreasphil/unbuild) that
work without bundling or other build processes.

- ⛴️ Supports npm, GitHub, and generic tarball URLs
- 📦 File extraction with configurable patterns
- ✅ Simple but effective caching to avoid re-downloading existing dependencies
- 👷 Extensible architecture for custom dependency handling

## Installation

You'll need [Deno v2](https://deno.com) installed as a prerequisite.

## Usage

Minipack is a set of utilities you can import and compose in a script to
describe your dependencies. This will produce a CLI tool which will manage those
dependencies for you when run.

To get started, create a minimal Minipack script in your app folder. The name
doesn't matter, let's call it `deps.ts`:

```ts
import Minipack from "https://esm.sh/gh/andreasphil/minipack@<tag>/main.ts?raw";

const dependencies = new Minipack();

// Add your dependencies here
// ...

dependencies.pack();
```

Then run the script (more on [permissions](#permissions) below):

```sh
deno run -A deps.ts
```

### GitHub tags

Downloads a repository at a specific tag from GitHub.

```ts
dependencies.gitHub({ repo: "user/repo", tag: "v0.1.0" });
```

### npm packages

Resolves an npm specifier to a specific package version, and downloads it from
npm. The package can be anything that you can `npm install`.

```ts
dependencies.npm({ package: "vue" });
```

### Generic tarballs

Downloads and unpacks any tarball.

```ts
dependencies.tar({
  name: "example",
  url: "https://example.com/example.tar.gz",
  key: "1.0",
});
```

### Selecting files to keep

In many cases, the downloaded dependency will include more files than you need.
This can be annoying, so most types of dependency offer a `use` option. This
lets you provide a list of globs. Minipack will only vendor files that match one
of those globs.

```ts
dependencies.npm({
  package: "vue",
  use: ["*LICENSE*", "dist/vue.esm-browser.*"],
});
```

### Options

You can configure Minipack with the following options:

- `outDir: string`: Where to store downloaded dependencies. Default: `./vendor`
- `tempDir: string`: For temporary files like downloads. Default: managed by
  your operating system
- `reload: boolean`: If enabled, will download all dependencies even if they
  already exist locally. Default: `false`

These options can also be passed as CLI arguments:

```sh
deno run -A deps.ts --reload --tempDir="./vendor/.temp"
```

### Permissions

If you don't want to run Minipack with all permissions, you can run it with more
fine-grained permissions:

- `--allow-read`: Needs read access to the output folder for existing
  dependencies and downloaded files
- `--allow-write`: Needs write access to the output folder for writing temporary
  data and downloaded files
- `--allow-run`: Depending on your dependencies, Minipack might need run access
  for `npm` and `tar`
- `--allow-net`: Needed for all download URLs of your dependencies
- `--allow-env`: Needed for determining terminal colors for console logging

## Development

You can add your own dependency types by implementing the `LoadableDependency`
interface. This needs to provide the following:

- `name`: Human-readable name of the dependency
- `key`: Optional, usually some kind of versioning. Dependencies will be
  re-downloaded if the key changes.
- `exec`: Will be called when `pack()` is called and should manage any
  downloading, copying, unpacking and similar required actions. Will receive a
  context as a parameter that includes temporary and output folder paths.

Then, pass them to `Minipack.add`:

```ts
depdendencies.add(myLoadableDependency);
```
