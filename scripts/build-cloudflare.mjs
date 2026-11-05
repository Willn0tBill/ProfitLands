import { copyFile, mkdir, readdir, rm, access } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "dist");
const publicExtensions = new Set([
  ".html", ".css", ".js", ".svg", ".png", ".jpg", ".jpeg",
  ".webp", ".gif", ".ico", ".woff", ".woff2", ".webmanifest", ".txt"
]);
const publicDirectories = ["play", "preview", "settings"];
let fileCount = 0;

async function copyPublicFiles(relativeDirectory = "") {
  const source = join(root, relativeDirectory);
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const relativeFile = join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      if (relativeDirectory) await copyPublicFiles(relativeFile);
      continue;
    }
    // Do not follow symlinks or upload server code/configuration.
    if (!entry.isFile() || !publicExtensions.has(extname(entry.name).toLowerCase())) continue;
    const destination = join(output, relativeFile);
    await mkdir(join(output, relativeDirectory), { recursive: true });
    await copyFile(join(root, relativeFile), destination);
    fileCount++;
  }
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await copyPublicFiles();
for (const directory of publicDirectories) {
  await copyPublicFiles(directory);
}
for (const path of ["index.html", "play/index.html", "preview/index.html", "settings/index.html"]) {
  await access(join(output, path));
}
console.log(`Cloudflare build ready: ${fileCount} public files in dist/ (backend, tests and secrets excluded).`);
