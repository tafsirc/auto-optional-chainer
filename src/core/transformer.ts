/**
 * Core transformation module for Auto Optional Chainer
 * ----------------------------------------------------
 * Pure functions for property access transformation and string literal tokenization.
 * Completely independent of the VS Code API.
 */

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
 * Processes a code segment to add optional chaining operators
 * Handles complex cases like:
 * - Nested property access (e.g., user.address.street -> user?.address?.street)
 * - Skipping property assignments (e.g., obj.prop = value)
 * - Preserving comparisons (e.g., obj.prop === value)
 * - Ignoring built-in objects (e.g., console.log)
 *
 * @param segment The code segment to process
 * @param customIgnored Optional set of custom identifiers to ignore
 * @returns The processed code segment with optional chaining added
 */
export function processCodeSegment(
  segment: string,
  customIgnored?: Set<string>
): string {
  const activeIgnored = customIgnored
    ? new Set([...ignoredIdentifiers, ...customIgnored])
    : ignoredIdentifiers;

  let current = segment;
  let previous = "";

  // Iteratively process chained properties (e.g., a.b.c -> a?.b?.c)
  while (current !== previous) {
    previous = current;

    // Identify all property assignments (standard and compound) in the code as ranges
    const assignmentRanges: Array<{ start: number; end: number }> = [];
    const assignmentRegex =
      /(?:\b[\w$]+(?:\s*\[[^\]]+\]|\([^)]*\))*\s*\.)+\s*[\w$]+\s*(?:\+|-|\*\*|\*|\/|%|<<|>>>|>>|&&|&|\|\||\||\^|\?\?)?=(?!=)/g;
    let match: RegExpExecArray | null;

    while ((match = assignmentRegex.exec(current)) !== null) {
      assignmentRanges.push({
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    // Identify update expressions (increment and decrement) in the code as ranges
    // Optional chaining is invalid on the target of an update expression (ECMA-262)
    const updateRanges: Array<{ start: number; end: number }> = [];
    const postfixUpdateRegex =
      /(?:\b[\w$]+(?:\s*\[[^\]]+\]|\([^)]*\))*\s*\.)+\s*[\w$]+\s*(?:\+\+|--)/g;
    while ((match = postfixUpdateRegex.exec(current)) !== null) {
      updateRanges.push({
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    const prefixUpdateRegex =
      /(?<![+\-])(?:\+\+|--)\s*((?:\b[\w$]+(?:\s*\[[^\]]+\]|\([^)]*\))*\s*\.)+\s*[\w$]+)/g;
    while ((match = prefixUpdateRegex.exec(current)) !== null) {
      updateRanges.push({
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    // Identify class extends expressions
    // Optional chaining is invalid in class extends / heritage clauses (ECMA-262)
    const classExtendsRanges: Array<{ start: number; end: number }> = [];
    const extendsRegex =
      /\bextends\s*(?:\(\s*)?([\w$]+(?:\s*\[[^\]]*\]|\s*\.\s*[\w$]+)*)/g;
    while ((match = extendsRegex.exec(current)) !== null) {
      const offset = match[0].indexOf(match[1]);
      const start = match.index + offset;
      classExtendsRanges.push({
        start,
        end: start + match[1].length,
      });
    }

    // Identify TypeScript type annotation contexts
    // Types represent static compile-time contracts and cannot contain optional chaining
    const typeAnnotationRanges: Array<{ start: number; end: number }> = [];

    // 1. "as" and "satisfies" assertions: expr as Namespace.Type, expr satisfies Namespace.Type
    const asSatisfiesRegex =
      /\b(?:as|satisfies)\s+([A-Za-z_$][\w$]*(?:\s*\.\s*[\w$]+)+)/g;
    while ((match = asSatisfiesRegex.exec(current)) !== null) {
      const offset = match[0].indexOf(match[1]);
      const start = match.index + offset;
      typeAnnotationRanges.push({ start, end: start + match[1].length });
    }

    // 2. Type predicate: x is Namespace.Type
    const isTypeRegex = /\bis\s+([A-Za-z_$][\w$]*(?:\s*\.\s*[\w$]+)+)/g;
    while ((match = isTypeRegex.exec(current)) !== null) {
      const offset = match[0].indexOf(match[1]);
      const start = match.index + offset;
      typeAnnotationRanges.push({ start, end: start + match[1].length });
    }

    // 3. Whole "type" alias definitions: type X = ...;
    const typeAliasRegex =
      /\btype\s+[A-Za-z_$][\w$]*(?:<[^>]*>)?\s*=\s*([^;]+)(?:;|\n|$)/g;
    while ((match = typeAliasRegex.exec(current)) !== null) {
      typeAnnotationRanges.push({
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    // 4. Whole "interface" definitions: interface X { ... }
    const interfaceRegex =
      /\binterface\s+[A-Za-z_$][\w$]*(?:<[^>]*>)?(?:\s+extends\s+[^{]+)?\s*\{[\s\S]*?\}/g;
    while ((match = interfaceRegex.exec(current)) !== null) {
      typeAnnotationRanges.push({
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    // 5. Generic type arguments: <...Namespace.Type...> attached to an identifier or after a generic
    const genericCallRegex = /(?:[A-Za-z_$][\w$]*|>\s*)\s*<([^{};=]+)>/g;
    while ((match = genericCallRegex.exec(current)) !== null) {
      const inner = match[1];
      if (!/[=+\/*%&|^!]|(?:if|return|while|for)/.test(inner)) {
        const typeRefRegex = /\b([A-Za-z_$][\w$]*(?:\s*\.\s*[\w$]+)+)/g;
        let innerMatch: RegExpExecArray | null;
        const baseOffset = match.index + match[0].indexOf(inner);
        while ((innerMatch = typeRefRegex.exec(inner)) !== null) {
          typeAnnotationRanges.push({
            start: baseOffset + innerMatch.index,
            end: baseOffset + innerMatch.index + innerMatch[0].length,
          });
        }
      }
    }

    // 6. Variable declarations with explicit type annotations: const/let/var x: Namespace.Type
    const varTypeRegex =
      /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*:\s*([A-Za-z_$][\w$]*(?:\s*\.\s*[\w$]+)+)/g;
    while ((match = varTypeRegex.exec(current)) !== null) {
      const offset = match[0].indexOf(match[1]);
      const start = match.index + offset;
      typeAnnotationRanges.push({ start, end: start + match[1].length });
    }

    // 7. Member property declarations with access modifiers: public/private/protected/readonly/static x: Namespace.Type
    const memberTypeRegex =
      /\b(?:public|private|protected|readonly|static)\s+(?:readonly\s+)?[A-Za-z_$][\w$]*\s*\??:\s*([A-Za-z_$][\w$]*(?:\s*\.\s*[\w$]+)+)/g;
    while ((match = memberTypeRegex.exec(current)) !== null) {
      const offset = match[0].indexOf(match[1]);
      const start = match.index + offset;
      typeAnnotationRanges.push({ start, end: start + match[1].length });
    }

    // 8. Function return types: ): Namespace.Type
    const returnTypeRegex = /\)\s*:\s*([A-Za-z_$][\w$]*(?:\s*\.\s*[\w$]+)+)/g;
    while ((match = returnTypeRegex.exec(current)) !== null) {
      const offset = match[0].indexOf(match[1]);
      const start = match.index + offset;
      typeAnnotationRanges.push({ start, end: start + match[1].length });
    }

    // 9. Function parameter types: (x: Namespace.Type) or (x?: Namespace.Type)
    const colonTypeRegex = /:\s*([A-Za-z_$][\w$]*(?:\s*\.\s*[\w$]+)+)/g;
    while ((match = colonTypeRegex.exec(current)) !== null) {
      const colonIndex = match.index;
      const typeStart = colonIndex + match[0].indexOf(match[1]);
      const typeLen = match[1].length;

      const stack: string[] = [];
      for (let i = 0; i < colonIndex; i++) {
        const ch = current[i];
        if (ch === "(" || ch === "{" || ch === "[") {
          stack.push(ch);
        } else if (ch === ")") {
          if (stack[stack.length - 1] === "(") {
            stack.pop();
          }
        } else if (ch === "}") {
          if (stack[stack.length - 1] === "{") {
            stack.pop();
          }
        } else if (ch === "]") {
          if (stack[stack.length - 1] === "[") {
            stack.pop();
          }
        }
      }

      if (stack.length > 0 && stack[stack.length - 1] === "(") {
        let isTernary = false;
        let depth = 0;
        for (let i = colonIndex - 1; i >= 0; i--) {
          const ch = current[i];
          if (ch === ")" || ch === "}" || ch === "]") {
            depth++;
          } else if (ch === "(" || ch === "{" || ch === "[") {
            if (depth === 0) {
              break;
            }
            depth--;
          } else if (depth === 0 && (ch === "," || ch === ";")) {
            break;
          } else if (ch === "?" && depth === 0) {
            const between = current.slice(i + 1, colonIndex).trim();
            if (between.length > 0) {
              isTernary = true;
            }
            break;
          }
        }

        if (!isTernary) {
          typeAnnotationRanges.push({
            start: typeStart,
            end: typeStart + typeLen,
          });
        }
      }
    }

    // Identify target constructor expressions in 'new' invocations
    // Optional chaining is invalid in the callee of a new expression (ECMA-262)
    const newExpressionRanges: Array<{ start: number; end: number }> = [];
    const newRegex = /\bnew\s+([\w$]+(?:\s*\[[^\]]*\]|\s*\.\s*[\w$]+)*)/g;

    while ((match = newRegex.exec(current)) !== null) {
      if (match[1] === "target") {
        continue;
      }
      const constructorOffset = match[0].indexOf(match[1]);
      const start = match.index + constructorOffset;
      newExpressionRanges.push({
        start,
        end: start + match[1].length,
      });
    }

    // Identify JSX namespaced tag names (e.g. <Modal.Header> and </Modal.Header>)
    // Component names in JSX cannot have optional chaining inserted
    const jsxTagRanges: Array<{ start: number; end: number }> = [];
    const jsxOpenTagRegex =
      /(?:^|[^\w$<=])<\s*([A-Za-z_$][\w$]*(?:\s*\.\s*[\w$]+)+)(?=[\s/>])/g;

    while ((match = jsxOpenTagRegex.exec(current)) !== null) {
      const offset = match[0].indexOf(match[1]);
      const start = match.index + offset;
      jsxTagRanges.push({
        start,
        end: start + match[1].length,
      });
    }

    const jsxCloseTagRegex = /<\/\s*([A-Za-z_$][\w$]*(?:\s*\.\s*[\w$]+)+)\s*>/g;

    while ((match = jsxCloseTagRegex.exec(current)) !== null) {
      const offset = match[0].indexOf(match[1]);
      const start = match.index + offset;
      jsxTagRanges.push({
        start,
        end: start + match[1].length,
      });
    }

    // Process property access (supporting word characters, brackets, parentheses, and meta-properties before the dot)
    const dotAccessRegex =
      /((\bimport\s*\.\s*meta|\bnew\s*\.\s*target|\b\w+|\)|\]))\s*\.\s*(\w+)/g;
    type PropertyMatch = {
      fullMatch: string;
      prefix: string;
      property: string;
      index: number;
      length: number;
    };
    const allMatches: PropertyMatch[] = [];

    while ((match = dotAccessRegex.exec(current)) !== null) {
      allMatches.push({
        fullMatch: match[0],
        prefix: match[1],
        property: match[3],
        index: match.index,
        length: match[0].length,
      });
    }

    allMatches.reverse().forEach(({ fullMatch, prefix, property, index }) => {
      const isAssignment = assignmentRanges.some(
        (range) => index >= range.start && index < range.end
      );
      const isUpdate = updateRanges.some(
        (range) => index >= range.start && index < range.end
      );
      const isClassExtends = classExtendsRanges.some(
        (range) => index >= range.start && index < range.end
      );
      const isTypeAnnotation = typeAnnotationRanges.some(
        (range) => index >= range.start && index < range.end
      );
      const isNewConstructor = newExpressionRanges.some(
        (range) => index >= range.start && index < range.end
      );
      const isJsxTag = jsxTagRanges.some(
        (range) => index >= range.start && index < range.end
      );
      // Meta-properties (import.meta, new.target) cannot have optional chaining inserted
      const isMetaProperty =
        (prefix === "import" && property === "meta") ||
        (prefix === "new" && property === "target");
      // Exclude floating-point number literals like 3.14
      const isNumber = /^\d+$/.test(prefix);

      if (
        !isAssignment &&
        !isUpdate &&
        !isClassExtends &&
        !isTypeAnnotation &&
        !isNewConstructor &&
        !isJsxTag &&
        !isMetaProperty &&
        !isNumber &&
        !activeIgnored.has(prefix)
      ) {
        const before = current.slice(0, index);
        const after = current.slice(index + fullMatch.length);
        current = before + `${prefix}?.${property}` + after;
      }
    });
  }

  return current;
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
 * @param customIgnored Optional set of custom identifiers to ignore
 * @returns Transformed source code string
 */
export function transformSourceCode(
  source: string,
  customIgnored?: Set<string>
): string {
  const segments = splitByStringLiterals(source);
  return segments
    .map((seg) =>
      seg.isCode ? processCodeSegment(seg.text, customIgnored) : seg.text
    )
    .join("");
}

/**
 * Transforms Vue, Svelte, or Astro component files by applying optional chaining
 * specifically within <script> blocks while preserving templates and styles.
 *
 * @param source Component source code
 * @param customIgnored Optional custom identifiers to ignore
 * @returns Transformed component code
 */
export function transformComponentDocument(
  source: string,
  customIgnored?: Set<string>
): string {
  // Support Astro frontmatter delimited by ---
  const frontmatterRegex = /^(---\r?\n)([\s\S]*?)(\r?\n---)/;
  let transformed = source.replace(
    frontmatterRegex,
    (_match, openTag: string, frontmatterBody: string, closeTag: string) => {
      const transformedBody = transformSourceCode(
        frontmatterBody,
        customIgnored
      );
      return `${openTag}${transformedBody}${closeTag}`;
    }
  );

  const scriptRegex = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi;
  transformed = transformed.replace(
    scriptRegex,
    (_match, openTag: string, scriptBody: string, closeTag: string) => {
      const transformedScript = transformSourceCode(scriptBody, customIgnored);
      return `${openTag}${transformedScript}${closeTag}`;
    }
  );

  return transformed;
}
