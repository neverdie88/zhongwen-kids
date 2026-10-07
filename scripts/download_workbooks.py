#!/usr/bin/env python3
"""Download the 24 official revised Zhongwen A/B workbooks from HQU."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "workbooks"
SOURCES = {
    "A": "https://hwjyyjy.hqu.edu.cn/info/1015/1113.htm",
    "B": "https://hwjyyjy.hqu.edu.cn/info/1015/1112.htm",
}
ALTERNATES = {
    # The HQU copy downloads with a missing PDF trailer. This official archive copy validates.
    (8, "B"): (
        "https://oss.hwjyw.com/uploads/jiaocaifile/20230129/eb9ae3285b27ed3bf7e73b10b25d0a6f.pdf",
        "https://www.hwjyw.com/hwjc.html",
    ),
}
NUMERALS = "一二三四五六七八九十"
VOLUME_NAMES = ["第一", "第二", "第三", "第四", "第五", "第六", "第七", "第八", "第九", "第十", "第十一", "第十二"]


def fetch(url: str, timeout: int = 90) -> bytes:
    request = Request(url, headers={"User-Agent": "Mozilla/5.0 ZhongwenKids/1.0"})
    with urlopen(request, timeout=timeout) as response:
        return response.read()


class WorkbookLinks(HTMLParser):
    def __init__(self, base: str, side: str) -> None:
        super().__init__()
        self.base = base
        self.side = side
        self.href: str | None = None
        self.links: dict[int, str] = {}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "a":
            self.href = dict(attrs).get("href")

    def handle_data(self, text: str) -> None:
        if not self.href:
            return
        match = re.search(rf"练习册第([{NUMERALS}]+)册{self.side}\.pdf", text)
        if not match:
            return
        han = match.group(1)
        if han == "十":
            number = 10
        elif han.startswith("十"):
            number = 10 + NUMERALS.index(han[1]) + 1
        else:
            number = NUMERALS.index(han) + 1
        self.links[number] = urljoin(self.base, self.href)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a":
            self.href = None


def discover() -> list[tuple[int, str, str, str]]:
    found = []
    for side, page_url in SOURCES.items():
        page = fetch(page_url, timeout=30).decode("utf-8", "ignore")
        parser = WorkbookLinks(page_url, side)
        parser.feed(page)
        if set(parser.links) != set(range(1, 13)):
            raise RuntimeError(f"{side} index has volumes {sorted(parser.links)}, expected 1–12")
        for number, url in parser.links.items():
            pdf_url, index_url = ALTERNATES.get((number, side), (url, page_url))
            found.append((number, side, pdf_url, index_url))
    return sorted(found)


def download(item: tuple[int, str, str, str]) -> dict[str, object]:
    number, side, url, index_url = item
    path = DEST / f"zhongwen-{number:02d}-{side}.pdf"
    cached_info = subprocess.run(["pdfinfo", str(path)], text=True, capture_output=True) if path.exists() else None
    if cached_info and cached_info.returncode == 0 and path.stat().st_size > 100_000:
        body = path.read_bytes()
    else:
        for attempt in range(4):
            try:
                body = fetch(url)
                if not body.startswith(b"%PDF-") or len(body) < 100_000:
                    raise ValueError(f"not a valid PDF ({len(body)} bytes)")
                temp = path.with_suffix(".part")
                temp.write_bytes(body)
                checked = subprocess.run(["pdfinfo", str(temp)], text=True, capture_output=True)
                if checked.returncode:
                    raise ValueError(f"invalid PDF: {checked.stderr.strip()}")
                temp.replace(path)
                break
            except Exception:
                path.with_suffix(".part").unlink(missing_ok=True)
                if attempt == 3:
                    raise
                time.sleep(2 ** attempt)
    path.with_suffix(".part").unlink(missing_ok=True)
    if not body.startswith(b"%PDF-"):
        raise ValueError(f"bad PDF signature: {path}")
    info = subprocess.run(["pdfinfo", str(path)], text=True, capture_output=True, check=True).stdout
    pages_match = re.search(r"^Pages:\s+(\d+)$", info, re.MULTILINE)
    pages = int(pages_match.group(1)) if pages_match else 0
    if pages < 20:
        raise ValueError(f"implausible page count: {path}: {pages}")
    front = subprocess.run(["pdftotext", "-f", "1", "-l", "6", str(path), "-"], text=True, capture_output=True, check=True).stdout
    normalized = re.sub(r"\s+", "", unicodedata.normalize("NFKC", front))
    title = f"{VOLUME_NAMES[number - 1]}册练习册({side})"
    if title not in normalized:
        raise ValueError(f"title mismatch: expected {title} in {path}")
    return {
        "volume": number,
        "workbook": side,
        "file": path.name,
        "verified_title": title,
        "pages": pages,
        "bytes": len(body),
        "sha256": hashlib.sha256(body).hexdigest(),
        "index_url": index_url,
        "pdf_url": url,
    }


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    items = discover()
    results = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        jobs = {pool.submit(download, item): item for item in items}
        for job in as_completed(jobs):
            item = jobs[job]
            result = job.result()
            print(f"Book {item[0]:02d}{item[1]}: {result['pages']} pages, {result['bytes']} bytes", flush=True)
            results.append(result)
    results.sort(key=lambda x: (x["volume"], x["workbook"]))
    if len(results) != 24 or len({(r["volume"], r["workbook"]) for r in results}) != 24:
        raise RuntimeError("workbook set is incomplete")
    (DEST / "manifest.json").write_text(
        json.dumps({"sources": ["Huaqiao University Chinese Language Education Research Institute", "Chinese Overseas Education Network"], "files": results}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("Verified all 24 workbook PDFs.", flush=True)


if __name__ == "__main__":
    main()
