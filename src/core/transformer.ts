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

    // Identify all property assignments in the code
    const assignmentPositions = new Set<number>();
    const assignmentRegex = /\b\w+\.\w+\s*=(?!=)/g;
    let match: RegExpExecArray | null;

    while ((match = assignmentRegex.exec(current)) !== null) {
      assignmentPositions.add(match.index);
    }

    // Process property access
    const dotAccessRegex = /(\b\w+)\.(\w+)/g;
    type PropertyMatch = {
      fullMatch: string;
      identifier: string;
      property: string;
      index: number;
      length: number;
    };
    const allMatches: PropertyMatch[] = [];

    while ((match = dotAccessRegex.exec(current)) !== null) {
      allMatches.push({
        fullMatch: match[0],
        identifier: match[1],
        property: match[2],
        index: match.index,
        length: match[0].length,
      });
    }

    allMatches
      .reverse()
      .forEach(({ fullMatch, identifier, property, index }) => {
        let isAssignment = false;
        assignmentPositions.forEach((pos) => {
          if (index >= pos && index <= pos + fullMatch.length) {
            isAssignment = true;
          }
        });

        if (!isAssignment && !activeIgnored.has(identifier)) {
          const before = current.slice(0, index);
          const after = current.slice(index + fullMatch.length);
          current = before + `${identifier}?.${property}` + after;
        }
      });
  }

  return current;
}

export type Segment = {
  text: string;
  isCode: boolean;
  type?: "single" | "double" | "backtick";
};

/**
 * Splits source code into segments of code and string literals
 */
export function splitByStringLiterals(text: string): Segment[] {
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
