#!/usr/bin/env python3
"""Обновляет данные сайта: выпуски BreezeCAD и каталог модулей.

  data/releases.json        — публичные выпуски BreezeCAD/breezecad (без пре-релизов)
                              и варианты скачивания каждого из них;
  data/registry-index.json  — index.json из BreezeCAD/registry;
  index.html, en/index.html — версия и размеры, вписанные прямо в страницу
                              (элементы с data-bz="…"), чтобы сайт показывал их и без JS.

Запускается Action'ом sync-data (раз в сутки, по событию, вручную). Только стандартная
библиотека Python. Токен — GITHUB_TOKEN, если есть.

  python3 scripts/sync_data.py
  python3 scripts/sync_data.py --offline   # только переписать страницы по готовым data/*.json
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = "BreezeCAD/breezecad"
REGISTRY_URL = "https://raw.githubusercontent.com/BreezeCAD/registry/main/index.json"
PAGES = ["index.html", "en/index.html"]

# Варианты скачивания: (система, вариант, точное имя файла в выпуске). Порядок —
# порядок на сайте; первый найденный вариант системы — рекомендуемый.
VARIANTS = [
    ("windows", "offline", "BreezeCAD-Setup-offline.exe"),
    ("windows", "online", "BreezeCAD-Setup.exe"),
    ("windows", "portable", "BreezeCAD-windows.zip"),
    ("macos", "dmg", "BreezeCAD-macos.dmg"),
    ("macos", "zip", "BreezeCAD-macos.zip"),
    ("linux", "offline", "BreezeCAD-Setup-linux-offline"),
    ("linux", "online", "BreezeCAD-Setup-linux"),
    ("linux", "targz", "BreezeCAD-linux.tar.gz"),
    ("android", "apk", "BreezeCAD-android.apk"),
]
# Чем меряется «вес» программы в блоке «Воплощение невесомости»: архив без установщика.
WEIGHT = {"windows": "portable", "macos": "zip", "linux": "targz", "android": "apk"}


def get(url: str, api: bool = True):
    headers = {"User-Agent": "breezecad-site"}
    if api:
        headers.update({"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"})
        if os.environ.get("GITHUB_TOKEN"):
            headers["Authorization"] = f"Bearer {os.environ['GITHUB_TOKEN']}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def label_of(rel: dict) -> str:
    """«BreezeCAD 0.2.5.1-Beta» → «0.2.5.1-Beta»; без имени — из тега v0.1.0-stable → 0.1.0-Stable."""
    name = (rel.get("name") or "").strip()
    m = re.search(r"\d+(?:\.\d+)+(?:-[A-Za-z0-9.]+)?", name)
    if m:
        return m.group(0)
    tag = re.sub(r"^v", "", rel["tag_name"])
    return re.sub(r"-([a-z])", lambda x: "-" + x.group(1).upper(), tag)


def fetch_releases() -> dict:
    rels, page = [], 1
    while True:
        batch = get(f"https://api.github.com/repos/{REPO}/releases?per_page=100&page={page}") or []
        rels += batch
        if len(batch) < 100:
            break
        page += 1
    out = []
    for r in rels:
        if r.get("draft") or r.get("prerelease") or not re.match(r"v\d", r["tag_name"]):
            continue
        assets = {a["name"]: a for a in r.get("assets", [])}
        variants = {}
        for system, variant, name in VARIANTS:
            a = assets.get(name)
            if a:
                variants.setdefault(system, {})[variant] = {
                    "name": name, "url": a["browser_download_url"], "size": a["size"]}
        if not variants:
            continue
        out.append({
            "tag": r["tag_name"],
            "label": label_of(r),
            "date": (r.get("published_at") or "")[:10],
            "url": r["html_url"],
            "variants": variants,
        })
    out.sort(key=lambda x: x["date"], reverse=True)
    return {"repo": REPO, "latest": out[0]["tag"] if out else None, "releases": out}


def write_json(path: Path, data: dict) -> bool:
    """Пишет, только если содержимое изменилось (поле generated не в счёт)."""
    strip = lambda d: {k: v for k, v in d.items() if k != "generated"}  # noqa: E731
    if path.exists():
        try:
            if strip(json.loads(path.read_text("utf-8"))) == strip(data):
                return False
        except json.JSONDecodeError:
            pass
    data = {"generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), **strip(data)}
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", "utf-8")
    return True


def mb(size: int) -> int:
    return max(1, round(size / 1048576))


def patch_pages(releases: dict) -> list[str]:
    """Вписывает версию и размеры в элементы data-bz="version" / "size-<система>" / "bar-<система>"."""
    if not releases["releases"]:
        return []
    latest = releases["releases"][0]
    values = {"version": latest["label"]}
    for system, variant in WEIGHT.items():
        v = latest["variants"].get(system, {}).get(variant)
        if v:
            values[f"size-{system}"] = str(mb(v["size"]))
    changed = []
    for page in PAGES:
        p = ROOT / page
        if not p.exists():
            continue
        html = p.read_text("utf-8")
        new = html
        for key, val in values.items():
            new = re.sub(r'(<(\w+)[^>]*\bdata-bz="%s"[^>]*>)[^<]*(</\2>)' % re.escape(key),
                         lambda m, v=val: m.group(1) + v + m.group(3), new)
            if key.startswith("size-"):  # полоска шкалы 0–100 МБ
                bar = key.replace("size-", "bar-")
                new = re.sub(r'(<div[^>]*\bdata-bz="%s"[^>]*style="[^"]*?width:\s*)\d+(%%)' % re.escape(bar),
                             lambda m, v=val: m.group(1) + str(min(100, int(v))) + m.group(2), new)
        if new != html:
            p.write_text(new, "utf-8")
            changed.append(page)
    return changed


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--offline", action="store_true")
    args = ap.parse_args()
    data = ROOT / "data"
    data.mkdir(exist_ok=True)

    if args.offline:
        releases = json.loads((data / "releases.json").read_text("utf-8"))
    else:
        releases = fetch_releases()
        if not releases["releases"]:
            print("::error::Не нашлось ни одного выпуска — данные не трогаю.")
            return 1
        print("releases.json:", "обновлён" if write_json(data / "releases.json", releases) else "без изменений",
              f"(последний — {releases['releases'][0]['label']}, всего {len(releases['releases'])})")
        try:
            index = get(REGISTRY_URL, api=False)
        except Exception as e:  # noqa: BLE001
            index = None
            print(f"::warning::Каталог недоступен: {e}")
        if index and isinstance(index.get("items"), list):
            print("registry-index.json:", "обновлён" if write_json(data / "registry-index.json", index) else "без изменений",
                  f"({len(index['items'])} записей)")
        else:
            print("::warning::Каталог не получен — оставляю прежний data/registry-index.json.")

    for page in patch_pages(releases):
        print(f"{page}: вписаны версия и размеры")
    return 0


if __name__ == "__main__":
    sys.exit(main())
