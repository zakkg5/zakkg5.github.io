# CLAUDE.md

> 給 Claude Code 的常駐說明。動手前先讀這份,再依任務去讀下面指的那份文件。

## 這是什麼

Zakk 的個人 portfolio,**純靜態網站**,GitHub Pages 直接服務 repo 根目錄
(`.nojekyll` 已開,不跑 Jekyll)。**沒有 build step、沒有套件管理、沒有測試**——
改完 HTML/CSS/JS 存檔就是成品,推上 `main` 就是上線。

```
index.html          單頁主頁(Hero / Works / Photos / About / Contact)
works/<slug>/       各專案獨立頁,共用同一套模板
vocab/              單字本 PWA(獨立小工具,有自己的 sw.js)
css/                style.css(全站) + work.css(作品內頁)
js/main.js          全站唯一的 JS
assets/             圖、字型、OG 圖
projects/           設計案交接文件(不是網站的東西,見下)
```

## 文件地圖

| 文件 | 內容 |
|---|---|
| `DESIGN.md` | 視覺憲法:色票、字型、間距。**動任何版面前先對齊這份** |
| `SPEC.md` | 整站規格與 sitemap |
| `DECISIONS.md` | 已拍板的決定,標了【已定案】/【A/B】/【別做】 |
| `PROGRESS.md` | 進度與「為什麼這樣決定」的長篇紀錄 |
| `motion-patterns.md` | 互動語彙,用編號(P01、P05…)溝通 |
| `PORTFOLIO-PDF-MAP.md` | 作品集原檔哪幾頁屬於哪個專案 |
| `projects/` | **不屬於本網站**的設計案交接文件,例如「每飯不忘」門楣書法字 |

`projects/` 裡的東西跟網站無關,是為了讓 session 之間不用重講脈絡才放進來的。
被指派設計案的工作時讀那裡;做網站時忽略它。

## 常踩的坑

- **`?v=` 快取版本號**:改完 `css/*.css` 或 `js/main.js`,要把**所有** HTML 裡
  引用它的 `?v=` 都 +1,不然瀏覽器抓舊檔。目前 `style.css?v=183` 出現在
  `index.html` 和 8 個 `works/*/index.html`,漏改哪頁哪頁就壞。
- **換網域要改四個地方**:`index.html` 的 canonical / og:url / og:image、
  各 `works/*/index.html` 的同三項、`sitemap.xml`(8 筆)、`robots.txt`。
  About 區的 `instagram.com/zakktseng` 是 IG 帳號,**不要**一起換。
- **`vocab/sw.js`**:改動 PWA 要把 `VERSION` 加一,舊快取才會清掉。
- **不進版控**:`_source/`(AI/PSD/相機原檔,幾百 MB)、`_dev/`(本機腳本)。
  別建議把它們加回來,也別假設它們存在。
- **`projects/*.md` 會公開**——GitHub Pages 服務整個 repo。不要寫業主姓名、
  地址、報價、聯絡方式。

## 工作方式(Zakk 的要求)

- **先提計畫,經確認後才動手。** 大改尤其如此。
- 拿不定的視覺決定**做兩版讓他選**,不要憑感覺定死。
- 完成一項就更新 `PROGRESS.md`。
- **文案語氣:短、乾、不解釋。** 禁止熱情自介體、禁止形容詞堆疊。
- 程式碼註解用中文,跟現有風格一致——現有註解會寫「為什麼」和踩過的坑,
  不是複述程式在做什麼。照這個密度寫。
