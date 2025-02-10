# Auto Optional Chainer README

## Introduction

**Auto Optional Chainer** is a Visual Studio Code extension that automatically adds optional chaining (`?.`) in JavaScript and TypeScript code where needed. This helps prevent runtime errors caused by accessing properties on `undefined` or `null` values.

## Features

- Automatically inserts optional chaining in JavaScript and TypeScript files.
- Supports JSX and TSX files.
- Smart detection to avoid modifying console statements and built-in objects like `Math`.
- Preserves string literals and template literals while processing interpolated expressions inside them.
- Provides a quick command (`Apply Optional Chaining`) to process the active file.

## Usage

1. Open a JavaScript or TypeScript file in VS Code.
2. Run the command **"Apply Optional Chaining"** from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
3. The extension will update your code with optional chaining where applicable.

## Requirements

- **Visual Studio Code** version **1.97.0** or later.
- **Node.js** and **npm** for development and testing.

## Extension Settings

Currently, this extension does not provide configurable settings.

## Known Issues

- The extension does not distinguish between optional chaining needed for safe property access and cases where explicit error handling is preferable.
- Complex code structures with dynamically computed properties may not be fully processed.

## Release Notes

### 0.0.5

- Initial release of **AutoOptionalChainer**.
- Supports JavaScript, TypeScript, JSX, and TSX files.
- Processes code while preserving string literals and template interpolations.
- Skips `console` and `Math` object properties to prevent unnecessary modifications.

## Developer

Feel free to visit the [GitHub](https://github.com/ctafsiras) profile.

## License

MIT License

## Further Reading

- [Visual Studio Code API Documentation](https://code.visualstudio.com/api)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)

**Enjoy coding with AutoOptionalChainer!** 🚀
