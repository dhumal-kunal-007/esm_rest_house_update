const fs = require("node:fs/promises");
const path = require("node:path");

async function prepareBackend() {
  const frontendDirectory = path.resolve(__dirname, "..");
  const repositoryDirectory = path.resolve(frontendDirectory, "..");
  const backendDirectory = path.join(repositoryDirectory, "backend");
  const stagingDirectory = path.join(
    frontendDirectory,
    "desktop-backend-build"
  );

  await fs.rm(stagingDirectory, { recursive: true, force: true });
  await fs.mkdir(stagingDirectory, { recursive: true });
  await fs.cp(
    path.join(backendDirectory, "dist"),
    path.join(stagingDirectory, "dist"),
    { recursive: true }
  );
  await fs.copyFile(
    path.join(backendDirectory, "package.json"),
    path.join(stagingDirectory, "package.json")
  );
}

prepareBackend().catch((error) => {
  console.error("Unable to prepare the packaged backend:", error);
  process.exitCode = 1;
});