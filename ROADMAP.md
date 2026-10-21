# Auto Optional Chainer Roadmap

This document outlines the planned vision, upcoming milestones, and architectural direction for **Auto Optional Chainer**.

## Current Release: v0.0.7
- [x] Automatic optional chaining insertion on command palette.
- [x] Configurable keyboard shortcut (`Ctrl+Shift+O` / `Cmd+Shift+O`).
- [x] Optional auto-apply on file save (`autoOptionalChainer.applyOnSave`).
- [x] String literal & template literal protection.
- [x] Multi-platform CI with cross-OS testing.

---

## Milestone 1: v0.1.0 — Enhanced Developer Controls
- [ ] **Selection-only transformation (`AutoOptionalChainer.applyToSelection`)**: Transform only highlighted lines.
- [ ] **Custom Ignored Identifiers**: User setting (`autoOptionalChainer.ignoredIdentifiers`) to ignore custom singletons or libraries.
- [ ] **Status Bar Indicator**: Visual indicator in VS Code status bar showing extension status and quick toggle.
- [ ] **Prettier & EditorConfig DX integration**: Standardized code formatting for contributors.

---

## Milestone 2: v0.2.0 — Framework & Syntax Expansion
- [ ] **Frontend Framework SFCs**: Support for `<script>` blocks in Vue (`.vue`), Svelte (`.svelte`), and Astro (`.astro`).
- [ ] **Method Call Chaining**: Support optional method call syntax (`obj.func() -> obj?.func?.()`).
- [ ] **Computed Property Chaining**: Safe bracket property access (`obj[key] -> obj?.[key]`).

---

## Milestone 3: v1.0.0 — Modern AST Engine & Web Extension
- [ ] **Babel / TypeScript AST Parser Engine**: Complete transition to AST traversal for 100% syntactic precision.
- [ ] **VS Code Web Extension**: Full compatibility with `vscode.dev` and `github.dev` browser environments.
- [ ] **Multi-root Workspace Configuration**: Project-specific rules and config overrides.

---

## Contributing to the Roadmap
Have ideas for features not listed here? Open an issue or join a discussion in [GitHub Discussions](https://github.com/tafsirc/auto-optional-chainer/discussions).
