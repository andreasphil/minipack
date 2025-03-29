import { Spinner } from "jsr:@std/cli@1.0.6/unstable-spinner";
import { parseArgs } from "jsr:@std/cli@1.0.7/parse-args";
import { emptyDirSync, existsSync, expandGlob } from "jsr:@std/fs@1.0.5";
import { dirname, join, resolve } from "jsr:@std/path@1.0.8";
import * as semver from "jsr:@std/semver@1.0.3";

// Utils --------------------------------------------------

const log = {
  info: (...params: unknown[]) => {
    console.info("%cℹ%c", "color: blue", "color: initial", ...params);
  },
  log: (...params: unknown[]) => {
    console.log(...params);
  },
  success: (...params: unknown[]) => {
    console.info("%c✔︎%c", "color: green", "color: initial", ...params);
  },
  warn: (...params: unknown[]) => {
    console.info("%c⚠%c", "color: yellow", "color: initial", ...params);
  },
  error: (...params: unknown[]) => {
    console.info("%c✕%c", "color: red", "color: initial", ...params);
  },
};

async function untar(path: string, cwd?: string, opts?: { flatten: boolean }) {
  const args = ["-xzf", path];
  if (cwd) args.push("-C", cwd);
  if (opts?.flatten) args.push("--strip-components=1");

  const tar = new Deno.Command("tar", { args });
  const { code, stderr } = await tar.output();

  if (code) {
    const err = new TextDecoder().decode(stderr);
    throw new Error(err);
  }
}

async function downloadRaw(url: string, path: string) {
  using handle = await Deno.open(path, { create: true, write: true });
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`"${response.statusText}" when downloading ${url}`);
  }

  if (response.body) await response.body.pipeTo(handle.writable);
}

async function globCopy(pattern: string | string[], from: string, to: string) {
  if (Array.isArray(pattern)) {
    for (const glob of pattern) await globCopy(glob, from, to);
    return;
  }

  const resolvedFrom = resolve(from);
  const resolvedTo = resolve(to);

  const entries = expandGlob(pattern, { root: from, includeDirs: false });
  for await (const entry of entries) {
    const targetDir = dirname(entry.path).replace(resolvedFrom, resolvedTo);
    await Deno.mkdir(targetDir, { recursive: true });
    await Deno.copyFile(entry.path, join(targetDir, entry.name));
  }
}

function keyedName(name: string, key?: string): string {
  return key ? `${name}@${key}` : name;
}

// Providers ----------------------------------------------

export type LoadableDependencyContext = {
  tempDir: string;
  outDir: string;
};

export interface LoadableDependency {
  readonly name: string;
  readonly key?: string;

  exec(context: LoadableDependencyContext): Promise<void>;
}

type TarOpts = {
  name: string;
  url: string;
  flatten?: boolean;
  key?: string;
  use?: string[];
};

type GitHubOpts = {
  repo: `${string}/${string}`;
  tag: string;
  use?: string[];
};

type NpmOpts = {
  package: string;
  use?: string[];
};

type NpmInfo = {
  name: string;
  version: string;
  "dist.tarball": string;
};

export class Tar implements LoadableDependency {
  private url: string;
  private use: string[];
  private flatten: boolean;

  readonly name: string;
  readonly key?: string;

  constructor(opts: TarOpts) {
    this.url = opts.url;
    this.use = opts.use ?? ["**/*"];
    this.flatten = opts.flatten ?? false;

    this.name = opts.name;
    this.key = opts.key;
  }

  async exec(c: LoadableDependencyContext): Promise<void> {
    const spinner = new Spinner({
      message: `Downloading ${this.name}...`,
    });

    spinner.start();

    try {
      const downloadTo = join(c.tempDir, "download");
      await downloadRaw(this.url, downloadTo);

      spinner.message = "Unpacking...";
      await untar(downloadTo, c.tempDir, { flatten: this.flatten });

      spinner.message = "Cleaning up download...";
      await Deno.remove(downloadTo);

      spinner.message = "Copying ...";
      await globCopy(this.use, c.tempDir, c.outDir);

      spinner.stop();
      log.success(keyedName(this.name, this.key));
    } catch (e) {
      spinner.stop();
      throw e;
    }
  }
}

export class GitHub extends Tar {
  constructor(opts: GitHubOpts) {
    const url =
      `https://github.com/${opts.repo}/archive/refs/tags/${opts.tag}.tar.gz`;

    super({
      name: opts.repo,
      url,
      flatten: true,
      key: opts.tag,
      use: opts.use,
    });
  }
}

export class Npm extends Tar {
  static resolveIdentifier(identifier: string): NpmInfo {
    let resolved: NpmInfo | undefined = undefined;

    const properties = ["name", "version", "dist.tarball"];
    const args = ["info", "--json", identifier, ...properties];
    const npm = new Deno.Command("npm", { args });
    const { code, stdout, stderr } = npm.outputSync();
    const decoder = new TextDecoder();

    if (code) {
      const err = decoder.decode(stderr);
      throw new Error(err);
    }

    const info: NpmInfo | NpmInfo[] = JSON.parse(decoder.decode(stdout));

    if (Array.isArray(info)) {
      resolved = info.sort((a, b) =>
        semver.compare(semver.parse(a.version), semver.parse(b.version))
      ).at(-1);
    } else resolved = info;

    if (!resolved) {
      throw new Error(`${identifier} did not resolve to an npm package`);
    }

    return resolved;
  }

  constructor(opts: NpmOpts) {
    let resolved;

    try {
      resolved = Npm.resolveIdentifier(opts.package);
    } catch (e) {
      log.error(e);
      throw e;
    }

    super({
      name: resolved.name,
      url: resolved["dist.tarball"],
      flatten: true,
      key: resolved.version,
      use: opts.use,
    });
  }
}

// Main ---------------------------------------------------

type MinipackOpts = {
  outDir: string;
  tempDir?: string;
  reload?: boolean;
};

export default class Minipack {
  private tasklist: LoadableDependency[] = [];

  private opts: MinipackOpts = {
    outDir: "./vendor",
    tempDir: undefined,
    reload: false,
  };

  constructor(opts?: Partial<MinipackOpts>) {
    Object.assign(this.opts, opts, this.getOptsFromArgs());
  }

  add(...deps: LoadableDependency[]) {
    this.tasklist.push(...deps);
    return this;
  }

  tar(opts: TarOpts) {
    return this.add(new Tar(opts));
  }

  gitHub(opts: GitHubOpts) {
    return this.add(new GitHub(opts));
  }

  npm(opts: NpmOpts) {
    return this.add(new Npm(opts));
  }

  async pack() {
    if (!this.tasklist.length) {
      log.warn("No dependencies specified");
      return;
    }

    try {
      this.verify();
      this.prepareFs();

      for (const task of this.tasklist) {
        if (!this.needsDownload(task.name, task.key)) {
          log.info(
            `Skipping ${task.name}, key ${task.key} has already been downloaded`,
          );
          continue;
        }

        const tempDir = this.createDepTempDir(task.name);
        const outDir = this.createDepOutDir(task.name, task.key);
        await task.exec({ tempDir, outDir });
      }
    } catch (e) {
      log.error(e);
    } finally {
      this.cleanup();
    }
  }

  private getOptsFromArgs(): Partial<MinipackOpts> {
    const result: Partial<MinipackOpts> = {};

    const args = parseArgs(Deno.args);
    Object.keys(this.opts).forEach((i) => {
      if (args[i] !== undefined) result[i as keyof MinipackOpts] = args[i];
    });

    return result;
  }

  private verify() {
    // Check duplicate names
    const uniqueNames = new Set(this.tasklist.map((i) => i.name));
    if (uniqueNames.size !== this.tasklist.length) {
      throw new Error("Names must be unique");
    }
  }

  private prepareFs() {
    let tempDir = this.opts.tempDir;
    if (!tempDir) {
      tempDir = Deno.makeTempDirSync({ prefix: "a13i-vendor-deps-" });
    } else emptyDirSync(tempDir);
    this.opts.tempDir = tempDir;

    if (this.opts.reload) {
      log.info("Reloading all dependencies");
      emptyDirSync(this.opts.outDir);
    } else {
      Deno.mkdirSync(this.opts.outDir, { recursive: true });
    }
  }

  private createDepTempDir(name: string): string {
    const tempDir = join(this.opts.tempDir!, name);
    emptyDirSync(tempDir);
    return tempDir;
  }

  private createDepOutDir(name: string, key?: string): string {
    const outDir = join(this.opts.outDir, keyedName(name, key));
    emptyDirSync(outDir);
    return outDir;
  }

  private needsDownload(name: string, key?: string): boolean {
    if (!key) return true;
    const outDir = join(this.opts.outDir, keyedName(name, key));
    return !existsSync(outDir, { isDirectory: true });
  }

  private cleanup() {
    if (this.opts.tempDir) {
      Deno.removeSync(this.opts.tempDir, { recursive: true });
    }
  }
}
