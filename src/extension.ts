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
 * of the form "identifier.property" with "identifier?.property",
 * unless the identifier is in the ignored list.
 */
function processCodeSegment(segment: string): string {
  let newSegment = segment;
  const regex: RegExp = /([a-zA-Z_]\w*)\.(\w+)/g;
  let replaced: string;
  do {
    replaced = newSegment;
    newSegment = replaced.replace(
      regex,
      (match: string, identifier: string, property: string) => {
        if (ignoredIdentifiers.includes(identifier)) {
          return match;
        }
        return `${identifier}?.${property}`;
      }
    );
  } while (newSegment !== replaced);
  return newSegment;
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
      // In backtick strings, handle template interpolation: ${ ... }
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
