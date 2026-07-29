from __future__ import annotations

import argparse
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

WORD_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def node_text(node: ET.Element) -> str:
    parts: list[str] = []
    for child in node.iter():
        tag = child.tag
        if tag == f"{{{WORD_NS['w']}}}t" and child.text:
            parts.append(child.text)
        elif tag == f"{{{WORD_NS['w']}}}tab":
            parts.append(" ")
        elif tag == f"{{{WORD_NS['w']}}}br":
            parts.append("\n")
    return re.sub(r"[ \t]+", " ", "".join(parts)).strip()


def extract_docx_lines(input_path: Path) -> list[str]:
    with zipfile.ZipFile(input_path) as archive:
        document_xml = archive.read("word/document.xml")

    root = ET.fromstring(document_xml)
    body = root.find("w:body", WORD_NS)
    if body is None:
        return []

    lines: list[str] = []
    for child in body:
        if child.tag == f"{{{WORD_NS['w']}}}p":
            text = node_text(child)
            if text:
                lines.append(text)
        elif child.tag == f"{{{WORD_NS['w']}}}tbl":
            for row in child.findall(".//w:tr", WORD_NS):
                cells = [node_text(cell) for cell in row.findall("./w:tc", WORD_NS)]
                cells = [cell for cell in cells if cell]
                if cells:
                    lines.append("| " + " | ".join(cells) + " |")

    return lines


def write_markdown(lines: list[str], input_path: Path, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    body = "\n".join(lines)
    output_path.write_text(
        f"# {input_path.stem}\n\n> Imported from DOCX RAG: {input_path}\n\n{body}\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert DOCX RAG into project knowledge-base markdown.")
    parser.add_argument("input_docx", type=Path)
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("knowledge-base") / "年轻向全球idol资料清单_120plus.md",
    )
    args = parser.parse_args()

    if not args.input_docx.exists():
        raise SystemExit(f"Input DOCX not found: {args.input_docx}")

    lines = extract_docx_lines(args.input_docx)
    if not lines:
        raise SystemExit(f"No text extracted from DOCX: {args.input_docx}")

    write_markdown(lines, args.input_docx, args.out)
    print(f"Imported {len(lines)} text/table lines to {args.out}")


if __name__ == "__main__":
    main()
