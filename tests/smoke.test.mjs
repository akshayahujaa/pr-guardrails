import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("workflow suite ships its three PR gates", () => {
  for (const wf of ["pr-scope-check.yml", "pr-agent.yml", "ci.yml"]) {
    const body = readFileSync(new URL(`../.github/workflows/${wf}`, import.meta.url), "utf8");
    assert.ok(body.includes("on:"), `${wf} is a triggerable workflow`);
  }
});
