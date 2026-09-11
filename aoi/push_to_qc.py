"""
把 infer.py 的結果送進 qc-app 某一批:
  python push_to_qc.py --results runs/xxx/results.json --lot L-260911-001 --zone end_face_a [--qc http://localhost:3000]
檔名規則:檔名開頭的數字 = 件號(例如 03.jpg、03_endA.jpg → #3)
"""
import argparse, base64, json, os, re, urllib.request

ap = argparse.ArgumentParser()
ap.add_argument("--results", required=True)
ap.add_argument("--lot", required=True)
ap.add_argument("--zone", default="unmachined", help="sealing_face / end_face_a / end_face_b / outer_dia / bore / unmachined")
ap.add_argument("--qc", default="http://localhost:3000")
a = ap.parse_args()
d = json.load(open(a.results))
out_dir = os.path.dirname(a.results)
items = []
for r in d["results"]:
    m = re.match(r"(\d+)", os.path.basename(r["file"]))
    if not m:
        print("略過(檔名不以件號開頭):", r["file"]); continue
    png = os.path.join(out_dir, os.path.splitext(os.path.basename(r["file"]))[0] + ".png")
    items.append({"seqNo": int(m.group(1)), "zone": a.zone, "verdict": r["verdict"], "score": r["score"], "regions": r["regions"],
                  "panelPng": base64.b64encode(open(png, "rb").read()).decode() if os.path.exists(png) and r["verdict"] == "NG" else None})
req = urllib.request.Request(f"{a.qc}/api/aoi/findings", data=json.dumps({"lotNo": a.lot, "items": items}).encode(), headers={"content-type": "application/json"})
print(urllib.request.urlopen(req).read().decode())
