import * as assert from "assert";
import {
  transformSourceCode,
  processCodeSegment,
  splitByStringLiterals,
  ignoredIdentifiers,
} from "../core/transformer";

suite("Core Transformer Test Suite", () => {
  test("Should transform simple dot access", () => {
    assert.strictEqual(processCodeSegment("user.name"), "user?.name");
  });

  test("Should transform deep nested access", () => {
    assert.strictEqual(processCodeSegment("a.b.c.d"), "a?.b?.c?.d");
  });

  test("Should not transform ignored identifiers", () => {
    for (const id of ignoredIdentifiers) {
      assert.strictEqual(processCodeSegment(`${id}.prop`), `${id}.prop`);
    }
  });

  test("Should transform source code with string literal preservation", () => {
    const input =
      'const x = user.profile.name; const label = "user.profile.name";';
    const expected =
      'const x = user?.profile?.name; const label = "user.profile.name";';
    assert.strictEqual(transformSourceCode(input), expected);
  });

  test("Should transform within template literals", () => {
    const input = "const msg = `User: ${user.name}`;";
    const expected = "const msg = `User: ${user?.name}`;";
    assert.strictEqual(transformSourceCode(input), expected);
  });

  test("Should respect custom ignored identifiers", () => {
    const custom = new Set(["customGlobal", "appConfig"]);
    const input = "customGlobal.method(); otherObj.user.name;";
    const expected = "customGlobal.method(); otherObj?.user?.name;";
    assert.strictEqual(transformSourceCode(input, custom), expected);
  });
});
