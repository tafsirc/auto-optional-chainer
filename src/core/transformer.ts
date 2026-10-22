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

    // Identify all property assignments in the code as ranges
    const assignmentRanges: Array<{ start: number; end: number }> = [];
    const assignmentRegex =
      /(?:\b[\w$]+(?:\s*\[[^\]]+\]|\([^)]*\))*\s*\.)+\s*[\w$]+\s*=(?!=)/g;
    let match: RegExpExecArray | null;

    while ((match = assignmentRegex.exec(current)) !== null) {
      assignmentRanges.push({
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    // Identify target constructor expressions in 'new' invocations
    // Optional chaining is invalid in the callee of a new expression (ECMA-262)
    const newExpressionRanges: Array<{ start: number; end: number }> = [];
    const newRegex = /\bnew\s+([\w$]+(?:\s*\[[^\]]*\]|\s*\.\s*[\w$]+)*)/g;

    while ((match = newRegex.exec(current)) !== null) {
      const constructorOffset = match[0].indexOf(match[1]);
      const start = match.index + constructorOffset;
      newExpressionRanges.push({
        start,
        end: start + match[1].length,
      });
    }

    // Process property access (supporting word characters, brackets, and parentheses before the dot)
    const dotAccessRegex = /((\b\w+|\)|\]))\s*\.\s*(\w+)/g;
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
      const isNewConstructor = newExpressionRanges.some(
        (range) => index >= range.start && index < range.end
      );
      // Exclude floating-point number literals like 3.14
      const isNumber = /^\d+$/.test(prefix);

      if (
        !isAssignment &&
        !isNewConstructor &&
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
  const scriptRegex = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi;
  return source.replace(
    scriptRegex,
    (_match, openTag: string, scriptBody: string, closeTag: string) => {
      const transformedScript = transformSourceCode(scriptBody, customIgnored);
      return `${openTag}${transformedScript}${closeTag}`;
    }
  );
}
