# MOTION-PATTERNS.md — 互動模式庫

> 這份文件是本專案的「互動語彙庫」。當我(Zakk)說「用 pattern 03」或「hero 加 P02」,
> 就是指下面編號的模式。實作前先讀「品味規則」,那是最高優先。
> 參考來源:russellnumo.nl、obscurastudio.webflow.io 等站的互動語言,經策展後收錄。

---

## 品味規則(優先於一切 pattern)

1. **一頁只有一個主角效果。** 其他互動退到「幾乎察覺不到」的層級。
   同時使用超過 3 個 pattern 前,先停下來問我。
2. **動態必須回答「為什麼」。** 每加一個效果,要能用一句話說明它幫使用者理解了什麼。
   說不出來就刪掉。
3. **時間紀律。** 微互動 150–300ms;入場動畫總長不超過 1.2s;preloader 不超過 2s。
   超過的一律視為 bug。
4. **必須尊重 `prefers-reduced-motion`。** 所有 pattern 都要有降級版(直接顯示最終狀態)。
5. **行動裝置上,hover 類效果全部關閉或改為 tap/scroll 觸發。**
6. **效能底線:** 只動 `transform` 和 `opacity`,不動 layout 屬性(width/top/margin)。
   持續性動畫用 `requestAnimationFrame`,滾動偵測用 `IntersectionObserver`,不用 scroll listener 硬算。

---

## PATTERNS

### P01 — 文字解碼(Text Scramble / Decode)
- **效果:** 標題文字從亂碼字元逐字收斂為正確文字,像訊號被解碼。
- **適用:** Hero 主標題、頁面切換後的章節標題。一頁最多用一次。
- **實作提示:** 逐字元迴圈隨機字元(可限定字元集:大寫字母 + 數字 + `#/\<>_`),
  每字元迭代 2–4 次後鎖定;由左至右錯開 30–50ms。總長 ≤ 900ms。
  用 monospace 或 `font-variant-numeric: tabular-nums` 避免寬度跳動。
- **降級:** reduced-motion 時直接顯示文字,或改用單純 fade。

### P02 — 入場計數 Preloader(Connecting 0%)
- **效果:** 進站時全屏遮罩,顯示狀態文字 + 百分比計數,到 100% 後遮罩滑開,內容入場。
- **適用:** 只在首次進站(用 sessionStorage 記錄),站內導覽不重播。
- **實作提示:** 百分比可綁定真實資源載入進度,或用 easing 假進度(快→慢→衝刺)。
  遮罩退場用 clip-path 或 translateY,銜接 P07 的內容入場。全程 ≤ 2s。
- **警告:** 這是儀式感成本最高的 pattern,內容不夠好時會顯得做作。上線前問我一次要不要留。

### P03 — 自訂游標(Custom Cursor + Follower)
- **效果:** 原生游標替換或伴隨一個跟隨圓點/圖示,hover 不同元素時變形
  (連結→放大、圖片→顯示「View」或箭頭圖示、拖曳區→顯示 drag)。
- **適用:** 桌機限定。整站一致使用,不能只有某頁有。
- **實作提示:** follower 用 rAF + lerp(係數約 0.12–0.18)做延遲跟隨;
  變形狀態用 data-attribute 標記目標元素(`data-cursor="view"`),CSS class 切換。
  `mix-blend-mode: difference` 可解決深淺背景通用問題。
- **降級:** 觸控裝置完全停用,不留殘骸 DOM。

### P04 — 圖片 Hover 特效(Image Hover Reveal)
- **效果:** 游標移入作品圖時的反應。可選強度:
  a. 輕:縮放 1.03–1.05 + 遮罩亮度變化(預設用這個)
  b. 中:圖片視差偏移,跟隨游標位置微傾
  c. 重:WebGL/曲面扭曲(distortion)——除非我點名,不要用
- **適用:** 作品列表、gallery。攝影作品建議只用 a,不要跟照片本身搶戲。
- **實作提示:** a 用純 CSS transition;b 用 rAF 讀取游標相對位置映射 transform。
  外層容器 `overflow: hidden`,縮放時不破版。

### P05 — Hover 換圖清單(List with Image Preview)
- **效果:** 專案以純文字清單呈現,游標滑過某列時,對應的預覽圖浮現並跟隨游標。
- **適用:** Works 頁的專案索引。文字清單本身就是排版主角。
- **實作提示:** 預覽圖 fixed 定位跟隨游標(套 P03 的 lerp 邏輯),
  切換列時交叉淡入淡出(150ms)。圖片預載避免首次 hover 閃爍。

### P06 — 磁吸元素(Magnetic Button)
- **效果:** 游標靠近按鈕/連結時,元素被輕微吸向游標,離開後彈回。
- **適用:** CTA、社群 icon、導覽項目。位移幅度 ≤ 8px,要含蓄。
- **實作提示:** 監聽元素周圍緩衝區的 mousemove,位移 = 游標偏移 × 0.2–0.3,
  離開時用 spring/elastic easing 回彈。

### P07 — 滾動揭示(Scroll Reveal)
- **效果:** 內容進入視口時淡入 + 上移(或文字逐行升起)。
- **適用:** 全站基礎入場語言。這是「地」,不是「圖」——做到讓人察覺不到才是做對。
- **實作提示:** IntersectionObserver + threshold 0.15;位移 ≤ 24px;
  同組元素 stagger 60–90ms;每個元素只播一次。
  文字逐行升起:外層 `overflow: hidden`,內層 translateY(100%) → 0。

### P08 — 編號章節系統(Indexed Sections)
- **效果:** 章節以「01 — About」式編號標示,導覽與內容呼應,建立閱讀節奏。
- **適用:** 單頁式主頁。注意:編號要對應真實的瀏覽順序才有意義,不是裝飾。
- **實作提示:** 這是排版 pattern 不是動畫;可搭配 P07,編號比內文早 100ms 入場。

### P09 — 跑馬燈(Marquee)
- **效果:** 一行文字或 logo 帶無限橫向滾動。
- **適用:** 章節分隔、footer 上方。一站最多一處。速度慢(40–60s 一輪),hover 時減速。
- **實作提示:** 內容複製兩份 + CSS animation translateX(-50%) 無限循環,不用 JS。

### P10 — 圖片視差(Scroll Parallax)
- **效果:** 滾動時圖片以不同速率位移,產生深度。
- **適用:** 大幅攝影作品的展示區。位移量 ≤ 15%,超過會暈。
- **實作提示:** 容器 overflow hidden,內圖高度 115%,依滾動進度 translateY。
  優先用 CSS `animation-timeline: scroll()`,不支援的瀏覽器降級為靜態。

---

## 使用方式(給 Claude Code 的指令範例)

- 「Works 頁用 P05,hover 強度參考 P04-a」
- 「hero 標題套 P01,副標用 P07 逐行升起」
- 「先告訴我你打算怎麼組合 pattern 和理由,confirm 後再動手」 ← 預設都先走這步

## 收錄新 pattern 的流程

我看到喜歡的效果時,會用這個格式描述給你,你負責補完實作提示後寫進本文件:
- 效果:(我看到了什麼)
- 出處:(哪個網站的哪個位置)
- 想用在:(本站的哪裡)
