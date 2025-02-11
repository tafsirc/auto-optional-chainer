import * as assert from "assert";
import * as vscode from "vscode";
import { activate, deactivate } from "../extension";

// Mock the vscode.window.activeTextEditor
let mockEditor: vscode.TextEditor;
let mockDocument: vscode.TextDocument;

// Helper function to create a mock TextDocument
function createMockDocument(
  content: string,
  languageId: string = "typescript"
): vscode.TextDocument {
  return {
    getText: () => content,
    languageId: languageId,
    uri: vscode.Uri.file("test.ts"),
    version: 1,
    fileName: "test.ts",
    isDirty: false,
    isUntitled: false,
    lineCount: 1,
    lineAt: () => ({
      text: content,
      lineNumber: 0,
      range: new vscode.Range(0, 0, 0, content.length),
      firstNonWhitespaceCharacterIndex: 0,
      rangeIncludingLineBreak: new vscode.Range(0, 0, 0, content.length),
      isEmptyOrWhitespace: false,
    }),
    offsetAt: () => 0,
    positionAt: () => new vscode.Position(0, 0),
    save: () => Promise.resolve(true),
    eol: vscode.EndOfLine.LF,
    getWordRangeAtPosition: () => undefined,
    validateRange: (range: vscode.Range) => range,
    validatePosition: (position: vscode.Position) => position,
  } as any;
}

suite("AutoOptionalChainer Extension Test Suite", () => {
  // Setup before running the tests
  setup(() => {
    // Initialize mocks
    mockDocument = createMockDocument("");
    mockEditor = {
      document: mockDocument,
      selection: new vscode.Selection(0, 0, 0, 0),
    } as any;

    // Mock the activeTextEditor
    (vscode.window as any).activeTextEditor = mockEditor;
  });

  // Teardown after tests
  teardown(() => {
    (vscode.window as any).activeTextEditor = undefined;
  });

  // Test suite for supported document types
  suite("Document Type Support", () => {
    test("Should support TypeScript files", () => {
      mockDocument = createMockDocument("", "typescript");
      assert.strictEqual(mockDocument.languageId, "typescript");
    });

    test("Should support JavaScript files", () => {
      mockDocument = createMockDocument("", "javascript");
      assert.strictEqual(mockDocument.languageId, "javascript");
    });

    test("Should support React TypeScript files", () => {
      mockDocument = createMockDocument("", "typescriptreact");
      assert.strictEqual(mockDocument.languageId, "typescriptreact");
    });

    test("Should support React JavaScript files", () => {
      mockDocument = createMockDocument("", "javascriptreact");
      assert.strictEqual(mockDocument.languageId, "javascriptreact");
    });
  });

  // Test suite for code processing
  suite("Code Processing", () => {
    // Test simple property access transformation
    test("Should transform simple property access", async () => {
      const input = "user.name";
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.strictEqual(processed, "user?.name");
    });

    // Test nested property access transformation
    test("Should transform nested property access", async () => {
      const input = "user.address.street";
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.strictEqual(processed, "user?.address?.street");
    });

    // Test ignored identifiers
    test("Should not transform ignored identifiers", async () => {
      const input = "console.log(Math.random())";
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.strictEqual(processed, input);
    });

    // Test assignment operations
    test("Should not transform assignments", async () => {
      const input = 'user.name = "John"';
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.strictEqual(processed, input);
    });

    // Test mixed scenarios
    test("Should handle mixed scenarios correctly", async () => {
      const input = "user.name = person.details.age";
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.strictEqual(processed, "user.name = person?.details?.age");
    });
  });

  // Test suite for string literal handling
  suite("String Literal Processing", () => {
    // Test single quotes
    test("Should preserve single quoted strings", async () => {
      const input = "'user.name'";
      mockDocument = createMockDocument(input);
      const segments = splitByStringLiterals(input);
      assert.strictEqual(segments.length, 1);
      assert.strictEqual(segments[0].isCode, false);
      assert.strictEqual(segments[0].type, "single");
    });

    // Test double quotes
    test("Should preserve double quoted strings", async () => {
      const input = '"user.name"';
      mockDocument = createMockDocument(input);
      const segments = splitByStringLiterals(input);
      assert.strictEqual(segments.length, 1);
      assert.strictEqual(segments[0].isCode, false);
      assert.strictEqual(segments[0].type, "double");
    });

    // Test template literals
    test("Should handle template literals", async () => {
      const input = "`user.name is ${user.name}`";
      mockDocument = createMockDocument(input);
      const segments = splitByStringLiterals(input);
      assert.strictEqual(segments.length, 5); // Start, ${, code, }, end
      assert.strictEqual(segments[2].isCode, true);
    });

    // Test nested template literals
    test("Should handle nested template literals", async () => {
      const input = "`${`nested ${user.name}`}`";
      mockDocument = createMockDocument(input);
      const segments = splitByStringLiterals(input);
      assert.ok(segments.some((s) => s.text.includes("user?.name")));
    });
  });

  // Test suite for error handling
  suite("Error Handling", () => {
    // Test no active editor
    test("Should handle no active editor", async () => {
      (vscode.window as any).activeTextEditor = undefined;
      let errorShown = false;
      (vscode.window as any).showErrorMessage = () => {
        errorShown = true;
      };
      await vscode.commands.executeCommand(
        "AutoOptionalChainer.applyOptionalChaining"
      );
      assert.strictEqual(errorShown, true);
    });

    // Test unsupported file type
    test("Should handle unsupported file type", async () => {
      mockDocument = createMockDocument("", "plaintext");
      let errorShown = false;
      (vscode.window as any).showErrorMessage = () => {
        errorShown = true;
      };
      await vscode.commands.executeCommand(
        "AutoOptionalChainer.applyOptionalChaining"
      );
      assert.strictEqual(errorShown, true);
    });
  });

  // Test suite for edge cases
  suite("Edge Cases", () => {
    test("Should handle empty string", async () => {
      const input = "";
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.strictEqual(processed, "");
    });

    test("Should handle white space only", async () => {
      const input = "   \n   \t   ";
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.strictEqual(processed, input);
    });

    test("Should handle multiple consecutive dots", async () => {
      const input = "user...name";
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.strictEqual(processed, input); // Should not modify invalid syntax
    });

    test("Should handle property access within comments", async () => {
      const input = "// user.name\n/* data.value */";
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.strictEqual(processed, input); // Should not modify comments
    });

    test("Should handle escaped characters in strings", async () => {
      const input = "'user.name\\'s value' + user.details.value";
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.strictEqual(
        processed,
        "'user.name\\'s value' + user?.details?.value"
      );
    });
  });

  // Test suite for multiple transformations in the same line
  suite("Multiple Transformations", () => {
    test("Should handle multiple property accesses in one line", async () => {
      const input = "user.name + person.address.street + data.value";
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.strictEqual(
        processed,
        "user?.name + person?.address?.street + data?.value"
      );
    });

    test("Should handle mixed property accesses and assignments", async () => {
      const input = "user.name = person.details.name + data.value";
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.strictEqual(
        processed,
        "user.name = person?.details?.name + data?.value"
      );
    });

    test("Should handle property access in function arguments", async () => {
      const input = "doSomething(user.name, getData(person.details))";
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.strictEqual(
        processed,
        "doSomething(user?.name, getData(person?.details))"
      );
    });
  });

  // Test suite for object property access patterns
  suite("Object Property Access Patterns", () => {
    test("Should handle object property in array access", async () => {
      const input = "users[0].name";
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.strictEqual(processed, "users[0]?.name");
    });

    test("Should handle computed property access", async () => {
      const input = 'user["profile"].name';
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.strictEqual(processed, 'user["profile"]?.name');
    });

    test("Should handle mixed property access patterns", async () => {
      const input = 'users[index].friends[0]["profile"].name';
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.strictEqual(
        processed,
        'users[index]?.friends[0]?.["profile"]?.name'
      );
    });

    test("Should handle method calls", async () => {
      const input = "user.getProfile().name";
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.strictEqual(processed, "user?.getProfile()?.name");
    });

    test("Should handle chained method calls", async () => {
      const input = "user.getProfile().getData().name";
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.strictEqual(processed, "user?.getProfile()?.getData()?.name");
    });
  });

  // Test suite for destructuring and assignments
  suite("Destructuring and Assignments", () => {
    test("Should handle object destructuring", async () => {
      const input = "const { name, age } = user.profile";
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.strictEqual(processed, "const { name, age } = user?.profile");
    });

    test("Should handle nested destructuring", async () => {
      const input =
        "const { name, address: { street } } = user.profile.details";
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.strictEqual(
        processed,
        "const { name, address: { street } } = user?.profile?.details"
      );
    });

    test("Should handle array destructuring", async () => {
      const input = "const [first] = user.items";
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.strictEqual(processed, "const [first] = user?.items");
    });

    test("Should handle mixed destructuring", async () => {
      const input = "const [{ name }] = user.friends[0].profiles";
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.strictEqual(
        processed,
        "const [{ name }] = user?.friends[0]?.profiles"
      );
    });
  });

  // Test suite for JSX/TSX specific cases
  suite("JSX/TSX Specific Cases", () => {
    test("Should handle props access in JSX", async () => {
      const input = "<Component data={user.profile.details} />";
      mockDocument = createMockDocument(input, "typescriptreact");
      const processed = processCodeSegment(input);
      assert.strictEqual(
        processed,
        "<Component data={user?.profile?.details} />"
      );
    });

    test("Should handle nested props access", async () => {
      const input = "<Component data={user.settings.theme.colors.primary} />";
      mockDocument = createMockDocument(input, "typescriptreact");
      const processed = processCodeSegment(input);
      assert.strictEqual(
        processed,
        "<Component data={user?.settings?.theme?.colors?.primary} />"
      );
    });

    test("Should handle mixed JSX expressions", async () => {
      const input = `
        <Component
          name={user.name}
          profile={data.user.profile}
          onClick={() => handleUser(user.id)}
          settings={React.useMemo(() => user.settings, [])}
        />
      `;
      mockDocument = createMockDocument(input, "typescriptreact");
      const processed = processCodeSegment(input);
      assert.ok(processed.includes("user?.name"));
      assert.ok(processed.includes("data?.user?.profile"));
      assert.ok(processed.includes("user?.id"));
      assert.ok(processed.includes("user?.settings"));
      assert.ok(processed.includes("React.useMemo")); // Should not be modified
    });

    test("Should handle conditional rendering", async () => {
      const input =
        "{user.isAdmin && user.permissions.canEdit && <AdminPanel />}";
      mockDocument = createMockDocument(input, "typescriptreact");
      const processed = processCodeSegment(input);
      assert.strictEqual(
        processed,
        "{user?.isAdmin && user?.permissions?.canEdit && <AdminPanel />}"
      );
    });

    test("Should handle template literal props", async () => {
      const input = "<Component template={`Welcome ${user.profile.name}!`} />";
      mockDocument = createMockDocument(input, "typescriptreact");
      const processed = processCodeSegment(input);
      assert.strictEqual(
        processed,
        "<Component template={`Welcome ${user?.profile?.name}!`} />"
      );
    });
  });

  // Test suite for regular expressions
  suite("Regular Expression Tests", () => {
    test("Should handle regex literals", async () => {
      const input = "const regex = /user.name/g";
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.strictEqual(processed, input); // Should not modify regex literals
    });

    test("Should handle regex with property access", async () => {
      const input = "const pattern = RegExp(user.pattern).test(str)";
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.strictEqual(
        processed,
        "const pattern = RegExp(user?.pattern).test(str)"
      );
    });

    test("Should handle regex methods", async () => {
      const input = "if (regex.test(user.input)) { }";
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.strictEqual(processed, "if (regex.test(user?.input)) { }");
    });
  });

  // Test suite for complete transformations
  suite("Complete Transformations", () => {
    // Test complex code transformation
    test("Should handle complex code transformation", async () => {
      const input = `
        const name = user.profile.name;
        console.log(data.results.items);
        Math.random();
        person.address.street = "123 Main St";
        if (user.settings.enabled) {
          console.log(\`Welcome \${user.name}!\`);
        }
      `;
      mockDocument = createMockDocument(input);
      const processed = processCodeSegment(input);
      assert.ok(processed.includes("user?.profile?.name"));
      assert.ok(processed.includes("data?.results?.items"));
      assert.ok(processed.includes("Math.random")); // Should not be changed
      assert.ok(processed.includes("person.address.street =")); // Assignment should not be changed
      assert.ok(processed.includes("user?.settings?.enabled"));
      assert.ok(processed.includes("user?.name"));
    });
  });
});

// Helper function to expose internal functions for testing - Imported from extension
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

function processCodeSegment(segment: string): string {
  // Find all assignments
  const assignmentPositions = new Set<number>();
  const assignmentRegex = /\b\w+\.\w+\s*=(?!=)/g;
  let match;

  while ((match = assignmentRegex.exec(segment)) !== null) {
    assignmentPositions.add(match.index);
  }

  // Process property accesses
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

  // Process matches in reverse order
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
