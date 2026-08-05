import test from "node:test";
import assert from "node:assert/strict";

import {
  buildProcurementItems,
  buildShoppingCopyText,
  filterProcurementItems,
  summarizeProcurement
} from "../public/shopping-list.mjs";

const groups = [
  {
    category: "蛋白质",
    items: [
      { name: "鸡胸肉", amount: "500g", estimatedCost: 20 },
      { name: "鸡蛋", amount: "6个", estimatedCost: 8 }
    ]
  },
  {
    category: "补充采购",
    items: [
      { name: "鸡胸肉", amount: "300g", estimatedCost: 12 },
      { name: "西兰花", amount: "400g", estimatedCost: 10 }
    ]
  }
];

const shoppingState = [[true, false], [false, true]];

test("buildProcurementItems merges duplicate shopping names and keeps completion state", () => {
  const items = buildProcurementItems(groups, shoppingState);

  assert.deepEqual(items.map((item) => item.name), ["鸡胸肉", "鸡蛋", "西兰花"]);
  assert.equal(items[0].amountText, "500g + 300g");
  assert.equal(items[0].estimatedCost, 32);
  assert.equal(items[0].isComplete, false);
  assert.equal(items[0].sourceCount, 2);
  assert.deepEqual(items[0].categories, ["蛋白质", "补充采购"]);
  assert.equal(items[1].isComplete, false);
  assert.equal(items[2].isComplete, true);
});

test("filterProcurementItems can show only unfinished shopping entries", () => {
  const items = buildProcurementItems(groups, shoppingState);
  const pending = filterProcurementItems(items, "pending");

  assert.deepEqual(pending.map((item) => item.name), ["鸡胸肉", "鸡蛋"]);
});

test("summarizeProcurement reports total pending and checked cost", () => {
  const summary = summarizeProcurement(buildProcurementItems(groups, shoppingState));

  assert.equal(summary.itemCount, 3);
  assert.equal(summary.pendingCount, 2);
  assert.equal(summary.completedCount, 1);
  assert.equal(summary.totalCost, 50);
  assert.equal(summary.completedCost, 10);
  assert.equal(summary.pendingCost, 40);
});

test("buildShoppingCopyText creates a compact checklist grouped by store section", () => {
  const text = buildShoppingCopyText(buildProcurementItems(groups, shoppingState), {
    title: "本周采购",
    filter: "pending"
  });

  assert.match(text, /^本周采购/);
  assert.match(text, /蛋白质/);
  assert.match(text, /- \[ \] 鸡胸肉 500g \+ 300g 约32元/);
  assert.match(text, /- \[ \] 鸡蛋 6个 约8元/);
  assert.doesNotMatch(text, /西兰花/);
});
