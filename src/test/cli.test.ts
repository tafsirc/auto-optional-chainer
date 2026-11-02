import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const { runCLI } = require("../../bin/auto-optional-chainer");

suite("CLI Executable Test Suite", () => {
  let tempDir: string;

  setup(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aoc-cli-test-"));
  });

  teardown(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("Should exit with code 0 on --help", () => {
    const code = runCLI(["--help"]);
    assert.strictEqual(code, 0);
  });

  test("Should exit with code 0 on --version", () => {
    const code = runCLI(["--version"]);
    assert.strictEqual(code, 0);
  });

  test("Should exit with code 1 if no files or globs are specified", () => {
    const code = runCLI(["--check"]);
    assert.strictEqual(code, 1);
  });

  test("Should check clean file and exit with code 0", () => {
    const filePath = path.join(tempDir, "clean.ts");
    fs.writeFileSync(filePath, "const x = user?.profile?.name;", "utf8");

    const code = runCLI(["--check", filePath]);
    assert.strictEqual(code, 0);
  });

  test("Should detect unformatted file in --check mode and exit with code 1", () => {
    const filePath = path.join(tempDir, "dirty.ts");
    fs.writeFileSync(filePath, "const x = user.profile.name;", "utf8");

    const code = runCLI(["--check", filePath]);
    assert.strictEqual(code, 1);
    assert.strictEqual(
      fs.readFileSync(filePath, "utf8"),
      "const x = user.profile.name;"
    );
  });

  test("Should format unformatted file in --write mode and exit with code 0", () => {
    const filePath = path.join(tempDir, "dirty.ts");
    fs.writeFileSync(filePath, "const x = user.profile.name;", "utf8");

    const code = runCLI(["--write", filePath]);
    assert.strictEqual(code, 0);
    assert.strictEqual(
      fs.readFileSync(filePath, "utf8"),
      "const x = user?.profile?.name;"
    );
  });

  test("Should format component files (.vue, .svelte, .astro) in --write mode", () => {
    const vueFile = path.join(tempDir, "App.vue");
    fs.writeFileSync(
      vueFile,
      "<template><div></div></template><script>const x = user.name;</script>",
      "utf8"
    );

    const code = runCLI(["--write", vueFile]);
    assert.strictEqual(code, 0);
    assert.strictEqual(
      fs.readFileSync(vueFile, "utf8"),
      "<template><div></div></template><script>const x = user?.name;</script>"
    );
  });
});
