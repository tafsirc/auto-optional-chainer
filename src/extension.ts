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
  transformComponentDocument,
  ignoredIdentifiers,
  processCodeSegment,
  splitByStringLiterals,
  Segment,
  TransformerOptions,
} from "./core/transformer";

// Re-export core transformer functions and types for consumers and tests
export {
  transformSourceCode,
  transformComponentDocument,
  ignoredIdentifiers,
  processCodeSegment,
  splitByStringLiterals,
  Segment,
  TransformerOptions,
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
      const activeSelections = editor.selections.filter((s) => !s.isEmpty);
      if (activeSelections.length === 0) {
        vscode.window.showInformationMessage("No text selected");
        return;
      }
      const options = getTransformerOptions();
      const isComponent = ["vue", "svelte", "astro"].includes(
        document.languageId
      );

      let hasChanges = false;
      await editor.edit(
        (editBuilder) => {
          for (const sel of activeSelections) {
            const selectedText = document.getText(sel);
            const processed = isComponent
              ? transformComponentDocument(selectedText, options)
              : transformSourceCode(selectedText, options);
            if (processed !== selectedText) {
              editBuilder.replace(sel, processed);
              hasChanges = true;
            }
          }
        },
        { undoStopBefore: true, undoStopAfter: true }
      );
      if (hasChanges) {
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

  // Register a listener for pre-save document events
  // This enables automatic application of optional chaining before the file commits to disk
  const onWillSaveDisposable = vscode.workspace.onWillSaveTextDocument(
    (event) => {
      const config = vscode.workspace.getConfiguration("autoOptionalChainer");
      const applyOnSave = config.get<boolean>("applyOnSave", false);

      if (applyOnSave && isSupportedDocument(event.document)) {
        const edits = getDocumentTransformEdits(event.document);
        if (edits.length > 0) {
          event.waitUntil(Promise.resolve(edits));
        }
      }
    }
  );

  context.subscriptions.push(onWillSaveDisposable);

  // Register formatting providers so users can format documents with Shift+Alt+F or defaultFormatter
  const formattingProvider: vscode.DocumentFormattingEditProvider = {
    provideDocumentFormattingEdits(
      document: vscode.TextDocument
    ): vscode.TextEdit[] {
      return getDocumentTransformEdits(document);
    },
  };

  const rangeFormattingProvider: vscode.DocumentRangeFormattingEditProvider = {
    provideDocumentRangeFormattingEdits(
      document: vscode.TextDocument,
      range: vscode.Range
    ): vscode.TextEdit[] {
      return getDocumentRangeTransformEdits(document, range);
    },
  };

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      SUPPORTED_LANGUAGES,
      formattingProvider
    ),
    vscode.languages.registerDocumentRangeFormattingEditProvider(
      SUPPORTED_LANGUAGES,
      rangeFormattingProvider
    ),
    vscode.languages.registerCodeActionsProvider(
      SUPPORTED_LANGUAGES,
      new OptionalChainingCodeActionProvider(),
      {
        providedCodeActionKinds:
          OptionalChainingCodeActionProvider.providedCodeActionKinds,
      }
    )
  );
}

/**
 * List of supported language identifiers for optional chaining transformation
 */
export const SUPPORTED_LANGUAGES: string[] = [
  "javascript",
  "typescript",
  "javascriptreact",
  "typescriptreact",
  "vue",
  "svelte",
  "astro",
];

/**
 * Checks if the given document type is supported for optional chaining transformation
 * @param document The VS Code text document to check
 * @returns true if the document is a JavaScript or TypeScript file (including React variants)
 */
export function isSupportedDocument(document: vscode.TextDocument): boolean {
  return SUPPORTED_LANGUAGES.includes(document.languageId);
}

export function getTransformerOptions(): TransformerOptions {
  const config = vscode.workspace.getConfiguration("autoOptionalChainer");
  const list = config.get<string[]>("ignoredIdentifiers", []);
  const chainInvocations = config.get<boolean>(
    "chainOptionalInvocations",
    false
  );
  return {
    customIgnored: new Set(list),
    chainOptionalInvocations: chainInvocations,
  };
}

export function deactivate(): void {}

/**
 * Computes TextEdit array for transforming a specific range within a document
 *
 * @param document The VS Code text document
 * @param range The range within the document to transform
 * @returns Array of TextEdit operations to apply to the range
 */
export function getDocumentRangeTransformEdits(
  document: vscode.TextDocument,
  range: vscode.Range
): vscode.TextEdit[] {
  const selectedText = document.getText(range);
  const options = getTransformerOptions();
  const processed = transformSourceCode(selectedText, options);

  if (processed === selectedText) {
    return [];
  }

  return [vscode.TextEdit.replace(range, processed)];
}

/**
 * Computes minimal granular TextEdits by comparing original and transformed text line by line.
 * Replaces only lines that actually changed, preserving editor folding, cursor positioning,
 * and reducing strain on language servers.
 *
 * @param document The VS Code text document
 * @param originalText The original document text
 * @param processedText The transformed document text
 * @returns Array of minimal granular TextEdits
 */
export function computeGranularTextEdits(
  document: vscode.TextDocument,
  originalText: string,
  processedText: string
): vscode.TextEdit[] {
  if (originalText === processedText) {
    return [];
  }

  const isCrlf = originalText.includes("\r\n");
  const delimiter = isCrlf ? "\r\n" : "\n";
  const origLines = originalText.split(delimiter);
  const procLines = processedText.split(delimiter);

  // If line counts do not match, fall back to replacing the full document range
  if (origLines.length !== procLines.length) {
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(originalText.length)
    );
    return [vscode.TextEdit.replace(fullRange, processedText)];
  }

  const edits: vscode.TextEdit[] = [];
  for (let i = 0; i < origLines.length; i++) {
    if (origLines[i] !== procLines[i]) {
      const lineRange = new vscode.Range(
        new vscode.Position(i, 0),
        new vscode.Position(i, origLines[i].length)
      );
      edits.push(vscode.TextEdit.replace(lineRange, procLines[i]));
    }
  }

  return edits;
}

/**
 * Computes TextEdit array for transforming a document with optional chaining
 *
 * @param document The VS Code text document to transform
 * @returns Array of TextEdit operations to apply
 */
export function getDocumentTransformEdits(
  document: vscode.TextDocument
): vscode.TextEdit[] {
  const originalText = document.getText();
  const options = getTransformerOptions();
  const isComponent = ["vue", "svelte", "astro"].includes(document.languageId);
  const processed = isComponent
    ? transformComponentDocument(originalText, options)
    : transformSourceCode(originalText, options);

  return computeGranularTextEdits(document, originalText, processed);
}

/**
 * Main transformation function that applies optional chaining to a document
 *
 * @param document The VS Code text document to transform
 * @returns Promise that resolves when the transformation is complete
 */
export async function applyOptionalChaining(
  document: vscode.TextDocument
): Promise<void> {
  const edits = getDocumentTransformEdits(document);
  if (edits.length === 0) {
    return;
  }

  const visibleEditor = vscode.window.visibleTextEditors.find(
    (e) => e.document.uri.toString() === document.uri.toString()
  );

  if (visibleEditor) {
    await visibleEditor.edit(
      (editBuilder) => {
        for (const edit of edits) {
          editBuilder.replace(edit.range, edit.newText);
        }
      },
      { undoStopBefore: true, undoStopAfter: true }
    );
  } else {
    const wsEdit = new vscode.WorkspaceEdit();
    for (const edit of edits) {
      wsEdit.replace(document.uri, edit.range, edit.newText);
    }
    await vscode.workspace.applyEdit(wsEdit);
  }
}

/**
 * Quick Fix Code Action Provider for automatically inserting optional chaining (?.)
 * at compiler diagnostic locations (e.g. TS2532, TS18048, TS2533) or cursor/selection ranges.
 */
export class OptionalChainingCodeActionProvider
  implements vscode.CodeActionProvider
{
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    if (!isSupportedDocument(document)) {
      return [];
    }

    const actions: vscode.CodeAction[] = [];
    const options = getTransformerOptions();

    // 1. Diagnostics-driven Quick Fixes:
    // Match TypeScript diagnostics: TS2532, TS18048, TS2533, or null/undefined error messages
    const tsNullDiagnostics = (context.diagnostics || []).filter((d) => {
      const codeStr = String(d.code ?? "");
      const isTargetCode =
        codeStr === "2532" ||
        codeStr === "18048" ||
        codeStr === "2533" ||
        codeStr === "TS2532" ||
        codeStr === "TS18048" ||
        codeStr === "TS2533";
      const isTargetMessage =
        d.message.includes("possibly 'undefined'") ||
        d.message.includes("possibly 'null'") ||
        d.message.includes("is undefined") ||
        d.message.includes("is null");
      return isTargetCode || isTargetMessage;
    });

    for (const diagnostic of tsNullDiagnostics) {
      const line = document.lineAt(diagnostic.range.start.line);
      const lineText = line.text;
      const transformedLine = transformSourceCode(lineText, options);

      if (transformedLine !== lineText) {
        const action = new vscode.CodeAction(
          "Add optional chaining (?.)",
          vscode.CodeActionKind.QuickFix
        );
        action.edit = new vscode.WorkspaceEdit();
        action.edit.replace(document.uri, line.range, transformedLine);
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        actions.push(action);
      }
    }

    // 2. Selection or cursor range Quick Fix:
    // If invoked on member access without a specific compiler diagnostic
    if (actions.length === 0) {
      const targetRange = range.isEmpty
        ? document.lineAt(range.start.line).range
        : range;
      const text = document.getText(targetRange);
      const transformed = transformSourceCode(text, options);

      if (transformed !== text) {
        const action = new vscode.CodeAction(
          "Add optional chaining (?.)",
          vscode.CodeActionKind.QuickFix
        );
        action.edit = new vscode.WorkspaceEdit();
        action.edit.replace(document.uri, targetRange, transformed);
        action.isPreferred = true;
        actions.push(action);
      }
    }

    return actions;
  }
}
