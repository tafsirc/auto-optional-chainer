/**
 * Auto Optional Chaining Extension
 * ------------------------------
 * This extension automatically adds optional chaining operators (?.) to property
 * accesses in JavaScript/TypeScript code. It helps prevent "Cannot read property
 * of undefined" errors by safely handling potentially undefined values.
 *
 * Features:
 * - Adds optional chaining on command palette/shortcut
 * - Can automatically apply on file save
 * - Smart handling of string literals and template strings
 * - Preserves existing optional chaining
 * - Ignores standard library objects
 *
 * Supported File Types:
 * - JavaScript (.js)
 * - TypeScript (.ts)
 * - JSX (.jsx)
 * - TSX (.tsx)
 */

import * as vscode from "vscode";
import {
  transformSourceCode,
  ignoredIdentifiers,
  processCodeSegment,
  splitByStringLiterals,
  Segment,
} from "./core/transformer";

// Re-export core transformer functions and types for consumers and tests
export {
  transformSourceCode,
  ignoredIdentifiers,
  processCodeSegment,
  splitByStringLiterals,
  Segment,
};

/**
 * Extension Activation Event
 * Called when the extension is activated by VS Code
 * Registers command palette action and file save handler
 * @param context The extension context provided by VS Code for registering disposables
 */
export function activate(context: vscode.ExtensionContext): void {
  // Register command for the command palette and keyboard shortcut
  // This enables users to manually trigger the optional chaining transformation
  const commandDisposable = vscode.commands.registerCommand(
    "AutoOptionalChainer.applyOptionalChaining",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor found");
        return;
      }
      const document = editor.document;
      if (isSupportedDocument(document)) {
        await applyOptionalChaining(document);
        vscode.window.showInformationMessage("Optional Chaining Applied");
      } else {
        vscode.window.showErrorMessage("File type not supported");
      }
    }
  );

  context.subscriptions.push(commandDisposable);

  // Register command to apply optional chaining only to selected text
  const selectionCommandDisposable = vscode.commands.registerCommand(
    "AutoOptionalChainer.applyToSelection",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor found");
        return;
      }
      const document = editor.document;
      if (!isSupportedDocument(document)) {
        vscode.window.showErrorMessage("File type not supported");
        return;
      }
      const selection = editor.selection;
      if (selection.isEmpty) {
        vscode.window.showInformationMessage("No text selected");
        return;
      }
      const selectedText = document.getText(selection);
      const customIgnored = getCustomIgnoredIdentifiers();
      const processed = transformSourceCode(selectedText, customIgnored);
      if (processed !== selectedText) {
        await editor.edit((editBuilder) => {
          editBuilder.replace(selection, processed);
        });
        vscode.window.showInformationMessage(
          "Optional Chaining Applied to Selection"
        );
      }
    }
  );

  context.subscriptions.push(selectionCommandDisposable);

  // Status Bar Item setup
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "AutoOptionalChainer.toggleApplyOnSave";
  context.subscriptions.push(statusBarItem);

  const updateStatusBar = (editor?: vscode.TextEditor): void => {
    if (!editor || !isSupportedDocument(editor.document)) {
      statusBarItem.hide();
      return;
    }
    const config = vscode.workspace.getConfiguration("autoOptionalChainer");
    const onSave = config.get<boolean>("applyOnSave", false);
    statusBarItem.text = onSave
      ? "$(check) AOC: Save"
      : "$(circle-slash) AOC: Manual";
    statusBarItem.tooltip = `Auto Optional Chainer: ${onSave ? "Auto-apply on Save" : "Manual trigger"} (Click to toggle)`;
    statusBarItem.show();
  };

  const toggleCommand = vscode.commands.registerCommand(
    "AutoOptionalChainer.toggleApplyOnSave",
    async () => {
      const config = vscode.workspace.getConfiguration("autoOptionalChainer");
      const current = config.get<boolean>("applyOnSave", false);
      await config.update(
        "applyOnSave",
        !current,
        vscode.ConfigurationTarget.Global
      );
      vscode.window.showInformationMessage(
        `Auto Optional Chainer: Auto on Save is now ${!current ? "Enabled" : "Disabled"}`
      );
      updateStatusBar(vscode.window.activeTextEditor);
    }
  );
  context.subscriptions.push(toggleCommand);

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(updateStatusBar),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("autoOptionalChainer")) {
        updateStatusBar(vscode.window.activeTextEditor);
      }
    })
  );

  updateStatusBar(vscode.window.activeTextEditor);

  // Register a listener for document save events
  // This enables automatic application of optional chaining when files are saved
  const onSaveDisposable = vscode.workspace.onDidSaveTextDocument(
    async (document) => {
      const config = vscode.workspace.getConfiguration("autoOptionalChainer");
      const applyOnSave = config.get<boolean>("applyOnSave");

      if (applyOnSave && isSupportedDocument(document)) {
        await applyOptionalChaining(document);
        // No need to show message on save to avoid spamming notifications
      }
    }
  );

  context.subscriptions.push(onSaveDisposable);
}

/**
 * Checks if the given document type is supported for optional chaining transformation
 * @param document The VS Code text document to check
 * @returns true if the document is a JavaScript or TypeScript file (including React variants)
 */
export function isSupportedDocument(document: vscode.TextDocument): boolean {
  const supportedLanguageIds: string[] = [
    "javascript",
    "typescript",
    "javascriptreact",
    "typescriptreact",
  ];
  return supportedLanguageIds.includes(document.languageId);
}

function getCustomIgnoredIdentifiers(): Set<string> {
  const config = vscode.workspace.getConfiguration("autoOptionalChainer");
  const list = config.get<string[]>("ignoredIdentifiers", []);
  return new Set(list);
}

export function deactivate(): void {}

/**
 * Main transformation function that applies optional chaining to a document
 *
 * @param document The VS Code text document to transform
 * @returns Promise that resolves when the transformation is complete
 */
export async function applyOptionalChaining(
  document: vscode.TextDocument
): Promise<void> {
  const originalText = document.getText();
  const customIgnored = getCustomIgnoredIdentifiers();
  const processed = transformSourceCode(originalText, customIgnored);

  // Skip if no changes were made to avoid unnecessary file updates
  if (processed === originalText) {
    return;
  }

  // Create a workspace edit to apply the changes
  const edit = new vscode.WorkspaceEdit();

  // Create a range that covers the entire document
  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(originalText.length)
  );

  // Replace the entire document content with the processed version
  edit.replace(document.uri, fullRange, processed);

  // Apply the edit to the document
  await vscode.workspace.applyEdit(edit);
}
