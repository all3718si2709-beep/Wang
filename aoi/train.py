"""
訓練:只要 OK 件照片。
  python train.py --good datasets/metal_nut/train/good --out models/metal_nut.pt
留出 --holdout 張 OK 件不進記憶庫,用來定門檻(不然記憶庫裡的圖自己對自己距離是 0)。
"""
import argparse, os, time, json
import numpy as np, torch
from aoi.data import list_images, load_rgb, Preproc
from aoi.patchcore import PatchCore, calibrate_thresholds


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--good", required=True, help="OK 件資料夾")
    ap.add_argument("--out", required=True)
    ap.add_argument("--size", type=int, default=256)
    ap.add_argument("--polar", action="store_true", help="圓形零件:先極座標展開")
    ap.add_argument("--coreset", type=float, default=0.1)
    ap.add_argument("--holdout", type=int, default=20)
    ap.add_argument("--k-sigma", type=float, default=3.0)
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()

    files = list_images(a.good)
    if len(files) < 30:
        raise SystemExit(f"OK 件太少({len(files)}),至少 30 張,建議 100+")
    rng = np.random.default_rng(a.seed)
    perm = rng.permutation(len(files))
    hold = [files[i] for i in perm[:a.holdout]]
    train = [files[i] for i in perm[a.holdout:]]
    print(f"OK 件 {len(files)} 張:訓練 {len(train)} / 留出定門檻 {len(hold)}")

    pre = Preproc(a.size, a.polar)
    t0 = time.time()
    pc = PatchCore(size=a.size, polar=a.polar)
    print(f"裝置 {pc.device}")
    tr = [pre.to_tensor(pre(load_rgb(f))) for f in train]
    model = pc.fit(tr, coreset_ratio=a.coreset)
    ho = [pre.to_tensor(pre(load_rgb(f))) for f in hold]
    s, m = pc.score(ho)
    calib = calibrate_thresholds(s, m, a.k_sigma)
    model.image_threshold = calib["image_threshold"]
    model.pixel_threshold = calib["pixel_threshold"]
    model.calib = {**calib, "train_files": len(train), "holdout_files": hold, "size": a.size, "polar": a.polar, "coreset": a.coreset}
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    model.save(a.out)
    print(f"留出 OK 件影像分數:mean {calib['good_mean']:.3f} / std {calib['good_std']:.3f} / max {calib['good_max']:.3f}")
    print(f"門檻:影像 {model.image_threshold:.3f},像素 {model.pixel_threshold:.3f}")
    print(f"完成 {time.time() - t0:.1f}s → {a.out}")
    json.dump(model.calib, open(a.out + ".json", "w"), indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
