# qc-app — 閥門零件品質檢驗系統(第 0 期:規格引擎 + 檢驗紀錄 + 報告)

單機網頁程式,資料全留本機(SQLite 檔案 + 本機照片資料夾),不上雲。平板或電腦開瀏覽器即可使用。

## 功能

| 模組 | 內容 |
|---|---|
| 規格引擎 | 客戶 → 料號 → 允收標準(版本化:草稿可編 / 生效鎖定 / 開新版複製) |
| 尺寸項次 | 特性、標稱、上下公差、量具、頻率(每件 / 首件 / 抽檢 / 首末件)、關鍵特性 |
| 外觀矩陣 | MSS SP-55 十二類 + 鏽蝕 + 加工損傷 × 六個區域 → 允許 / 尺寸上限 / 數量上限 |
| 檢驗批 | 對應鼎新工單 / 採購批 / 供應商 / 爐號;開批時鎖定規格版本 |
| 量測輸入 | 表格式,Enter 自動跳格(逐項 / 逐件兩種順序),藍牙量具(Mitutoyo U-WAVE 鍵盤模式)直接打入;即時 OK / 警戒 / NG 上色;塞規 / 環規為「通 / 不通」按鈕(鍵盤 1 / 0) |
| 外觀發現 | 區域 + 缺陷類型 + 尺寸 + 數量 + 時鐘方位 + 拍照;引擎依允收矩陣預判;責任歸屬(上游 / 廠內) |
| 判定 | 件:允收 / 拒收 / 待複判 / 未完成;人工覆判需理由,留稽核;批:允收 / 拒收 / 特採 |
| 報告 | 出貨 / 首件 / 進料檢驗報告(A4,列印即 PDF):基本資料、尺寸統計含 Cpk、外觀分類、NG 明細、簽核、逐件附錄 |
| 退供應商報表 | 月份 × 供應商,上游責任的拒收缺陷清單,附照片與批次證據 |

## 安裝(廠內電腦,Windows / macOS / Linux 皆可)

需求:Node.js 20 以上(建議 22 LTS)、pnpm。

```bash
# 1. 安裝 pnpm(只需一次)
npm i -g pnpm

# 2. 安裝套件
cd qc-app
pnpm install

# 3. 建置 + 灌資料(只需一次)
pnpm build
pnpm db:seed         # 最小示範:1 料號 1 批(正式上線用這個,之後自己建)
# 或
pnpm db:seed-demo    # 完整假資料:3 客戶、3 鑄造廠、6 料號、14 批(展示用;會清空資料庫!)

# 4. 啟動
pnpm start
```

開瀏覽器到 http://localhost:3000。同網段的平板用 `http://<這台電腦的IP>:3000`。

資料庫在 `data/qc.db`,照片在 `data/photos/`。**備份 = 複製 `data/` 資料夾。**

## 開發

```bash
pnpm dev          # 開發模式
pnpm test         # 判定引擎單元測試(vitest)
pnpm typecheck
pnpm lint
pnpm db:generate  # 改 db/schema.ts 後產生 migration(啟動時自動套用)
```

## 架構

```
db/schema.ts          資料表(Drizzle ORM + SQLite/libsql)
lib/engine/           純判定邏輯,無 I/O,前後端共用,有單元測試
  dimension.ts        尺寸:OK / WARN(用掉公差帶 ≥ 警戒比例)/ NG,單邊公差、浮點邊界處理
  visual.ts           外觀:查允收矩陣 → OK / NG / REVIEW(未定義)
  verdict.ts          件綜合判定;必量項次依批類別(FAI 全部 / 其他只算每件)
  stats.ts            批統計 min / max / mean / stdev / Cp / Cpk
lib/domain.ts         MSS SP-55 缺陷代號、區域、量具、頻率常數
lib/queries/          讀取(server only)
lib/actions/          寫入(server actions;規格鎖定、重判、稽核)
app/                  頁面
components/lot/       檢驗工作區(量測格 + 件面板)
```

## 已知限制(第 0 期刻意不做)

- 無登入 / 權限(單機使用;檢驗員以文字欄記錄)
- 鼎新 ERP 為手填工單 / 採購批號;自動匯入排第二版
- 三次元 CSV 匯入排第二版(需先確認三次元軟體與匯出格式)
- 藍牙量具走鍵盤模式(U-WAVE Keyboard),不需驅動;U-WAVE Pack 模式(SDK)未支援
