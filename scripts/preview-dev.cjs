// Launches `next dev` with the working directory pinned to the project root,
// so Tailwind/PostCSS resolve their config + content globs correctly even when
// the process is spawned from a different directory (e.g. the preview runner).
const { spawn } = require("child_process");
const path = require("path");

const projectRoot = path.join(__dirname, "..");
process.chdir(projectRoot);

const nextBin = require.resolve("next/dist/bin/next");
const port = process.env.PORT || "3000";

const child = spawn(process.execPath, [nextBin, "dev", "-p", port], {
  cwd: projectRoot,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));
