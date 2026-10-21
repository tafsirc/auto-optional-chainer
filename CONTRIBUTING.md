# Contributing to Auto Optional Chainer

Thank you for your interest in contributing to **Auto Optional Chainer**! We welcome contributions, bug fixes, feature requests, and improvements.

## Code of Conduct

Please note that this project is released with a [Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project, you agree to abide by its terms.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or v20 recommended)
- [npm](https://www.npmjs.com/)
- [Visual Studio Code](https://code.visualstudio.com/) (version 1.96.0 or higher)

### Setup

1. Fork the repository on GitHub.
2. Clone your fork locally:
   ```bash
   git clone https://github.com/<your-username>/auto-optional-chainer.git
   cd auto-optional-chainer
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

### Development Scripts

- **`npm run compile`**: Compiles TypeScript code from `src/` to `out/`.
- **`npm run watch`**: Compiles TypeScript in watch mode during development.
- **`npm run lint`**: Runs ESLint to check for code style and syntax issues.
- **`npm test`**: Runs the extension test suite.

### Debugging in VS Code

1. Open the project folder in VS Code.
2. Press `F5` (or go to **Run and Debug** $\rightarrow$ **Run Extension**).
3. A new **Extension Development Host** window will open with the extension loaded for testing.

## Making Changes

1. Create a new branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```
2. Make your changes in `src/`.
3. Verify that code builds, lints, and passes tests without errors:
   ```bash
   npm run lint
   npm test
   ```
4. Commit your changes with clear, descriptive commit messages.

## Submitting a Pull Request

1. Push your branch to your forked repository:
   ```bash
   git push -u origin feature/your-feature-name
   ```
2. Open a Pull Request against the `main` branch of the upstream repository (`tafsirc/auto-optional-chainer`).
3. Fill out the Pull Request template with details about your changes and link any related issues (e.g., `Closes #123`).
4. Wait for CI checks and code review. Address any feedback requested by maintainers.
