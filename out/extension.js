"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
function activate(context) {
    // Command registration for palette and shortcut
    const commandDisposable = vscode.commands.registerCommand("AutoOptionalChainer.applyOptionalChaining", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage("No active editor found");
            return;
        }
        const document = editor.document;
        if (isSupportedDocument(document)) {
            await applyOptionalChaining(document);
            vscode.window.showInformationMessage("Optional Chaining Applied");
        }
        else {
            vscode.window.showErrorMessage("File type not supported");
        }
    });
    context.subscriptions.push(commandDisposable);
    // Register onSave listener
    const onSaveDisposable = vscode.workspace.onDidSaveTextDocument(async (document) => {
        const config = vscode.workspace.getConfiguration("autoOptionalChainer");
        const applyOnSave = config.get("applyOnSave");
        if (applyOnSave && isSupportedDocument(document)) {
            await applyOptionalChaining(document);
            // No need to show message on save to avoid spamming notifications
        }
    });
    context.subscriptions.push(onSaveDisposable);
}
function isSupportedDocument(document) {
    const supportedLanguageIds = [
        "javascript",
        "typescript",
        "javascriptreact",
        "typescriptreact",
    ];
    return supportedLanguageIds.includes(document.languageId);
}
function deactivate() { }
// Array of identifiers to ignore during the replacement.
const ignoredIdentifiers = [
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
function processCodeSegment(segment) {
    // First step: Find all assignments
    const assignmentPositions = new Set();
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
function splitByStringLiterals(text) {
    const segments = [];
    let current = "";
    let state = "normal";
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
            }
            else {
                current += char;
                i++;
            }
        }
        else if (state === "single") {
            current += char;
            if (char === "\\") {
                i++;
                if (i < text.length) {
                    current += text[i];
                }
            }
            else if (char === "'") {
                segments.push({ text: current, isCode: false, type: "single" });
                current = "";
                state = "normal";
            }
            i++;
        }
        else if (state === "double") {
            current += char;
            if (char === "\\") {
                i++;
                if (i < text.length) {
                    current += text[i];
                }
            }
            else if (char === '"') {
                segments.push({ text: current, isCode: false, type: "double" });
                current = "";
                state = "normal";
            }
            i++;
        }
        else if (state === "backtick") {
            if (char === "\\") {
                current += char;
                i++;
                if (i < text.length) {
                    current += text[i];
                }
                i++;
            }
            else if (char === "$" && text[i + 1] === "{") {
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
                    }
                    else if (c === "}") {
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
            }
            else if (char === "`") {
                current += char;
                segments.push({ text: current, isCode: false, type: "backtick" });
                current = "";
                state = "normal";
                i++;
            }
            else {
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
async function applyOptionalChaining(document) {
    const originalText = document.getText();
    const segments = splitByStringLiterals(originalText);
    const processed = segments
        .map((seg) => (seg.isCode ? processCodeSegment(seg.text) : seg.text))
        .join("");
    if (processed === originalText) {
        return;
    }
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(originalText.length));
    edit.replace(document.uri, fullRange, processed);
    await vscode.workspace.applyEdit(edit);
}
//# sourceMappingURL=extension.js.map