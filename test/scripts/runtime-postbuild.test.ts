import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  copyStewardMigrationAssets,
  copyStaticExtensionAssets,
  listStaticExtensionAssetOutputs,
  writeStableRootRuntimeAliases,
} from "../../scripts/runtime-postbuild.mjs";
import { createScriptTestHarness } from "./test-helpers.js";

const { createTempDir } = createScriptTestHarness();

describe("runtime postbuild static assets", () => {
  it("tracks plugin-owned static assets that release packaging must ship", () => {
    expect(listStaticExtensionAssetOutputs()).toContain(
      "dist/extensions/diffs/assets/viewer-runtime.js",
    );
  });

  it("copies declared static assets into dist", async () => {
    const rootDir = createTempDir("openclaw-runtime-postbuild-");
    const src = "extensions/acpx/src/runtime-internals/mcp-proxy.mjs";
    const dest = "dist/extensions/acpx/mcp-proxy.mjs";
    const sourcePath = path.join(rootDir, src);
    const destPath = path.join(rootDir, dest);
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(sourcePath, "proxy-data\n", "utf8");

    copyStaticExtensionAssets({
      rootDir,
      assets: [{ src, dest }],
    });

    expect(await fs.readFile(destPath, "utf8")).toBe("proxy-data\n");
  });

  it("copies steward migration sql files into dist root", async () => {
    const rootDir = createTempDir("openclaw-runtime-postbuild-");
    const migrationsDir = path.join(rootDir, "src/steward/db/migrations");
    const migrationPath = path.join(migrationsDir, "0005_autonomy_execution.sql");
    const ignoredPath = path.join(migrationsDir, "notes.txt");
    const distPath = path.join(rootDir, "dist/0005_autonomy_execution.sql");
    await fs.mkdir(migrationsDir, { recursive: true });
    await fs.writeFile(migrationPath, "ALTER TABLE test ADD COLUMN value TEXT;\n", "utf8");
    await fs.writeFile(ignoredPath, "ignore me\n", "utf8");

    copyStewardMigrationAssets({ rootDir });

    expect(await fs.readFile(distPath, "utf8")).toBe("ALTER TABLE test ADD COLUMN value TEXT;\n");
    await expect(fs.stat(path.join(rootDir, "dist/notes.txt"))).rejects.toThrow();
  });

  it("warns when a declared static asset is missing", async () => {
    const rootDir = createTempDir("openclaw-runtime-postbuild-");
    const warn = vi.fn();

    copyStaticExtensionAssets({
      rootDir,
      assets: [{ src: "missing/file.mjs", dest: "dist/file.mjs" }],
      warn,
    });

    expect(warn).toHaveBeenCalledWith(
      "[runtime-postbuild] static asset not found, skipping: missing/file.mjs",
    );
  });

  it("writes stable aliases for hashed root runtime modules", async () => {
    const rootDir = createTempDir("openclaw-runtime-postbuild-");
    const distDir = path.join(rootDir, "dist");
    await fs.mkdir(distDir, { recursive: true });
    await fs.writeFile(
      path.join(distDir, "runtime-model-auth.runtime-XyZ987.js"),
      "export const auth = true;\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(distDir, "runtime-tts.runtime-AbCd1234.js"),
      "export const tts = true;\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(distDir, "library-Other123.js"),
      "export const x = true;\n",
      "utf8",
    );

    writeStableRootRuntimeAliases({ rootDir });

    expect(await fs.readFile(path.join(distDir, "runtime-model-auth.runtime.js"), "utf8")).toBe(
      'export * from "./runtime-model-auth.runtime-XyZ987.js";\n',
    );
    expect(await fs.readFile(path.join(distDir, "runtime-tts.runtime.js"), "utf8")).toBe(
      'export * from "./runtime-tts.runtime-AbCd1234.js";\n',
    );
    await expect(fs.stat(path.join(distDir, "library.js"))).rejects.toThrow();
  });
});
