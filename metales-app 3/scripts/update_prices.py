#!/usr/bin/env python3
"""Descarga los precios de cierre y actualiza data/prices.json.

- Estaño y plomo: LME Cash-Settlement, 3 meses y stocks (tabla pública de westmetall.com)
- Plata: cierre diario XAG/USD (stooq.com, con respaldo en Yahoo Finance SI=F)

Solo usa la biblioteca estándar de Python (no requiere pip install).
"""
import csv
import io
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "prices.json"
KEEP_DAYS = 800  # ~3 años de días hábiles
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"

LME = {
    "tin": {"name": "Estaño", "field": "LME_Sn_cash"},
    "lead": {"name": "Plomo", "field": "LME_Pb_cash"},
}

MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july",
     "august", "september", "october", "november", "december"], 1)}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", errors="replace")


def parse_date(text):
    """'08. October 2026' -> '2026-10-08' (también acepta 2026-10-08 y 08.10.2026)."""
    t = text.strip().lower().replace(",", " ")
    m = re.match(r"(\d{1,2})\.?\s+([a-z]+)\s+(\d{4})", t)
    if m and m.group(2) in MONTHS:
        return f"{int(m.group(3)):04d}-{MONTHS[m.group(2)]:02d}-{int(m.group(1)):02d}"
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", t)
    if m:
        return m.group(0)
    m = re.match(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", t)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    return None


def parse_num(text):
    t = text.strip().replace(",", "").replace(" ", "")
    try:
        return float(t)
    except ValueError:
        return None


def parse_westmetall(html):
    """Devuelve [{date, cash, m3, stock}] a partir de la(s) tabla(s) de westmetall."""
    rows = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", html, flags=re.S | re.I):
        cells = [unescape(re.sub(r"<[^>]+>", "", c)).strip()
                 for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, flags=re.S | re.I)]
        if len(cells) < 2:
            continue
        d = parse_date(cells[0])
        if not d:
            continue
        nums = [parse_num(c) for c in cells[1:]]
        cash = nums[0] if nums else None
        if cash is None:
            continue
        rows.append({
            "date": d,
            "cash": cash,
            "m3": nums[1] if len(nums) > 1 else None,
            "stock": nums[2] if len(nums) > 2 else None,
        })
    return rows


def fetch_lme(field):
    url = f"https://www.westmetall.com/en/markdaten.php?action=table&field={field}"
    rows = parse_westmetall(get(url))
    if not rows:
        raise RuntimeError(f"No se encontraron filas en {url}")
    return rows


def fetch_silver_stooq():
    text = get("https://stooq.com/q/d/l/?s=xagusd&i=d")
    rows = []
    for r in csv.DictReader(io.StringIO(text)):
        close = parse_num(r.get("Close", "") or "")
        d = parse_date(r.get("Date", "") or "")
        if d and close:
            rows.append({"date": d, "close": close})
    if not rows:
        raise RuntimeError("stooq sin datos")
    return rows


def fetch_silver_yahoo():
    data = json.loads(get("https://query1.finance.yahoo.com/v8/finance/chart/SI=F?range=5y&interval=1d"))
    res = data["chart"]["result"][0]
    rows = []
    for ts, c in zip(res["timestamp"], res["indicators"]["quote"][0]["close"]):
        if c:
            d = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
            rows.append({"date": d, "close": round(c, 3)})
    if not rows:
        raise RuntimeError("yahoo sin datos")
    return rows


def merge(old, new, key="date"):
    """Une historiales; lo nuevo gana. Así un día con fuente caída no borra lo previo."""
    by = {r[key]: r for r in old}
    by.update({r[key]: r for r in new})
    return sorted(by.values(), key=lambda r: r[key])[-KEEP_DAYS:]


def main():
    prev = json.loads(OUT.read_text()) if OUT.exists() else {}
    prev_m = prev.get("metals", {})
    out = {"updated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "metals": {}, "errors": []}

    for key, cfg in LME.items():
        old = prev_m.get(key, {}).get("history", [])
        try:
            hist = merge(old, fetch_lme(cfg["field"]))
        except Exception as e:  # noqa: BLE001
            out["errors"].append(f"{cfg['name']}: {e}")
            hist = old
        out["metals"][key] = {
            "name": cfg["name"], "unit": "USD/t", "source": "LME (vía westmetall.com)",
            "history": hist,
        }

    old = prev_m.get("silver", {}).get("history", [])
    hist, src = old, "—"
    for fn, label in ((fetch_silver_stooq, "XAG/USD (stooq.com)"), (fetch_silver_yahoo, "COMEX SI=F (Yahoo Finance)")):
        try:
            hist, src = merge(old, fn()), label
            break
        except Exception as e:  # noqa: BLE001
            out["errors"].append(f"Plata {label}: {e}")
    out["metals"]["silver"] = {"name": "Plata", "unit": "USD/oz", "source": src, "history": hist}

    if not any(m["history"] for m in out["metals"].values()):
        print("ERROR: ninguna fuente respondió", out["errors"], file=sys.stderr)
        sys.exit(1)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    for k, m in out["metals"].items():
        last = m["history"][-1] if m["history"] else None
        print(f"{m['name']:7s} {len(m['history']):4d} días  último: {last}")
    for e in out["errors"]:
        print("AVISO:", e)


if __name__ == "__main__":
    main()
