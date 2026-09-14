import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("./clipboard.ts", import.meta.url), "utf8");
const script = new Script(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText);

function fixture(clipboard, result = true) {
  let removed = false;
  let focused = false;
  let selected = false;
  let restored = false;
  class Element {}
  const previous = Object.assign(new Element(), { isConnected: true, focus() { focused = true; } });
  const range = {};
  const selection = {
    rangeCount: 1, getRangeAt: () => ({ cloneRange: () => range }),
    removeAllRanges() {}, addRange(value) { restored = value === range; },
  };
  const textarea = { style: {}, value: "", select() { selected = true; }, remove() { removed = true; } };
  const exports = {};
  script.runInNewContext({
    exports, navigator: { clipboard }, HTMLElement: Element,
    document: {
      activeElement: previous, getSelection: () => selection,
      createElement: () => textarea, body: { appendChild() {} },
      execCommand(command) {
        assert.equal(command, "copy");
        if (result instanceof Error) throw result;
        return result;
      },
    },
  });
  return { copy: exports.copyText, state: () => ({ removed, focused, selected, restored, text: textarea.value }) };
}

test("modern clipboard preserves exact Windows, UNC, POSIX and special-character paths", async () => {
  for (const path of [String.raw`E:\项目 空格\a & 100% #.txt`, String.raw`\\server\share\文档.txt`, "/tmp/a b.txt", "E:\\"]) {
    let actual;
    const f = fixture({ writeText: async (value) => { actual = value; } });
    await f.copy(path);
    assert.equal(actual, path);
    assert.equal(f.state().selected, false);
  }
});

test("permission rejection is reported rather than silently claiming success", async () => {
  const f = fixture({ writeText: async () => { throw new Error("denied"); } });
  await assert.rejects(f.copy("/file"), /denied/);
  assert.equal(f.state().selected, false);
});

test("legacy copy restores focus/selection and removes the temporary textarea", async () => {
  const f = fixture(undefined);
  await f.copy("/tmp/a & b.txt");
  assert.deepEqual(f.state(), { removed: true, focused: true, selected: true, restored: true, text: "/tmp/a & b.txt" });
});

for (const result of [false, new Error("copy threw")]) {
  test(`legacy ${String(result)} rejects and still cleans up`, async () => {
    const f = fixture(undefined, result);
    await assert.rejects(f.copy("/file"));
    assert.equal(f.state().removed, true);
    assert.equal(f.state().focused, true);
    assert.equal(f.state().restored, true);
  });
}