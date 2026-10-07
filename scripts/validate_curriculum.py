#!/usr/bin/env python3
"""Check the playable Book 2 phrases against the supplied textbook PDF."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "source" / "zhongwen-02-textbook.pdf"
DATA = ROOT / "data" / "book2.json"


def han(text: str) -> str:
    return "".join(re.findall(r"[\u4e00-\u9fff]", text))


def main() -> None:
    curriculum = json.loads(DATA.read_text(encoding="utf-8"))
    lessons = curriculum["lessons"]
    assert [x["number"] for x in lessons] == list(range(1, 13))
    assert [x["unit"] for x in lessons] == [1] * 3 + [2] * 3 + [3] * 3 + [4] * 3
    assert len(curriculum["units"]) == 4
    total = 0
    for lesson in lessons:
        page = lesson["page"] + 14  # the printed page 1 is PDF page 15
        raw = subprocess.run(
            ["pdftotext", "-f", str(page), "-l", str(page), "-layout", str(PDF), "-"],
            text=True, capture_output=True, check=True,
        ).stdout
        # The PDF's old font corrupts pinyin on extraction. Exclude lines with
        # Latin letters; the main Chinese text is intact on these pages.
        chinese_lines = [line for line in raw.splitlines() if not re.search(r"[A-Za-z]", line) and han(line)]
        source = han("".join(chinese_lines))
        assert han(lesson["title"]) in source, lesson["title"]
        for phrase in lesson["phrases"]:
            assert han(phrase["chinese"]) in source, (lesson["number"], phrase["chinese"])
            assert phrase["english"] and phrase["pinyin"]
            total += 1
        assert han("".join(lesson["build"])) in source, lesson["number"]
    print(f"Validated 12 lessons, 4 units, {total} focus phrases, and 12 sentence builders against the PDF.")


if __name__ == "__main__":
    main()
