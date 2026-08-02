# SPEC.md — Zakk 個人 Portfolio 網站規格

> 給 Claude Code:這是本專案的規格文件。互動效果參照 motion-patterns.md,用編號溝通。
> 工作方式:每個階段先提出計畫,經確認後才動手。

---

## 一、定位(整站要傳達的一句話)

**空間與產品設計出身,用 AI 工具做數位交付的設計師。**
攝影和 3D 是佐證,不是裝飾。網站本身就是作品之一——它由我用 Claude Code 打造。

## 二、視覺方向

- **調性:外冷內熱。** 極簡的殼,情感放在內容(作品、攝影),不放在裝飾。
- **底色:淺色暖白系。** 確切色票由素材分析決定(見第六節),先不要自行定案。
  已知排除:深色底(與自然攝影調性衝突)、Terra Studio 的 terracotta 土色系(避免重複)。
- **字型排印是主角。** Display 字型要有個性但用量克制,內文乾淨。中英混排要好看,
  中文考慮思源黑體/Noto Sans TC 之外更有態度的選擇,先提案再定。
- **文案語氣:短、乾、不解釋。** 範本:「NZ >>」。禁止熱情自介體、禁止形容詞堆疊。
- **動態:少而準。** 全站基礎只用 P07(滾動揭示)+ P08(編號章節)。
  主角效果最多一個,候選:P01(hero 標題解碼)或 P05(Works 清單 hover 換圖)。
  P02(preloader)**確定要做,排在收尾階段**——百分比綁真實圖片載入進度,不做假進度。
  P03(自訂游標)第二版再說。

## 三、Sitemap

單頁式主頁 + 專案獨立頁。

```
/               主頁(單頁滾動)
  ├─ Hero       名字 + 一句定位 + Open to work 狀態
  ├─ 01 Works   專案索引(P05 或卡片式,先提案)
  ├─ 02 Photos  攝影精選(15–25 張,horizontal scroll 或網格,先提案)
  ├─ 03 About   短自介 + 能力 + 工具
  └─ 04 Contact email + 社群連結
/works/<slug>   各專案獨立頁(統一模板)
```

## 四、各區內容

### Hero
- 名字:Zakk(顯示用,全大寫或原樣由字型提案決定)
- 定位句(擇一,或提出更好的):
  - `Product & spatial design, delivered digitally.`
  - `From space to screen.`
  - `Designs objects, spaces, and now — interfaces.`
- 狀態:`Open to work` + 色點。**改用餘燼橘 `#B4552A`,不用綠色**——
  這是全站唯一的暖色,圓形能承載顏色,位置本來就該有色點,功能明確。
- 地點:`Based in Taiwan`

### 01 Works(每項只給:編號/類型/年份/名稱/兩句描述/連結)
| # | 專案 | 類型 | 備註 |
|---|------|------|------|
| 01 | 智慧交通號誌(緊急車輛優先)| Product / UX | 畢業專題,連到 Framer 頁或搬重點 |
| 02 | Terra Studio | Web Design / Dev | 連 zakkg5.github.io/terra-studio,附「用 Claude Code 打造」說明 |
| 03 | 親子減糖專案 | Product Design | 學術專案 |
| 04 | 空間設計作品 | Spatial | 內容待我提供 |
| 05 | 本網站 | Web Design / Dev | 做完後回頭補,含製作過程說明 |

### 02 Photos
- 只放自然景觀(紐西蘭為主),不分國家、不寫遊記,圖說最多一行(只寫地點)。
  年份不寫——風景照的年份不提供資訊,只會變裝飾。年份留給 Works(看得出時間軸)。
- 呈現以「照片自己發光」為原則,底色和留白服務照片。

### 03 About
- 三句以內。背景(產品/空間設計)→ 現在(數位設計 + AI 工具)→ 個人氣質(一句就好)。
- 工具列:CAD / SketchUp / Rhino / KeyShot / Figma / Claude Code
- 不放:星座、MBTI、心路歷程。

### 04 Contact
- Email、Instagram、GitHub。不做表單。

## 五、技術規格

- 純靜態:HTML / CSS / vanilla JS,不用框架(內容量不需要,載入快是賣點)
- 部署:GitHub Pages(repo 名建議 `zakk-portfolio` 或直接 `zakkg5.github.io`)
- 圖片:WebP,長邊 2000px,lazy loading;首屏圖優先載入
- RWD:手機優先驗收,hover 類效果在觸控裝置停用(見 motion-patterns.md 品味規則)
- 無障礙:`prefers-reduced-motion` 全站尊重、alt text 全部要寫、鍵盤可導覽
- 語言:介面英文為主(國際感 + 符合乾式文案),About 可中英並置,先提案

## 六、工作流程(依序,每步完成才進下一步)

1. **素材分析** — 讀 photos/ 全部圖片,回報:主色調、共同氣質、建議色票(4–6 色附 hex)、
   建議字型組合(2–3 組)。不寫 code。
2. **設計提案** — 依分析結果 + 本規格,提出:最終色票、字型、hero 佈局(ASCII 線框圖)、
   主角效果選 P01 還是 P05 及理由。經我確認才進下一步。
3. **建站** — Hero + 全站骨架 → Works → Photos → About/Contact,每完成一區截圖回報。
4. **收尾** — RWD 檢查、效能(Lighthouse)、上 GitHub Pages。

---

## 給 Claude Code 的第一個指令(複製貼上用)

```
讀 SPEC.md 和 motion-patterns.md,然後執行 SPEC 第六節的步驟 1:
分析 photos/ 資料夾的所有照片,回報主色調、共同氣質、建議色票(附 hex)
和字型組合提案。先不要寫任何 code。
```
