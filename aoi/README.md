# aoi — 外觀異常偵測(第 1 期離線驗證)

只用 **OK 件照片**訓練,抓「不像正常」的區域。方法:PatchCore(CVPR 2022,工業 AOI 主流),ImageNet 預訓練 WideResNet-50 特徵 + 記憶庫最近鄰。本機 GPU 跑,照片不出門。

## 公開資料集驗證結果(2026-09-11,MVTec AD metal_nut 金屬圓件)

| 項目 | 結果 |
|---|---|
| 訓練 | 200 張 OK 件,**零張 NG** |
| 測試 | 115 張:22 OK + 93 缺陷(刮傷 / 變色 / 彎曲 / 翻面) |
| 影像級 AUROC | 0.999 |
| 像素級 AUROC(定位) | 0.990 |
| 門檻 | 只用留出的 20 張 OK 件決定(mean + 3σ 與 max×1.02 取大) |
| **漏檢** | **0 / 93** |
| **誤殺** | **1 / 22(4.5%)** |
| 逐類偵測 | 刮傷 23/23 · 變色 22/22 · 彎曲 25/25 · 翻面 23/23 |
| 推論 | 91 ms / 張(RTX 5060 Laptop) |
| 訓練 | 200 s |

產出在 `runs/metal_nut/`(report.html、contact_sheet.png、summary.json;不進 git)。

## 用法

```bash
# 環境(RTX 50 系列要 cu128 torch)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
pip install -r requirements.txt

# 1. 訓練:只給 OK 件資料夾
python train.py --good photos/VD-8-150/ok --out models/VD-8-150_endA.pt [--polar]

# 2. 推論:一張或一個資料夾;檔名開頭數字 = 件號
python infer.py --model models/VD-8-150_endA.pt --images photos/lot_0911 --out runs/lot_0911 --mm-per-px 0.05

# 3. 送進 qc-app 該批(NG 件 → 外觀發現「AI 偵測異常」→ 待複判,附熱圖)
python push_to_qc.py --results runs/lot_0911/results.json --lot L-260911-001 --zone end_face_a

# 公開資料集完整驗證(需先下載 datasets/metal_nut,見下)
python eval_mvtec.py --data datasets/metal_nut --out runs/metal_nut
```

`--polar`:圓形零件先以外圓為準做極座標展開(旋轉不變),零件放的角度不同也沒差。metal_nut 驗證未用(該資料集已對齊)。
`--mm-per-px`:校正值 = 已知尺寸(mm)÷ 該尺寸在**縮放後影像**中的像素數;沒給就只報像素。

## 拍你們零件的規範(第 1 期步驟 B)

模型學的是「正常長什麼樣」,所以**拍法一致比相機好壞重要**。

1. **固定治具**:零件每次放同一位置、同一面朝上;用膠帶在桌上貼定位框
2. **固定相機**:手機架在腳架 / 翻拍架,鏡頭垂直向下,高度固定;鎖 AE/AF(iPhone 長按畫面 → AE/AF 鎖定)
3. **固定光**:兩盞桌燈 45° 側打(鑄孔會產生陰影才看得到)或 LED 環燈;關閉自動閃光;避免窗光(會隨時間變)
4. **同一料號、同一面 = 一個模型**:端面 A、端面 B、外圓分別拍、分別訓練
5. **張數**:OK 件 **100~200 張**(可以同一件轉不同角度多拍);手上所有 NG 件各拍幾張,標清楚是鏽蝕還是鑄孔(用於驗證,不用於訓練)
6. **命名**:`ok/001.jpg …`;NG:`ng/rust_01.jpg`、`ng/pore_01.jpg`
7. **放一把尺或已知直徑的零件拍一張**,用來算 mm/px

拍好後跑 `train.py` → 用 NG 件跑 `infer.py` → 看漏檢 / 誤殺 / 能抓的最小尺寸,這三個數字決定第 2 期要不要投相機與旋轉台。

## 限制(誠實版)

- 只能說「這裡不正常」,不能分類是鏽蝕還是鑄孔;分類要等累積 NG 樣本後再加一層(或先由人選)
- 打光 / 位置一變,模型就要重訓(所以治具與光要固定)
- 0.1mm 級鑄孔在手機解析度下未必看得到 — 這正是步驟 B 要驗的事
- 資料集 MVTec AD 為 CC BY-NC-SA 4.0,僅供研究驗證
