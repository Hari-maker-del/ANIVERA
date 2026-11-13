#!/usr/bin/env python3
"""Replace ANIVERA species photos with openly licensed Wikimedia Commons originals.

Only accepts CC0, public-domain, or Creative Commons Attribution / Attribution-ShareAlike
images. Each accepted source is cropped exactly as the site's 16:9 object-fit:cover hero
would crop it, then encoded as a 3840x2160 WebP. Unmatched species are left untouched.
"""
from pathlib import Path
from PIL import Image, ImageOps
from io import BytesIO
import json, re, time, requests

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "animals-data.js"
OUT_DIRS = [ROOT / "public/assets/species", ROOT / "dist/assets/species"]
REPORT = ROOT / "species-photo-sources.json"
API = "https://commons.wikimedia.org/w/api.php"
HEADERS = {"User-Agent": "ANIVERA-SpeciesPhotoRefresh/1.0 (open wildlife image attribution; GitHub Actions)"}
ALLOWED_LICENSES = ("cc0", "public domain", "cc by", "cc-by", "cc by-sa", "cc-by-sa")
session = requests.Session()
session.headers.update(HEADERS)

raw = DATA_FILE.read_text(encoding="utf-8")
raw = re.sub(r"^\s*window\.ANIVERA_ANIMALS_DATA\s*=\s*", "", raw)
raw = re.sub(r";\s*$", "", raw)
animals = json.loads(raw)

def license_ok(meta):
    license_name = str(meta.get("LicenseShortName", {}).get("value", "")).strip().lower()
    license_url = str(meta.get("LicenseUrl", {}).get("value", "")).lower()
    combined = license_name + " " + license_url
    if any(x in combined for x in ("nc", "noncommercial", "nd", "no derivatives")):
        return False
    return any(x in combined for x in ALLOWED_LICENSES)

def search_candidates(common, scientific):
    queries = [scientific, common]
    seen = set()
    candidates = []
    for query in queries:
        params = {
            "action": "query", "generator": "search", "gsrsearch": query,
            "gsrnamespace": 6, "gsrlimit": 30, "prop": "imageinfo",
            "iiprop": "url|size|extmetadata", "format": "json", "formatversion": 2
        }
        response = session.get(API, params=params, timeout=45)
        response.raise_for_status()
        pages = response.json().get("query", {}).get("pages", [])
        for page in pages:
            title = page.get("title", "")
            if title in seen:
                continue
            seen.add(title)
            info = (page.get("imageinfo") or [{}])[0]
            meta = info.get("extmetadata") or {}
            width, height = int(info.get("width", 0)), int(info.get("height", 0))
            url = info.get("url", "")
            if not url or max(width, height) < 1920 or not license_ok(meta):
                continue
            title_norm = re.sub(r"[^a-z0-9]+", " ", title.lower())
            sci_words = [w.lower() for w in scientific.split() if len(w) > 2]
            common_words = [w.lower() for w in common.split() if len(w) > 2]
            sci_hits = sum(w in title_norm for w in sci_words)
            common_hits = sum(w in title_norm for w in common_words)
            # Scientific-name matches rank highest; resolution and landscape framing break ties.
            score = sci_hits * 100 + common_hits * 12 + min(max(width, height), 8000) / 100
            ratio = width / height if height else 0
            score -= abs(ratio - (16/9)) * 5
            candidates.append((score, width, height, title, url, meta))
        time.sleep(0.15)
    return sorted(candidates, key=lambda x: x[0], reverse=True)

def meta_value(meta, key):
    return re.sub(r"<[^>]+>", "", str((meta.get(key) or {}).get("value", ""))).strip()

report = {"target": "3840x2160 WebP hero images", "crop": "centered 16:9 cover crop matching the hero frame", "license_policy": "CC0, public domain, CC BY, CC BY-SA only", "replaced": [], "unchanged": [], "errors": []}
for index, animal in enumerate(animals, 1):
    common = animal.get("commonName") or animal.get("name") or ""
    scientific = animal.get("scientificName") or ""
    image_url = animal.get("imageUrl") or animal.get("imageSource") or ""
    filename = Path(image_url).name
    if not filename:
        report["unchanged"].append({"animal": common, "reason": "No image filename in catalogue"})
        continue
    destination = OUT_DIRS[0] / filename
    try:
        candidates = search_candidates(common, scientific)
        if not candidates:
            report["unchanged"].append({"animal": common, "file": str(destination.relative_to(ROOT)), "reason": "No high-resolution, clearly licensed Commons match; kept existing image"})
            continue
        score, width, height, title, source_url, meta = candidates[0]
        response = session.get(source_url, timeout=90)
        response.raise_for_status()
        image = Image.open(BytesIO(response.content))
        image = ImageOps.exif_transpose(image).convert("RGB")
        # This is the same centered 16:9 crop produced by the current hero's cover fit.
        image = ImageOps.fit(image, (3840, 2160), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
        for out_dir in OUT_DIRS:
            out_dir.mkdir(parents=True, exist_ok=True)
            image.save(out_dir / filename, "WEBP", quality=94, method=6)
        report["replaced"].append({
            "animal": common, "scientific_name": scientific, "file": str(destination.relative_to(ROOT)),
            "source_title": title, "source_url": source_url, "source_dimensions": [width, height],
            "output_dimensions": [3840, 2160], "license": meta_value(meta, "LicenseShortName"),
            "license_url": meta_value(meta, "LicenseUrl"), "artist": meta_value(meta, "Artist"),
            "credit": meta_value(meta, "Credit"), "attribution": meta_value(meta, "Attribution")
        })
        print(f"[{index}/{len(animals)}] replaced {common}: {width}x{height} -> 3840x2160", flush=True)
    except Exception as exc:
        report["errors"].append({"animal": common, "file": filename, "error": str(exc)})
        print(f"[{index}/{len(animals)}] ERROR {common}: {exc}", flush=True)

REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
print(json.dumps({"replaced": len(report["replaced"]), "unchanged": len(report["unchanged"]), "errors": len(report["errors"])}, indent=2))
