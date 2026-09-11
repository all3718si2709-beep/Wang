"""
用 MVTec AD metal_nut 做完整驗證:訓練 → 測試集(含 OK 與四種缺陷)→ 準確率 + 漏檢 / 誤殺 + 逐類偵測率 + 圖。
  python eval_mvtec.py --data datasets/metal_nut --out runs/metal_nut
"""
import argparse, os, json, time, collections
import numpy as np, cv2, torch
from sklearn.metrics import roc_auc_score
from aoi.data import load_rgb, Preproc
from aoi.patchcore import PatchCore, PatchCoreModel
from aoi.report import regions, panel, contact_sheet, write_html


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default=None, help="已訓練模型;不給就現場訓練")
    ap.add_argument("--size", type=int, default=256)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    man = json.load(open(os.path.join(a.data, "manifest.json")))
    dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    if a.model:
        model = PatchCoreModel.load(a.model, dev)
    else:
        import subprocess, sys
        mp = os.path.join(a.out, "model.pt")
        subprocess.run([sys.executable, "train.py", "--good", os.path.join(a.data, "train", "good"), "--out", mp, "--size", str(a.size)], check=True)
        model = PatchCoreModel.load(mp, dev)
    pc = PatchCore(dev, size=model.size, polar=model.polar); pc.model = model
    pre = Preproc(model.size, model.polar)

    test = [m for m in man if m["split"] == "test"]
    t0 = time.time()
    rgbs = [pre(load_rgb(m["image"])) for m in test]
    scores, maps = pc.score([pre.to_tensor(r) for r in rgbs])
    dt = time.time() - t0
    y = np.array([0 if m["defect"] == "good" else 1 for m in test])
    img_auroc = roc_auc_score(y, scores)

    # 像素級 AUROC(有遮罩的)
    px_y, px_s = [], []
    amaps = [pc.anomaly_map(pm, r.shape[:2]) for pm, r in zip(maps, rgbs)]
    gts = []
    for m, r, am in zip(test, rgbs, amaps):
        if m["mask"]:
            g = cv2.imread(m["mask"], cv2.IMREAD_GRAYSCALE)
            g = cv2.resize(g, (r.shape[1], r.shape[0]), interpolation=cv2.INTER_NEAREST)
        else:
            g = np.zeros(r.shape[:2], np.uint8)
        gts.append(g)
        px_y.append((g > 0).ravel()[::7]); px_s.append(am.ravel()[::7])
    px_auroc = roc_auc_score(np.concatenate(px_y), np.concatenate(px_s))

    ithr, pthr = model.image_threshold, model.pixel_threshold
    pred = (scores >= ithr).astype(int)
    tp = int(((pred == 1) & (y == 1)).sum()); fn = int(((pred == 0) & (y == 1)).sum())
    fp = int(((pred == 1) & (y == 0)).sum()); tn = int(((pred == 0) & (y == 0)).sum())
    per = collections.OrderedDict()
    for m, p in zip(test, pred):
        d = m["defect"]; per.setdefault(d, [0, 0]); per[d][1] += 1; per[d][0] += int(p == 1)
    # 若把門檻放在最佳點(僅供參考:實務上門檻要用 OK 件定,不能偷看測試集)
    best = max(((thr, ((scores >= thr) == y).mean()) for thr in np.unique(scores)), key=lambda t: t[1])

    summary = {
        "n_test": len(test), "n_good": int((y == 0).sum()), "n_defect": int((y == 1).sum()),
        "image_auroc": float(img_auroc), "pixel_auroc": float(px_auroc),
        "threshold_from_holdout_ok": {"image": float(ithr), "pixel": float(pthr), "miss_rate(漏檢)": fn / max(1, tp + fn), "false_alarm_rate(誤殺)": fp / max(1, fp + tn), "tp": tp, "fn": fn, "fp": fp, "tn": tn,
                                       "accuracy": (tp + tn) / len(test)},
        "per_defect_detect_rate": {k: f"{v[0]}/{v[1]}" for k, v in per.items()},
        "oracle_threshold_accuracy(參考)": {"threshold": float(best[0]), "accuracy": float(best[1])},
        "inference_ms_per_image": dt / len(test) * 1000, "device": str(dev),
    }
    json.dump(summary, open(os.path.join(a.out, "summary.json"), "w"), indent=1, ensure_ascii=False)
    print(json.dumps(summary, indent=1, ensure_ascii=False))

    # 圖:每類挑 2 張 + 2 張 OK + 漏檢/誤殺全部
    vmax = float(scores.max())
    picks = []
    seen = collections.Counter()
    for i, m in enumerate(test):
        d = m["defect"]; wrong = pred[i] != y[i]
        if wrong or seen[d] < 2:
            picks.append(i); seen[d] += 1
    panels, titles, items = [], [], []
    for i in picks:
        m = test[i]; regs = regions(amaps[i], pthr) if pred[i] else []
        pan = panel(rgbs[i], amaps[i], regs, pthr * 0.7, vmax, None, gts[i] if m["mask"] else None)
        name = f"{m['defect']}_{os.path.basename(m['image'])}"
        cv2.imwrite(os.path.join(a.out, name), cv2.cvtColor(pan, cv2.COLOR_RGB2BGR))
        tag = "MISS" if (y[i] and not pred[i]) else "FALSE-ALARM" if (pred[i] and not y[i]) else "ok"
        t = f"{m['defect']} #{os.path.basename(m['image'])[:-4]} score={scores[i]:.2f} -> {'NG' if pred[i] else 'OK'} {tag if tag != 'ok' else ''}"
        panels.append(pan); titles.append(t)
        items.append({"img": name, "title": t, "verdict": "NG" if pred[i] else "OK", "score": float(scores[i]), "regions": regs})
    sheet = contact_sheet(panels, titles, cols=2, scale=0.4)
    cv2.imwrite(os.path.join(a.out, "contact_sheet.png"), cv2.cvtColor(sheet, cv2.COLOR_RGB2BGR))
    rows = [("資料", "MVTec AD metal_nut(公開金屬圓件缺陷資料集)"), ("訓練", f"{model.calib.get('train_files')} 張 OK 件(不含任何 NG)"), ("測試", f"{summary['n_test']} 張:OK {summary['n_good']} / 缺陷 {summary['n_defect']}"),
            ("影像級 AUROC", f"{img_auroc:.4f}"), ("像素級 AUROC", f"{px_auroc:.4f}"),
            ("門檻(只用留出 OK 件定)", f"影像 {ithr:.3f} / 像素 {pthr:.3f}"),
            ("漏檢 / 誤殺", f"{fn}/{tp + fn} 漏檢({fn / max(1, tp + fn):.1%}) · {fp}/{fp + tn} 誤殺({fp / max(1, fp + tn):.1%})"),
            ("逐類偵測率", " · ".join(f"{k} {v}" for k, v in summary["per_defect_detect_rate"].items())),
            ("推論速度", f"{summary['inference_ms_per_image']:.0f} ms/張({dev})")]
    write_html(os.path.join(a.out, "report.html"), "AOI 離線驗證 — metal_nut", rows, [("圖例", "<p class=small>每列四格:原圖 → 異常熱圖 → 偵測框(含等效直徑 px)→ 標準答案(綠框)。標題 MISS = 漏檢、FALSE-ALARM = 誤殺。</p>")], items)
    print("→", os.path.join(a.out, "report.html"))


if __name__ == "__main__":
    main()
