from pathlib import Path
from PIL import Image, ImageOps
import json

ROOTS = [Path("public/assets/animals"), Path("dist/assets/animals")]
MIN_LONG_EDGE = 3840
QUALITY = 94
processed = []
errors = []

for root in ROOTS:
    if not root.is_dir():
        errors.append({"file": str(root), "error": "Image directory not found"})
        continue
    for path in sorted(root.iterdir()):
        if path.suffix.lower() not in {".webp", ".jpg", ".jpeg", ".png"}:
            continue
        try:
            with Image.open(path) as source:
                source.load()
                image = ImageOps.exif_transpose(source)
                width, height = image.size
                long_edge = max(width, height)
                if long_edge < MIN_LONG_EDGE:
                    scale = MIN_LONG_EDGE / long_edge
                    target = (round(width * scale), round(height * scale))
                    image = image.resize(target, Image.Resampling.LANCZOS)
                else:
                    target = (width, height)

                if image.mode not in ("RGB", "RGBA"):
                    image = image.convert("RGBA" if "transparency" in image.info else "RGB")
                if path.suffix.lower() == ".webp":
                    image.save(path, "WEBP", quality=QUALITY, method=6)
                else:
                    output = path.with_suffix(".webp")
                    image.save(output, "WEBP", quality=QUALITY, method=6)
                    path.unlink()
                    path = output

                processed.append({
                    "file": str(path),
                    "source_dimensions": [width, height],
                    "output_dimensions": list(target),
                    "bytes": path.stat().st_size,
                    "long_edge_at_least_3840": max(target) >= MIN_LONG_EDGE,
                })
        except Exception as exc:
            errors.append({"file": str(path), "error": str(exc)})

report = {
    "target": "4K-class (minimum 3840 pixels on the long edge)",
    "method": "Lanczos upscale; this increases pixel dimensions but does not create native captured detail",
    "processed_count": len(processed),
    "error_count": len(errors),
    "images": processed,
    "errors": errors,
}
Path("animal-4k-upscale-report.json").write_text(json.dumps(report, indent=2))
print(json.dumps({"processed": len(processed), "errors": errors}, indent=2))
if errors:
    raise SystemExit(1)
