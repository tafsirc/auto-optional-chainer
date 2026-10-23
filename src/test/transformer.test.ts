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

  test("Should support ignoring 'this' reference via custom ignored set", () => {
    const custom = new Set(["this"]);
    const input = "this.user.profile.name";
    const expected = "this.user?.profile?.name";
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

  test("Should not transform new constructor expressions", () => {
    assert.strictEqual(processCodeSegment("new a.b()"), "new a.b()");
    assert.strictEqual(processCodeSegment("new a.b.c()"), "new a.b.c()");
    assert.strictEqual(
      processCodeSegment("const s = new service.Client(user.name);"),
      "const s = new service.Client(user?.name);"
    );
    assert.strictEqual(
      processCodeSegment("const x = new a.b() + new c.d();"),
      "const x = new a.b() + new c.d();"
    );
    assert.strictEqual(
      processCodeSegment("const item = new a.b().method();"),
      "const item = new a.b()?.method();"
    );
  });

  test("Should protect JavaScript meta-properties (import.meta, new.target, super)", () => {
    assert.strictEqual(
      processCodeSegment("console.log(import.meta.url);"),
      "console.log(import.meta?.url);"
    );
    assert.strictEqual(
      processCodeSegment("const meta = import.meta;"),
      "const meta = import.meta;"
    );
    assert.strictEqual(
      processCodeSegment("console.log(import.meta.env.VITE_API_URL);"),
      "console.log(import.meta?.env?.VITE_API_URL);"
    );
    assert.strictEqual(
      processCodeSegment("if (!new.target) throw new Error();"),
      "if (!new.target) throw new Error();"
    );
    assert.strictEqual(
      processCodeSegment("const name = new.target.name;"),
      "const name = new.target?.name;"
    );
    assert.strictEqual(
      processCodeSegment("super.render();"),
      "super.render();"
    );
    assert.strictEqual(
      processCodeSegment("super.data.items;"),
      "super.data.items;"
    );
  });

  test("Should protect namespaced JSX element tag names (<Modal.Header>)", () => {
    assert.strictEqual(
      processCodeSegment("<Modal.Header>Hello</Modal.Header>"),
      "<Modal.Header>Hello</Modal.Header>"
    );
    assert.strictEqual(
      processCodeSegment("<Modal.Header title={user.name} />"),
      "<Modal.Header title={user?.name} />"
    );
    assert.strictEqual(
      processCodeSegment(
        "<Card.Body.Item sub={details.title}>{user.address.city}</Card.Body.Item>"
      ),
      "<Card.Body.Item sub={details?.title}>{user?.address?.city}</Card.Body.Item>"
    );
    assert.strictEqual(
      processCodeSegment(
        "return <Select.Option value={opt.id}>{opt.label}</Select.Option>;"
      ),
      "return <Select.Option value={opt?.id}>{opt?.label}</Select.Option>;"
    );
    assert.strictEqual(
      processCodeSegment(
        "const el = <Dropdown.Menu onClick={() => user.select()} />;"
      ),
      "const el = <Dropdown.Menu onClick={() => user?.select()} />;"
    );
    assert.strictEqual(
      processCodeSegment("if (count < max.length) {}"),
      "if (count < max?.length) {}"
    );
  });
});
