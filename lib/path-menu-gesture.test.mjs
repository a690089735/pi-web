import assert from "node:assert/strict";
import test from "node:test";
import { installPathLongPress } from "./path-menu-gesture.ts";
import { getPathMenuActions, registerPathMenuActions } from "./path-menu-actions.ts";

function fixture(t) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const document = new EventTarget();
  document.defaultView = new EventTarget();
  const source = { isConnected: true, dataset: { copyPath: "/repo/file.txt" } };
  const opened = [];
  const cleanup = installPathLongPress(document, () => source, (...args) => opened.push(args));
  t.after(cleanup);
  const send = (type, props = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: 20, clientY: 30, detail: 1 }, props);
    document.dispatchEvent(event);
    return event;
  };
  return { send, opened, source, document, cleanup };
}

test("opens after 500ms, suppresses release click once, and permits the next gesture", (t) => {
  const f = fixture(t);
  f.send("pointerdown");
  t.mock.timers.tick(499);
  assert.equal(f.opened.length, 0);
  t.mock.timers.tick(1);
  assert.equal(f.opened.length, 1);
  assert.equal(f.send("contextmenu").defaultPrevented, true);
  f.send("pointerup");
  assert.equal(f.send("click").defaultPrevented, true);
  f.send("pointerdown");
  f.send("pointerup");
  assert.equal(f.send("click").defaultPrevented, false);
});

for (const reason of ["move", "cancel", "release", "multi", "scroll", "blur", "hidden", "removed", "changed", "cleanup"]) {
  test(`long press cancels on ${reason}`, (t) => {
    const f = fixture(t);
    f.send("pointerdown");
    if (reason === "move") f.send("pointermove", { clientX: 31 });
    if (reason === "cancel") f.send("pointercancel");
    if (reason === "release") f.send("pointerup");
    if (reason === "multi") f.send("pointerdown", { pointerId: 2, isPrimary: false });
    if (reason === "scroll" || reason === "blur") f.document.defaultView.dispatchEvent(new Event(reason));
    if (reason === "hidden") f.send("visibilitychange");
    if (reason === "removed") f.source.isConnected = false;
    if (reason === "changed") f.source.dataset.copyPath = "/new";
    if (reason === "cleanup") f.cleanup();
    t.mock.timers.tick(600);
    assert.equal(f.opened.length, 0);
  });
}

test("mouse hold stays native and touch jitter does not cancel", (t) => {
  const f = fixture(t);
  f.send("pointerdown", { pointerType: "mouse" });
  t.mock.timers.tick(600);
  assert.equal(f.opened.length, 0);
  assert.equal(f.send("contextmenu").defaultPrevented, false);
  f.send("pointerup");
  f.send("pointerdown");
  f.send("pointermove", { clientX: 24, clientY: 34 });
  t.mock.timers.tick(500);
  assert.equal(f.opened.length, 1);
});

test("actions are scoped to their exact DOM element and cleaned up", () => {
  const first = {}, second = {};
  const actions = { cwd: "/repo", mention() {} };
  const cleanup = registerPathMenuActions(first, actions);
  assert.equal(getPathMenuActions(first), actions);
  assert.equal(getPathMenuActions(second), undefined);
  cleanup();
  assert.equal(getPathMenuActions(first), undefined);
});