import argparse
import hashlib
import json
import re
from pathlib import Path

try:
    import pillow_avif  # noqa: F401 - registers the AVIF encoder with Pillow
except ImportError:
    pass

from PIL import Image, ImageOps, features


PROJECT_ID = re.compile(r"^[a-z0-9-]{2,80}$")


def encode_variant(image, output_dir, project_id, width, image_format):
    target_width = min(width, image.width)
    target_height = max(1, round(image.height * target_width / image.width))
    resized = image.resize((target_width, target_height), Image.Resampling.LANCZOS)
    extension = image_format.lower()
    temporary = output_dir / f".{project_id}-{target_width}w.{extension}.tmp"
    if image_format == "WEBP":
        resized.save(temporary, "WEBP", quality=78, method=6)
    else:
        resized.save(temporary, "AVIF", quality=50, speed=6)
    digest = hashlib.sha256(temporary.read_bytes()).hexdigest()[:12]
    final_name = f"{project_id}-{target_width}w.{digest}.{extension}"
    final_path = output_dir / final_name
    temporary.replace(final_path)
    return {
        "src": f"/hub/assets/project-covers/generated/{final_name}",
        "width": target_width,
        "bytes": final_path.stat().st_size,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--source-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--result", required=True)
    args = parser.parse_args()

    if not features.check("webp") or not features.check("avif"):
        raise SystemExit("Pillow must provide both WebP and AVIF encoders.")

    source_dir = Path(args.source_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    projects = json.loads(Path(args.input).read_text(encoding="utf-8"))["projects"]
    result = {}

    for project in projects:
        project_id = str(project["id"])
        source_name = Path(str(project["source"])).name
        if not PROJECT_ID.fullmatch(project_id) or source_name != str(project["source"]):
            raise ValueError(f"Unsafe cover input for {project_id!r}")
        source_path = (source_dir / source_name).resolve()
        if source_path.parent != source_dir or not source_path.is_file():
            raise FileNotFoundError(source_name)

        with Image.open(source_path) as opened:
            image = ImageOps.exif_transpose(opened)
            image.load()
            image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
            variants = {"avif": [], "webp": []}
            for width in (480, 800):
                for image_format in ("AVIF", "WEBP"):
                    variant = encode_variant(image, output_dir, project_id, width, image_format)
                    bucket = image_format.lower()
                    if all(item["width"] != variant["width"] for item in variants[bucket]):
                        variants[bucket].append(variant)

            result[project_id] = {
                "width": image.width,
                "height": image.height,
                "fallback": variants["webp"][0]["src"],
                **variants,
            }

    Path(args.result).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
