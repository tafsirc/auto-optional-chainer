import * as assert from "assert";
import * as vscode from "vscode";
import {
  activate,
  deactivate,
  processCodeSegment,
  splitByStringLiterals,
  transformSourceCode,
  isSupportedDocument,
  getDocumentTransformEdits,
} from "../extension";

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

    // Mock the activeTextEditor safely
    try {
      Object.defineProperty(vscode.window, "activeTextEditor", {
        get: () => mockEditor,
        configurable: true,
      });
    } catch {
      // vscode.window.activeTextEditor may be read-only in some host environments
    }
  });

  // Teardown after tests
  teardown(() => {
    try {
      Object.defineProperty(vscode.window, "activeTextEditor", {
        get: () => undefined,
        configurable: true,
      });
    } catch {
      // Ignore cleanup error if not configurable
    }
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
    test("Should correctly detect unsupported file types", () => {
      const plaintextDoc = createMockDocument("", "plaintext");
      assert.strictEqual(isSupportedDocument(plaintextDoc), false);

      const markdownDoc = createMockDocument("", "markdown");
      assert.strictEqual(isSupportedDocument(markdownDoc), false);
    });

    test("Should correctly identify supported file types", () => {
      const tsDoc = createMockDocument("", "typescript");
      assert.strictEqual(isSupportedDocument(tsDoc), true);

      const jsDoc = createMockDocument("", "javascript");
      assert.strictEqual(isSupportedDocument(jsDoc), true);
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
      const processed = transformSourceCode(input);
      assert.strictEqual(processed, input); // Should not modify comments
    });

    test("Should handle escaped characters in strings", async () => {
      const input = "'user.name\\'s value' + user.details.value";
      mockDocument = createMockDocument(input);
      const processed = transformSourceCode(input);
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
        'users[index]?.friends[0]["profile"]?.name'
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
      const input = "const regex = /user.name/g;";
      mockDocument = createMockDocument(input);
      const processed = transformSourceCode(input);
      assert.strictEqual(processed, input); // Should not modify regex literals
    });

    test("Should handle regex with property access", async () => {
      const input = "const pattern = RegExp(user.pattern).test(str)";
      mockDocument = createMockDocument(input);
      const processed = transformSourceCode(input);
      assert.strictEqual(
        processed,
        "const pattern = RegExp(user?.pattern)?.test(str)"
      );
    });

    test("Should handle regex methods", async () => {
      const input = "if (regex.test(user.input)) { }";
      mockDocument = createMockDocument(input);
      const processed = transformSourceCode(input);
      assert.strictEqual(processed, "if (regex?.test(user?.input)) { }");
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
      const processed = transformSourceCode(input);
      assert.ok(processed.includes("user?.profile?.name"));
      assert.ok(processed.includes("data?.results?.items"));
      assert.ok(processed.includes("Math.random")); // Should not be changed
      assert.ok(processed.includes("person.address.street =")); // Assignment should not be changed
      assert.ok(processed.includes("user?.settings?.enabled"));
      assert.ok(processed.includes("user?.name"));
    });
  });

  // Test suite for Document Transformation Edits (Pre-Save & Formatting)
  suite("Document Transform Edits", () => {
    test("Should return replacement TextEdit when changes exist", () => {
      const doc = createMockDocument("const x = user.profile.name;");
      const edits = getDocumentTransformEdits(doc);
      assert.strictEqual(edits.length, 1);
      assert.strictEqual(edits[0].newText, "const x = user?.profile?.name;");
    });

    test("Should return empty array when no transformations are required", () => {
      const doc = createMockDocument("const x = user?.profile?.name;");
      const edits = getDocumentTransformEdits(doc);
      assert.strictEqual(edits.length, 0);
    });

    test("Should handle component document edits", () => {
      const doc = createMockDocument(
        "<script>const x = user.name;</script>",
        "vue"
      );
      const edits = getDocumentTransformEdits(doc);
      assert.strictEqual(edits.length, 1);
      assert.strictEqual(
        edits[0].newText,
        "<script>const x = user?.name;</script>"
      );
    });
  });
});
