/**
 * Core transformation module for Auto Optional Chainer
 * ----------------------------------------------------
 * Pure functions for property access transformation and string literal tokenization.
 * Completely independent of the VS Code API.
 */

import * as ts from "typescript";

// List of built-in JavaScript objects and commonly used globals
// These are skipped during optional chaining transformation to prevent unnecessary changes
export const ignoredIdentifiers = new Set<string>([
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
  "window",
  "document",
  "globalThis",
  "global",
  "process",
  "navigator",
  "location",
  "Promise",
  "Boolean",
  "Symbol",
  "Error",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Intl",
  "Reflect",
  "Proxy",
  "crypto",
  "super",
]);

/**
 * Options for configuring transformation behavior
 */
export interface TransformerOptions {
  customIgnored?: Set<string>;
  chainOptionalInvocations?: boolean;
}

function resolveTransformerOptions(
  customIgnoredOrOptions?: Set<string> | TransformerOptions,
  options?: TransformerOptions
): { customIgnored?: Set<string>; chainOptionalInvocations: boolean } {
  if (customIgnoredOrOptions instanceof Set) {
    return {
      customIgnored: customIgnoredOrOptions,
      chainOptionalInvocations: options?.chainOptionalInvocations ?? false,
    };
  }
  if (customIgnoredOrOptions && typeof customIgnoredOrOptions === "object") {
    return {
      customIgnored: customIgnoredOrOptions.customIgnored,
      chainOptionalInvocations:
        customIgnoredOrOptions.chainOptionalInvocations ??
        options?.chainOptionalInvocations ??
        false,
    };
  }
  return {
    customIgnored: options?.customIgnored,
    chainOptionalInvocations: options?.chainOptionalInvocations ?? false,
  };
}

/**
 * Processes a code segment to add optional chaining operators
 * Handles complex cases like:
 * - Nested property access (e.g., user.address.street -> user?.address?.street)
 * - Skipping property assignments (e.g., obj.prop = value)
 * - Preserving comparisons (e.g., obj.prop === value)
 * - Ignoring built-in objects (e.g., console.log)
 *
 * @param segment The code segment to process
 * @param customIgnoredOrOptions Optional set of custom identifiers to ignore or options object
 * @param options Optional configuration options
 * @returns The processed code segment with optional chaining added
 */
export function processCodeSegment(
  segment: string,
  customIgnoredOrOptions?: Set<string> | TransformerOptions,
  options?: TransformerOptions
): string {
  const { customIgnored, chainOptionalInvocations } = resolveTransformerOptions(
    customIgnoredOrOptions,
    options
  );
  const activeIgnored = customIgnored
    ? new Set([...ignoredIdentifiers, ...customIgnored])
    : ignoredIdentifiers;

  const source = ts.createSourceFile(
    "segment.tsx",
    segment,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const insertions = new Map<number, string>();

  // Walk the parsed syntax so type nodes, JSX tag names, and literals are never
  // mistaken for runtime property accesses. Insertions preserve all source trivia.
  const isWriteTarget = (node: ts.Node): boolean => {
    let target = node;
    while (
      target.parent &&
      (ts.isPropertyAccessExpression(target.parent) ||
        ts.isElementAccessExpression(target.parent)) &&
      target.parent.expression === target
    ) {
      target = target.parent;
    }
    const parent = target.parent;
    return (
      !!parent &&
      ((ts.isBinaryExpression(parent) &&
        parent.left === target &&
        parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment) ||
        (ts.isPrefixUnaryExpression(parent) &&
          (parent.operator === ts.SyntaxKind.PlusPlusToken ||
            parent.operator === ts.SyntaxKind.MinusMinusToken)) ||
        (ts.isPostfixUnaryExpression(parent) &&
          (parent.operator === ts.SyntaxKind.PlusPlusToken ||
            parent.operator === ts.SyntaxKind.MinusMinusToken)))
    );
  };

  const isConstructorTarget = (node: ts.Node): boolean => {
    let target = node;
    while (
      target.parent &&
      (ts.isPropertyAccessExpression(target.parent) ||
        ts.isElementAccessExpression(target.parent)) &&
      target.parent.expression === target
    ) {
      target = target.parent;
    }
    return (
      !!target.parent &&
      ts.isNewExpression(target.parent) &&
      target.parent.expression === target
    );
  };

  const isHeritageExpression = (node: ts.Node): boolean => {
    let current: ts.Node | undefined = node;
    while (current && current !== source) {
      if (
        ts.isExpressionWithTypeArguments(current) &&
        current.parent &&
        ts.isHeritageClause(current.parent)
      ) {
        return true;
      }
      current = current.parent;
    }
    return false;
  };

  const baseExpression = (node: ts.Expression): ts.Expression => {
    let current = node;
    while (
      ts.isPropertyAccessExpression(current) ||
      ts.isElementAccessExpression(current) ||
      ts.isCallExpression(current)
    ) {
      current = current.expression;
    }
    return current;
  };

  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxOpeningElement(node) ||
        ts.isJsxClosingElement(node) ||
        ts.isJsxSelfClosingElement(node)) &&
      node.tagName
    ) {
      // A namespaced JSX tag is syntax, not a property read.
      node.forEachChild((child) => {
        if (child !== node.tagName) {
          visit(child);
        }
      });
      return;
    }
    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      const expression = node.expression;
      const root = baseExpression(expression);
      const ignoredRoot =
        (ts.isIdentifier(root) &&
          activeIgnored.has(root.text) &&
          !ts.isCallExpression(expression)) ||
        (root.kind === ts.SyntaxKind.ThisKeyword &&
          expression === root &&
          activeIgnored.has("this"));
      const superRoot = root.kind === ts.SyntaxKind.SuperKeyword;
      const hasSuperCall =
        superRoot &&
        (() => {
          let current: ts.Expression = expression;
          while (
            ts.isPropertyAccessExpression(current) ||
            ts.isElementAccessExpression(current) ||
            ts.isCallExpression(current)
          ) {
            if (ts.isCallExpression(current)) {
              return true;
            }
            current = current.expression;
          }
          return false;
        })();

      if (
        !node.questionDotToken &&
        !ignoredRoot &&
        (!superRoot || hasSuperCall) &&
        !isWriteTarget(node) &&
        !isConstructorTarget(node) &&
        !isHeritageExpression(node)
      ) {
        if (ts.isPropertyAccessExpression(node)) {
          const dot = segment.lastIndexOf(".", node.name.getStart(source) - 1);
          if (dot >= expression.end && dot >= 0) {
            insertions.set(dot, "?");
          }
        } else if (!ts.isNumericLiteral(node.argumentExpression)) {
          // Computed keys are valid optional accesses too.
          const bracket = segment.indexOf("[", expression.end);
          if (bracket !== -1 && bracket < node.end) {
            insertions.set(bracket, "?.");
          }
        }
      }
    }

    if (
      chainOptionalInvocations &&
      ts.isCallExpression(node) &&
      (ts.isPropertyAccessExpression(node.expression) ||
        ts.isElementAccessExpression(node.expression)) &&
      !node.questionDotToken &&
      !isConstructorTarget(node.expression) &&
      !isHeritageExpression(node) &&
      baseExpression(node.expression).kind !== ts.SyntaxKind.SuperKeyword
    ) {
      const callee = node.expression;
      const root = baseExpression(callee);
      if (!(ts.isIdentifier(root) && activeIgnored.has(root.text))) {
        const paren = segment.indexOf("(", callee.end);
        if (paren !== -1 && paren < node.end) {
          insertions.set(paren, "?.");
        }
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(source);

  let transformed = segment;
  for (const [position, text] of [...insertions].sort((a, b) => b[0] - a[0])) {
    transformed =
      transformed.slice(0, position) + text + transformed.slice(position);
  }
  return transformed;
}

export type Segment = {
  text: string;
  isCode: boolean;
  type?: "single" | "double" | "backtick" | "comment" | "regex";
};

/**
 * Splits source code into segments of code and string literals
 */
export function splitByStringLiterals(text: string): Segment[] {
  const segments: Segment[] = [];
  let current = "";
  let state:
    | "normal"
    | "single"
    | "double"
    | "backtick"
    | "lineComment"
    | "blockComment"
    | "regex" = "normal";
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (state === "normal") {
      if (char === "/" && text[i + 1] === "/") {
        if (current) {
          segments.push({ text: current, isCode: true });
          current = "";
        }
        state = "lineComment";
        current += "//";
        i += 2;
      } else if (char === "/" && text[i + 1] === "*") {
        if (current) {
          segments.push({ text: current, isCode: true });
          current = "";
        }
        state = "blockComment";
        current += "/*";
        i += 2;
      } else if (char === '"' || char === "'" || char === "`") {
        if (current) {
          segments.push({ text: current, isCode: true });
          current = "";
        }
        state = char === '"' ? "double" : char === "'" ? "single" : "backtick";
        current += char;
        i++;
      } else if (
        char === "/" &&
        (i === 0 || /[=(:,;!&|?+\-*~^%]\s*$/.test(current))
      ) {
        if (current) {
          segments.push({ text: current, isCode: true });
          current = "";
        }
        state = "regex";
        current += char;
        i++;
      } else {
        current += char;
        i++;
      }
    } else if (state === "lineComment") {
      current += char;
      if (char === "\n") {
        segments.push({ text: current, isCode: false, type: "comment" });
        current = "";
        state = "normal";
      }
      i++;
    } else if (state === "blockComment") {
      current += char;
      if (char === "*" && text[i + 1] === "/") {
        current += "/";
        segments.push({ text: current, isCode: false, type: "comment" });
        current = "";
        state = "normal";
        i += 2;
      } else {
        i++;
      }
    } else if (state === "regex") {
      current += char;
      if (char === "\\") {
        i++;
        if (i < text.length) {
          current += text[i];
        }
      } else if (char === "/") {
        i++;
        while (i < text.length && /[a-z]/i.test(text[i])) {
          current += text[i];
          i++;
        }
        segments.push({ text: current, isCode: false, type: "regex" });
        current = "";
        state = "normal";
        continue;
      }
      i++;
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
    let finalType: Segment["type"] = undefined;
    if (state === "lineComment" || state === "blockComment") {
      finalType = "comment";
    } else if (state !== "normal") {
      finalType = state;
    }
    segments.push({
      text: current,
      isCode: state === "normal",
      type: finalType,
    });
  }
  return segments;
}

/**
 * Transforms full source code string by inserting optional chaining operators
 * while preserving string literals and ignored identifiers.
 *
 * @param source Source code text
 * @param customIgnoredOrOptions Optional set of custom identifiers to ignore or options object
 * @param options Optional configuration options
 * @returns Transformed source code string
 */
export function transformSourceCode(
  source: string,
  customIgnoredOrOptions?: Set<string> | TransformerOptions,
  options?: TransformerOptions
): string {
  const resolved = resolveTransformerOptions(customIgnoredOrOptions, options);
  const segments = splitByStringLiterals(source);
  return segments
    .map((seg) =>
      seg.isCode ? processCodeSegment(seg.text, resolved) : seg.text
    )
    .join("");
}

/**
 * Transforms Vue, Svelte, or Astro component files by applying optional chaining
 * specifically within <script> blocks while preserving templates and styles.
 *
 * @param source Component source code
 * @param customIgnoredOrOptions Optional set of custom identifiers to ignore or options object
 * @param options Optional configuration options
 * @returns Transformed component code
 */
export function transformComponentDocument(
  source: string,
  customIgnoredOrOptions?: Set<string> | TransformerOptions,
  options?: TransformerOptions
): string {
  const resolved = resolveTransformerOptions(customIgnoredOrOptions, options);
  // Support Astro frontmatter delimited by ---
  const frontmatterRegex = /^(---\r?\n)([\s\S]*?)(\r?\n---)/;
  let transformed = source.replace(
    frontmatterRegex,
    (_match, openTag: string, frontmatterBody: string, closeTag: string) => {
      const transformedBody = transformSourceCode(frontmatterBody, resolved);
      return `${openTag}${transformedBody}${closeTag}`;
    }
  );

  const scriptRegex = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi;
  transformed = transformed.replace(
    scriptRegex,
    (_match, openTag: string, scriptBody: string, closeTag: string) => {
      const transformedScript = transformSourceCode(scriptBody, resolved);
      return `${openTag}${transformedScript}${closeTag}`;
    }
  );

  return transformed;
}
