import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(
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

  context.subscriptions.push(disposable);
}

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

// Array of identifiers to ignore during the replacement.
const ignoredIdentifiers: string[] = [
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
];

/**
 * Processes a code segment by iteratively replacing property accesses
 * but skips assignments while keeping comparisons.
 */
function processCodeSegment(segment: string): string {
  // First step: Find all assignments
  const assignmentPositions = new Set<number>();
  const assignmentRegex = /\b\w+\.\w+\s*=(?!=)/g;
  let match;

  while ((match = assignmentRegex.exec(segment)) !== null) {
    assignmentPositions.add(match.index);
  }

  // Second step: Process property accesses
  const dotAccessRegex = /(\b\w+)\.(\w+)/g;
  let result = segment;
  let allMatches = [];

  // Collect all matches first
  while ((match = dotAccessRegex.exec(segment)) !== null) {
    allMatches.push({
      fullMatch: match[0],
      identifier: match[1],
      property: match[2],
      index: match.index,
      length: match[0].length,
    });
  }

  // Process matches in reverse order to maintain indices
  allMatches.reverse().forEach(({ fullMatch, identifier, property, index }) => {
    // Skip if this is part of an assignment or ignored identifier
    let isAssignment = false;
    assignmentPositions.forEach((pos) => {
      if (index >= pos && index <= pos + fullMatch.length) {
        isAssignment = true;
      }
    });

    if (!isAssignment && !ignoredIdentifiers.includes(identifier)) {
      const before = result.slice(0, index);
      const after = result.slice(index + fullMatch.length);
      result = before + `${identifier}?.${property}` + after;
    }
  });

  return result;
}

/**
 * Splits the input text into segments that are either code or string literals.
 * For backtick (template) literals, interpolation blocks (${ ... }) are split out
 * so that their code is processed separately.
 */
type Segment = {
  text: string;
  isCode: boolean;
  type?: "single" | "double" | "backtick";
};

function splitByStringLiterals(text: string): Segment[] {
  const segments: Segment[] = [];
  let current = "";
  let state: "normal" | "single" | "double" | "backtick" = "normal";
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (state === "normal") {
      if (char === '"' || char === "'" || char === "`") {
        if (current) {
          segments.push({ text: current, isCode: true });
          current = "";
        }
        state = char === '"' ? "double" : char === "'" ? "single" : "backtick";
        current += char;
        i++;
      } else {
        current += char;
        i++;
      }
    } else if (state === "single") {
      current += char;
      if (char === "\\") {
        i++;
        if (i < text.length) {
          current += text[i];
        }
      } else if (char === "'") {
        segments.push({ text: current, isCode: false, type: "single" });
        current = "";
        state = "normal";
      }
      i++;
    } else if (state === "double") {
      current += char;
      if (char === "\\") {
        i++;
        if (i < text.length) {
          current += text[i];
        }
      } else if (char === '"') {
        segments.push({ text: current, isCode: false, type: "double" });
        current = "";
        state = "normal";
      }
      i++;
    } else if (state === "backtick") {
      if (char === "\\") {
        current += char;
        i++;
        if (i < text.length) {
          current += text[i];
        }
        i++;
      } else if (char === "$" && text[i + 1] === "{") {
        if (current) {
          segments.push({ text: current, isCode: false, type: "backtick" });
          current = "";
        }
        segments.push({ text: "${", isCode: false, type: "backtick" });
        i += 2;
        let braceCount = 1;
        let codeSegment = "";
        while (i < text.length && braceCount > 0) {
          const c = text[i];
          if (c === "{") {
            braceCount++;
          } else if (c === "}") {
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
        current += char;
        segments.push({ text: current, isCode: false, type: "backtick" });
        current = "";
        state = "normal";
        i++;
      } else {
        current += char;
        i++;
      }
    }
  }

  if (current) {
    segments.push({
      text: current,
      isCode: state === "normal",
      type: state === "normal" ? undefined : state,
    });
  }
  return segments;
}

/**
 * Applies optional chaining to property accesses in the document,
 * but skips normal string literals while still processing code inside
 * template literal interpolations.
 */
async function applyOptionalChaining(
  document: vscode.TextDocument
): Promise<void> {
  const originalText = document.getText();
  const segments = splitByStringLiterals(originalText);
  const processed = segments
    .map((seg) => (seg.isCode ? processCodeSegment(seg.text) : seg.text))
    .join("");

  if (processed === originalText) {
    return;
  }

  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(originalText.length)
  );
  edit.replace(document.uri, fullRange, processed);
  await vscode.workspace.applyEdit(edit);
}
