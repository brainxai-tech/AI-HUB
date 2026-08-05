export function buildProcurementItems(groups = [], shoppingState = []) {
  const byName = new Map();

  for (const [groupIndex, group] of (Array.isArray(groups) ? groups : []).entries()) {
    const category = String(group?.category || "未分类");
    for (const [itemIndex, item] of (Array.isArray(group?.items) ? group.items : []).entries()) {
      const normalized = normalizeShoppingItem(item);
      if (!normalized.name) continue;

      const key = normalized.name;
      const source = {
        groupIndex,
        itemIndex,
        isComplete: Boolean(shoppingState?.[groupIndex]?.[itemIndex])
      };
      const existing = byName.get(key) || {
        name: normalized.name,
        amountParts: [],
        estimatedCost: 0,
        categories: [],
        sourceRefs: [],
        sourceCount: 0,
        isComplete: true
      };

      if (normalized.amount) existing.amountParts.push(normalized.amount);
      existing.estimatedCost += normalized.estimatedCost;
      if (!existing.categories.includes(category)) existing.categories.push(category);
      existing.sourceRefs.push(source);
      existing.sourceCount += 1;
      existing.isComplete = existing.isComplete && source.isComplete;
      byName.set(key, existing);
    }
  }

  return [...byName.values()].map((item) => ({
    ...item,
    amountText: item.amountParts.join(" + "),
    estimatedCost: Math.round(item.estimatedCost * 100) / 100
  }));
}

export function filterProcurementItems(items = [], filter = "all") {
  if (filter === "pending") {
    return items.filter((item) => !item.isComplete);
  }
  if (filter === "done") {
    return items.filter((item) => item.isComplete);
  }
  return items.slice();
}

export function summarizeProcurement(items = []) {
  const normalized = Array.isArray(items) ? items : [];
  const completed = normalized.filter((item) => item.isComplete);
  const pending = normalized.filter((item) => !item.isComplete);
  return {
    itemCount: normalized.length,
    completedCount: completed.length,
    pendingCount: pending.length,
    totalCost: sumCosts(normalized),
    completedCost: sumCosts(completed),
    pendingCost: sumCosts(pending)
  };
}

export function buildShoppingCopyText(items = [], { title = "采购清单", filter = "all" } = {}) {
  const selected = filterProcurementItems(items, filter);
  const lines = [title];
  const groups = groupItemsByCategory(selected);

  for (const [category, categoryItems] of groups) {
    lines.push("", category);
    for (const item of categoryItems) {
      const checked = item.isComplete ? "x" : " ";
      const amount = item.amountText ? ` ${item.amountText}` : "";
      const cost = item.estimatedCost > 0 ? ` 约${formatCost(item.estimatedCost)}元` : "";
      lines.push(`- [${checked}] ${item.name}${amount}${cost}`);
    }
  }

  if (!selected.length) {
    lines.push("", "没有待复制的采购项。");
  }

  return `${lines.join("\n")}\n`;
}

function normalizeShoppingItem(item) {
  if (typeof item === "string") {
    return { name: item.trim(), amount: "", estimatedCost: 0 };
  }
  if (!item || typeof item !== "object") {
    return { name: "", amount: "", estimatedCost: 0 };
  }
  return {
    name: String(item.name || item.display || "").trim(),
    amount: String(item.amount || "").trim(),
    estimatedCost: numericCost(item.estimatedCost)
  };
}

function groupItemsByCategory(items) {
  const map = new Map();
  for (const item of items) {
    const category = item.categories?.[0] || "未分类";
    if (!map.has(category)) map.set(category, []);
    map.get(category).push(item);
  }
  return map;
}

function sumCosts(items) {
  return Math.round(items.reduce((sum, item) => sum + numericCost(item.estimatedCost), 0) * 100) / 100;
}

function numericCost(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatCost(value) {
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(1)));
}
