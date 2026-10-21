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

// Import the vscode API which provides access to the VS Code extensibility API
import * as vscode from "vscode";

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
function isSupportedDocument(document: vscode.TextDocument): boolean {
  const supportedLanguageIds: string[] = [
    "javascript",
    "typescript",
    "javascriptreact",
    "typescriptreact",
  ];
  return supportedLanguageIds.includes(document.languageId);
}

export function deactivate(): void {}

// List of built-in JavaScript objects and commonly used globals
// These are skipped during optional chaining transformation to prevent unnecessary changes
const ignoredIdentifiers = new Set<string>([
  "console",
  "Math",
  "Number",
  "String",
  "Date",
  "React",
  "Object",
  "Array",
  "RegExp",
  "JSON",
]);

/**
 * Processes a code segment to add optional chaining operators
 * Handles complex cases like:
 * - Skipping property assignments (e.g., obj.prop = value)
 * - Preserving comparisons (e.g., obj.prop === value)
 * - Ignoring built-in objects (e.g., console.log)
 *
 * @param segment The code segment to process
 * @returns The processed code segment with optional chaining added
 *
 * Example:
 * Input:  user.profile.name
 * Output: user?.profile?.name
 */
export function processCodeSegment(segment: string): string {
  // First step: Identify all property assignments in the code
  // This prevents adding optional chaining to the left side of assignments
  const assignmentPositions = new Set<number>();
  const assignmentRegex = /\b\w+\.\w+\s*=(?!=)/g;
  let match;

  while ((match = assignmentRegex.exec(segment)) !== null) {
    assignmentPositions.add(match.index);
  }

  // Second step: Process each property access chain
  // Adds optional chaining while respecting assignments and ignored identifiers
  const dotAccessRegex = /(\b\w+)\.(\w+)/g;
  let result = segment;
  type PropertyMatch = {
    fullMatch: string;
    identifier: string;
    property: string;
    index: number;
    length: number;
  };
  const allMatches: PropertyMatch[] = [];

  // Collect all property access matches before processing
  // This allows us to handle nested property chains correctly
  while ((match = dotAccessRegex.exec(segment)) !== null) {
    allMatches.push({
      fullMatch: match[0],
      identifier: match[1],
      property: match[2],
      index: match.index,
      length: match[0].length,
    });
  }

  // Process matches from end to start to maintain correct string indices
  // This prevents index shifts from affecting subsequent replacements
  allMatches.reverse().forEach(({ fullMatch, identifier, property, index }) => {
    // Skip if this is part of an assignment or ignored identifier
    let isAssignment = false;
    assignmentPositions.forEach((pos) => {
      if (index >= pos && index <= pos + fullMatch.length) {
        isAssignment = true;
      }
    });

    if (!isAssignment && !ignoredIdentifiers.has(identifier)) {
      const before = result.slice(0, index);
      const after = result.slice(index + fullMatch.length);
      result = before + `${identifier}?.${property}` + after;
    }
  });

  return result;
}

/**
 * Splits source code into segments of code and string literals
 * Handles three types of string literals:
 * 1. Single quotes ('...')
 * 2. Double quotes ("...")
 * 3. Template literals (`...${expr}...`)
 *
 * For template literals, the interpolated expressions (${...})
 * are extracted and processed separately to allow optional chaining
 * within the expressions while preserving the string structure.
 *
 * Example:
 * Input:  const msg = `Hello ${user.profile.name}!`
 * Output: const msg = `Hello ${user?.profile?.name}!`
 */
export type Segment = {
  text: string;
  isCode: boolean;
  type?: "single" | "double" | "backtick";
};

export function splitByStringLiterals(text: string): Segment[] {
  const segments: Segment[] = [];
  let current = "";
  let state: "normal" | "single" | "double" | "backtick" = "normal";
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    // Main state machine for processing source code and string literals
    if (state === "normal") {
      if (char === '"' || char === "'" || char === "`") {
        // When we encounter a quote character while in normal code
        if (current) {
          // Push any accumulated code before the string starts
          segments.push({ text: current, isCode: true });
          current = "";
        }
        // Determine the type of string literal and switch state
        state = char === '"' ? "double" : char === "'" ? "single" : "backtick";
        current += char;
        i++;
      } else {
        // Continue accumulating normal code characters
        current += char;
        i++;
      }
    } else if (state === "single") {
      // Processing characters inside single-quoted string
      current += char;
      if (char === "\\") {
        // Handle escaped characters in single quotes
        // Example: 'It\'s a string'
        i++;
        if (i < text.length) {
          current += text[i];
        }
      } else if (char === "'") {
        // End of single-quoted string reached
        // Add the complete string as a non-code segment
        segments.push({ text: current, isCode: false, type: "single" });
        current = "";
        state = "normal";
      }
      i++;
    } else if (state === "double") {
      // Processing characters inside double-quoted string
      current += char;
      if (char === "\\") {
        // Handle escaped characters in double quotes
        // Example: "He said \"Hello\""
        i++;
        if (i < text.length) {
          current += text[i];
        }
      } else if (char === '"') {
        // End of double-quoted string reached
        segments.push({ text: current, isCode: false, type: "double" });
        current = "";
        state = "normal";
      }
      i++;
    } else if (state === "backtick") {
      // Processing characters inside template literal
      if (char === "\\") {
        current += char;
        i++;
        if (i < text.length) {
          current += text[i];
        }
        i++;
      } else if (char === "$" && text[i + 1] === "{") {
        // Found template literal interpolation ${...}
        if (current) {
          segments.push({ text: current, isCode: false, type: "backtick" });
          current = "";
        }
        segments.push({ text: "${", isCode: false, type: "backtick" });
        i += 2;
        // Track nested braces to handle complex expressions
        // Example: `${obj.method({key: value})}`
        let braceCount = 1;
        let codeSegment = "";
        while (i < text.length && braceCount > 0) {
          const c = text[i];
          if (c === "{") {
            // Handle nested object literals or blocks
            braceCount++;
          } else if (c === "}") {
            // Track closing braces to find end of interpolation
            braceCount--;
            if (braceCount === 0) {
              break;
            }
          }
          codeSegment += c;
          i++;
        }
        segments.push({ text: processCodeSegment(codeSegment), isCode: true });
        segments.push({ text: "}", isCode: false, type: "backtick" });
        i++;
      } else if (char === "`") {
        // End of template literal reached
        current += char;
        segments.push({ text: current, isCode: false, type: "backtick" });
        current = "";
        state = "normal";
        i++;
      } else {
        // Continue accumulating template literal content
        current += char;
        i++;
      }
    }
  }

  // Handle any remaining text after processing is complete
  if (current) {
    segments.push({
      text: current,
      isCode: state === "normal", // Only treat as code if we ended in normal state
      type: state === "normal" ? undefined : state, // Preserve string type if in a string
    });
  }
  return segments;
}

/**
 * Main transformation function that applies optional chaining to a document
 * This function orchestrates the entire transformation process in these steps:
 * 1. Extract document text
 * 2. Split into code/string segments
 * 3. Process code segments
 * 4. Reassemble and apply changes
 *
 * Handles:
 * - Code vs string literal separation
 * - Property access transformation
 * - Template literal interpolation
 * - Workspace edit application
 *
 * @param document The VS Code text document to transform
 * @returns Promise that resolves when the transformation is complete
 */
async function applyOptionalChaining(
  document: vscode.TextDocument
): Promise<void> {
  // Get the full text content of the document
  const originalText = document.getText();

  // Split the text into processable segments (code vs. strings)
  const segments = splitByStringLiterals(originalText);

  // Process each segment:
  // - Apply optional chaining to code segments
  // - Leave string segments unchanged
  const processed = segments
    .map((seg) => (seg.isCode ? processCodeSegment(seg.text) : seg.text))
    .join("");

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
