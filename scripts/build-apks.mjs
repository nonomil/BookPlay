import { access, copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(root, "android");
const releaseDir = path.join(root, "release");
const versionPropsPath = path.join(androidDir, "version.properties");

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

// 每次打包自动递增修订号与 versionCode；大版本/功能版本在
// android/version.properties 里人工升级。versionCode 只增不减，
// Android 覆盖安装时靠它判断新旧。
async function bumpAndroidVersion() {
  const props = { versionMajor: 1, versionMinor: 0, versionPatch: 0, versionCode: 5 };
  try {
    for (const line of (await readFile(versionPropsPath, "utf8")).split(/\r?\n/)) {
      const match = line.match(/^\s*(version\w+)\s*=\s*(\d+)\s*$/);
      if (match) props[match[1]] = Number(match[2]);
    }
  } catch (_) {
    // 首次运行：使用默认基线并落盘。
  }
  props.versionPatch += 1;
  props.versionCode += 1;
  const versionName = `${props.versionMajor}.${props.versionMinor}.${props.versionPatch}`;
  const content = [
    "# APK 版本号，由 scripts/build-apks.mjs 在每次打包时维护：",
    "#   versionMajor / versionMinor 人工升级（大版本 / 功能版本）",
    "#   versionPatch 每次打包自动 +1（修订号）",
    "#   versionCode  每次打包自动 +1；Android 判断新旧只看它，只增不减",
    `versionMajor=${props.versionMajor}`,
    `versionMinor=${props.versionMinor}`,
    `versionPatch=${props.versionPatch}`,
    `versionCode=${props.versionCode}`,
    "",
  ].join("\n");
  await writeFile(versionPropsPath, content, "utf8");
  return { versionName, versionCode: props.versionCode };
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
  const version = await bumpAndroidVersion();
  console.log(`[build-apks] APK 版本 ${version.versionName} (versionCode ${version.versionCode})`);
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
