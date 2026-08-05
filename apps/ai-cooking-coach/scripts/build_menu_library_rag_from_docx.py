import json
import re
import sys
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile


WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def compact_text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def extract_docx_lines(source_path):
    with ZipFile(source_path) as archive:
        document_xml = archive.read("word/document.xml")

    root = ET.fromstring(document_xml)
    lines = []
    for paragraph in root.findall(f".//{{{WORD_NS}}}p"):
        parts = []
        for node in paragraph.iter():
            if node.tag == f"{{{WORD_NS}}}t" and node.text:
                parts.append(node.text)
            elif node.tag == f"{{{WORD_NS}}}tab":
                parts.append("\t")
            elif node.tag == f"{{{WORD_NS}}}br":
                parts.append("\n")
        text = "".join(parts).strip()
        if text:
            lines.append(text)
    return lines


def parse_labeled_value(line, label):
    prefixes = (f"- {label}：", f"- {label}:")
    for prefix in prefixes:
        if line.startswith(prefix):
            return compact_text(line[len(prefix):])
    return ""


def parse_ingredient(line):
    value = line[2:].strip() if line.startswith("- ") else line.strip()
    if not value or value.endswith("：") or value.endswith(":"):
        return None

    if "：" in value:
        name, amount = value.split("：", 1)
    elif ":" in value:
        name, amount = value.split(":", 1)
    else:
        match = re.match(r"(.+?)(\d+(?:\.\d+)?\s*(?:g|kg|ml|l|个|只|枚|片|根|段|勺|克|毫升).*)$", value, re.I)
        if match:
            name, amount = match.groups()
        else:
            name, amount = value, ""

    return {
        "name": compact_text(name),
        "amount": compact_text(amount),
    }


def parse_calorie_estimate(text, recipe_id):
    match = re.search(r"整菜约\s*(\d+)\s*kcal[；;，,\s]+约\s*(\d+)\s*kcal/人", text, re.I)
    if not match:
        return None

    total_kcal = int(match.group(1))
    per_serving_kcal = int(match.group(2))
    return {
        "sourceId": recipe_id,
        "totalKcal": total_kcal,
        "perServingKcal": per_serving_kcal,
        "text": compact_text(f"{text}；按文档配料克重和常见营养值粗估。"),
    }


def infer_technique(name, method, category):
    combined = f"{name} {method} {category}"
    if any(keyword in name for keyword in ("汤", "羹", "煲", "粥")):
        return "汤羹"
    if any(keyword in name for keyword in ("炒", "爆", "熘", "干煸", "回锅")) or "翻炒" in combined:
        return "小炒"
    if any(keyword in name for keyword in ("烧", "焖", "扒", "煨", "卤")) or "焖烧" in combined:
        return "焖烧"
    if "蒸" in combined:
        return "清蒸"
    if any(keyword in combined for keyword in ("炸", "酥", "锅包", "脆皮")):
        return "煎炸"
    if "煎" in combined:
        return "煎制"
    if any(keyword in name for keyword in ("拌", "凉")):
        return "凉拌"
    if any(keyword in combined for keyword in ("烤", "焗", "披萨")):
        return "烤焗"
    if category == "主食汤羹与点心" or any(keyword in name for keyword in ("面", "饭", "饼", "包", "饺", "粉", "馄饨", "春卷")):
        return "主食点心"
    return "餐厅成菜"


def finish_recipe(raw):
    ingredients = raw.get("ingredients", [])
    recipe_id = raw["id"]
    category = raw.get("category", "")
    method = compact_text(" ".join(raw.get("method_lines", [])))
    technique = infer_technique(raw["name"], method, category)
    calorie_estimate = parse_calorie_estimate(raw.get("calorieText", ""), recipe_id)
    ingredients_text = "；".join(
        f"{ingredient['name']}{ingredient['amount']}" if ingredient.get("amount") else ingredient["name"]
        for ingredient in ingredients
    )
    search_text = " ".join([
        raw["name"],
        category,
        technique,
        raw.get("servings", ""),
        ingredients_text,
        method,
        raw.get("calorieText", ""),
        str(calorie_estimate["totalKcal"]) if calorie_estimate else "",
        str(calorie_estimate["perServingKcal"]) if calorie_estimate else "",
        "kcal 大卡 卡路里",
    ]).lower()

    item = {
        "id": recipe_id,
        "name": raw["name"],
        "category": category,
        "technique": technique,
        "flavor": category,
        "servings": raw.get("servings", ""),
        "ingredientsText": ingredients_text,
        "ingredients": ingredients,
        "method": method,
        "fdcMatches": [],
        "searchText": compact_text(search_text),
    }
    if calorie_estimate:
        item["calorieEstimate"] = calorie_estimate
    return item


def parse_recipes(lines):
    items = []
    current = None
    mode = None
    heading_pattern = re.compile(r"^###\s+(\d+)\.\s*(.+)$")

    for line in lines:
        heading = heading_pattern.match(line)
        if heading:
            if current:
                items.append(finish_recipe(current))
            current = {
                "id": int(heading.group(1)),
                "name": compact_text(heading.group(2)),
                "ingredients": [],
                "method_lines": [],
            }
            mode = None
            continue

        if not current:
            continue

        category = parse_labeled_value(line, "分类")
        if category:
            current["category"] = category
            mode = None
            continue

        servings = parse_labeled_value(line, "份量")
        if servings:
            current["servings"] = servings
            mode = None
            continue

        calories = parse_labeled_value(line, "卡路里")
        if calories:
            current["calorieText"] = calories
            mode = None
            continue

        if line in ("- 配料表：", "- 配料表:"):
            mode = "ingredients"
            continue

        if line in ("- 制作方式：", "- 制作方式:"):
            mode = "method"
            continue

        if mode == "ingredients" and line.startswith("- "):
            ingredient = parse_ingredient(line)
            if ingredient and ingredient["name"]:
                current["ingredients"].append(ingredient)
            continue

        if mode == "method":
            current["method_lines"].append(line)

    if current:
        items.append(finish_recipe(current))

    return items


def build_index(source_path):
    lines = extract_docx_lines(source_path)
    items = parse_recipes(lines)
    ingredient_counter = Counter()
    technique_counter = Counter()
    flavor_counter = Counter()
    calorie_count = 0

    for item in items:
        technique_counter[item["technique"]] += 1
        flavor_counter[item["flavor"]] += 1
        calorie_count += 1 if item.get("calorieEstimate") else 0
        for ingredient in item["ingredients"]:
            ingredient_counter[ingredient["name"]] += 1

    index = {
        "source": source_path.name,
        "sourceFormat": "docx-markdown",
        "itemCount": len(items),
        "facets": {
            "techniques": [name for name, _count in technique_counter.most_common() if name],
            "flavors": [name for name, _count in flavor_counter.most_common() if name],
            "topIngredients": [name for name, _count in ingredient_counter.most_common(40) if name],
        },
        "items": items,
        "calorieEstimateSource": source_path.name,
        "calorieEstimateCount": calorie_count,
        "calorieEstimateMatchedCount": calorie_count,
        "calorieEstimateMissingRecipeCount": len(items) - calorie_count,
    }
    if calorie_count != len(items):
        index["calorieEstimateMissingRecipes"] = [
            item["name"] for item in items if not item.get("calorieEstimate")
        ][:20]
    return index


def main():
    if len(sys.argv) != 3:
        print("Usage: build_menu_library_rag_from_docx.py <source.docx> <output.json>", file=sys.stderr)
        return 2

    source_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    if not source_path.exists():
        print(f"Source file not found: {source_path}", file=sys.stderr)
        return 1

    index = build_index(source_path)
    if index["itemCount"] == 0:
        print("No recipes were parsed from the source document.", file=sys.stderr)
        return 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(
        f"Wrote {index['itemCount']} recipes to {output_path} "
        f"({index['calorieEstimateMatchedCount']} with calorie estimates)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
