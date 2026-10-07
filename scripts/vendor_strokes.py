"""Copy only Book 2 stroke data from an official hanzi-writer-data npm tarball."""

import json
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOOK = ROOT / "data" / "book2.json"
DEST = ROOT / "public" / "strokes"


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 scripts/vendor_strokes.py /path/to/hanzi-writer-data-2.0.1.tgz")
    book = json.loads(BOOK.read_text())
    chars = sorted({
        char
        for lesson in book["lessons"]
        for text in [lesson["character"], *(phrase["chinese"] for phrase in lesson["phrases"])]
        for char in text
        if "\u3400" <= char <= "\u9fff"
    })
    DEST.mkdir(exist_ok=True)
    with tarfile.open(sys.argv[1], "r:gz") as archive:
        for char in chars:
            member = archive.extractfile(f"package/{char}.json")
            if member is None:
                raise RuntimeError(f"Missing stroke data: {char}")
            payload = member.read()
            data = json.loads(payload)
            if not data.get("strokes") or not data.get("medians"):
                raise RuntimeError(f"Invalid stroke data: {char}")
            (DEST / f"{char}.json").write_bytes(payload)
        license_file = archive.extractfile("package/ARPHICPL.TXT")
        if license_file is None:
            raise RuntimeError("Stroke data license is missing")
        (DEST / "ARPHICPL.TXT").write_bytes(license_file.read())
    print(f"Saved {len(chars)} local stroke-order files")


if __name__ == "__main__":
    main()
