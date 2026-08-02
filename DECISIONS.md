# DECISIONS.md — 今日決策交接

> 給 Claude Code:這份是今天討論後拍板的決定。請先讀完整份再動手。
> 動工前先提計畫,經確認後才改。每完成一項更新 PROGRESS.md。
> 標示原則:**【已定案】** 直接做 / **【A/B】** 做兩版讓我選,不要憑感覺定死 / **【別做】** 明確不要
> 建立日期:2026-07-23

---

## 一、整站定位(重要,影響所有文案判斷)

網站設計為主,但要能**同時服務非設計職求職**。
判斷準則:任何文案和內容,設計職看了加分、非設計職看了也不排斥。
避免:把網站做成「只有設計師看得懂」的樣子。

---

## 二、Hero 主頁改造【A/B — 做兩版讓我比較】

現在的純文字 Hero(`From space to screen.`)我覺得太節儉。
參考 Russell Numo(russellnumo.nl)的 editorial 大字風格,想試另一種方向。

### A 版(保留現狀,微調)
- 現有的純文字 Hero,`From space to screen.` 大標 + 副標
- 已完成 blur 進場,保留
- 這版當對照組,不用大改

### B 版(新做 — Russell Numo 風格身分牆)
- 超大字型佔滿畫面,字大到左右被裁切(那種「裝不下」的張力就是氣勢來源)
- 三行身分橫向排列,每行可橫向緩慢滾動(跑馬燈)。內容:
  `PRODUCT DESIGNER / SPATIAL DESIGNER / UX · UI / CREATIVE`
  (放 CREATIVE 這種通用詞是刻意的,讓非設計職也接得住)
- 黑白人像置中,被文字上下夾住,人與字產生層次
- 人像加輕微 glitch / RGB 色差效果(克制,不要太重)
- 用 assets 裡的個人照,轉黑白處理

### 怎麼交付
兩版用不同網址或 URL 參數切換(例如 `/?hero=b`),不要直接覆蓋 A 版。
我實際看過兩版再決定留哪個,或是否融合。

### 待我決定的問題(先不用做,做出來看畫面再說)
- B 版是否完全取代 `From space to screen.`,還是兩者融合
- 背景要不要加文字 / logo 圖形層次 → 先不加,B 版本身夠豐富了,之後再試

---

## 三、About 頁【已定案 — 文案如下,直接用】

### 版面
- 語言:英文為主,關鍵句中英並置
- 配一張黑白人像(用 assets 裡的個人照,暗調冷色系,與網站色調搭)
- 結構順序:開場 → 自我介紹 → 經歷 → 能力(兩組)→ 下載 CV → 接 Contact

### 開場(大字,配人像)
> I make complicated things clear.
> 把複雜的事,變清楚。

### 自我介紹(定稿)
> A designer who works across space, product, and screen, and has worked through the messy part between: understanding people, untangling problems, and turning them into something that works.
>
> 空間、產品、數位都做過,也處理過中間最麻煩的部分:理解需求、拆解問題,把它變成真正能用的東西。

### 經歷(Experience)
- **National Yunlin University of Science and Technology** — Creative Design｜2021–2024
- **Interior Design Studio** — Design Assistant｜2025
  CAD drafting, 3D modeling, on-site measurement, coordinating drawings between clients and on-site teams.
- **Sasaki Ken Interior Design** — Design Intern｜2023
  Built a material reference system across hundreds of finishes; assisted CAD and client presentations.

### 能力(兩組 — 順序重要,Beyond the tools 放前面)
- **Beyond the tools**
  English (TOEIC 720) · International experience (New Zealand) · Cross-role communication · Turning complex information into clear systems
- **Software**
  AutoCAD · SketchUp · Rhino · KeyShot · Illustrator

### 結尾
> Currently open to work — in design, and beyond. ｜ Download CV ↓

CV PDF:用我提供的履歷檔(曾莛翔.pdf),放下載連結。

---

## 四、Daima 分析採用的效果【已定案】

依 Claude Code 自己的分析結論,採用以下、其餘不做:

### 要做
1. **blur 進場【進行中】** — 加在現有 P07 滾動揭示上,`filter: blur()` 質感分層。
   目前 10px / 600ms,Hero 大標也加。做完看畫面微調。
2. **導覽列 rolling text hover** — 滑過導覽項目時字往上捲換新的一份,
   用 text-shadow 做(不複製 DOM,無障礙與效能都零代價)。
3. **preloader 版面【收尾階段做】** — 抄 Daima 版面(大數字 + 細橘線 + 小字 LOADING),
   橘色用 `#B4552A`。但百分比綁真實圖片載入,不做假進度。

### 別做
- **三層 parallax 卡片** — Works 已有 P05 當主角,再加會打架。(整站完成後若嫌平再議)
- **Lenis 平滑滾動** — 多載套件、有人嫌滑不停、站不長,收益低。
- **跑馬燈無限循環(內容區)** — agency 拿來充版面用的,你內容是真的,不需要。
  (註:Hero B 版的身分橫排跑馬燈是例外,那是設計主體不是充版面)

### 進場動畫只播一次
刻意設計,不是 bug。重看效果按 F5 重整即可。不要改成每次滾過都重播。

---

## 五、素材處理
- 黑白人像:從 assets 個人照挑,轉黑白。About 頁用一張,Hero B 版用一張
  (可同張不同處理,或挑兩張)。
- 挑選標準:暗調、氛圍感、能配網站冷色調。**挑好前先給我看候選。**

---

## 六、目前進度基準(依 PROGRESS.md 為準)

已完成:Hero A 版(純文字)、Works 區(P05)、色票、字型、blur 進場(進行中)

接下來建議順序:
1. 完成 blur + rolling text hover
2. **Hero B 版(A/B 比較)← 我最想看的**
3. About 頁(文案已定稿)
4. Photos 區
5. 收尾:preloader、RWD、上線
