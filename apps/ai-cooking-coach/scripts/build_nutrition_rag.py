import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


NUTRIENT_LABELS = [
    ("energyKcal", "能量"),
    ("proteinG", "蛋白"),
    ("fatG", "脂肪"),
    ("carbsG", "碳水"),
    ("fiberG", "纤维"),
    ("sugarG", "糖"),
    ("sodiumMg", "钠"),
    ("potassiumMg", "钾"),
    ("calciumMg", "钙"),
    ("ironMg", "铁"),
    ("vitaminCMg", "维C"),
    ("vitaminAUg", "维A"),
    ("vitaminB12Ug", "B12"),
    ("cholesterolMg", "胆固醇"),
]

GENERIC_FEATURE = "营养特点不突出/需看具体数值"


def docx_paragraphs(path):
    with zipfile.ZipFile(path) as package:
        document_xml = package.read("word/document.xml")
    root = ET.fromstring(document_xml)
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

    paragraphs = []
    for paragraph in root.findall(".//w:p", ns):
        text = "".join(node.text or "" for node in paragraph.findall(".//w:t", ns)).strip()
        if text:
            paragraphs.append(text)
    return paragraphs


def parse_nutrients(summary):
    nutrients = {}
    for part in summary.split(";"):
        text = part.strip()
        if not text:
            continue
        for key, label in NUTRIENT_LABELS:
            if not text.startswith(label):
                continue
            rest = text[len(label) :].strip()
            match = re.match(r"^(NA|-?\d+(?:\.\d+)?)(.*)$", rest)
            if not match:
                break
            raw_value, unit = match.groups()
            nutrients[key] = {
                "label": label,
                "value": None if raw_value == "NA" else float(raw_value),
                "unit": unit.strip(),
            }
            break
    return nutrients


def parse_features(features):
    if not features or features == GENERIC_FEATURE:
        return []
    return [item.strip() for item in re.split(r"[；;]", features) if item.strip()]


def parse_food_row(line):
    if not re.match(r"^\|\s*\d+\s*\|", line):
        return None

    cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
    if len(cells) < 5 or not cells[0].isdigit():
        return None

    if len(cells) >= 6:
        index, fdc_id, chinese_hint, english_name, features, summary = cells[:6]
        name = chinese_hint or english_name
    else:
        index, fdc_id, name, features, summary = cells[:5]
        chinese_hint = ""
        english_name = name

    return {
        "id": int(index),
        "fdcId": fdc_id,
        "name": name,
        "chineseHint": chinese_hint,
        "englishName": english_name,
        "features": parse_features(features),
        "summary": summary,
        "nutrients": parse_nutrients(summary),
        "searchText": f"{name} {english_name} {features} {summary}".lower(),
    }


def build_index(source_path):
    items = []
    for line in docx_paragraphs(source_path):
        item = parse_food_row(line)
        if item:
            items.append(item)

    return {
        "source": Path(source_path).name,
        "dataSource": "USDA FoodData Central - SR Legacy CSV (Release 04/2018)",
        "servingBasis": "每 1g 食材约含量",
        "itemCount": len(items),
        "items": items,
    }


def main():
    if len(sys.argv) != 3:
        print("Usage: build_nutrition_rag.py <source.docx> <output.json>", file=sys.stderr)
        return 2

    source_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    output_path.parent.mkdir(parents=True, exist_ok=True)

    index = build_index(source_path)
    if index["itemCount"] < 1000:
        raise RuntimeError(f"Only extracted {index['itemCount']} rows; expected a large nutrition table.")

    output_path.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {index['itemCount']} nutrition rows to {output_path}")


if __name__ == "__main__":
    raise SystemExit(main())
