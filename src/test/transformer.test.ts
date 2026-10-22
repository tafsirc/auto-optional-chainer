import * as assert from "assert";
import {
  transformSourceCode,
  transformComponentDocument,
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

  test("Should preserve common Web and Node globals", () => {
    assert.strictEqual(
      processCodeSegment("const env = process.env.NODE_ENV;"),
      "const env = process.env.NODE_ENV;"
    );
    assert.strictEqual(
      processCodeSegment("window.location.href;"),
      "window.location.href;"
    );
    assert.strictEqual(
      processCodeSegment("Promise.resolve();"),
      "Promise.resolve();"
    );
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

  test("Should transform script blocks in Vue/Svelte/Astro components", () => {
    const component = `<template>
  <div class="user-card">{{ user.name }}</div>
</template>

<script lang="ts">
const name = user.profile.name;
</script>

<style>
.user-card { color: red; }
</style>`;

    const expected = `<template>
  <div class="user-card">{{ user.name }}</div>
</template>

<script lang="ts">
const name = user?.profile?.name;
</script>

<style>
.user-card { color: red; }
</style>`;

    assert.strictEqual(transformComponentDocument(component), expected);
  });

  test("Should not transform floating point number literals", () => {
    assert.strictEqual(
      processCodeSegment("const pi = 3.14;"),
      "const pi = 3.14;"
    );
    assert.strictEqual(
      processCodeSegment("const price = 99.95;"),
      "const price = 99.95;"
    );
  });

  test("Should preserve comments untouched", () => {
    const input =
      "// user.name\n/* data.value */\nconst x = user.profile.name;";
    const expected =
      "// user.name\n/* data.value */\nconst x = user?.profile?.name;";
    assert.strictEqual(transformSourceCode(input), expected);
  });

  test("Should preserve regex literals", () => {
    const input = "const regex = /user.name/g; const valid = user.name;";
    const expected = "const regex = /user.name/g; const valid = user?.name;";
    assert.strictEqual(transformSourceCode(input), expected);
  });

  test("Should handle array indexing and method chaining", () => {
    assert.strictEqual(processCodeSegment("users[0].name"), "users[0]?.name");
    assert.strictEqual(
      processCodeSegment("user.getProfile().name"),
      "user?.getProfile()?.name"
    );
  });

  test("Should handle assignment with property access on RHS", () => {
    assert.strictEqual(
      processCodeSegment("user.name = person.details.age"),
      "user.name = person?.details?.age"
    );
  });
});
