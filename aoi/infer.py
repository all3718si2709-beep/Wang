"""
推論:一張或一個資料夾。
  python infer.py --model models/metal_nut.pt --images some_dir --out runs/xxx [--mm-per-px 0.05]
輸出:每張的判定 + 熱圖 + 缺陷框(png),results.json(可直接匯入 qc-app 外觀發現),report.html
"""
import argparse, os, json, time
import numpy as np, cv2, torch
from aoi.data import list_images, load_rgb, Preproc
from aoi.patchcore import PatchCore, PatchCoreModel
from aoi.report import overlay, regions, panel, write_html


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--images", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--mm-per-px", type=float, default=None, help="校正:每像素幾 mm(以 --size 縮放後的影像為準)")
    ap.add_argument("--image-threshold", type=float, default=None)
    ap.add_argument("--pixel-threshold", type=float, default=None)
    a = ap.parse_args()

    dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = PatchCoreModel.load(a.model, dev)
    pc = PatchCore(dev, size=model.size, polar=model.polar)
    pc.model = model
    ithr = a.image_threshold or model.image_threshold
    pthr = a.pixel_threshold or model.pixel_threshold
    pre = Preproc(model.size, model.polar)
    files = list_images(a.images)
    os.makedirs(a.out, exist_ok=True)
    t0 = time.time()
    rgbs = [pre(load_rgb(f)) for f in files]
    scores, maps = pc.score([pre.to_tensor(r) for r in rgbs])
    vmax = max(float(scores.max()), ithr * 1.5)
    results, items = [], []
    for f, rgb, s, pm in zip(files, rgbs, scores, maps):
        amap = pc.anomaly_map(pm, rgb.shape[:2])
        regs = regions(amap, pthr) if s >= ithr else []
        for r in regs:
            if a.mm_per_px:
                r["mm"] = r["equiv_diam_px"] * a.mm_per_px
        verdict = "NG" if s >= ithr else "OK"
        name = os.path.splitext(os.path.basename(f))[0]
        pan = panel(rgb, amap, regs, pthr * 0.7, vmax, a.mm_per_px)
        cv2.imwrite(os.path.join(a.out, f"{name}.png"), cv2.cvtColor(pan, cv2.COLOR_RGB2BGR))
        results.append({"file": f, "score": float(s), "verdict": verdict, "regions": regs})
        items.append({"img": f"{name}.png", "title": os.path.basename(f), "verdict": verdict, "score": float(s), "regions": regs})
    dt = time.time() - t0
    json.dump({"model": a.model, "image_threshold": ithr, "pixel_threshold": pthr, "mm_per_px": a.mm_per_px, "results": results}, open(os.path.join(a.out, "results.json"), "w"), indent=1, ensure_ascii=False)
    ng = sum(r["verdict"] == "NG" for r in results)
    write_html(os.path.join(a.out, "report.html"), "外觀異常偵測結果", [("模型", a.model), ("張數", str(len(files))), ("判 NG", str(ng)), ("影像門檻", f"{ithr:.3f}"), ("像素門檻", f"{pthr:.3f}"), ("耗時", f"{dt:.1f}s(每張 {dt / max(1, len(files)) * 1000:.0f} ms)")], [], items)
    print(f"{len(files)} 張,NG {ng},{dt:.1f}s → {a.out}/report.html")


if __name__ == "__main__":
    main()
