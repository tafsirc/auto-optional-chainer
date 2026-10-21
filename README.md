# Auto Optional Chainer

<p align="center">
  <img src="assets/logo.png" alt="Auto Optional Chainer" width="128" />
</p>

<p align="center">
  <a href="https://github.com/tafsirc/auto-optional-chainer/actions/workflows/ci.yml"><img src="https://github.com/tafsirc/auto-optional-chainer/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" /></a>
</p>

## Introduction

**Auto Optional Chainer** is a Visual Studio Code extension that automatically adds optional chaining (`?.`) in JavaScript and TypeScript code where needed. This helps prevent runtime errors caused by accessing properties on `undefined` or `null` values.

## Features

- Automatically inserts optional chaining in JavaScript and TypeScript files.
- Supports JSX and TSX files.
- Smart detection to avoid modifying console statements and built-in objects (`Math`, `Number`, `String`, `Date`, `React`, `Object`, `Array`, `RegExp`, `JSON`).
- Preserves string literals and template literals while processing interpolated expressions inside them.
- Provides a quick command (`Apply Optional Chaining`) to process the active file.
- Optional auto-apply on file save.
- Configurable keyboard shortcut (Ctrl+Shift+O / Cmd+Shift+O).

## Usage

1. Open a JavaScript or TypeScript file in VS Code.
2. Run the command **"Apply Optional Chaining"** from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
3. The extension will update your code with optional chaining where applicable.

## Requirements

- **Visual Studio Code** version **1.96.0** or later.
- **Node.js** and **npm** for development and testing.

## Configuration

This extension provides the following settings:

- `autoOptionalChainer.applyOnSave`: Enable/disable automatic application of optional chaining when saving supported files.
- `autoOptionalChainer.enableShortcut`: Enable/disable keyboard shortcut (Ctrl+Shift+O / Cmd+Shift+O) for applying optional chaining.

To modify these settings:

1. Open VS Code Settings (Ctrl+,)
2. Search for "Auto Optional Chainer"
3. Toggle the desired options

## Known Issues

- The extension does not distinguish between optional chaining needed for safe property access and cases where explicit error handling is preferable.
- Complex code structures with dynamically computed properties may not be fully processed.
- Template literals with nested interpolations might require multiple passes for complete processing.

## Release Notes

### 0.0.7

- Initial release of **AutoOptionalChainer**.
- Supports JavaScript, TypeScript, JSX, and TSX files.
- Processes code while preserving string literals and template interpolations.
- Extended list of ignored identifiers to prevent unnecessary modifications.
- Added configuration options for auto-apply on save and keyboard shortcuts.
- Implemented keyboard shortcut support (Ctrl+Shift+O / Cmd+Shift+O).

## Developer

Feel free to visit the [GitHub](https://github.com/tafsirc) profile.

## License

MIT License

## Further Reading

- [Visual Studio Code API Documentation](https://code.visualstudio.com/api)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)

**Enjoy coding with AutoOptionalChainer!** 🚀
