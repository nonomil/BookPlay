import { access, copyFile, mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(root, "android");
const releaseDir = path.join(root, "release");

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    // Windows .cmd/.bat wrappers require shell dispatch; Unix stays direct.
    const child = spawn(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

async function findApk(dir, matcher) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const match = await findApk(fullPath, matcher);
      if (match) return match;
    } else if (entry.isFile() && matcher.test(entry.name)) {
      return fullPath;
    }
  }
  return null;
}

export async function buildApks() {
  const jttwOnly = process.argv.includes("--jttw-only");
  await run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "android:sync"], root);
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const starterVersion = String(packageJson.version || "dev");
  // The APK is a useful first-run experience, not just a shell around an
  // external ZIP.  Generate the deliberately small starter tree after
  // Capacitor sync so it lands under app/src/main/assets/data and is served by
  // the local range server.  Later books/episodes remain external packs.
  await run(process.platform === "win32" ? "python" : "python3", [
    "-X", "utf8", "prj/tools/pack_android.py", "--engine-only", "--builtin",
    "--builtin-profile", jttwOnly ? "jttw-only" : "starter",
    "--builtin-version", starterVersion,
  ], root);
  // Profiles can remove hundreds of megabytes of assets.  A clean package is
  // required here because the Android asset merger may otherwise leave the
  // previous archive's data as unused gaps, making a 79 MiB tree look like a
  // 190 MiB APK on disk.
  await run(process.platform === "win32" ? "gradlew.bat" : "./gradlew", ["clean", "assembleMobileDebug", "assembleTvDebug"], androidDir);

  const debugDir = path.join(androidDir, "app", "build", "outputs", "apk");
  const mobileSource = await findApk(debugDir, /mobile.*debug.*\.apk$/i);
  const tvSource = await findApk(debugDir, /tv.*debug.*\.apk$/i);
  if (!mobileSource || !tvSource) {
    throw new Error(`Expected both flavor APKs under ${debugDir}`);
  }

  await mkdir(releaseDir, { recursive: true });
  const outputs = [
    [mobileSource, path.join(releaseDir, jttwOnly ? "storyhall-jttw-mobile-debug.apk" : "storyhall-mobile-debug.apk")],
    [tvSource, path.join(releaseDir, jttwOnly ? "storyhall-jttw-tv-debug.apk" : "storyhall-tv-debug.apk")],
  ];
  for (const [source, destination] of outputs) {
    await rm(destination, { force: true });
    await copyFile(source, destination);
    await access(destination);
    console.log(`[build-apks] ${path.relative(root, destination)}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await buildApks();
  } catch (error) {
    console.error(`[build-apks] ${error.message}`);
    process.exitCode = 1;
  }
}
