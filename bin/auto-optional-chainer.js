#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// Resolve compiled transformer module
let transformer;
try {
  transformer = require("../out/core/transformer");
} catch {
  try {
    transformer = require("./out/core/transformer");
  } catch (err) {
    console.error(
      "Error: Could not load transformer engine. Please run 'npm run compile' first."
    );
    process.exit(1);
  }
}

const { transformSourceCode, transformComponentDocument } = transformer;

function getVersion() {
  try {
    const pkgPath = path.join(__dirname, "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return pkg.version || "0.0.0";
  } catch {
    return "unknown";
  }
}

function printHelp() {
  console.log(`Auto Optional Chainer CLI (v${getVersion()})

Usage:
  auto-optional-chainer [options] <files/globs...>

Options:
  -w, --write     Apply optional chaining transformations in place
  -c, --check     Check if files need optional chaining (exits 1 if unformatted)
  -v, --version   Display CLI version
  -h, --help      Display this help message

Examples:
  npx auto-optional-chainer "src/**/*.{js,ts,jsx,tsx}" --check
  npx auto-optional-chainer "src/**/*.ts" --write
  auto-optional-chainer src/app.ts --write
`);
}

function collectFiles(patterns) {
  const fileSet = new Set();
  const excludePatterns = [
    "node_modules",
    ".git",
    "out",
    ".vscode-test",
    "dist",
    "coverage",
  ];

  for (const pattern of patterns) {
    if (fs.existsSync(pattern)) {
      const stat = fs.statSync(pattern);
      if (stat.isFile()) {
        fileSet.add(path.resolve(pattern));
        continue;
      }
      if (stat.isDirectory()) {
        const walked = walkDirectory(pattern, excludePatterns);
        for (const f of walked) {
          fileSet.add(f);
        }
        continue;
      }
    }

    // Try glob matching if pattern contains glob characters or if fs.globSync is available
    if (typeof fs.globSync === "function") {
      try {
        const matches = fs.globSync(pattern, {
          exclude: (p) => excludePatterns.some((e) => p.includes(e)),
        });
        for (const m of matches) {
          if (fs.existsSync(m) && fs.statSync(m).isFile()) {
            fileSet.add(path.resolve(m));
          }
        }
      } catch {
        // Continue if glob pattern fails
      }
    }
  }

  return Array.from(fileSet);
}

function walkDirectory(dir, excludePatterns) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (excludePatterns.includes(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkDirectory(fullPath, excludePatterns));
    } else if (entry.isFile()) {
      if (/\.(js|ts|jsx|tsx|vue|svelte|astro)$/i.test(entry.name)) {
        results.push(path.resolve(fullPath));
      }
    }
  }
  return results;
}

function runCLI(args) {
  if (args.includes("-h") || args.includes("--help") || args.length === 0) {
    printHelp();
    return 0;
  }

  if (args.includes("-v") || args.includes("--version")) {
    console.log(getVersion());
    return 0;
  }

  const isWrite = args.includes("-w") || args.includes("--write");
  const isCheck = args.includes("-c") || args.includes("--check") || !isWrite;

  const patterns = args.filter((a) => !a.startsWith("-"));
  if (patterns.length === 0) {
    console.error("Error: No file paths or globs specified.");
    printHelp();
    return 1;
  }

  const files = collectFiles(patterns);
  if (files.length === 0) {
    console.log("No matching files found.");
    return 0;
  }

  let changedCount = 0;
  const cwd = process.cwd();

  for (const file of files) {
    try {
      const original = fs.readFileSync(file, "utf8");
      const ext = path.extname(file).toLowerCase();
      const isComponent = [".vue", ".svelte", ".astro"].includes(ext);

      const transformed = isComponent
        ? transformComponentDocument(original)
        : transformSourceCode(original);

      const relPath = path.relative(cwd, file) || file;
      if (transformed !== original) {
        changedCount++;
        if (isWrite) {
          fs.writeFileSync(file, transformed, "utf8");
          console.log(`[fixed] ${relPath}`);
        } else {
          console.log(`[check] ${relPath} needs optional chaining`);
        }
      }
    } catch (err) {
      console.error(`Error processing ${file}: ${err.message}`);
    }
  }

  if (isWrite) {
    if (changedCount === 0) {
      console.log("All matched files are already formatted.");
    } else {
      console.log(`Successfully formatted ${changedCount} file(s).`);
    }
    return 0;
  } else {
    if (changedCount === 0) {
      console.log("All matched files are clean.");
      return 0;
    } else {
      console.error(
        `\nFound ${changedCount} file(s) that need optional chaining. Run with '--write' to fix.`
      );
      return 1;
    }
  }
}

if (require.main === module) {
  const exitCode = runCLI(process.argv.slice(2));
  process.exit(exitCode);
}

module.exports = { runCLI, collectFiles, printHelp, getVersion };
