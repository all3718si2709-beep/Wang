from __future__ import annotations
import os, html
import numpy as np
import cv2


def overlay(rgb: np.ndarray, amap: np.ndarray, vmin: float, vmax: float, alpha: float = 0.45) -> np.ndarray:
    n = np.clip((amap - vmin) / max(vmax - vmin, 1e-6), 0, 1)
    heat = cv2.applyColorMap((n * 255).astype(np.uint8), cv2.COLORMAP_JET)
    heat = cv2.cvtColor(heat, cv2.COLOR_BGR2RGB)
    return (rgb * (1 - alpha * n[..., None]) + heat * (alpha * n[..., None])).astype(np.uint8)


def regions(amap: np.ndarray, thr: float, min_area: int = 20) -> list[dict]:
    """門檻以上的連通區 → 框、面積、等效直徑(px)、峰值分數"""
    mask = (amap >= thr).astype(np.uint8)
    n, lab, stats, cent = cv2.connectedComponentsWithStats(mask, connectivity=8)
    out = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < min_area:
            continue
        peak = float(amap[lab == i].max())
        out.append({"x": int(x), "y": int(y), "w": int(w), "h": int(h), "area_px": int(area),
                    "equiv_diam_px": float(2 * np.sqrt(area / np.pi)), "peak": peak, "cx": float(cent[i][0]), "cy": float(cent[i][1])})
    return sorted(out, key=lambda r: -r["peak"])


def draw_regions(rgb: np.ndarray, regs: list[dict], mm_per_px: float | None) -> np.ndarray:
    im = rgb.copy()
    for r in regs:
        cv2.rectangle(im, (r["x"], r["y"]), (r["x"] + r["w"], r["y"] + r["h"]), (255, 0, 0), 2)
        label = f"{r['equiv_diam_px'] * mm_per_px:.2f}mm" if mm_per_px else f"{r['equiv_diam_px']:.0f}px"
        cv2.putText(im, label, (r["x"], max(12, r["y"] - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 0, 0), 1, cv2.LINE_AA)
    return im


def panel(rgb: np.ndarray, amap: np.ndarray, regs: list[dict], vmin: float, vmax: float, mm_per_px: float | None, gt: np.ndarray | None = None) -> np.ndarray:
    cols = [rgb, overlay(rgb, amap, vmin, vmax), draw_regions(rgb, regs, mm_per_px)]
    if gt is not None:
        g = rgb.copy()
        cnts, _ = cv2.findContours((gt > 0).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(g, cnts, -1, (0, 255, 0), 2)
        cols.append(g)
    return np.concatenate(cols, axis=1)


def contact_sheet(panels: list[np.ndarray], titles: list[str], cols: int = 2, scale: float = 0.5) -> np.ndarray:
    tiles = []
    for p, t in zip(panels, titles):
        p = cv2.resize(p, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        bar = np.full((22, p.shape[1], 3), 255, np.uint8)
        cv2.putText(bar, t, (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (20, 20, 20), 1, cv2.LINE_AA)
        tiles.append(np.concatenate([bar, p], axis=0))
    w = max(t.shape[1] for t in tiles)
    h = max(t.shape[0] for t in tiles)
    tiles = [cv2.copyMakeBorder(t, 0, h - t.shape[0], 0, w - t.shape[1], cv2.BORDER_CONSTANT, value=(255, 255, 255)) for t in tiles]
    rows = [np.concatenate(tiles[i:i + cols], axis=1) for i in range(0, len(tiles), cols)]
    rows = [cv2.copyMakeBorder(r, 0, 0, 0, w * cols - r.shape[1], cv2.BORDER_CONSTANT, value=(255, 255, 255)) for r in rows]
    return np.concatenate(rows, axis=0)


def write_html(path: str, title: str, summary_rows: list[tuple[str, str]], sections: list[tuple[str, str]], items: list[dict]):
    """items: {img: relpath, title, verdict, score, regions}"""
    css = """body{font-family:system-ui,'Noto Sans TC',sans-serif;margin:24px;color:#0f172a;background:#f8fafc}
    table{border-collapse:collapse;margin:8px 0}td,th{border:1px solid #e2e8f0;padding:4px 10px;font-size:13px;text-align:left}
    .card{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin:10px 0}
    .ok{color:#15803d;font-weight:600}.ng{color:#b91c1c;font-weight:600}img{max-width:100%;border-radius:4px}
    .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.small{font-size:12px;color:#64748b}"""
    h = [f"<!doctype html><meta charset=utf-8><title>{html.escape(title)}</title><style>{css}</style><h1>{html.escape(title)}</h1>"]
    h.append("<div class=card><table>" + "".join(f"<tr><th>{html.escape(k)}</th><td>{html.escape(v)}</td></tr>" for k, v in summary_rows) + "</table></div>")
    for st, body in sections:
        h.append(f"<div class=card><h2>{html.escape(st)}</h2>{body}</div>")
    h.append("<div class=grid>")
    for it in items:
        cls = "ng" if it["verdict"] == "NG" else "ok"
        regs = "".join(f"<li>峰值 {r['peak']:.2f} · 等效直徑 {r['equiv_diam_px']:.0f}px" + (f" ≈ {r['mm']:.2f}mm" if 'mm' in r else "") + f" · 位置 ({r['cx']:.0f},{r['cy']:.0f})</li>" for r in it["regions"])
        h.append(f"<div class=card><div><b>{html.escape(it['title'])}</b> <span class={cls}>{it['verdict']}</span> <span class=small>分數 {it['score']:.2f}</span></div><img src='{it['img']}'><ul class=small>{regs}</ul></div>")
    h.append("</div>")
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    open(path, "w", encoding="utf-8").write("".join(h))
