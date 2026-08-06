/* ═══════════════════════════════════════════════════════
   1. P07 滾動揭示
   2. 導覽列「你在這裡」標示
   兩者都用 IntersectionObserver(瀏覽器內建的「進入畫面偵測器」),
   不用 scroll 事件硬算 — 效能差很多。
   ═══════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════
   平滑捲動 —— 影片感的關鍵

   實際看過 to-portfolio.com 的原始碼:它用 Lenis。
   那個「順」不是動畫做得好,是**捲動位置被內插過**:
   原生滾輪一格就跳 100px 上下,畫面是階梯狀前進;
   平滑捲動每一幀只走剩餘距離的一小段,所以看起來像影片在播。

   這裡自己做,不裝 Lenis —— 原理就是一行 lerp,不值得為它多一個相依。

   分寸:
   ・只接管滾輪。鍵盤、拖捲軸、觸控都走原生,不攔截 —— 攔了會壞掉無障礙
   ・任何非滾輪的捲動都會把目標值同步回來,不會打架
   ・prefers-reduced-motion 或觸控裝置直接不啟用
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  var root = document.documentElement;
  // 自己做平滑之後,原生的 scroll-behavior 要關掉,不然兩套會互相打架
  root.style.scrollBehavior = 'auto';

  var target = window.pageYOffset || 0;
  var running = false;
  var EASE = 0.09;          // 每幀走剩餘距離的 9%

  function maxY() {
    return Math.max(0, root.scrollHeight - window.innerHeight);
  }

  function loop() {
    var cur = window.pageYOffset || 0;
    var d = target - cur;
    if (Math.abs(d) < 0.4) {
      window.scrollTo(0, target);
      running = false;
      return;
    }
    window.scrollTo(0, cur + d * EASE);
    requestAnimationFrame(loop);
  }

  function kick() {
    if (running) return;
    running = true;
    requestAnimationFrame(loop);
  }

  window.addEventListener('wheel', function (e) {
    if (e.ctrlKey) return;                       // 縮放手勢不要攔
    /* ⚠️ 已經被別人處理掉的滾輪不要再接管。
       照片帶自己會攔滾輪來左右捲照片;它的監聽在元素上、比 window 早跑,
       所以這裡看得到 defaultPrevented。不擋的話會變成
       「滑鼠在照片上滾 → 照片捲了、頁面也跟著跳到下一幀」。 */
    if (e.defaultPrevented) return;
    e.preventDefault();
    target += e.deltaY;
    if (target < 0) target = 0;
    var m = maxY();
    if (target > m) target = m;
    kick();
  }, { passive: false });

  /* 鍵盤、拖捲軸、程式捲動(scrollTo / scrollIntoView / 瀏覽器還原位置)
     → 把目標同步回來,免得下一次滾輪把畫面拉回舊位置。

     ⚠️ 條件要用 running(動畫是否進行中),不能用 wheeling。
     用 wheeling 的話:動畫結束後 wheeling 還是 true 的那段時間裡,
     外部的 scrollTo 不會被同步 → 程式捲動整個失效。實際踩過。 */
  window.addEventListener('scroll', function () {
    if (!running) target = window.pageYOffset || 0;
  }, { passive: true });

  /* 站內錨點(導覽列的 #works 等)自己接手,才不會跟平滑捲動打架 */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    var top = el.getBoundingClientRect().top + (window.pageYOffset || 0);
    /* ⚠️ 幀的最上緣是「還沒被描出來」的位置 —— 直接跳過去會看到空白頁。
       要跳到定格區(描繪已完成、還沒開始退場)的中點。 */
    var fr = el.classList.contains('frame') ? el : el.closest('.frame');
    if (fr) {
      var play = fr.getBoundingClientRect().height - window.innerHeight;
      top = fr.getBoundingClientRect().top + (window.pageYOffset || 0) + play * 0.55;
    }
    target = Math.max(0, Math.min(maxY(), top));
    kick();
  });

  window.addEventListener('resize', function () {
    target = window.pageYOffset || 0;
    restY = -1;                 // 視窗改了,定格點跟著變,出發點要重算
  }, { passive: true });


  /* ══ 停手就吸附到最清楚的位置 ══
     🔴 Zakk:「滾輪換頁的時候,很多人會沒有滑到透明度最高的地方,
     他們都沒發現字還有點透明」。

     這是真的可用性問題,不是美感問題:每一幀是「描出來 → 定格 → 淡出」,
     停在描到一半的地方,看到的是**半透明的內文**,
     而沒有人會知道那是過場 —— 只會以為「這個網站的字就是淡的」。

     所以滾輪停下來之後,自動落到那一幀的定格點。
     ⚠️ 只在**使用者停手**時做,不在滾動中途插手 —— 中途改目標會變成
     「網頁在跟我搶方向盤」。160ms 是「手指離開滾輪」的判斷值,
     太短會在連續滾動的間隙誤觸發。 */
  var SNAP_IDLE = 160;      // 停手多久之後才吸附
  var snapTimer = null;

  function holdY(fr) {
    /* 定格點:描繪完成、還沒開始退場的中點。
       跟導覽列錨點用的是同一個算式(0.55),兩邊必須一致,
       不然點導覽跟滾輪停下來會落在不同位置。 */
    /* ⚠️ 一定要用 getBoundingClientRect + pageYOffset,不能用 offsetTop。
       offsetTop 是相對於**最近的定位祖先**,而 #main 有 z-index(所以有定位),
       算出來的位置整個偏掉 —— 實測吸附後落在 vis 0.00 的地方,
       比不吸附還糟。導覽列錨點那段用的也是這個算法,兩邊必須一致。 */
    var r = fr.getBoundingClientRect();
    var play = r.height - window.innerHeight;
    return r.top + (window.pageYOffset || 0) + play * 0.55;
  }

  /* 上一次落定的位置。吸附要以「他從哪裡出發」為準,不是「離哪裡近」——
     否則往下滑了 900px 卻因為離出發點還比較近,就被拉回原地。 */
  var restY = -1;

  function snap() {
    var frames = document.querySelectorAll('.frame');
    if (!frames.length) return;
    var m = maxY();
    if (target <= 4 || target >= m - 4) return;

    /* 所有定格點,由上到下 */
    var holds = [];
    for (var i = 0; i < frames.length; i++) {
      holds.push(Math.max(0, Math.min(m, holdY(frames[i]))));
    }
    holds.sort(function (a, b) { return a - b; });
    if (!holds.length) return;

    /* 第一次進來(或視窗改過)先找離現在最近的當出發點 */
    if (restY < 0) {
      var nd = Infinity;
      for (i = 0; i < holds.length; i++) {
        var d0 = Math.abs(holds[i] - target);
        if (d0 < nd) { nd = d0; restY = holds[i]; }
      }
    }
    var from = 0;
    for (i = 0; i < holds.length; i++) if (holds[i] === restY) from = i;

    var pitch = holds.length > 1 ? (holds[1] - holds[0]) : window.innerHeight;
    var moved = target - restY;

    /* ⚠️ 門檻只要 22%,不是 50%。
       一幀相隔 2160px,用「過半才算」的話,滑了 900px 還是會被拉回原地
       —— 使用者會覺得網頁在跟他作對。往哪個方向動、動得夠明顯,
       就往那個方向走一幀。 */
    var idx = from;
    if (Math.abs(moved) > pitch * 0.22) idx = from + (moved > 0 ? 1 : -1);
    if (idx < 0) idx = 0;
    if (idx > holds.length - 1) idx = holds.length - 1;

    /* 最後一幀之後是 footer:已經滑過最後一個定格點就別拉回去 */
    if (target > holds[holds.length - 1] + window.innerHeight * 0.6) { restY = -1; return; }

    restY = holds[idx];
    if (Math.abs(restY - target) < 2) return;
    target = restY;
    kick();
  }

  window.addEventListener('wheel', function () {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(snap, SNAP_IDLE);
  }, { passive: true });

  /* 觸控與鍵盤也一樣 —— 手指離開螢幕、放開方向鍵之後要落定 */
  window.addEventListener('touchend', function () {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(snap, SNAP_IDLE + 120);
  }, { passive: true });
  window.addEventListener('keyup', function (e) {
    if (e.key !== 'PageDown' && e.key !== 'PageUp' &&
        e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== ' ') return;
    clearTimeout(snapTimer);
    snapTimer = setTimeout(snap, SNAP_IDLE);
  }, { passive: true });
})();


/* ═══════════════════════════════════════════════════════
   影片式翻頁 —— pin + 捲動當播放頭

   Zakk:「頁面整體固定,畫面往下一幀跑動,像是播影片一樣」

   之前用 scroll-snap 只是「強制停到下一段」,頁面還是在移動,
   所以不像影片。真正的做法是 ScrollTrigger 那套 **pin + scrub**:
   把畫面釘住不動,捲動推進的是「這一幀播到哪」。

   這裡用原生 position: sticky 實作,不裝 GSAP ——
   sticky 本身就是 pin,進度自己算 60 行就夠,
   而 DESIGN.md 的原則是不依賴外部函式庫與伺服器。

   結構(由這段 JS 在載入時包好,HTML 不用動):
     <section class="frame">          外殼,高度 = 這一幀的播放長度
       <div class="frame__pin">       釘住的那一屏
         ...原本的內容...
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  /* 🔴 手機不建幀系統 —— 這套在小螢幕上不成立,而且是三個症狀的同一個病根:

     一幀就是「一屏」,但手機的視窗只有 844px 高,而內容改成直向堆疊之後會變很高。
     實測 390×844:Works 的內容 971px(裁掉 13%)、**About 1557px(裁掉 46%)** ——
     超出的部分被 .frame__pin 的 overflow: hidden 直接切掉,而且**不會有捲軸**,
     使用者根本不知道下面還有東西。

     內容又是 position: fixed 釘死不動的(那正是桌機「像播影片」的來源),
     手機一次慣性滑動輕鬆超過 1000px、一幀才 1266px ——
     所以體感是「什麼都沒動,然後突然跳一頁」。

     不建幀的路徑本來就存在(上面那行 reduced-motion 就是走這條),
     `.section` 在沒有 .frame 的時候是 min-height: 0 的一般 block,
     不會留下大洞 —— 頁面就變成正常捲動的文件,全部看得到。

     ⚠️ 寬度與指標**兩個條件都要**:
       - `pointer: coarse` 抓真的觸控裝置
       - `max-width: 720px` 抓「視窗很窄的桌機」—— 那時 CSS 也已經改成直向堆疊,
         內容一樣會超出一屏(720px 就是全站既有的手機斷點) */
  if (window.matchMedia('(max-width: 720px), (pointer: coarse)').matches) return;

  var secs = [].slice.call(document.querySelectorAll('.hero-b, main .section'));
  if (!secs.length) return;

  secs.forEach(function (sec, i) {
    sec.classList.add('frame');

    var pin = document.createElement('div');
    pin.className = 'frame__pin';

    /* sheet = 被「描」出來的那張圖紙(clip-path 由上往下揭開)
       pen   = 騎在描繪邊緣的 ember 細線,就是筆
       兩層分開,筆才不會被 sheet 的 clip 一起裁掉 */
    var sheet = document.createElement('div');
    sheet.className = 'frame__sheet';
    while (sec.firstChild) sheet.appendChild(sec.firstChild);
    /* 每個直接子元素標上順序,CSS 靠 --d 把浮現時間錯開。
       這樣進場是「一層一層長出來」,不是整塊一起亮 —— 才像影片在放,
       而不是像掃描器掃過去。 */
    for (var k = 0; k < sheet.children.length; k++)
      sheet.children[k].style.setProperty('--d', k);

    var pen = document.createElement('i');
    pen.className = 'frame__pen';
    pen.setAttribute('aria-hidden', 'true');

    pin.appendChild(sheet);
    pin.appendChild(pen);
    sec.appendChild(pin);

    sec.__pin = pin;
    sec.__sheet = sheet;
    /* 第一幀前面沒有東西,不該還要「等它被描出來」——
       一進站文字就在(Zakk:「首頁一開始字就浮現,不要滑了才出來」) */
    sec.__first = (i === 0);
  });

  /* 每一幀的播放曲線:
       0 ─ 0.28   進場(內容浮上來、對焦)
       0.28 ─ 0.74 停住讓人看(這段完全不動 —— 讀字的時候畫面必須是靜的)
       0.74 ─ 1   退場(往上走、淡出)
     停住那段佔了快一半,所以「一幀」感覺得出來是一個定格,不是連續捲動。 */
  /* 2026-08-01 調整(Zakk:「轉場太快根本看不出做了什麼,空白停留太長」)
       描繪 0.28 → 0.48(慢一倍,看得出筆在走)
       定格 0.46 →  0.14(原本快一半的時間都停著不動,太空) */
  /* 2026-08-01 再調(Zakk:「每一頁的留白太多,太空了」)
     ⚠️ 真正的原因不是動畫太快,是「幀跟幀之間根本沒接上」。

     一幀高 200svh(1800px),排版是這樣:
       scrollY 1800i-900 ~ 1800i   ← 這一幀正從畫面下方升上來(p 是負的)
       scrollY 1800i     ~ 1800i+900 ← 釘住不動(p 從 0 到 1)
     舊寫法把 p 夾在 0~1,所以「升上來」那 900px 裡 --in 一直是 0 →
     上一幀已經退場完、這一幀還沒開始 → 整整一個畫面高度是空的。

     改成讓 p 可以是負的,進場動作提早在「升上來」的那段就開始跑:
       p −0.95 ~ −0.25  進場(還沒釘住就已經在浮現)
       p −0.25 ~  0.60  停住讓人讀
       p  0.60 ~  1.00  退場,結束的位置正好等於下一幀的 p = −1
     兩幀首尾相接,中間不再有空白。 */
  /* ⚠️ 實測才發現空白的真正原因,不是動畫時間 ——
     p ∈ [0,1] 是「釘住」那段,但一幀高 200svh、pin 只有 100svh,
     所以 p 走完 1 之後,這一幀還會再往上滑 900px 才真的離場;
     同一時間下一幀正從畫面下緣升上來(p 是負的、內容還在螢幕外)。
     舊寫法把 p 夾在 [0,1],結果那 900px 裡:
       上一幀 out 已經是 1(明明還在畫面上,卻被畫成全透明)
       下一幀 in 還是 0(而且內容根本還在下緣外)
     → 就是 Zakk 說的「過場留白太多,太空了」。

     現在讓 p 可以是負的、也可以超過 1,把動畫對齊「實際的物理位移」:
       p −0.80 ~  0.00  進場:邊往上升邊浮現,升到定位剛好完成
       p  0.00 ~  1.00  釘住不動,讓人讀(這段完全靜止)
       p  1.00 ~  1.80  退場:邊往上滑邊淡出
     上一幀的退場和下一幀的進場在時間上重疊,是真的交叉淡出。 */
  /* ⚠️ 定格時間不要為了「順」而縮短 —— 縮到 0.95 幀之後,
     Zakk 說「又變成往下滾的感覺」。定格夠長,一幀才會像一個鏡頭。

     內容改成 fixed(完全疊在一起)之後,交叉可以做滿:
     相鄰兩幀的 p 永遠相差 2,所以 out 走 [1,2]、in 走 [-1,0] 剛好互補 ——
     上一幀淡掉多少,下一幀就補上多少,任何一刻畫面都是滿的,不會有空檔。 */
  /* ⚠️ 這些數字的單位是「釘住那段的捲動距離」(total = 幀高 - 一個視窗高),
     幀高一改,相鄰兩幀的 p 差距(OFF = 幀高 / total)就跟著變 ——
     所以 OUT_END 不能寫死,要每一幀依自己的 OFF 算。
     幀高 200svh 時 OFF = 2;為了少滾幾圈改成 150svh,OFF 就變成 3。

     交叉不能做滿:做滿的時候兩幀在中點各 50%,兩整頁文字疊在一起
     (Zakk 回報「內容都會互相重疊」)。內容已經不會滑了,只需要很短的交接。 */
  /* 交接曲線的訣竅:**退場快、進場慢**。
     兩邊用一樣的長度就會同時停在 50%,變成兩整頁疊在一起(Zakk 不要);
     兩邊都短又會出現全空的一瞬間(實測掉到 0.08)。
     退場走 1.1、進場走 2.0 —— 時間上重疊,但透明度不會同時在中間,
     所以「第二亮的那一幀」最高只有 0.17,而畫面永遠有東西。 */
  /* ⚠️ Zakk 第三次回報「所有畫面還是重疊到了」。
     前幾版都還是讓兩幀在時間上重疊,只是靠曲線錯開透明度 —— 但只要同時有東西在,
     他就看得出來。所以改成**完全不重疊**:
     上一幀必須先掉到 0,下一幀才開始進場,中間留一小段只有碎片的畫面
     (那一段他早就同意了:「中間交給碎片撐著」)。

     不重疊的條件:OUT_LEN + IN_LEN <= OFF - 1(OFF = 幀高 / 釘住段,150svh 時是 3)。
     0.80 + 1.00 = 1.80 < 2 ✓,中間空 0.2 段 ≈ 130px,只有碎片。 */
  var IN_LEN = 1.00;      // 進場長度
  var OUT_LEN = 0.80;     // 退場長度
  var OUT_START = 1.00;

  function frame() {
    var vh = window.innerHeight;
    for (var i = 0; i < secs.length; i++) {
      var sec = secs[i];
      var r = sec.getBoundingClientRect();
      /* ⚠️ 離太遠的幀不能只是「跳過」。
         內容改成 fixed 之後,每一幀都疊在視窗上,跳過的話 --in 會停在預設值 1
         → 五幀全部同時顯示。實際踩過:首屏一載入,About / Photos / Contact 全疊上來。
         所以要明確把它設成「完全隱藏」再跳過。 */
      if (r.bottom < -vh || r.top > vh * 2) {
        sec.__pin.style.setProperty('--in', '0');
        sec.__pin.style.setProperty('--out', '0');
        sec.__sheet.setAttribute('data-live', '0');
        sec.__sheet.style.zIndex = 0;
        continue;
      }

      var total = r.height - vh;
      var p = total > 0 ? (-r.top) / total : 0;
      /* ⚠️ 下限不能夾在 0 —— 進場要在還沒釘住的時候就開始 */
      /* ⚠️ 下限一定要比 IN_LEN 還遠,否則遠處的幀會被卡在「進場一半」的亮度,
         永遠淡不掉(實測:最大重疊衝到 0.58)。 */
      if (p < -(IN_LEN + 0.4)) p = -(IN_LEN + 0.4); else if (p > 4) p = 4;

      var OFF = r.height / total;                 // 相鄰兩幀的 p 差距
      var OUT_END = OUT_START + OUT_LEN;
      var vin = sec.__first ? 1 : (p + IN_LEN) / IN_LEN;   // p 是負的,從 -IN_LEN 開始
      if (vin > 1) vin = 1; else if (vin < 0) vin = 0;
      var vout = (p - OUT_START) / (OUT_END - OUT_START); if (vout < 0) vout = 0; else if (vout > 1) vout = 1;

      // smoothstep,兩端收得柔一點
      vin = vin * vin * (3 - 2 * vin);
      vout = vout * vout * (3 - 2 * vout);

      /* ⚠️ 光是「還沒淡出就別藏起來」是不夠的 ——
         那 900px 裡上一幀的 pin 正往上滑、下一幀的 pin 正從下面上來,
         兩張畫面是前後排隊的,同時可見就變成「兩頁疊在一起」,看起來像壞掉。

         所以要把內容鎖在畫面中央:算出 pin 現在偏離螢幕頂端多少,
         再用等量的位移把它推回去。這樣進場和退場的內容都固定在同一個位置,
         只有透明度在交叉 —— 頁面不動、畫面換一偵,才是 Zakk 要的「像播影片」。 */
      /* ⚠️ 只有「正在演出」的幀才鎖位置。
         還沒輪到的幀 pinTop 是好幾千 px,照搬會把它整塊拉到首屏中央 ——
         內容雖然是透明的,但碎片的「避開文字」是照元素位置算的,
         結果整片中央被當成有字挖掉,頭骨中間就破了一個大洞。 */
      /* 內容已經 fixed 在視窗上,完全不隨捲動移動,所以不需要再抵銷任何位移
         (--lock 那套「用位移抵銷位移」已作廢 —— 只要抵銷差一點點就看得出來)。
         這裡只剩一件事:所有幀疊在同一個位置,只有夠亮的那一幀能吃點擊。 */
      var vis = vin * (1 - vout);
      /* 🔴 右側的骨頭要跟內容**同一個時間軸**。
         它本來自己用 getBoundingClientRect 算一套進退場,
         跟這裡的 vin/vout 是兩條不同的曲線 —— 所以換頁時
         文字都出來了骨頭還沒到、或反過來(Zakk:「滑到下一頁時
         內容跟碎片沒有同時出現,回上一頁也是」)。
         把這裡算好的能見度掛出去,骨頭直接讀它。 */
      if (sec.id) (window.__frameVis || (window.__frameVis = {}))[sec.id] = vis;
      sec.__sheet.setAttribute('data-live', vis > 0.5 ? '1' : '0');
      sec.__sheet.style.zIndex = (vis * 100) | 0;
      sec.__pin.style.setProperty('--in', vin.toFixed(3));
      sec.__pin.style.setProperty('--out', vout.toFixed(3));
    }
    raf = requestAnimationFrame(frame);
  }

  var raf = requestAnimationFrame(frame);
})();


(function () {
  'use strict';

  /* ── Hero 版本切換 ──
     B 版(文字+人像)已是預設主頁;想看舊的純文字 A 版,網址加 ?hero=a。
     JS 失效時預設顯示 B 版。 */
  if (location.search.indexOf('hero=a') !== -1) {
    document.documentElement.classList.add('hero-a-on');
  }

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;


  /* ── P07 滾動揭示 ───────────────────────────── */

  var targets = document.querySelectorAll('.reveal');

  if (targets.length) {
    // 關掉動畫、或舊瀏覽器沒有 IntersectionObserver → 直接全部顯示,
    // 絕不能讓內容因為動畫失效就消失
    if (reduced || !hasIO) {
      targets.forEach(function (el) { el.classList.add('is-visible'); });
    } else {
      var revealer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          revealer.unobserve(entry.target);   // 播過就不再監聽
        });
      }, {
        threshold: 0.15,
        rootMargin: '0px 0px -8% 0px'   // 稍微晚一點才觸發,比較自然
      });

      targets.forEach(function (el) { revealer.observe(el); });

      /* ── 從別頁「掃描」進來時,首屏內容直接是成形的 ──
         換頁時整頁是由左往右被描出來的,那個掃描**本身就是這一頁的進場**。
         如果首屏的字同時還在演自己的進場(淡入 + 上浮 + 對焦),
         繪圖機描出來的就會是一頁模糊的字 —— 實測過,很難看。
         同一件事不該演兩次。

         所以:掃描進來時,把首屏內的元素直接標成已顯示,而且那一幀不要過渡
         (html.vt-arrive 把 transition 關掉,才不會看到它們「跳」一下)。
         首屏以下的內容不動,照常捲到才進場。

         直接開網址(沒有轉場)完全不受影響,照原本的方式一個一個浮上來。 */
      if ('onpagereveal' in window) {
        window.addEventListener('pagereveal', function (e) {
          if (!e.viewTransition) return;

          var root = document.documentElement;
          root.classList.add('vt-arrive');

          var vh = window.innerHeight;
          targets.forEach(function (el) {
            var r = el.getBoundingClientRect();
            if (r.top < vh && r.bottom > 0) {       // 只處理首屏看得到的
              el.classList.add('is-visible');
              revealer.unobserve(el);
            }
          });

          // 隔兩幀再放開,確保「無過渡」那一幀已經畫完
          requestAnimationFrame(function () {
            requestAnimationFrame(function () { root.classList.remove('vt-arrive'); });
          });
        }, { once: true });
      }
    }
  }


  /* ── Hero 進場 ───────────────────────────────
     Hero 一開始就在畫面裡,不該等滾動。
     等字型載完再播,避免文字先用備用字型閃一下再跳字(FOUT)。 */

  var heroTitles = document.querySelectorAll('.hero__title, .hb2-title');
  if (heroTitles.length) {
    var play = function () {
      heroTitles.forEach(function (t) { t.classList.add('is-visible'); });
    };
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(play);
      setTimeout(play, 1200);   // 字型載太久的保險,不讓標題卡住不出現
    } else {
      play();
    }
  }


  /* ── Hero B 滑鼠視差 ──
     只寫兩個變數 --mx/--my(-0.5~0.5),位移交給 CSS calc。
     觸控裝置與關閉動畫者都不啟用。 */

  var heroB = document.querySelector('.hero-b');
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (heroB && fine && !reduced) {
    heroB.addEventListener('mousemove', function (e) {
      var r = heroB.getBoundingClientRect();
      heroB.style.setProperty('--mx', (e.clientX - r.left) / r.width - 0.5);
      heroB.style.setProperty('--my', (e.clientY - r.top) / r.height - 0.5);
    });
    heroB.addEventListener('mouseleave', function () {
      heroB.style.setProperty('--mx', 0);
      heroB.style.setProperty('--my', 0);
    });

    // 滑過 logo 或大標時,背景龍骨鬼影「顯影」
    heroB.querySelectorAll('.lgm, .hb2-title').forEach(function (el) {
      el.addEventListener('mouseenter', function () { heroB.classList.add('ghost-lit'); });
      el.addEventListener('mouseleave', function () { heroB.classList.remove('ghost-lit'); });
    });
  }


  /* ── 導覽列「你在這裡」 ─────────────────────────
     哪個章節通過畫面中央,對應的導覽項就標示為目前位置。
     rootMargin 上下各縮 45%,等於只留中間那條窄帶當判斷區。 */

  var links = document.querySelectorAll('.nav a');

  if (links.length && hasIO) {
    var linkOf = {};
    links.forEach(function (a) {
      linkOf[a.getAttribute('href').slice(1)] = a;
    });

    var clear = function () {
      links.forEach(function (a) {
        a.classList.remove('is-active');
        a.removeAttribute('aria-current');
      });
    };

    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var a = linkOf[entry.target.id];
        clear();
        if (a) {
          a.classList.add('is-active');
          a.setAttribute('aria-current', 'true');   // 讀螢幕軟體也聽得到
        }
      });
    }, { rootMargin: '-45% 0px -45% 0px' });

    // Hero 也要觀察 — 在 Hero 時四個導覽項都不該亮
    document.querySelectorAll('.hero, main .section').forEach(function (s) {
      spy.observe(s);
    });
  }


  /* ── 導覽列 rolling text ─────────────────────
     把每個字母拆成一個 <span>,才能一個一個錯開時間往上捲。
     捲上來遞補的那一份是 CSS 的 text-shadow 畫的,不是真的文字,
     所以這裡只負責拆字,不複製任何內容。
     關閉動畫時整段跳過 — 沒有 .ch 就沒有捲動,文字照常顯示。 */

  if (!reduced) {
    document.querySelectorAll('.nav__label').forEach(function (label) {
      var text = label.textContent;
      label.textContent = '';

      for (var i = 0; i < text.length; i++) {
        var ch = document.createElement('span');
        ch.className = 'ch';
        ch.textContent = text[i];
        ch.style.setProperty('--i', i);   // 給 CSS 算延遲用的順序
        label.appendChild(ch);
      }
    });
  }


  /* ═══════════════════════════════════════════════════
     P05 — Works 清單 hover 換圖
     預覽圖用 requestAnimationFrame + lerp 做延遲跟隨:
     每一幀只把圖片往游標移動一小段(係數 0.15),
     所以它是「跟上來」而不是「黏在游標上」。
     只動 transform,不動 layout 屬性(效能底線)。
     ═══════════════════════════════════════════════════ */

  var canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var rows = document.querySelectorAll('.works__row');

  /* ── 觸控裝置:按住那一列才出現預覽圖(Zakk 指定)──
     原本手機是八張圖全部攤開,清單本來是排版主角,結果變成圖片牆。
     這是把桌機的 hover 預覽翻譯成觸控的說法。

     ⚠️ 門檻要 300ms,不能短。一次普通的點擊大約 100–200ms ——
     設太短的話每次點都會先展圖、還把跳頁擋掉,等於連結壞了。
     現在:快點 = 進作品頁,按住 = 看圖(放開時不跳頁)。

     ⚠️ pointercancel 一定要接 —— 手指開始滑動捲頁時瀏覽器會送這個事件,
     不接的話一邊捲一邊會有圖莫名其妙展開。 */
  if (!canHover && rows.length) {
    var HOLD_MS = 300;

    rows.forEach(function (row) {
      var timer = null, held = false;

      row.addEventListener('pointerdown', function () {
        held = false;
        clearTimeout(timer);
        timer = setTimeout(function () {
          held = true;
          row.classList.add('is-press');
        }, HOLD_MS);
      });

      var release = function () {
        clearTimeout(timer);
        row.classList.remove('is-press');
      };
      row.addEventListener('pointerup', release);
      row.addEventListener('pointercancel', release);
      row.addEventListener('pointerleave', release);

      // 按住看完圖放開,不該順便跳頁
      row.addEventListener('click', function (e) {
        if (held) { e.preventDefault(); held = false; }
      });
    });
  }

  if (canHover && rows.length) {
    var thumbs = document.querySelectorAll('.works__thumb');

    /* 🔴 預覽圖一定要搬到 <body> 底下。
       它是 position: fixed、由 JS 餵視窗座標,但 `.works` 這個清單帶著
       進場動畫的 transform —— **祖先只要有 transform(連 identity 都算),
       fixed 就會改用那個祖先當基準,不再對齊視窗**,座標整組偏掉
       (實測垂直差 417px、水平差 56px)。
       這是同一個坑第五次出現:§18 clip-path、§53 --lock、§58 fixed、
       §62 will-change,這次是進場動畫的 transform。 */
    var thumbOf = [];               // row index → thumb(搬走之後就不是子元素了)
    for (var n = 0; n < rows.length; n++) {
      var tn = rows[n].querySelector('.works__thumb');
      thumbOf[n] = tn;
      if (tn) document.body.appendChild(tn);
    }

    var pointer = { x: 0, y: 0 };   // 游標實際位置
    var eased   = { x: 0, y: 0 };   // 預覽圖目前位置(追在後面)
    var lerp = reduced ? 1 : 0.5;   // 貼緊游標(太小會拖在後面很遠);關閉動畫時直接對齊
    var active = null;
    var activeThumb = null;
    var running = false;

    var OFFSET_X = 18;              // 只要不蓋住游標就好,不用推很遠

    var frame = function () {
      eased.x += (pointer.x - eased.x) * lerp;
      eased.y += (pointer.y - eased.y) * lerp;

      // 所有預覽圖共用同一個位置,切換時才不會從別的地方飛過來
      for (var i = 0; i < thumbs.length; i++) {
        var t = thumbs[i];
        var y = eased.y - t.offsetHeight / 2;
        t.style.transform = 'translate3d(' + (eased.x + OFFSET_X) + 'px,' + y + 'px,0)';
      }

      if (active) {
        requestAnimationFrame(frame);
      } else {
        running = false;
      }
    };

    var start = function () {
      if (running) return;
      running = true;
      requestAnimationFrame(frame);
    };

    document.querySelector('.works').addEventListener('mousemove', function (e) {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    });

    rows.forEach(function (row, idx) {
      row.addEventListener('mouseenter', function (e) {
        // 第一次進入時直接把預覽圖放到游標處,避免從左上角飛過來
        if (!active) {
          eased.x = pointer.x = e.clientX;
          eased.y = pointer.y = e.clientY;
        }
        if (activeThumb) activeThumb.classList.remove('is-hover');
        active = row;
        activeThumb = thumbOf[idx];
        if (activeThumb) activeThumb.classList.add('is-hover');
        start();
      });

      row.addEventListener('mouseleave', function () {
        if (thumbOf[idx]) thumbOf[idx].classList.remove('is-hover');
        if (active === row) { active = null; activeThumb = null; }
      });
    });
  }


  /* ── 開發用診斷面板 ─────────────────────────────
     網址加上 ?debug 才會出現(例如 localhost:8765/?debug)。
     它直接讀 h1 的 computed style — 等同 devtools 看到的值。
     上線前整段刪掉。 */

  if (location.search.indexOf('debug') === -1) return;

  var probe = function () {
    var h1 = document.querySelector('.hero__title');
    var cs = getComputedStyle(h1);

    // 實測:同一句話在 wdth 100 和目前設定下,寬度差多少
    var ruler = document.createElement('span');
    ruler.textContent = 'From space';
    ruler.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;' +
      'font-family:' + cs.fontFamily + ';font-size:100px;font-weight:500;';
    document.body.appendChild(ruler);

    ruler.style.fontStretch = '100%';
    ruler.style.fontVariationSettings = "'wdth' 100, 'wght' 500";
    var w100 = ruler.getBoundingClientRect().width;

    ruler.style.fontStretch = '125%';
    ruler.style.fontVariationSettings = "'wdth' 125, 'wght' 500";
    var w125 = ruler.getBoundingClientRect().width;

    ruler.remove();

    var diff = (w125 / w100 - 1) * 100;
    var axisWorks = diff > 5;                        // 預期約 +28.9%
    var loaded = document.fonts.check('500 100px Archivo');
    var usingArchivo = /Archivo/i.test(cs.fontFamily);

    var box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:999;max-width:min(92vw,520px);' +
      'padding:14px 16px;background:#171B1E;color:#F4F6F7;border-radius:4px;' +
      'font:12px/1.75 ui-monospace,monospace;white-space:pre-wrap;user-select:text;';

    var report =
      '── h1 computed style ──\n' +
      'font-family              : ' + cs.fontFamily + '\n' +
      'font-size                : ' + cs.fontSize + '\n' +
      'font-weight              : ' + cs.fontWeight + '\n' +
      'font-stretch             : ' + cs.fontStretch + '\n' +
      'font-variation-settings  : ' + cs.fontVariationSettings + '\n' +
      '\n── 實測寬度 (100px 字級) ──\n' +
      'wdth 100                 : ' + w100.toFixed(1) + ' px\n' +
      'wdth 125                 : ' + w125.toFixed(1) + ' px\n' +
      '差距                     : ' + diff.toFixed(1) + '%   (預期 +28.9%)\n' +
      '\n── 判定 ──\n' +
      'Archivo 已載入           : ' + (loaded ? 'YES' : 'NO  ← 字型沒載到') + '\n' +
      '目前套用的是 Archivo     : ' + (usingArchivo ? 'YES' : 'NO') + '\n' +
      'wdth 軸有作用            : ' + (axisWorks ? 'YES' : 'NO  ← 軸沒生效') + '\n' +
      '\n' + navigator.userAgent;

    box.textContent = report;

    // 一鍵複製,不用手動選取
    var btn = document.createElement('button');
    btn.textContent = '📋 複製這份報告';
    btn.style.cssText = 'display:block;margin-top:12px;padding:8px 14px;cursor:pointer;' +
      'background:#F4F6F7;color:#171B1E;border:0;border-radius:3px;' +
      'font:12px ui-monospace,monospace;';
    btn.onclick = function () {
      navigator.clipboard.writeText(report).then(function () {
        btn.textContent = '✅ 已複製,去貼給 Claude';
      }, function () {
        btn.textContent = '❌ 複製失敗,請手動選取文字';
      });
    };
    box.appendChild(btn);

    document.body.appendChild(box);
  };

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(probe);
  } else {
    setTimeout(probe, 1500);
  }

})();


/* ═══════════════════════════════════════════════════════
   Hero 龍骨 3D 點雲碎片
   取樣龍骨雕塑 → 每個碎片給一個深度(用明暗當立體起伏),
   組成一團可旋轉的 3D 點雲:近大遠小、隨滑鼠轉動、緩慢自轉,
   放大到幾乎鋪滿 hero、疊在文字與照片上方(碎片會蓋過去)。
   另有一圈環繞粒子繞著龍骨飛。關動畫則畫靜態一張。
   效能:碎片依「顏色+透明度」分桶,每桶只設一次 fillStyle 批次畫。
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var canvas = document.querySelector('.fragments');
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext('2d');
  var heroB = document.querySelector('.hero-b');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 五段骨頭,對應五個區塊 ──
     捲動不是只把碎片吹散,而是**把它們重新組成下一段骨頭**:
     頭骨 → 脊椎 → 肋骨 → 翅膀 → 尾椎。
     中間會先炸開再聚攏,所以每一段之間都有一個「散掉又長回來」的過程,
     但任何一個落點都是一副看得出來的骨頭,不是雜訊。 */
  /* fs = 顆粒大小倍率,wob = 晃動幅度倍率,am = 濃度倍率。
     頭骨 am 拉到 1.45 —— 它是首屏主角,要比其餘幾段更實。
     頭骨是實心塊面,顆粒大一點才有份量;
     其餘幾段是線稿,點都擠在細線上 —— 顆粒要小、晃動要收,
     線才會利、形狀才讀得出來(顆粒一大就糊成一條粗帶)。 */
  /* 2026-08-01:只留首屏的龍頭骨。
     其他區塊的脊椎 / 肋骨 / 翅膀 / 尾椎全部拿掉(Zakk:「其他頁的骨頭刪掉,
     保留首頁的就好,其他頁改成正常一點的設計」)。

     只剩一段之後,換段判斷、炸開過場、空白框定位那整套會自然退化成不作用 ——
     forms.length - 1 = 0,sectionIndex 永遠回傳 0,骨頭就一直是首屏那顆頭骨。
     程式碼留著沒有壞處,要加回其他部位只要把陣列補回來。 */
  var FORMS = [
    { src: 'assets/3d/dragon.webp', flat: false, fs: 1.00, wob: 1.85, am: 1.45 }   /* wob 1.00 -> 1.85:Zakk 說「有點靜止」 */
  ];
  /* 手機把負擔砍下來(Zakk 回報「有點卡頓」)。
     碎片這張畫布是全站最貴的東西:每一偵 clearRect 整張 + 幾千次 drawImage。
     實測 390×844 的手機:DPR 2 時畫布是 780×1688 = 1.32 MP,
     降到 1.5 之後 585×1266 = 0.74 MP —— **填色量少 44%**,
     而 1.5 倍在手機的高密度螢幕上肉眼看不出差別(環繞粒子那支引擎本來就用 1.5)。
     ⚠️ **點數不要跟著砍太兇。** 先試 1600,頭骨立刻變得稀稀落落 ——
     Zakk 在 §60 已經連續兩次嫌粒子太少了,省效能不能拿這個換。
     DPR 那 44% 是**看不出來**的省,優先用它;點數只收三分之一。 */
  var SMALL = window.matchMedia('(max-width: 720px), (pointer: coarse)').matches;
  /* 手機:點數比桌機少很多,但每一顆**畫得比較大**(見 SIZE_K)。
     少而大 > 多而小 —— 後者在手機上又糊又擠,而且畫的次數還比較多。 */
  var NPTS = SMALL ? 1800 : 3600;
  var SIZE_K = SMALL ? 2.0 : 1;     // 手機碎片放大,補回密度感,也回應「太小」
  var TRANS_MS = 900;          // 換區塊時過場動畫的固定時長
  var curSeg = 0, wantSeg = 0, fromSeg = 0, segT = 1;
                               // 每段都取樣成同樣點數 —— 數量一樣才能逐點插值
  var heroFrame = null;      /* 首屏那一幀,第一次用到才查 */
  var BURST = 0.95;            /* 過場時往外炸開的幅度。
                                  0.34 太小:新骨頭同時要縮進小空白框,
                                  那個「縮」蓋過了「炸」,看起來只是縮小平移。
                                  要讓中途的散開明顯大於兩端,才讀得出是炸開。 */
  var imgs = [];               // 載好的圖
  var forms = [];              // forms[f] = [[x,y,z], ...] 共 NPTS 個
  var formExt = [];            // 每段骨頭的實際寬高
  var buckets = [];          // [{style, items:[碎片]}] — 依顏色+透明度分桶
  var W = 0, H = 0, DPR = 1, raf = null, t = 0, assemble = 1;
  var ay = 0, ax = 0, tay = 0, tax = 0;   // 旋轉角(目前/滑鼠目標)
  /* 滑鼠的實際像素位置,用來把附近的碎片推開(-1 = 還沒進畫面) */
  var pxm = -1, pym = -1, pxe = -1, pye = -1;
  /* ── 滑鼠互動:散開 ──
     Zakk 的參考圖「有一種粒子散開的感覺」。前三代都做錯方向:
       ① 推開 + 沿切線繞 → 游標下面一個洞
       ② 半徑重映射(透鏡)→ 還是洞
       ③ 純扭轉 → 沒有洞,但那是「被擰過去」,不是散開
     真正的散開 = 往外推 + **每顆各自往自己的方向亂跑**。
     亂跑的方向用 p.ph 算(固定值),不是每幀重擲 —— 不然會抖。 */
  var LENS_R = 110;    // 影響半徑(Zakk:「扭曲可以範圍小點」)
  var TWIST = 0.34;    // 留一點旋轉,散開才有方向感
  var SCAT_R = 26;     // 往外推多少 px
  var SCAT_J = 30;     // 每顆各自亂跑的幅度 px
  var LENS_MAG = 0.16; // 中心的碎片本身放大一點,才有厚度感
  /* ⚠️ 碎片自己的旋轉已經拿掉(Zakk:「不要有碎片轉動」)。
     整片被擰過去是對的,但每一片還各轉各的,看起來就是在抖。 */
  var F = 900;                            // 透視焦距(越小越誇張)


  /* 🔴 碎片的配色 = 三塊印刷版:黑墨、製圖藍、餘燼橘。
     原本是「墨黑 → 灰藍 → 石灰」—— 三階全是灰,所以碎片只有明度差、沒有顏色
     (Zakk:「碎片呢,感覺可以加點顏色」)。
     中階換成真正的製圖藍(#1F4A78,跟 CSS 的 --slate 同一個值),
     深淺的中段因此帶藍,整團才有「兩塊版疊印」的感覺。
     橘從 4% 提到 7%:它是第三塊版,太少會看不出來是「有這個顏色」,
     只會像雜訊。 */
  /* 🔴 碎片改成**單一色相**:製圖藍的三個階(Zakk:「我想看看她同顏色的樣子」)。
     原本是黑墨/藍/石灰三個不同的顏色混在一起 —— 那是「雜色」不是「配色」,
     遠看就是一團灰。同一個色相只變明度,整團才會被讀成一個東西。
     ⚠️ 橘版也一併關掉(下面 EMBER_RATE = 0)——「同顏色」要看得準,
     留 8% 的橘就測不出來了。要加回來把 RATE 調回 0.07 就好。 */
  var COLS = ['20,48,79', '31,74,120', '86,124,168'];   // 製圖藍:深 / 中 / 淺
  var EMBER = '21,53,92';   // 原本是餘燼橘 180,85,42;全站改單色相後換成深藍

  function layout() {
    /* ⚠️ 曾經在手機把上限壓到 1.5 換效能 —— **那是「糊」的元兇。**
       手機大多是 3 倍螢幕,1.5 的畫布要被放大兩倍顯示,碎片邊緣就爛掉了
       (Zakk:「碎片太小,很糊」)。清晰度不能拿來換,改從**點數**省。 */
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    build();          // 尺寸變了要重新取樣龍骨,不然碎片會對不到位置
  }

  /* 不規則碎片 sprite:預先畫好幾種隨機多邊形,之後只 drawImage。
     比每幀畫多邊形快很多,又不會是死板的方形像素。 */
  var SHAPES = 7, spriteCache = {};
  function makeFrags(rgb, a) {
    var arr = [];
    for (var s = 0; s < SHAPES; s++) {
      var c = document.createElement('canvas'); c.width = c.height = 16;
      var g = c.getContext('2d');
      g.globalAlpha = a;
      g.fillStyle = 'rgb(' + rgb + ')';
      /* 不規則碎片(2026-07-29 試過方塊/空心方塊,Zakk 覺得不好看,改回來)。
         形狀由編號 s 決定、不用亂數 —— 透明度是烤進 sprite 的,
         碎片淡出時 band 會變,亂數會讓同一顆碎片在淡出過程中換形狀。 */
      g.beginPath();
      var n = 3 + (s % 3);                       // 3~5 邊
      for (var i = 0; i < n; i++) {
        var ang = (i / n) * 6.283 + ((s * 1.7 + i * 2.3) % 1) * 0.9;
        var rad = 3.4 + ((s * 2.9 + i * 1.3) % 1) * 4.2;
        var vx = 8 + Math.cos(ang) * rad, vy = 8 + Math.sin(ang) * rad;
        if (i === 0) g.moveTo(vx, vy); else g.lineTo(vx, vy);
      }
      g.closePath();
      g.fill();
      arr.push(c);
    }
    return arr;
  }
  /* 透明度直接烤進 sprite,不是每顆碎片去設 globalAlpha ——
     Canvas 每改一次 globalAlpha 就是一次狀態切換,上萬顆會嚴重掉幀。
     烤好之後整幀只剩 drawImage,霧化(每顆深淺不同)才做得起來。
     band 1–20 對應 alpha 0.05–1.0。 */
  function fragsFor(col, band) {
    var key = col + '|' + band;
    if (!spriteCache[key]) spriteCache[key] = makeFrags(col, band / 20);
    return spriteCache[key];
  }

  function bucketPush(map, col, alLv, p) {
    var key = col + '|' + alLv;
    if (!map[key]) {
      map[key] = { col: col, al: alLv / 10, items: [] };
    }
    p.sh = (Math.random() * SHAPES) | 0;

    map[key].items.push(p);
  }

  /* 把一張圖取樣成點雲(模型座標,已置中、已縮放到畫面尺度) */
  function samplePoints(im, flat) {
    var iw = im.naturalWidth, ih = im.naturalHeight;
    var off = document.createElement('canvas');
    off.width = iw; off.height = ih;
    var octx = off.getContext('2d');
    octx.drawImage(im, 0, 0);
    var data;
    try { data = octx.getImageData(0, 0, iw, ih).data; }
    catch (e) { return []; }

    /* ⚠️ 這個 1650 是**頭骨在寬螢幕上長不大的原因**。
       W*1.05 在 1571px 以上就會超過 1650 被夾住,螢幕再寬頭骨都一樣大 ——
       實測 1920 寬時頭骨主體只有 566px(29% 螢幕寬),中間就空了。
       放寬到 2200,1571px 以下完全不受影響(那時本來就沒被夾到)。 */
    var s = Math.min(W * 1.05, 2200) / iw;
    var depth = iw * s * 0.16;
    // 線稿的線只有幾 px 寬,取樣要比照片密,不然整條線會被跳過
    var step = Math.max(1, Math.round(iw / (flat ? 520 : 230)));
    var out = [];
    for (var y = 0; y < ih; y += step) {
      for (var x = 0; x < iw; x += step) {
        var i = (y * iw + x) * 4;
        if (data[i + 3] / 255 < 0.5) continue;
        var lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
        out.push([
          (x - iw / 2) * s,
          (y - ih / 2) * s,
          flat ? (Math.random() - 0.5) * depth * 1.15 : (lum - 0.5) * depth,
          lum
        ]);
      }
    }
    return out;
  }

  /* 每段點數不一樣,要統一成 NPTS —— 多的隨機抽,少的重複並加一點抖動,
     這樣同一顆碎片在每一段都有自己的落點,才能一路插值過去。 */
  function fit(pts, n) {
    if (!pts.length) return [];
    var out = [];
    if (pts.length >= n) {
      var stepf = pts.length / n;
      for (var i = 0; i < n; i++) out.push(pts[(i * stepf) | 0]);
    } else {
      for (var j = 0; j < n; j++) {
        var q = pts[j % pts.length];
        out.push(j < pts.length ? q :
          [q[0] + (Math.random() - 0.5) * 14, q[1] + (Math.random() - 0.5) * 14, q[2], q[3]]);
      }
    }
    return out;
  }

  function build() {
    buckets = [];
    if (!imgs.length || !imgs[0] || !imgs[0].naturalWidth) return;

    forms = []; formExt = [];
    for (var f = 0; f < imgs.length; f++) {
      var pts = fit(samplePoints(imgs[f], FORMS[f].flat), NPTS);
      forms.push(pts);
      // 這一段骨頭的實際寬高 —— 等一下要算它塞不塞得進空白框
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (var q = 0; q < pts.length; q++) {
        var pq = pts[q]; if (!pq) continue;
        if (pq[0] < x0) x0 = pq[0]; if (pq[0] > x1) x1 = pq[0];
        if (pq[1] < y0) y0 = pq[1]; if (pq[1] > y1) y1 = pq[1];
      }
      formExt.push([Math.max(1, x1 - x0), Math.max(1, y1 - y0)]);
    }
    if (!forms[0].length) return;

    var gap = (Math.min(W * 1.05, 2200) / imgs[0].naturalWidth) *
              Math.max(1, Math.round(imgs[0].naturalWidth / 190));

    var map = {};
    for (var i = 0; i < NPTS; i++) {
      var lum = forms[0][i] ? forms[0][i][3] : 0.5;
      var alLv = Math.max(1, Math.min(9, Math.round((0.22 + lum * 0.45) * 10)));

      // 每顆碎片自己的炸開方向(過場時往這個方向飛出去再回來)
      var ba = Math.random() * 6.283, bv = Math.acos(2 * Math.random() - 1);

      bucketPush(map, COLS[(Math.random() * COLS.length) | 0], alLv, {
        idx: i,
        bx: Math.sin(bv) * Math.cos(ba),
        by: Math.sin(bv) * Math.sin(ba) * 0.7,
        bz: Math.cos(bv),
        amp: 4 + Math.random() * 13,
        ecc: 0.35 + Math.random() * 0.9,
        sp: 0.35 + Math.random() * 0.9,
        sp2: 0.12 + Math.random() * 0.3,
        ph: Math.random() * 6.283,
        ph2: Math.random() * 6.283,
        sz: gap * (0.30 + Math.random() * 0.40),
        oa: Math.random() * 6.283,
        orad: Math.max(W, H) * (0.4 + Math.random() * 0.55),
        osp: (Math.random() < 0.5 ? -1 : 1) * (0.2 + Math.random() * 0.6)
      });
    }

    /* 環繞粒子:不屬於任何一段骨頭,一直在外圈繞 —— 負責「畫面感」 */
    var R = Math.max(W, H) * 0.30;
    for (var n = 0; n < 130; n++) {   // Zakk:「環繞的粒子太雜了」
      var u = Math.random() * 6.283, v = Math.acos(2 * Math.random() - 1);
      var rr = R * (0.5 + Math.random() * 1.05);
      bucketPush(map, COLS[(Math.random() * COLS.length) | 0],
        Math.max(1, Math.min(9, Math.round((0.16 + Math.random() * 0.3) * 10))), {
          idx: -1,                                   // -1 = 不跟著骨頭變形
          ox2: rr * Math.sin(v) * Math.cos(u),
          oy2: rr * Math.sin(v) * Math.sin(u) * 0.6,
          oz2: rr * Math.cos(v),
          /* 動得慢而穩:大而緩的圓周,不是快速亂抖。
             之前 sp 0.5–2.0 各轉各的,整團看起來就是雜訊。 */
          amp: 34 + Math.random() * 46,
          ecc: 0.75 + Math.random() * 0.35,     // 接近正圓,軌跡才乾淨
          sp: 0.16 + Math.random() * 0.2,       // 慢
          sp2: 0.05 + Math.random() * 0.09,
          ph: Math.random() * 6.283,
          ph2: Math.random() * 6.283,
          sz: gap * (0.2 + Math.random() * 0.34),
          oa: Math.random() * 6.283,
          orad: Math.max(W, H) * (0.4 + Math.random() * 0.55),
          osp: (Math.random() < 0.5 ? -1 : 1) * (0.2 + Math.random() * 0.6)
        });
    }

    for (var k in map) if (map.hasOwnProperty(k)) buckets.push(map[k]);
  }

  /* ── 避開文字 ──
     碎片不要出現在字周圍,只待在版面的空白處。

     ⚠️ PROGRESS §18 的教訓:用「推開」會在框邊堆成一條生硬的直線,
     **改用淡出才自然** —— 越靠近文字越透明,到框內完全不畫。

     每 20 幀重量一次就好:字型載入、進場動畫都會讓框移動,
     但每幀都查 getBoundingClientRect 會逼瀏覽器重算版面,很貴。 */
  var avoid = [], avoidTick = 0;
  var FEATHER = 56;              // 羽化距離:框外多遠開始淡

  /* 空白區的重心與大小 —— 骨頭會往這裡靠,而不是死死置中。
     不用我逐區塊猜版面:每次量框時順便掃一張粗網格,
     沒被文字佔到的格子就是空白,取重心當骨頭的落點。 */
  var emptyX = 0, emptyY = 0, emptyBW = 400, emptyBH = 300;   // 最大空白框
  var eX = 0, eY = 0, eK = 1;                  // 平滑後(實際用的)
  var anchorX = 0, anchorY = 0, anchorK = 1, anchorSet = false;   // 定案的落點(畫面座標,鎖住)
  var GX = 18, GY = 12;                        // 網格解析度

  function measureAvoid() {
    avoid.length = 0;
    /* ⚠️ 要抓「實際有字的小塊」,不能抓容器。
       抓 main li 的話,Works 每一列都是整行寬 —— 避讓框會吃掉整個畫面,
       碎片全被擋光,形狀反而看不見。抓到欄位層級,欄與欄之間的空隙才留得下來。 */
    var sel = 'main h2, main h3, main p, main dt, main dd, main figcaption,' +
              '.section__title, .section__num,' +
              '.works__num, .works__name, .works__type, .works__year,' +
              '.xp__org, .xp__role, .xp__time, .about__label, .about__list,' +
              '.contact-list a, .about__name, .about__opening,' +
              '.hb2-head, .hb2-meta, .hb2-status, .footer p';
    var els = document.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      if (r.bottom < -FEATHER || r.top > H + FEATHER) continue;   // 不在畫面就跳過
      if (r.width < 8 || r.height < 8) continue;
      /* ⚠️ 內容改成 position: fixed 之後,**每一幀的文字都疊在視窗上**,
         即使 opacity 是 0 也一樣有位置。照單全收的話整個畫面都被當成「有字」,
         碎片被遮到只剩 110 點 —— 首屏的頭骨就整個不見了(實際踩過)。
         只算現在真的看得見的那一幀。 */
      var sheet = els[i].closest('.frame__sheet');
      if (sheet && sheet.getAttribute('data-live') !== '1') continue;
      avoid.push(r.left, r.top, r.right, r.bottom);
    }

    /* ── 找「最大的一塊連續空白」 ──
       之前是取所有空白格的**重心**,但空白通常散在上緣、左欄、右側 ——
       重心落在中間、骨頭被攤得很大片、密度很低,結果完全看不出是骨頭。
       改成用直方圖法找最大的全空矩形,把骨頭整個塞進那一塊,小而密才讀得出來。 */
    var cw = W / GX, chh = H / GY;
    var free = new Array(GX * GY);
    for (var gy = 0; gy < GY; gy++) {
      for (var gx = 0; gx < GX; gx++) {
        var px0 = (gx + 0.5) * cw, py0 = (gy + 0.5) * chh;
        var ok = 1;
        for (var a = 0; a < avoid.length; a += 4) {
          if (px0 > avoid[a] - FEATHER && px0 < avoid[a + 2] + FEATHER &&
              py0 > avoid[a + 1] - FEATHER && py0 < avoid[a + 3] + FEATHER) { ok = 0; break; }
        }
        free[gy * GX + gx] = ok;
      }
    }

    // 直方圖 + 單調堆疊:每一列往上累積高度,找該列能撐出的最大矩形
    var hgt = new Array(GX).fill(0), bestA = 0, bx0 = 0, by0 = 0, bx1 = 0, by1 = 0;
    for (var r2 = 0; r2 < GY; r2++) {
      for (var c2 = 0; c2 < GX; c2++) hgt[c2] = free[r2 * GX + c2] ? hgt[c2] + 1 : 0;
      var st = [];
      for (var c3 = 0; c3 <= GX; c3++) {
        var hh = c3 === GX ? 0 : hgt[c3];
        while (st.length && hgt[st[st.length - 1]] >= hh) {
          var top = st.pop();
          var left = st.length ? st[st.length - 1] + 1 : 0;
          var area = hgt[top] * (c3 - left);
          if (area > bestA) {
            bestA = area;
            bx0 = left; bx1 = c3 - 1; by1 = r2; by0 = r2 - hgt[top] + 1;
          }
        }
        st.push(c3);
      }
    }

    if (bestA >= 6) {
      var rx0 = bx0 * cw, rx1 = (bx1 + 1) * cw;
      var ry0 = by0 * chh, ry1 = (by1 + 1) * chh;
      emptyX = (rx0 + rx1) / 2;
      emptyY = (ry0 + ry1) / 2;
      emptyBW = rx1 - rx0;
      emptyBH = ry1 - ry0;
    } else {
      emptyX = W * 0.5; emptyY = H * 0.5;
      emptyBW = W * 0.3; emptyBH = H * 0.3;
    }
  }

  /* ── 遮蔽查表 ──
     ⚠️ 原本每顆碎片都要對「所有文字框」算一次距離:
     3700 顆 × 40 框 ≈ 15 萬次/幀 —— 滑鼠移動時就會有卡頓感。
     改成每 20 幀算好一張 48×32 的遮蔽表,之後每顆碎片只做一次雙線性取樣 → O(1)。 */
  var CGX = 48, CGY = 32;
  var cgrid = new Float32Array(CGX * CGY);

  function buildClearGrid() {
    var cw = W / CGX, ch = H / CGY;
    for (var gy = 0; gy < CGY; gy++) {
      for (var gx = 0; gx < CGX; gx++) {
        var x = (gx + 0.5) * cw, y = (gy + 0.5) * ch;
        var m = 1;
        for (var i = 0; i < avoid.length; i += 4) {
          var dx = 0, dy = 0;
          if (x < avoid[i]) dx = avoid[i] - x; else if (x > avoid[i + 2]) dx = x - avoid[i + 2];
          if (y < avoid[i + 1]) dy = avoid[i + 1] - y; else if (y > avoid[i + 3]) dy = y - avoid[i + 3];
          if (dx === 0 && dy === 0) { m = 0; break; }      // 框內:完全不畫
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < FEATHER) { var f = d / FEATHER; if (f < m) m = f; }
        }
        cgrid[gy * CGX + gx] = m;
      }
    }
  }

  /* 回傳 0(完全擋住)~ 1(離文字夠遠可以全亮)。雙線性取樣,邊界才不會有階梯。 */
  function clearOf(x, y) {
    var fx = x / W * CGX - 0.5, fy = y / H * CGY - 0.5;
    var ix = fx | 0, iy = fy | 0;
    if (ix < 0) ix = 0; else if (ix > CGX - 2) ix = CGX - 2;
    if (iy < 0) iy = 0; else if (iy > CGY - 2) iy = CGY - 2;
    var tx = fx - ix, ty = fy - iy;
    if (tx < 0) tx = 0; else if (tx > 1) tx = 1;
    if (ty < 0) ty = 0; else if (ty > 1) ty = 1;
    var i0 = iy * CGX + ix, i1 = i0 + CGX;
    var a = cgrid[i0] + (cgrid[i0 + 1] - cgrid[i0]) * tx;
    var b = cgrid[i1] + (cgrid[i1 + 1] - cgrid[i1]) * tx;
    return a + (b - a) * ty;
  }

  /* 現在在第幾個區塊 —— 用視窗中央落在哪一區來判斷,
     跟捲動距離無關,所以每一區停留多久都不影響骨頭。

     ⚠️ **不能用 offsetTop**:它是相對「最近的定位祖先」算的,
     而 #main 有 position: relative → 裡面每個區塊的 offsetTop 都從 main 起算,
     #works 會是 0。實際踩過:首屏時判斷成第 2 段,畫出來的是脊椎不是頭骨。
     要用 getBoundingClientRect().top + scrollY 才是真正的文件座標。
     這個查詢會逼瀏覽器重算版面,所以跟 measureAvoid 一起、每 20 幀才做一次。 */
  var segTops = [];

  function measureSegs() {
    var ids = ['hero-b', 'works', 'about', 'photos', 'contact'];
    var sy = window.pageYOffset || 0;
    segTops.length = 0;
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el) segTops.push(el.getBoundingClientRect().top + sy);
    }
  }

  function sectionIndex(sy) {
    if (!segTops.length) return 0;
    /* 用視窗 60% 的位置當判定線,不是正中央。
       用正中央的話:從首屏往下捲一段距離了,中線都還在首屏裡 →
       炸開的過場遲遲不觸發,骨頭就只是呆在那裡(Zakk:「下滑沒有跟著炸開」)。
       0.78 的意思是「下一區的頂端升過視窗約八成高」就換段 —— 一開始下捲就會觸發。 */
    var line = sy + H * 0.78, best = 0;
    for (var k = 0; k < segTops.length; k++) {
      if (line >= segTops[k]) best = k;
    }
    return Math.min(forms.length - 1, best);
  }

  function render(anim) {
    var drawn = 0;                    // 這一偵實際畫出去的粒子數(給 HUD 的讀數)
    var K0 = (window.__loadK === undefined) ? 1 : window.__loadK;
    /* ⚠️ 載入中曾經改成「蓋半透明底色」讓碎片留下軌跡殘影,
       但 3600 顆碎片各自拖一條尾巴,畫面糊成一團 ——
       Zakk:「粒子有種殘影特效,有點讓她太多太亂,很不好看」。
       每一偵都清乾淨,聚攏靠位移本身表達就夠了。 */
    ctx.clearRect(0, 0, W, H);
    var cx = W * 0.5, cy = H * 0.5;
    ay += (tay - ay) * 0.06; ax += (tax - ax) * 0.06;
    if (anim) ay += 0.0016;                    // 緩慢自轉,讓它一直有生命
    var sy = Math.sin(ay), cyy = Math.cos(ay), sx = Math.sin(ax), cxx = Math.cos(ax);

    // 載入成形程度:0 = 散在外圍繞,1 = 完整頭骨(由 preloader 寫入)
    var K = (window.__loadK === undefined) ? 1 : window.__loadK;

    /* ── 沿著骨架往下走 ──
       捲動不是把碎片吹散,是**把同一批碎片重新組成下一段骨頭**。
       整份文件的捲動範圍映射到 0 → (段數-1):
         整數位置 = 停在某一段骨頭上(頭骨 / 脊椎 / 肋骨 / 翅膀 / 尾椎)
         中間     = 一邊往下一段的落點插值,一邊往外炸開再收回來
       所以過場有「散掉」的爽度,但兩端都是看得出來的形,不會變成雜訊。 */
    if ((avoidTick++ % 20) === 0) { measureAvoid(); measureSegs(); buildClearGrid(); }

    var scrollY = window.pageYOffset || 0;
    var segs = Math.max(1, forms.length - 1);

    /* ── 換區塊才動,同一區塊內完全靜止 ──
       之前是把捲動位置**連續**映射到骨頭段落,所以只要在捲,骨頭就一直在變形 ——
       人在讀字的時候背景一直動,很干擾。(Zakk:「同一頁閱讀時粒子還跑動會影響閱讀」)

       改成:先判斷「現在在第幾個區塊」,只有**區塊換了**才播一次過場動畫,
       播完就停在那個形狀上不動。跟捲動速度、捲動距離都無關。 */
    var idx = sectionIndex(scrollY);
    if (idx !== wantSeg) {                      // 換區塊了 → 開始播過場
      fromSeg = curSeg;
      wantSeg = idx;
      segT = 0;
    }
    if (segT < 1) {
      segT += 1 / (TRANS_MS / 16.67);           // 固定時長,不隨捲動快慢改變
      if (segT >= 1) { segT = 1; curSeg = wantSeg; }
    }

    var fi = Math.min(segs, fromSeg);
    var toI = Math.min(segs, wantSeg);
    var ft = segT;
    var fe = ft * ft * (3 - 2 * ft);
    // 過場中才炸開;停下來就是 0,骨頭完全靜止
    /* ═══ 首屏離場進度 hx:0 = 還在首屏,1 = 完全離開 ═══
       ⚠️ 舊寫法把炸開綁在「區塊換了沒」+ 固定 900ms 計時器上,有兩個毛病:
         ① 跟捲動無關 —— 捲慢一點,0.9 秒內就播完了,人還在首屏上方,
            等真的往下看時骨頭早就沒了 → Zakk 看到的「顱骨完全沒有散開」。
         ② 區塊判斷會誤判 → 骨頭跑到 Works / About 上面 → 「所有畫面都有龍骨」。
       改成直接讀首屏這一幀捲了多少,捲動就是播放頭。 */
    var hx = 1;
    if (!heroFrame) heroFrame = document.getElementById('hero-b');
    if (heroFrame) {
      var hr = heroFrame.getBoundingClientRect();
      var htot = hr.height - H;
      /* 🔴 手機沒有幀,首屏就只有「一屏減掉導覽列」那麼高 —— 比視窗還矮,
         htot 變成負的(實測 792 - 844 = -52),原本的 `htot > 0 ? ... : 0`
         會讓進度永遠是 0,骨頭就凍在原地不散開(Zakk:「下滑碎片卡住了」)。

         沒有幀的時候改用首屏自己的高度當播放長度:
         -hr.top 就是「首屏頂端被捲上去多少」,除以首屏高 = 捲過首屏的比例。
         桌機有幀時 htot > 0,走原本的算法,行為完全不變。 */
      if (htot <= 0) htot = hr.height;
      var hp = htot > 0 ? (-hr.top) / htot : 0;
      /* ⚠️ 手機要提早很多。桌機的首屏是 1266px 的「幀」,捲過 55%(700px)
         才開始散是合理的 —— 那段路內容是釘住的,人還在讀首屏。
         手機的首屏只有 792px 而且會真的跟著捲走,55% = 436px ——
         等於已經滑掉大半個畫面骨頭才動,那就是 Zakk 說的「延遲才散開」。
         改成 15% 起跑(119px),一動就有反應。 */
      /* ⚠️ 手機的「散完」必須早於「離開首屏」。
         HXL 原本 0.85 → 0.15 + 0.85 = 1.00,也就是**剛好捲完首屏才散完** ——
         而 Works 就緊接在首屏後面,所以碎片正好糊在 Works 標題上
         (Zakk 的截圖:碎片壓在「Works」那一行)。
         改成 0.10 起跑、0.50 散完 → 首屏捲到 60% 就乾淨了,
         還有 40% 的距離才會看到 Works。 */
      /* ⚠️ 手機的首屏差不多**剛好一個螢幕高**,所以 Works 的上緣從捲動的第一刻
         就已經在往上頂 —— 沒有「首屏還獨佔畫面」的那段路可用。
         0.10/0.50 還是太晚(Zakk 第二次回報「到這邊還沒炸開」)。
         改成 5% 起跑、40% 散完 —— 大約捲三分之一個螢幕就乾淨。 */
      var HX0 = SMALL ? 0.05 : 0.55, HXL = SMALL ? 0.35 : 0.80;
      hx = (hp - HX0) / HXL;
      hx = hx < 0 ? 0 : (hx > 1 ? 1 : hx);
      hx = hx * hx * (3 - 2 * hx);
    }
    /* 炸開的幅度直接跟著 hx 走:一路往外推,不回收。
       骨頭同時淡掉,所以是「散開消失」,不是「炸出去又縮回來」。 */
    var burst = hx * BURST * Math.min(W, H) * 0.62;
    var settled = segT >= 1;

    var fsA = FORMS[fi].fs, fsB = (FORMS[toI] || FORMS[fi]).fs;
    var wbA = FORMS[fi].wob, wbB = (FORMS[toI] || FORMS[fi]).wob;
    var amA = FORMS[fi].am || 1, amB = (FORMS[toI] || FORMS[fi]).am || 1;
    var amMix = amA + (amB - amA) * fe;
    var fsMix = fsA + (fsB - fsA) * fe;
    var wobMix = wbA + (wbB - wbA) * fe;

    var A = forms[fi], B = forms[toI] || forms[fi];
    if (!A || !A.length) { ctx.globalAlpha = 1; return; }

    /* 離開首屏後整層降到 30% —— 骨頭與過場照跑,但不跟內文搶。
       首屏沒什麼字,可以放到滿;下面全是要讀的東西,不能蓋。
       (之前做到 100% 鋪滿整頁,結果碎片壓在 About 的內文上,很難讀。) */
    /* 捲離首屏就淡掉 —— 骨頭只屬於首屏,下面的區塊維持乾淨的編輯版面。
       完全淡出(不是留 30%),因為留一點點只會變成看不出用意的雜訊。 */
    /* 骨頭只屬於首屏,捲離就淡掉;
       但**環繞粒子留著** —— 每一幀都要有東西,不然版面太空
       (Zakk:「每一頁的空白太多,可以放點粒子環繞」)。
       所以這裡不再整段 return,改成只讓骨頭那部分淡出。 */
    /* 龍骨的存在感綁在「過場」上,不是綁在捲了幾 px。
       ⚠️ 舊寫法 (1 - scrollY / (H*0.75)) 會在捲到 675px 就歸零,
       而首屏→Works 的炸開是 900px 才發生 —— 骨頭早就不見了,
       Zakk 看到的就是「過場龍骨沒有炸開」。
       改成跟著 fe(過場進度)交叉淡出:炸到一半時骨頭還有一半在,
       所以是「炸散」而不是「先消失再炸」。
       ⚠️ 這裡不能用 fi / toI —— FORMS 只剩一個形體,那兩個永遠是 0。
       要用未夾限的 fromSeg / wantSeg。 */
    var sFade = 1 - hx;      /* 骨頭只活在首屏,散完就是 0 —— 其他頁不會再出現 */

    /* ── 骨頭釘在頁面上,不在畫面上游移 ──
       Zakk:「粒子到下一頁就待在那個地方,而不是一直往下跑動」。

       之前骨頭每一幀都去追「目前畫面上的最大空白框」,但捲動時文字在移動、
       框就跟著變 → 骨頭在畫面上慢慢游走,讀字的時候很干擾。

       改成:**只在換區塊的過場中量一次落點,之後就鎖住**。
       ⚠️ 試過存「文件座標」讓它跟著頁面捲 —— 結果捲過去之後骨頭直接離開畫面不見了。
       要的是「停在那裡不再游移」,不是「跟著頁面捲走」。 */
    var ext = formExt[fi] || [400, 300];
    var extB = formExt[toI] || ext;
    var extW = ext[0] + (extB[0] - ext[0]) * fe;
    var extH = ext[1] + (extB[1] - ext[1]) * fe;

    if (!settled && segT > 0.55 && !anchorSet) {
      // 過場過半 → 新的一區已經在畫面上了,這時候量才準,量完就定案
      var k = Math.min(emptyBW * 0.92 / extW, emptyBH * 0.92 / extH);
      anchorK = k > 1 ? 1 : (k < 0.28 ? 0.28 : k);
      anchorX = emptyX;
      anchorY = emptyY;                         // 畫面座標:鎖住不動,但不會跟著捲走
      anchorSet = true;
    }
    if (segT === 0) anchorSet = false;           // 新的過場開始,允許再量一次

    /* 還在第 0 段就維持置中不動 —— 讓它「炸開」離開,而不是「滑」走。
       (先前加了 scrollY < H*0.35 的門檻,結果龍頭在還沒換段時就慢慢平移,
        看起來像漂走,反而更怪。) */
    /* ⚠️ 骨頭現在只活在首屏,位置就固定置中 —— 不要再靠「現在是第幾區」去算。
       那套判斷(sectionIndex → wantSeg → anchorX/anchorY)在幀高改成 200svh 之後
       會失準:首屏時 wantSeg 已經不是 0,骨頭就被搬到畫面外、還縮成 0.28 倍,
       所以載入動畫一結束頭骨就「不見了」。 */
    var inHero = true;
    var tgtX = W * 0.5;
    var tgtY = H * 0.5;
    var tgtK = inHero ? 1 : anchorK;

    if (eX === 0) { eX = tgtX; eY = tgtY; eK = tgtK; }
    // 過場中才追;停下來之後直接對齊,骨頭相對版面完全不動
    var follow = settled ? 1 : 0.08;
    eX += (tgtX - eX) * follow;
    eY += (tgtY - eY) * follow;
    eK += (tgtK - eK) * follow;

    var offX = eX - W * 0.5;
    var offY = eY - H * 0.5;
    var boneK = eK;

    /* 滑鼠位置也做平滑追蹤 —— 直接用原始座標的話,
       游標一停碎片就瞬間彈回原位,很生硬。 */
    if (pxm >= 0) {
      if (pxe < 0) { pxe = pxm; pye = pym; }
      /* 0.12 太黏 —— 滑鼠停下來後碎片還在慢慢追,看起來就像掉幀 */
      pxe += (pxm - pxe) * 0.22;
      pye += (pym - pye) * 0.22;
    }
    var hasPtr = pxe >= 0;

    var skullA = (0.25 + K * 0.75) * sFade;
    var orbitA = 0.82 + 0.18 * sFade;   /* 0.42 → 0.62 → 0.82,Zakk 連續兩次說還是太少 */     // 環繞粒子:離開首屏後降到 28%,但不歸零
    ctx.globalAlpha = 1;    // 透明度改由 sprite 自己帶(見 fragsFor),整幀只設這一次

    for (var b = 0; b < buckets.length; b++) {
      var bk = buckets[b];
      var items = bk.items;
      for (var k = 0; k < items.length; k++) {
        var p = items[k];
        var px = 0, py = 0, d = 0;

        var dx, dy, dz;
        if (p.idx < 0) {                       // 環繞粒子:不跟著骨頭變形
          dx = p.ox2; dy = p.oy2; dz = p.oz2;
        } else {
          var a0 = A[p.idx], b0 = B[p.idx];
          if (!a0) continue;
          if (!b0) b0 = a0;
          dx = a0[0] + (b0[0] - a0[0]) * fe;
          dy = a0[1] + (b0[1] - a0[1]) * fe;
          dz = a0[2] + (b0[2] - a0[2]) * fe;
          if (burst > 0.5) {                   // 過場中:往自己的方向炸出去再收回
            dx += p.bx * burst;
            dy += p.by * burst;
            dz += p.bz * burst;
          }
        }
        if (anim) {
          /* 主軌道:cos/sin 同一個角度 → 真正的閉合橢圓,繞完回到原位。
             第二層慢擺動幅度只有 0.4 倍,讓路徑不是完美的圈,但仍有界。 */
          var w1 = t * p.sp + p.ph;
          var w2 = t * p.sp2 + p.ph2;
          /* 停在形狀上時把晃動收到 0.12 —— 骨頭幾乎不動,讀字才不會被干擾。
             環繞粒子不受影響,它們負責「還活著」的感覺。 */
          var wob = (p.idx < 0) ? 1 : wobMix * (settled ? 0.12 : 1);
          dx += (Math.cos(w1) * p.amp + Math.sin(w2) * p.amp * 0.4) * assemble * wob;
          dy += (Math.sin(w1) * p.amp * p.ecc + Math.cos(w2 * 1.3) * p.amp * 0.28) * assemble * wob;
        }
        var x1 = dx * cyy - dz * sy, z1 = dx * sy + dz * cyy;   // 繞 Y
        var y1 = dy * cxx - z1 * sx, z2 = dy * sx + z1 * cxx;   // 繞 X
        var scale = F / (F - z2);

        if (p.idx < 0) {
          px = cx + x1 * scale;
          py = cy + y1 * scale;
        } else {
          px = cx + offX + x1 * scale * boneK;
          py = cy + offY + y1 * scale * boneK;
        }
        d = p.sz * scale * 2.1 * SIZE_K * (p.idx < 0 ? 1 : fsMix);

        // 載入中:從外圍環繞的位置插值到頭骨上
        if (K < 0.999) {
          var a = p.oa + t * 0.9 * p.osp;
          var ox = cx + Math.cos(a) * p.orad;
          var oy = cy + Math.sin(a) * p.orad * 0.7;
          px = ox + (px - ox) * K;
          py = oy + (py - oy) * K;
        }

        var aMul = skullA;

        /* ── 滑鼠扭曲 ──
           試過三代,兩代都失敗,原因寫在下面免得再走一次: */
        if (hasPtr) {
          var mdx = px - pxe, mdy = py - pye;
          var md = Math.sqrt(mdx * mdx + mdy * mdy);
          if (md < LENS_R && md > 0.01) {
            var tt = md / LENS_R, fo = (1 - tt) * (1 - tt);
            /* 散開 = 旋轉(給方向)+ 往外推 + 每顆各自亂跑(這一項才是「散」)。
               ⚠️ 亂跑的方向用 p.ph 這個固定值算,不能每幀 Math.random()——
               那樣每顆會自己抖,不是散開。
               ⚠️ 碎片自己的朝向不轉(Zakk:「不要有碎片轉動」)。 */
            var th = TWIST * fo;
            var cs = Math.cos(th), sn = Math.sin(th);
            var rx = mdx * cs - mdy * sn, ry = mdx * sn + mdy * cs;
            var inv = 1 / md;
            px = pxe + rx + rx * inv * SCAT_R * fo
                     + Math.cos(p.ph * 7.3) * SCAT_J * fo;
            py = pye + ry + ry * inv * SCAT_R * fo
                     + Math.sin(p.ph * 5.1) * SCAT_J * fo;
            d *= 1 + LENS_MAG * fo;
          }
        }

        // 太小看不見、或已經飛出畫面 —— 不必畫
        if (d < 0.6) continue;
        if (px < -d || px > W + d || py < -d || py > H + d) continue;

        var keep = clearOf(px, py);        // 靠近文字就淡掉
        if (keep <= 0) continue;

        var band = (bk.al * (p.idx < 0 ? orbitA : aMul * amMix) * keep * 20) | 0;
        if (band < 1) continue;                  // 淡到看不見就不用畫
        if (band > 20) band = 20;

        ctx.drawImage(fragsFor(bk.col, band)[p.sh], px - d / 2, py - d / 2, d, d);
        drawn++;
      }
    }
    ctx.globalAlpha = 1;
    readout(drawn, ay);
  }

  /* ══ 首屏 HUD 的讀數 ══
     ⚠️ 這三個數字必須是**真的**:PTS 是這一偵實際畫出去的粒子數、
     ROT 是頭骨目前的旋轉角、時間是台北時間。
     寫死的數字是裝飾,會動的才是儀器 —— 這是「視窗/科技感」跟
     「印刷規格表」最大的差別(Zakk 指出框架用錯的那件事)。

     每 6 偵才寫一次 DOM:每偵寫會讓數字糊成一團,也白白吃掉版面計算。 */
  var roEls = null, roTick = 0;
  function readout(n, rot) {
    if (roEls === null) {
      roEls = {
        pts:   document.querySelector('[data-read="pts"]'),
        rot:   document.querySelector('[data-read="rot"]'),
        clock: document.querySelector('[data-read="clock"]'),
        clock2: document.querySelector('[data-read="clock2"]')   // CONNECT 那一區的時鐘
      };
      if (!roEls.pts) { roEls = false; return; }
    }
    if (roEls === false) return;
    if (++roTick % 6) return;

    roEls.pts.textContent = 'PTS ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    /* 角度換算成 0–360,並取絕對值 —— 負角度讀起來像壞掉 */
    var deg = ((rot * 180 / Math.PI) % 360 + 360) % 360;
    roEls.rot.textContent = 'ROT ' + deg.toFixed(1) + '°';
    /* 台北時間:用 Asia/Taipei 明確指定,不靠使用者的時區
       —— 這一行講的是 Zakk 在哪,不是看的人在哪。 */
    var tpe = new Date().toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Taipei', hour12: false
    }) + ' TPE';
    roEls.clock.textContent = tpe;
    if (roEls.clock2) roEls.clock2.textContent = tpe;
  }

  /* ── 手機:碎片每兩偵才畫一次(30fps)──
     Zakk 回報手機的開場會卡。我在桌機模擬 390px 一律 60fps,量不出來 ——
     真正的成本在手機:2400 次 drawImage + 清掉 0.74 百萬像素,每一偵。
     中階手機的 canvas 2D 大約 1000–3000 次 draw call 就到頂了。

     碎片是慢慢飄的背景,30fps 看不太出來;但**忽快忽慢**很明顯 ——
     與其在 60 和 25 之間抖,不如穩定在 30。

     網址加 ?fps60 可以關掉這個限制,拿來跟 ?fps 的讀數對照
     (這是給 Zakk 在自己手機上 A/B 用的,我這台驗不了他的機器)。 */
  /* ⚠️ 一開始寫的是「手機一律 30fps 上限」—— **那是猜的,而且猜錯了。**
     Zakk 回報改完之後手機「粒子沒有動畫」。想通了:如果他的手機本來就只跑到 30,
     再砍一半就是 15fps —— 那不是「順」,那是「不會動」。
     固定上限的前提是「我知道這支手機多快」,而我不知道。

     改成自己量、自己決定:
       量到平均一偵 > 22ms(低於約 45fps)才開始跳偵;
       回到 < 15ms 就升回滿速。中間留一段不動作,避免在門檻上來回抖。
     快的手機永遠是滿速(所以不會有「沒動畫」),
     慢的手機才降到一半 —— 而且是它真的慢了才降。

     ?fps60 強制滿速,拿來跟 ?fps 的讀數對照。 */
  var FORCE_FULL = location.search.indexOf('fps60') !== -1;
  var slow = false, tick = 0;
  var accMs = 0, accN = 0, lastMs = performance.now();

  function frame() {
    raf = requestAnimationFrame(frame);

    var now = performance.now(), dt = now - lastMs; lastMs = now;
    /* 分頁切回來的第一偵是好幾百 ms,不是真的掉偵 —— 不能算進平均 */
    if (dt < 200) { accMs += dt; accN++; }
    if (accN >= 45) {
      var avg = accMs / accN; accMs = 0; accN = 0;
      if (SMALL && !FORCE_FULL) slow = avg > 22 ? true : (avg < 15 ? false : slow);
    }

    if (slow && (++tick & 1)) return;      // 奇數偵直接跳過,不清畫布也不畫
    t += slow ? 0.032 : 0.016;             // ⚠️ 時間也要跟著走兩倍,不然飄動會慢一半
    var target = (heroB && heroB.classList.contains('ghost-lit')) ? 0.2 : 1;
    assemble += (target - assemble) * (slow ? 0.12 : 0.06);
    window.__fragSlow = slow;              // 給 ?fps 讀數面板顯示現在是哪一檔
    render(true);
  }

  /* 五張圖全部載完才建點雲 —— 少一張就沒辦法逐點插值。
     路徑從 main.js 自己的位置推算(主頁 js/main.js,內頁 ../../js/main.js)。 */
  var self = (document.currentScript && document.currentScript.src) || '';
  var base = self ? self.replace(/js\/main\.js.*$/, '') : '';

  var pending = FORMS.length;
  FORMS.forEach(function (f, i) {
    var im = new Image();
    imgs[i] = im;
    im.onload = im.onerror = function () {
      if (--pending) return;
      layout();
      if (reduced) render(false);
      else if (!raf) frame();
    };
    im.src = base + f.src;
  });

  window.addEventListener('resize', function () {
    layout();
    if (reduced) render(false);
  });

  /* 滑鼠視差改掛在 window ——
     碎片現在跑遍整頁,只綁在 hero 上的話捲下去就不會動了。 */
  if (!reduced && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    window.addEventListener('mousemove', function (e) {
      pxm = e.clientX; pym = e.clientY;
      tay = (e.clientX / window.innerWidth - 0.5) * 0.9;     // 左右轉
      tax = (e.clientY / window.innerHeight - 0.5) * -0.6;   // 上下俯仰
    }, { passive: true });
  }
})();


/* 共用:不規則碎片 sprite 產生器(載入畫面與全站粒子共用) */
window.__fragSprites = (function () {
  var SHAPES = 7, cache = {};
  return function (rgb) {
    if (cache[rgb]) return cache[rgb];
    var arr = [];
    for (var s = 0; s < SHAPES; s++) {
      var c = document.createElement('canvas'); c.width = c.height = 16;
      var g = c.getContext('2d');
      g.fillStyle = 'rgb(' + rgb + ')';
      g.beginPath();
      var n = 3 + (s % 3);
      for (var i = 0; i < n; i++) {
        var a = (i / n) * 6.283 + Math.random() * 0.9;
        var r = 3.4 + Math.random() * 4.2;
        var x = 8 + Math.cos(a) * r, y = 8 + Math.sin(a) * r;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath(); g.fill();
      arr.push(c);
    }
    cache[rgb] = arr;
    return arr;
  };
})();


/* ═══════════════════════════════════════════════════════
   載入動畫(preloader)
   碎片先在畫面上環繞漂流,隨著真實載入進度**逐漸聚攏成頭骨**,
   搭配數字與細橘線。進度綁真實載入(字型 + 非 lazy 圖片 + load),
   不做固定時間的假動畫;6 秒硬性收尾,絕不把人鎖在載入畫面。
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var pl = document.getElementById('preloader');
  if (!pl) return;

  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* 進度只寫成一個變數 --k,剩下交給 CSS:
     每個字母依 --i 算出自己的進度,從模糊 + 下方浮上來對焦。
     跟頁面過場用同一套語彙,開場和內容才像同一個東西。 */
  function paint(k) {
    pl.style.setProperty('--k', k.toFixed(3));
    pl.setAttribute('aria-valuenow', Math.round(k * 100));
  }

  var finished = false, raf = null;

  function finish() {
    if (finished) return;
    finished = true;
    window.__loadK = 1;          // 收尾一定要把成形程度補滿
    paint(1);
    /* 這裡本來留 420ms 讓碎片聚攏完成,但等速時間軸改好之後,
       骨頭在 __loadK = 1 的那一刻就已經到位,再等 420ms 就變成
       「骨頭停住了、字還在」—— Zakk:「龍骨跑完 zakk 字就消失,現在兩個有點沒有同時」。
       改成同一刻觸發,退場的柔和度交給 CSS transition。 */
    pl.classList.add('is-done');
    root.classList.remove('is-loading');
    if (raf) cancelAnimationFrame(raf);
  }

  if (reduced) { pl.style.display = 'none'; window.__loadK = 1; return; }

  /* ── 同一次瀏覽只播一次 ──
     從作品內頁按返回回到主頁時,是一份全新的 HTML,載入動畫會整個再跑一次。
     圖都在快取裡了還讓人等兩秒,換頁的連續感就沒了。
     用 sessionStorage 記一下:這次瀏覽已經看過開場了就直接跳過。
     (關掉分頁就重來,所以真正的第一次訪客還是看得到開場) */
  var SEEN = 'zakk-intro-played';
  /* ⚠️ 「同一次瀏覽只播一次」在調整開場的時候很礙事 ——
     Zakk:「我還是看不了載入動畫,可以讓我重新載入就可以看一次嗎」。
     現在主頁**每次重新載入都播**;只有從作品內頁按返回回來時才跳過
     (那時 referrer 是站內的作品頁,人已經等過一次了)。 */
  var fromWork = document.referrer.indexOf('/works/') > -1;
  /* 🔴 漏洞:**重新載入會保留 referrer**。
     從作品內頁回主頁(referrer = 作品頁)之後再按重新整理,
     referrer 還是那一頁,所以 fromWork 依然成立 → 開場被跳過
     (Zakk:「我希望重新載入時載入動畫會再出現」)。
     用 Navigation Timing 直接問瀏覽器這次是不是 reload,那個不會騙人。 */
  var isReload = false;
  try {
    var nav = performance.getEntriesByType('navigation')[0];
    isReload = nav ? nav.type === 'reload'
                   : performance.navigation && performance.navigation.type === 1;
  } catch (e) { /* 舊瀏覽器沒有這個 API,就當成一般進站 */ }

  try {
    if (fromWork && !isReload && sessionStorage.getItem(SEEN) === '1') {
      pl.style.display = 'none';
      window.__loadK = 1;          // 頭骨直接是組好的狀態,不要從碎片重來
      return;
    }
    sessionStorage.setItem(SEEN, '1');
  } catch (e) { /* 無痕模式等情況讀不到,就正常播 */ }

  root.classList.add('is-loading');

  /* ── 真實載入進度 ── */
  var tasks = [];
  if (document.fonts && document.fonts.ready) tasks.push(document.fonts.ready);
  Array.prototype.forEach.call(
    document.querySelectorAll('img:not([loading="lazy"])'),
    function (im) {
      if (im.complete) return;
      tasks.push(new Promise(function (res) {
        im.addEventListener('load', res); im.addEventListener('error', res);
      }));
    }
  );
  tasks.push(new Promise(function (res) {
    if (document.readyState === 'complete') res();
    else window.addEventListener('load', res);
  }));

  var total = tasks.length, done = 0, target = 0, shown = 0;
  tasks.forEach(function (p) {
    Promise.resolve(p).then(function () { done++; target = done / total; });
  });

  /* 只更新數字與線;碎片的「成形程度」寫進 window.__loadK,
     由首屏那張 canvas 直接把碎片組成主頁畫面(不做第二個過場畫面)。 */
  /* ⚠️ 不要讓碎片直接跟著「真實載入進度」跑。
     Zakk 回報:「碎片的動畫很不順、很奇怪,骨頭聚攏的過程不夠明顯」。
     原因有兩個,都在這一段:
       ① target 是階梯式的(字型好了跳一段、圖片好了又跳一段),
          碎片就跟著一段一段衝,中間又停 → 很不順。
       ② `shown += (target - shown) * 0.028` 是指數追趕,
          前段衝很快、後段用爬的 —— 最該看清楚的「合體」那一下反而最慢。

     改成:動畫走自己的等速時間軸,真實載入只決定「可不可以收尾」。
     沒載完就停在 92% 等,載完了再用同樣的速度走完最後一段 ——
     不管網路快慢,聚攏的過程都是同一個速度、同樣看得清楚。 */
  var GATHER_MS = 2200;
  var STEP = 1 / (GATHER_MS / 16.67);

  function frame() {
    // 收尾後可能還有一幀排在佇列裡 —— 若不擋掉,它會用舊值把 __loadK 覆寫回去,
    // 頭骨就永遠聚不攏(實際踩過的 bug)
    if (finished) { window.__loadK = 1; return; }

    var cap = (target >= 1) ? 1 : 0.92;   // 東西還沒到齊就先等在 92%
    if (shown < cap) shown = Math.min(cap, shown + STEP);

    /* easeInOutCubic:兩端柔、中段快。
       碎片先各自慢慢漂 → 中段明顯往中心收 → 最後輕輕落定,
       「聚攏」這件事就有頭有尾,看得出來是一個動作。 */
    var k = shown;
    window.__loadK = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    paint(Math.min(0.99, k));

    if (target >= 1 && shown >= 1) { window.__loadK = 1; finish(); }
    else raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);
  setTimeout(function () { window.__loadK = 1; finish(); }, 6000);   // 硬性收尾,絕不卡住
})();


/* ═══════════════════════════════════════════════════════
   全站環繞粒子
   固定鋪滿視窗的微塵:緩慢漂移 + 滑鼠視差 + 捲動時比頁面慢(景深)。
   刻意很淡 —— 是氛圍,不是主角。
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var canvas = document.querySelector('.ambient');
  if (!canvas || !canvas.getContext) return;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, DPR = 1, raf = null, t = 0, mx = 0, my = 0;
  var clouds = [];                                // 每一區自己的碎片雲
  var lastY = window.pageYOffset || 0, vel = 0;   // 捲動速度 → 碎片拖曳方向

  var COLS = ['84,118,160', '108,142,182', '146,172,204'];   // 製圖藍的淡階(氛圍層)
  var EMBER = '21,53,92';   // 原本是餘燼橘 180,85,42;全站改單色相後換成深藍

  function layout() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  /* 2026-07-28:拿掉了「全站通用飄浮微塵」那一層(原本 420 顆)。
     理由是它不是這個網站的東西 —— 任何一篇 canvas 粒子教學都會產出一模一樣的效果,
     反而把真正原創的部分(龍骨碎片、每一區自己的碎片雲)稀釋掉了。
     現在這張 canvas 只畫區塊碎片雲。 */

  /* ── 閱讀區安靜下來(motion-design 的 1/3 法則) ──
     首屏的碎片是主角,要有膽子;但捲到 Works / About 這些「閱讀區」時,
     背景一直在飄會跟文字搶注意力 —— 同時在動的元素不該超過三分之一。

     所以只調「次要層」的強度:首屏維持 1,離開首屏後平滑降到 0.45。
     不是關掉,是退到背景 —— 氛圍還在,只是不再搶戲。
     smoothstep 讓它是漸變的,捲動時不會有一條看得出來的界線。 */
  var CALM_MIN = 0.45;
  function calmAt(scrollY) {
    var heroH = window.innerHeight;
    var k = (scrollY - heroH * 0.35) / (heroH * 0.65);
    if (k < 0) k = 0;
    if (k > 1) k = 1;
    k = k * k * (3 - 2 * k);
    return 1 - k * (1 - CALM_MIN);
  }

  function render() {
    var scrollY = window.pageYOffset || 0;
    var calm = calmAt(scrollY);

    // 捲動速度(平滑過的)→ 碎片往捲動方向被帶走,鬆手後慢慢回穩
    var raw = scrollY - lastY; lastY = scrollY;
    if (raw > 90) raw = 90; if (raw < -90) raw = -90;
    vel += (raw - vel) * 0.18;

    ctx.clearRect(0, 0, W, H);

    /* ── 每一區的碎片雲:進入視野時像載入動畫那樣聚攏,之後在該區周圍緩慢環繞 ── */
    for (var b = 0; b < clouds.length; b++) {
      var c = clouds[b];
      c.k += (1 - c.k) * 0.022;                 // 聚攏程度
      var cy0 = c.py - scrollY;
      if (cy0 < -H || cy0 > H * 2) continue;    // 離太遠不畫
      var pts = c.pts;
      for (var j = 0; j < pts.length; j++) {
        var q = pts[j];
        var qa = q.a + t * 0.004 * q.spin;
        var ox = c.px + Math.cos(qa) * q.rad;   // 環繞位置
        var oy = cy0 + Math.sin(qa) * q.rad * 0.55;
        var tx = q.tx + Math.sin(t * 0.006 * q.sp + q.ph) * 26;   // 落定後仍緩慢漂
        var ty = cy0 + q.ty + Math.cos(t * 0.005 * q.sp + q.ph) * 18;
        var px2 = ox + (tx - ox) * c.k;
        /* 這裡只收「動」不收「亮」:區塊碎片雲是每一區的招牌,調暗等於把設計拿掉。
           但捲動時整團跟著晃會干擾閱讀,所以拖曳量吃 calm,亮度維持原樣。 */
        var py2 = oy + (ty - oy) * c.k - vel * 2.2 * calm;

        /* 3D 景深:一開始散在很深/很近的位置,聚攏時往 z=0 收;
           落定後仍留一點前後擺盪,所以整團一直是立體的。 */
        var zz = q.z0 * (1 - c.k) + Math.sin(t * 0.004 + q.ph) * 46 * c.k;
        var sc = 900 / (900 - zz);
        px2 = W * 0.5 + (px2 - W * 0.5) * sc;
        py2 = H * 0.5 + (py2 - H * 0.5) * sc;

        ctx.globalAlpha = q.al * (0.2 + c.k * 0.8) * Math.min(1.3, sc);
        var sp2 = window.__fragSprites(q.col);
        var d2 = q.sz * 2.4 * sc;
        ctx.drawImage(sp2[q.sh], px2 - d2 / 2, py2 - d2 / 2, d2, d2);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* 為某一區生成一團碎片:先散在外圈,進入視野後聚攏到該區周圍 */
  function spawnCloud(el) {
    var r = el.getBoundingClientRect();
    var pageTop = r.top + (window.pageYOffset || 0);
    var n = Math.round(Math.min(150, W * 0.11));
    var pts = [];
    for (var i = 0; i < n; i++) {
      pts.push({
        tx: r.left + Math.random() * r.width,               // 目標:散布在該區範圍
        ty: Math.min(r.height, H * 1.1) * Math.random(),
        a: Math.random() * 6.283,
        rad: 200 + Math.random() * Math.max(W, H) * 0.6,    // 起始:外圈
        z0: (Math.random() * 2 - 1) * 620,                  // 起始深度(3D 飛入用)
        spin: (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.9),
        sp: 0.2 + Math.random() * 0.7,
        ph: Math.random() * 6.283,
        sz: 0.8 + Math.random() * 2.2,
        al: 0.08 + Math.random() * 0.26,
        col: COLS[(Math.random() * COLS.length) | 0],   // 單一色相測試中,橘版關掉
        sh: (Math.random() * 7) | 0
      });
    }
    clouds.push({ px: r.left + r.width / 2, py: pageTop, k: 0, pts: pts });
  }

  function frame() { t += 1; render(); raf = requestAnimationFrame(frame); }

  layout();
  if (!raf) frame();

  /* 每一區第一次進入視野時,生成它自己的碎片雲(只生一次) */
  if ('IntersectionObserver' in window) {
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        spawnCloud(e.target);
        e.target.classList.add('is-in');   // 觸發骨架描線
        seen.unobserve(e.target);
      });
    }, { rootMargin: '10% 0px 10% 0px' });
    document.querySelectorAll('main .section').forEach(function (s) { seen.observe(s); });
  }

  window.addEventListener('resize', layout);
  window.addEventListener('mousemove', function (e) {
    mx = e.clientX / window.innerWidth - 0.5;
    my = e.clientY / window.innerHeight - 0.5;
  });
})();


/* ═══════════════════════════════════════════════════════
   捲動動態:頂部進度線 + 照片視差
   都只寫 CSS 變數 / width,不動 layout 屬性(效能底線)。
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var bar = document.querySelector('.scroll-progress i');
  var phs = document.querySelectorAll('.ph, .about__portrait');
  if (!bar && !phs.length) return;

  var ticking = false;

  function update() {
    var sy = window.pageYOffset || 0;
    var max = document.documentElement.scrollHeight - window.innerHeight;

    if (bar) bar.style.width = (max > 0 ? Math.min(100, sy / max * 100) : 0) + '%';

    if (!reduced) {
      var vh = window.innerHeight;
      for (var i = 0; i < phs.length; i++) {
        var el = phs[i];
        var r = el.getBoundingClientRect();
        if (r.bottom < -120 || r.top > vh + 120) continue;
        // 元素中心相對視窗中心:-1(下方)~1(上方)
        var prog = (r.top + r.height / 2 - vh / 2) / vh;
        var amt = (i % 2 ? -30 : -18);            // 交錯視差,深淺不同
        el.style.setProperty('--py', (prog * amt).toFixed(1) + 'px');
      }
    }
    ticking = false;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  update();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
})();


/* ═══════════════════════════════════════════════════════
   Photos 橫幅無縫循環 + 右中「到下一頁」線條
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* 量出「不含捲軸」的視窗寬給 CSS 用 —— 100vw 會多算捲軸,造成整頁能左右晃 */
  function setVW() {
    document.documentElement.style.setProperty(
      '--vw', document.documentElement.clientWidth + 'px');
  }
  setVW();
  window.addEventListener('resize', setVW);
  /* 載入畫面會鎖捲動(沒有捲軸),解鎖後捲軸出現、寬度會變 —— 之後要補量幾次 */
  window.addEventListener('load', setVW);
  setTimeout(setVW, 1600);
  setTimeout(setVW, 4200);

  /* 複製一份軌道內容接在後面 —— CSS 的 translateX(-50%) 才會剛好無縫接回 */
  var track = document.querySelector('.marquee__track');
  if (track) {
    var firstCount = track.children.length;
    track.innerHTML += track.innerHTML;

    /* 量出一個完整循環的距離:第一張 → 複製後的第一張。
       這才是「內容一份 + 一個 gap」的真實寬度,-50% 會差一個 gap。 */
    var measureShift = function () {
      var kids = track.children;
      if (kids.length <= firstCount) return;
      var d = kids[firstCount].offsetLeft - kids[0].offsetLeft;
      if (d > 0) track.style.setProperty('--mq-shift', d + 'px');
    };
    measureShift();
    window.addEventListener('load', measureShift);
    window.addEventListener('resize', measureShift);
    setTimeout(measureShift, 1800);        // 圖片載完尺寸才穩
  }

  /* 滑鼠在照片帶上時,可以用滾輪左右捲(自動播放此時是暫停的)。
     用 CSS 變數 --mq-x 疊加位移,不影響原本的自動捲動。 */
  var mq = document.querySelector('.marquee');
  if (mq && track) {
    var manual = 0;
    mq.addEventListener('wheel', function (e) {
      e.preventDefault();                       // 接管滾輪:在這裡是左右捲照片
      manual -= (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * 1.1;
      /* 手動位移的循環也要用同一個距離,不然跟自動捲動對不上 */
      var sh = parseFloat(track.style.getPropertyValue('--mq-shift')) || (track.scrollWidth / 2);
      if (manual > 0) manual -= sh;
      if (manual < -sh) manual += sh;
      track.style.setProperty('--mq-x', manual + 'px');
    }, { passive: false });
  }

  /* ── 手機:照片帶改成「手指左右滑」(2026-08-04)──

     ⚠️ 捲動驅動(§73)在手機上是**錯的做法**,Zakk 實際用了才發現:
     「photo 那邊手機要左右滑比較好看照片,現在要上下滑才能看,
       結果上下滑衝突到換頁了。」

     說得完全對 —— 捲動驅動把「看照片」和「離開這一區」綁成同一個動作,
     想多看一張就會滑掉整個區塊,兩件事互相打架。

     手機上正確的答案是**原生的左右捲動**:手指橫著滑 = 看照片,
     直著滑 = 換頁,瀏覽器自己就分得開,不需要任何 JS。
     (桌機維持自動播放 + 滾輪,那邊沒有這個衝突。) */

  /* 右側中間:所有區塊的線條列(參考 jcedrik)。
     一區一條短線,滑過伸長並顯示名稱;目前所在的那條轉橘。 */
  var items = [
    ['hero-b', 'Intro'], ['works', 'Works'], ['about', 'About'],
    ['photos', 'Photos'], ['contact', 'Contact']
  ].filter(function (it) { return document.getElementById(it[0]); });
  if (!items.length) return;

  var side = document.createElement('nav');
  side.className = 'side-nav';
  side.setAttribute('aria-label', 'Sections');

  var links = items.map(function (it) {
    var a = document.createElement('a');
    a.href = '#' + it[0];
    a.setAttribute('aria-label', it[1]);
    var s = document.createElement('span'); s.textContent = it[1];
    a.appendChild(s);
    a.appendChild(document.createElement('i'));
    side.appendChild(a);
    return a;
  });
  document.body.appendChild(side);

  /* 標出目前在哪一區:取最接近視窗中央的那一區 */
  var ticking = false;
  function mark() {
    var mid = window.innerHeight / 2, best = 0, bestD = Infinity;
    items.forEach(function (it, i) {
      var r = document.getElementById(it[0]).getBoundingClientRect();
      var d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bestD) { bestD = d; best = i; }
    });
    links.forEach(function (a, i) { a.classList.toggle('is-here', i === best); });
    ticking = false;
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(mark); } }
  mark();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
})();


/* ═══════════════════════════════════════════════════════
   換頁轉場 — 被點的那行字,飛過去變成內頁的大標

   實際的轉場是瀏覽器做的(View Transitions,CSS 在 style.css 尾段)。
   這段 JS 只負責一件事:在點擊的那一瞬間,把 view-transition-name
   掛到「被點的那一行」上。

   為什麼不寫死在 CSS:同一頁不能有兩個一樣的 view-transition-name,
   Works 有九行,全部寫死會互相衝突。而且只有被點的那一行需要飛。

   不支援的瀏覽器就直接換頁 —— 這裡整段跳過,不影響任何連結能不能用。
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!document.startViewTransition) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var CLS = 'vt-title';

  function clear() {
    var old = document.querySelectorAll('.' + CLS);
    for (var i = 0; i < old.length; i++) old[i].classList.remove(CLS);
  }

  /* ── 主頁:Works 清單裡連到作品內頁的那幾行 ── */
  var rows = document.querySelectorAll('a.works__line[href]');
  Array.prototype.forEach.call(rows, function (a) {
    // 只處理站內的作品頁;外部連結(另開分頁)不需要轉場
    if (a.target === '_blank' || /^https?:/.test(a.getAttribute('href'))) return;

    a.addEventListener('click', function () {
      clear();
      var name = a.querySelector('.works__name');
      if (name) name.classList.add(CLS);
    });
  });

  /* ── 內頁:離開時把名字拿掉 ──
     不拿掉的話,大標會在舊頁的快照上自己飛向一個不存在的位置。
     回主頁就讓它單純交叉淡出,乾淨。 */
  var title = document.querySelector('.work-title');
  if (title) {
    document.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[href]') : null;
      if (a) title.style.viewTransitionName = 'none';
    }, true);
  }
})();


/* ═══════════════════════════════════════════════════
   ?fps —— 手機用的效能讀數(2026-08-03)

   為什麼需要:Zakk 回報手機卡頓,但我在桌機模擬 390px 一律量到 60fps。
   **卡頓只存在他的機器上,我這台驗不了。** 與其一直猜著改,
   不如讓他自己量:網址加 ?fps 就會出現一個小讀數。

   怎麼用(在手機上):
     ?fps          現在的設定(碎片自己量、自己決定滿速或半速)
     ?fps&fps60    關掉上限來對照
   兩個都滑一遍首屏,看 min 差多少。

   平常完全不存在 —— 沒有 ?fps 就直接 return,一行都不執行。
   ═══════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (location.search.indexOf('fps') === -1) return;

  var box = document.createElement('div');
  box.style.cssText =
    'position:fixed;left:8px;bottom:8px;z-index:9999;pointer-events:none;' +
    'font:600 12px/1.45 ui-monospace,monospace;color:#16232C;' +
    'background:rgba(244,246,247,.92);border:1px solid #C9D4DA;' +
    'padding:6px 9px;border-radius:2px;white-space:pre';
  document.body.appendChild(box);

  var last = performance.now(), n = 0, sum = 0, worst = 0, shownMin = 999;

  function loop() {
    var t = performance.now(), d = t - last; last = t;
    /* 分頁切回來的第一偵會是好幾百 ms,不是真的掉偵 —— 丟掉 */
    if (d < 400) { sum += d; n++; if (d > worst) worst = d; }

    if (n >= 30) {
      var avg = sum / n;
      var fpsNow = Math.round(1000 / avg);
      var fpsMin = Math.round(1000 / worst);
      if (fpsMin < shownMin) shownMin = fpsMin;
      box.textContent =
        'fps ' + fpsNow + '   min ' + fpsMin + '\n' +
        '最差 ' + shownMin + '   碎片 ' + (window.__fragSlow ? '半速' : '滿速') + '\n' +
        Math.round(window.scrollY) + 'px';
      n = 0; sum = 0; worst = 0;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}());






/* ═══════════════════════════════════════════════════════
   右邊飄的那塊骨頭(2026-08-04 第三版)

   Zakk:「其他頁的細節可以再細一點嗎?一樣可以加跟首頁的扭曲特效還有碎片動態。
          看起來看不出來是骨頭。」

   🔴 「看不出是骨頭」的根源:前一版是**先取樣整張圖、再把裁切外的丟掉** ——
   22000 顆裡每一段只用得到 15–20%(約 3500 顆),而且取樣解析度只有 320px,
   肋骨那種細的結構整條被跳過。所以畫出來是一團點,不是骨頭。

   這一版改成:**每一段各自從自己的裁切區、用高解析度取樣**,
   每段都拿到完整的點數,細節才出得來。

   同時補上首屏那兩件事:
     ・滑鼠扭曲(碎片纏著游標繞,不是被彈開)
     ・碎片自己的軌道飄動(閉合橢圓,繞完回原位)
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var canvas = document.querySelector('canvas.dragon-side');
  if (!canvas) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  /* ⚠️ 這個門檻要跟 CSS 的 .dragon-side 顯示條件一致。
     CSS 已經降到 1441(版面保證右邊留 30%),JS 還卡在 1720 的話,
     1441–1719 之間會出現「格線畫得出來、碎片一顆都沒有」——
     因為引擎在這裡就 return 了,連骨頭圖都不會下載。 */
  if (!window.matchMedia('(min-width: 1441px)').matches) return;

  /* 碎片改成跟首屏一樣大(Zakk 指定)。首屏的算式是
     sz = gap*(0.3~0.7) 再 ×2.1,在 2000px 寬時約 7~17px ——
     這裡直接對齊。顆粒變大,顆數就要降,不然會糊成一片。 */
  var PER_SEG = 2600;
  var SAMPLE_W = 620;       // 取樣解析度:肋骨很細,320 會整條跳過
  var F = 820;

  var ctx = canvas.getContext('2d', { alpha: true });
  var W = 0, H = 0, DPR = 1, raf = null, t = 0, tick = 0;
  var COLS = ['20,48,79', '31,74,120', '86,124,168'];   // 製圖藍:深 / 中 / 淺
  var PLATE_BLUE = '31,74,120';
  var EMBER = '21,53,92';   // 原本是餘燼橘 180,85,42;全站改單色相後換成深藍
  var EMBER_RATE = 0;   // 0 = 單一色相。想把橘版加回來就調成 0.07
  var sprites = {};
  var sets = {};            // id → 這一段自己的碎片陣列
  var prevVis = {}, dirOf = {};   // 換頁位移用:上一幀的能見度、以及進場/退場方向
  /* 滾輪方向:+1 往下捲。用 12px 的門檻濾掉微幅晃動,不然方向會一直跳。 */
  var scrollSign = 1, lastSY = window.pageYOffset;
  window.addEventListener('scroll', function () {
    var y = window.pageYOffset, d = y - lastSY;
    if (d > 12) { scrollSign = 1; lastSY = y; }
    else if (d < -12) { scrollSign = -1; lastSY = y; }
  }, { passive: true });

  /* 每一區取骨架的一小塊 —— 只是「身體的一部分」,不求連貫。
     cy / kh 是這一塊在畫面上的位置與大小。
     ⚠️ photos 特別放高、放小:照片帶是滿版的,尾巴垂到中間就會壓在照片上
     (Zakk:「photo 那邊尾巴不用到照片」)。 */
  /* 🔴 改用**象徵性的部位**,不再切同一張大圖(Zakk:「不如去找有象徵性的,
     像翅膀、腳掌」)。他說得對:脊椎中段不管怎麼切都是「一排重複的肋骨」,
     沒有辨識點,所以才會「站很滿卻看不出是什麼」。
     翅膀一看就是龍;腳掌小而集中、輪廓清楚;尾巴的勾本來就是三個裡最成功的。

     每一段是一張獨立的去背圖(整張都用,不再裁切),所以也沒有「切口」問題了。
     kh 是它在畫面上佔的高度比例,cx/cy 是位置,dens 是密度倍率。 */
  /* 三段各是一張獨立的去背圖:翅膀 / 腳掌 / 尾巴。

     🔴 但**不是整張照放**(Zakk:「我給你整張圖就是要讓你截可能比較好放的角度」)。
     crop 是原圖上的取樣框 [x0, y0, x1, y1](0~1),用來:
       ① 切掉「接到身體的那一端」—— 翅膀左邊那條脊椎、腳掌上面的髖、
          尾巴根部那幾節粗椎骨。那些是身體的邊,不是元素(「身體的邊邊不用做出來」)。
       ② 只留辨識點:翅膀留手肘的 V + 指骨張開,腳掌留小腿到腳趾,尾巴留那個勾。 */
  /* 🔴 切口要**剛好落在畫面外**(Zakk:「切點可以剛好從網站邊界出來嗎,
     這樣不會有很像截一部份飄著的感覺」)。

     一塊骨頭浮在版面正中間,兩端都是切口 —— 那看起來就是「一塊碎片」。
     但如果切口那一端伸出畫面,大腦會自動補完:它是**從畫面外延伸進來的**,
     只是被視窗裁到而已。同一塊骨頭,差別只在位置。

     所以每一段:
       flip  左右鏡射,把切口那一側翻到右邊(他說「你都可以自己換角度去放」)
       cx/cy 把切口推出邊界:翅膀、腳掌從右邊出去,尾巴的根從上面出去

     密度一併調低、透明度也降(「碎片盡量不要太密,只要明顯有形狀,
     感覺可以整體透明一點」)。 */
  var SEGS = {
    /* ⚠️ 翅膀左下角還有一根**斷掉的碎骨**,跟指骨同一個高度,矩形裁不掉
       (Zakk:「這還有一小塊飄著」)—— 用 drop 挖掉。 */
    /* 翅膀轉橫的(Zakk:「work 的翅膀可以改橫的嗎」)。
       rot 'ccw' 之後:指骨朝右(伸出右界),手肘的 V 留在空白欄中間。 */
    /* ⚠️ 切點又飄在空白處了(第三次)。轉成橫的之後我只顧著指骨朝右,
       忘了脊椎那條切口跟著轉到**下面**,而它就落在版面中間。
       rot 'cw' + flip:切口翻到上面、指骨還是朝右,
       再把 cy 壓小讓上緣出畫面 —— 切口就看不到了。 */
    /* ⚠️ 切口出「上界」是行不通的 —— 導覽列就在右上角。
       我在 2000px 寬測不出來,Zakk 的螢幕是 2560:
       翅膀 x 1976–2524 / y 0–608,導覽列 x 2305–2504 / y 6–30,整個疊在一起。

       改成切口出**右界**(不轉 90°,只左右鏡射 → 斷面在右、指骨朝下),
       整塊往下移到導覽列底下(cy 0.40 → 上緣約 y 190~245)。
       這樣兩種寬度都成立,不是只在我測的那一個尺寸剛好。
       tilt 只給一點點(26° 太多)。 */
    /* 🔴 方向:指骨往下垂(只左右鏡射,不轉 90°)。
       我為了收掉右邊的空格,把它轉成橫的、指骨朝右 —— 那是他先前就要我改掉的方向
       (Zakk:「方向可以改回來嗎,這樣又變成我之前想改的樣子」)。
       ⚠️ 空格不該用「轉方向 + 往左搬」來解,要用**大小** ——
       他自己講了:「不能用內容大小或圖的大小去變嗎」。
       所以方向轉回來、切口回到右邊(anchor right),空格改由 wFrac 控制。 */
    works:  { src: 'bones-wing.webp', crop: [0.15, 0.00, 1.00, 0.88],
              drop: [[0.00, 0.60, 0.44, 1.00]], flip: true, tilt: -12,
              anchor: 'right', wFrac: 0.86, cy: 0.42, dens: 1.25,
              tag: 'WING', tagSub: 'FROM “DRAGON SKULL”' },
    /* 腳掌:⚠️ 原本整條腿(含髖)一起放,看起來只是一根斜的骨頭
       (Zakk:「about 那頁的碎片看不太出來是腳了」)。
       改成只留小腿到腳趾、不鏡射(腳掌在左邊,朝空白處),
       腿的斷面從**上界**出去 —— 像從畫面上方踩下來。 */
    /* ⚠️ 「看不到腳跟以上」改兩次都沒中,因為我一直在調 crop ——
       但 crop 已經含到腿了,真正把腿切掉的是**視窗上緣**:
       cy 0.20 + kh 0.55 → 方框上緣在 -82px,腳跟以上全部在畫面外。
       所以要把整塊往下移(cy 0.34)、同時放大(kh 0.74)並把 crop 往上開到 0.05,
       腿才有東西可以露出來。 */
    /* ⚠️ kh 縮小之後 cy 也要跟著往上:方框變矮,原本的 0.34 會讓
       腿的斷面掉回畫面內(從 -43 變成 +72)。切口必須留在上緣外。 */
    about:  { src: 'bones-claw.webp', crop: [0.06, 0.05, 1.00, 1.00], tilt: 12,
              /* 往左靠一點:2560 寬時內容右緣 1220、腳左緣 1792,
                 中間空了 572px(Zakk:「這兩個中間有點太空了」)。
                 腳的切口在上緣,左右可以自由移動 —— 翅膀不行(切口在右邊,要出右界)。 */
              padL: 0.20, topOut: 0.04, wFrac: 0.82, dens: 1.05,
              tag: 'CLAW', tagSub: 'FROM “DRAGON SKULL”' },
    /* 尾巴:⚠️ 兩次錯誤都記著 ——
       ① 整個 C 型放進去 = 一段脊椎的彎,又寬又粗(「他尾巴不可能那麼寬」)
       ② 改細之後我把它推到更右邊,但他要的是更左(「我是指從左邊一點的地方,
          你反而更右邊了」)。
       ③ 改成直的往下掃 —— 壓到照片上。

       ⚠️ 關鍵事實(量出來的,不是猜的):Photos 的跑馬燈是**滿版** 0→2000px,
       跟 Works / About 不一樣,那一區右邊沒有留白欄。
       照片上緣在 y≈317,所以尾巴只能待在標題右邊那條空白帶裡。
       → 根從上界出去(Zakk 圈的位置),往右生長,整條壓在 y 320 以上。
       ⚠️ 不鏡射:原圖的尾巴本來就是「根在左上、尖在右下」,正好是他要的方向。 */
    photos: { src: 'bones-tail.webp', crop: [0.18, 0.42, 0.92, 1.00],
              padL: 0.16, topOut: 0.20, wFrac: 0.58, dens: 0.50, alpha: 0.60,
              tag: 'CAUDAL', tagSub: 'FROM “DRAGON SKULL”' }
  };


  /* 滑鼠扭曲 —— 跟首屏同一套。演變過程寫在首屏那一段:
     推開 → 洞;半徑重映射(透鏡)→ 還是洞;現在是**扭轉**,面積不變,不會少碎片。 */
  var BLUE = '#1F4A78';  // 製圖藍,跟 CSS 的 --slate 同一個值
  var LENS_R = 110;      // 影響半徑
  var TWIST = 0.34;      // 旋轉,給散開一個方向感
  var SCAT_R = 26;       // 往外推
  var SCAT_J = 30;       // 每顆各自亂跑
  var LENS_MAG = 0.16;   // 中心的碎片放大幅度
  var pxm = -1, pym = -1, pxe = -1, pye = -1;
  /* 🔴 立體感的關鍵:讓滑鼠**帶動兩軸旋轉**(首屏就是這樣才像可以繞著看的物件),
     再加一點持續自轉,讓它一直有生命。只有單軸擺動看起來還是一張紙。 */
  var ay = 0, ax = 0, tay = 0, tax = 0;

  /* 🔴 導覽列避讓區(畫布座標)。
     ⚠️ 用位置去閃導覽列是行不通的:2560px 寬時翅膀 x 1976–2524、
     導覽列 2305–2504,整個疊在一起;但把骨頭縮到閃得開,
     在 2000px 寬時那隻腳有 720px、畫布只有 850px —— 根本擠不下。
     所以改成跟首屏一樣「碎片避開文字」:進到導覽列附近就淡掉。
     這個做法跟視窗寬度無關,不會只在我測的那個尺寸剛好。 */
  var navBox = null;
  function measureNav() {
    var el = document.querySelector('.topbar .nav');
    if (!el) { navBox = null; return; }
    var r = el.getBoundingClientRect(), b = canvas.getBoundingClientRect();
    var PAD = 26;
    navBox = { l: r.left - b.left - PAD, t: r.top - PAD,
               r: r.right - b.left + PAD, b: r.bottom + PAD, fade: 30 };
  }
  function navClear(px, py) {
    var nb = navBox;
    if (!nb || px < nb.l - nb.fade || px > nb.r + nb.fade ||
        py < nb.t - nb.fade || py > nb.b + nb.fade) return 1;
    if (px > nb.l && px < nb.r && py > nb.t && py < nb.b) return 0;
    /* 邊緣 30px 內漸淡,不要切出一條硬邊 */
    var dx = px < nb.l ? nb.l - px : (px > nb.r ? px - nb.r : 0);
    var dy = py < nb.t ? nb.t - py : (py > nb.b ? py - nb.b : 0);
    var dd = Math.sqrt(dx * dx + dy * dy) / nb.fade;
    return dd > 1 ? 1 : dd;
  }

  function layout() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    measureNav();
  }

  /* 只把「這一段」畫進離屏 canvas 再取樣 —— 整段的點數全部落在看得到的地方 */
  function buildSeg(img, sg) {
    var c = sg.crop || [0, 0, 1, 1];
    var sx = c[0] * img.width, sy = c[1] * img.height;
    var sw = (c[2] - c[0]) * img.width, sh = (c[3] - c[1]) * img.height;

    var drops = sg.drop;
    var ow = SAMPLE_W, oh = Math.round(ow * sh / sw);
    var oc = document.createElement('canvas');
    oc.width = ow; oc.height = oh;
    var og = oc.getContext('2d');
    og.drawImage(img, sx, sy, sw, sh, 0, 0, ow, oh);
    var d;
    try { d = og.getImageData(0, 0, ow, oh).data; } catch (e) { return []; }

    /* ① 先做出骨頭的遮罩 */
    var mask = new Uint8Array(ow * oh);
    for (var y = 0; y < oh; y++) {
      for (var x = 0; x < ow; x++) {
        var i = (y * ow + x) * 4;
        /* 門檻拉到 90:去背的邊緣還留著一點很淡的暈,55 會把那圈也當成骨頭 */
        if (d[i + 3] <= 90) continue;
        /* drop:矩形裁不掉的零星碎骨,在這裡挖掉。
           座標是**原圖**的 0~1(不是 crop 之後的),比較好對圖。 */
        if (drops) {
          var su = c[0] + (x / ow) * (c[2] - c[0]);
          var sv = c[1] + (y / oh) * (c[3] - c[1]);
          var skip = false;
          for (var q = 0; q < drops.length; q++) {
            var r = drops[q];
            if (su >= r[0] && su <= r[2] && sv >= r[1] && sv <= r[3]) { skip = true; break; }
          }
          if (skip) continue;
        }
        mask[y * ow + x] = 1;
      }
    }

    /* ② 🔴 距離場:每個骨頭像素離最近的空白有多遠。
       這是整個立體感的來源。骨頭是純黑剪影,亮度沒有變化,
       所以**深度不可能從顏色來** —— 以前用 Math.random() 湊,
       那不是厚度,是雜訊:一轉,隨機的前後就變成隨機的左右位移,
       輪廓當場爛掉(Zakk:「粒子自己會很大範圍亂動,還跑到變形」),
       而且因為深度不是形狀,看起來反而是扁的。

       改成「離邊緣多遠」→ 骨頭中央厚、邊緣薄 → 每根骨頭是一根圓管。
       轉的時候輪廓不會壞,尾尖也會自己收成一點。
       兩趟 chamfer(正向 + 反向),O(n),620x? 的圖大約 1ms。 */
    var dist = new Float32Array(ow * oh);
    var INF = 1e9, n;
    for (n = 0; n < dist.length; n++) dist[n] = mask[n] ? INF : 0;
    for (y = 0; y < oh; y++) {
      for (x = 0; x < ow; x++) {
        n = y * ow + x; if (!dist[n]) continue;
        var m = dist[n];
        if (x > 0) m = Math.min(m, dist[n - 1] + 1);
        if (y > 0) m = Math.min(m, dist[n - ow] + 1);
        if (x > 0 && y > 0) m = Math.min(m, dist[n - ow - 1] + 1.414);
        if (x < ow - 1 && y > 0) m = Math.min(m, dist[n - ow + 1] + 1.414);
        dist[n] = m;
      }
    }
    var maxD = 0;
    for (y = oh - 1; y >= 0; y--) {
      for (x = ow - 1; x >= 0; x--) {
        n = y * ow + x; if (!dist[n]) continue;
        var m2 = dist[n];
        if (x < ow - 1) m2 = Math.min(m2, dist[n + 1] + 1);
        if (y < oh - 1) m2 = Math.min(m2, dist[n + ow] + 1);
        if (x < ow - 1 && y < oh - 1) m2 = Math.min(m2, dist[n + ow + 1] + 1.414);
        if (x > 0 && y < oh - 1) m2 = Math.min(m2, dist[n + ow - 1] + 1.414);
        dist[n] = m2;
        if (m2 > maxD) maxD = m2;
      }
    }
    if (maxD <= 0) maxD = 1;

    var hits = [];
    for (y = 0; y < oh; y++) {
      for (x = 0; x < ow; x++) {
        n = y * ow + x;
        if (!mask[n]) continue;
        var j = n * 4;
        hits.push([x / ow, y / oh, (d[j] + d[j + 1] + d[j + 2]) / 765, dist[n] / maxD]);
      }
    }
    if (!hits.length) return [];

    var want = Math.round(PER_SEG * (sg.dens || 1));
    var out = [], step = Math.max(1, hits.length / want);
    for (var k = 0; k < want; k++) {
      var h = hits[(k * step) | 0];
      if (!h) continue;
      var band = h[2] < 0.30 ? 0 : (h[2] < 0.55 ? 1 : 2);
      /* 🔴 藍要當成**獨立的一塊版**,不能靠深淺去挑。
         這裡的 band 是從骨頭的亮度算的,而骨頭幾乎全是深色 ——
         所以永遠挑到 COLS[0](黑墨),藍只出現 4.9%(實測)。
         改成固定比例抽:7% 橘版、29% 藍版、其餘照深淺走黑墨/石灰。
         這也才像真的疊印:每一塊版是各自印上去的,跟原圖的深淺無關。 */
      var r0 = Math.random();
      var rgb = r0 < EMBER_RATE ? EMBER : COLS[band];
      if (!sprites[rgb]) sprites[rgb] = window.__fragSprites(rgb);
      /* rot:'ccw' 把整塊轉 90°(u,v) → (v, 1-u)。長寬也跟著對調,
         所以 aspect 要取倒數 —— 在下面 out.aspect 那裡處理。 */
      var hu = h[0], hv = h[1], tmp;
      if (sg.rot === 'ccw') { tmp = hu; hu = hv; hv = 1 - tmp; }
      else if (sg.rot === 'cw') { tmp = hu; hu = 1 - hv; hv = tmp; }
      if (sg.flip) hu = 1 - hu;

      out.push({
        u: hu, v: hv,
        /* 圓管的表面:離邊緣的距離 → 半徑,sqrt 是圓的側面輪廓。
           隨機正負 = 這顆碎片落在管子的前面還是後面(是殼,不是實心)。
           只留一點點抖動,免得表面太乾淨像塑膠。 */
        z: (Math.random() < 0.5 ? 1 : -1) * Math.sqrt(h[3]) * 0.5
           + (Math.random() - 0.5) * 0.05,
        sp: sprites[rgb],
        si: (Math.random() * 7) | 0,
        /* 尖端要看得出是尖的:碎片大小跟著骨頭的粗細走 ——
           細的地方(h[3] 小)用小碎片,不然尾尖會被大碎片糊成一團
           (Zakk:「他尾巴是尖的ㄟ」)。 */
        sz: (6.4 + Math.random() * 6.0) * (0.72 + h[3] * 0.7),
        sp1: 0.35 + Math.random() * 0.5,
        ph: Math.random() * 6.28,
        amp: 0.4 + Math.random() * 1.0,   // 飄動幅度也收小,不要飄離骨頭
        ecc: 0.5 + Math.random() * 0.6,
        fall: 0.5 + Math.random() * 1.4,
        a: 0.24 + Math.random() * 0.34    // 透明,但要看得出形狀
      });
    }
    out.aspect = sg.rot ? sh / sw : sw / sh;   // 轉 90° 之後長寬對調

    /* ── tilt:任意角度(度) ──
       rot 只能轉 90 的倍數,不夠用(Zakk:「翅膀可以轉個角度嗎」)。
       ⚠️ u/v 是 0~1 的正規化座標,直接在上面轉會**把形狀壓扁** ——
       因為兩軸的實際長度不一樣。要先乘回 aspect 變成等比例,
       轉完再重新量邊界、重新正規化,aspect 也跟著換成轉後的。 */
    if (sg.tilt) {
      var ang = sg.tilt * Math.PI / 180;
      var ca = Math.cos(ang), sa = Math.sin(ang), A = out.aspect;
      var nx0 = 1e9, nx1 = -1e9, ny0 = 1e9, ny1 = -1e9, q2;
      for (q2 = 0; q2 < out.length; q2++) {
        var pp = out[q2];
        var ex = (pp.u - 0.5) * A, ey = pp.v - 0.5;
        pp.u = ex * ca - ey * sa;
        pp.v = ex * sa + ey * ca;
        if (pp.u < nx0) nx0 = pp.u; if (pp.u > nx1) nx1 = pp.u;
        if (pp.v < ny0) ny0 = pp.v; if (pp.v > ny1) ny1 = pp.v;
      }
      var rw = (nx1 - nx0) || 1, rh = (ny1 - ny0) || 1;
      for (q2 = 0; q2 < out.length; q2++) {
        out[q2].u = (out[q2].u - nx0) / rw;
        out[q2].v = (out[q2].v - ny0) / rh;
      }
      out.aspect = rw / rh;
    }
    /* 最粗的骨頭半徑,換算成 boxW 的比例 —— 深度用這個,
       而不是固定的 boxW × 0.8。骨頭的厚度是它自己的事,
       跟這塊骨頭被放多大無關。 */
    out.thick = maxD / ow;
    return out;
  }

  /* 🔴 挑哪一段、以及它多明顯,**完全交給幀系統**(window.__frameVis)——
     那是內容自己在用的能見度,所以骨頭跟文字必然同進同出。
     以前這裡自己用 getBoundingClientRect 再算一次,兩條曲線對不起來。
     內頁沒有幀系統(它是一般捲動的長頁),那邊退回舊的算法。 */
  function state() {
    var fv = window.__frameVis, best = null;
    if (fv) {
      ['works', 'about', 'photos'].forEach(function (id) {
        var v = fv[id];
        if (v > 0.01 && (!best || v > best.vis)) best = { id: id, vis: v };
      });
      return best;
    }
    var vh = window.innerHeight;
    ['works', 'about', 'photos'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var r = el.getBoundingClientRect();
      var p = (vh * 0.5 - r.top) / Math.max(1, r.height);
      if (p < -0.15 || p > 1.15) return;
      p = p < 0 ? 0 : (p > 1 ? 1 : p);
      var v = Math.min(1, p / 0.18) * (p < 0.72 ? 1 : 1 - (p - 0.72) / 0.28);
      if (!best || v > best.vis) best = { id: id, vis: v < 0 ? 0 : v };
    });
    return best;
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    var st = state();
    if (!st) return;
    var pts = sets[st.id], sg = SEGS[st.id];
    if (!pts || !pts.length) return;

    var vis = st.vis;               // 跟內容同一條曲線
    if (vis <= 0.01) return;

    /* ── 換頁位移 ──
       🔴 方向要跟**滾輪**一致,不是跟進場/退場一致
       (Zakk:「滾輪下滑的時候碎片要往下掉」)。
       下滑時:退場的往下掉、進場的也從上面往下進來 —— 整體都往下,
       跟手指的方向同一邊,才不會覺得畫面在跟你作對。
         退場(vis 在降)→ 位移 +(往下離開)
         進場(vis 在升)→ 位移 -(在上面,往下落到定位)
       上滑時整組反過來。

       ⚠️ 進場/退場記在 dirOf,不是每幀用 vis 升降重判 ——
       過場中 vis 有小抖動,每幀重判會讓整片來回彈。

       ⚠️ 幅度用 (1-vis)^2 而不是 (1-vis):原本線性、係數 0.42,
       vis 0.5 時就偏了 230px —— 內容都讀得了碎片還在半路
       (Zakk:「粒子還沒到定位,感覺要滑更多圈才能到畫面」)。
       平方讓它一離開過場就迅速歸位:vis 0.8 時只剩 13px。 */
    var pv = prevVis[st.id];
    if (pv !== undefined && Math.abs(vis - pv) > 0.004) dirOf[st.id] = vis > pv ? 1 : -1;
    prevVis[st.id] = vis;
    var g = 1 - vis;
    /* ⚠️ 預設要當成「進場」。寫 (dirOf > 0 ? -1 : 1) 的話,
       第一幀 dirOf 還沒設定,undefined > 0 是 false → 被當成退場,
       於是進場的碎片從下面往上跑,跟滾輪反方向。 */
    var travel = g * g * H * 0.34 * (dirOf[st.id] === -1 ? 1 : -1) * scrollSign;

    var segA = sg.alpha || 1;      // 這一段自己的透明度(Zakk:「photo 碎片可以透明一點」)
    var ratio = pts.aspect || 0.8;
    /* 🔴 大小和位置**都**從「右邊那條空欄」算,不從視窗高度算。
       (Zakk:「不能用內容大小或圖的大小去變嗎」——
        空格不該靠移動骨頭來解決,骨頭本來就該跟著空欄一起縮放。)

       ⚠️ 用視窗高度當基準時,同一個 kh 在不同螢幕會留下完全不同的空白:
       2560 空 330px、1800 只剩 16px。空欄寬度才是這件事真正的變數。

       wFrac = 骨頭寬度佔空欄的比例。空欄變窄,骨頭跟著變窄,留白比例不變。 */
    /* 內容欄佔螢幕 70%(見 style.css 的 min-width:1441 那一段),
       骨頭只能用剩下的 30%。⚠️ 這個數字是硬編的 1296 改過來的 ——
       固定值在 2560 的螢幕上會讓骨頭拿到 49% 的版面。 */
    var CONTENT_R = window.innerWidth * 0.70;
    var freeW = Math.max(160, window.innerWidth - CONTENT_R);
    var canvasL = canvas.getBoundingClientRect().left;

    var boxW = freeW * (sg.wFrac || 0.8);
    var boxH = boxW / ratio;

    /* ⚠️ 這裡原本有「boxW 超過畫布 92% 就整個縮小」的保護 ——
       那會連 boxH 一起縮,於是切口從畫面外掉回畫面內
       (1800px 寬實測:上緣從 0 變成 56,斷面露出來)。已移除。 */

    var cx;
    if (sg.anchor === 'right') {
      /* 切口在右邊的(翅膀):右緣固定溢出視窗,左緣由 wFrac 決定 */
      cx = (window.innerWidth + freeW * 0.06) - canvasL - boxW / 2;
    } else {
      cx = CONTENT_R + freeW * (sg.padL != null ? sg.padL : 0.24) - canvasL + boxW / 2;
    }

    /* 垂直:切口在上緣的,要用**方框高度**的比例把上緣推出畫面 ——
       用視窗高度的比例(cy)在骨頭縮小時會讓切口掉回畫面內。 */
    var cy = sg.topOut != null ? boxH * (0.5 - sg.topOut) : H * sg.cy;

    /* 🔴 這幾塊骨頭**不自轉**(Zakk:「不要讓那些部位自轉,你會錯意了」)。
       它們是版面上的裝飾元素,角度是設計決定的、不是動畫 ——
       一直擺動反而讓人看不出那是翅膀還是腳。
       (首屏那顆頭骨是主角,才需要一直轉。)

       ⚠️ 我之前把「他覺得角度怪」讀成「要能調角度」,加了 tilt 參數;
       又把「你可以自己去看轉哪個角度最好看」讀成「要有旋轉動畫」。
       兩次都錯:他要的是**挑一個固定角度**。

       只留滑鼠帶動的極小幅度傾斜(±8°),當作立體的暗示,不構成「自轉」。 */
    ay += (tay * 0.16 - ay) * 0.05;
    ax += (tax * 0.16 - ax) * 0.05;
    var cyr = Math.cos(ay), syr = Math.sin(ay);
    var cxr = Math.cos(ax), sxr = Math.sin(ax);
    /* 深度 = 骨頭真實的粗細 × 2.2(稍微誇張一點才看得出來)。
       ⚠️ 以前是 boxW × 0.80 —— 那等於把碎片丟在前後 ±200px,
       一轉就變成 ±200px 的左右亂跑。 */
    var depth = boxW * (pts.thick || 0.05) * 2.2;

    // 滑鼠平滑追蹤(直接用原始座標的話,游標一停碎片就瞬間彈回,很生硬)
    if (pxm >= 0) {
      if (pxe < 0) { pxe = pxm; pye = pym; }
      pxe += (pxm - pxe) * 0.22;
      pye += (pym - pye) * 0.22;
    }

    // 碎片實際畫到哪裡 —— 標註的引線要釘在這個範圍上,不能用方框推算
    var bbL = 1e9, bbR = -1e9, bbT = 1e9, bbB = -1e9;

    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      var dx = (p.u - 0.5) * boxW;
      var dy = (p.v - 0.5) * boxH;
      var dz = p.z * depth;

      /* 軌道飄動:同一個角度餵給 cos/sin → 閉合橢圓,不會漂走 */
      var w1 = t * p.sp1 + p.ph;
      dx += Math.cos(w1) * p.amp;
      dy += Math.sin(w1) * p.amp * p.ecc;
      dy += travel * p.fall;      // 換頁位移;p.fall 讓每顆快慢不同,是「跑」不是整塊平移



      /* 先繞 Y 再繞 X —— 跟首屏同一套順序 */
      var x1 = dx * cyr - dz * syr;
      var zz = dx * syr + dz * cyr;
      var y1 = dy * cxr - zz * sxr;
      var z2 = dy * sxr + zz * cxr;
      var scale = F / (F - z2);
      var px = cx + x1 * scale;
      var py = cy + y1 * scale;

      /* 扭轉:繞著游標轉一個角度,角度隨距離衰減。面積不變 = 密度不變 */
      var mag = 1;
      if (pxe >= 0) {
        var vx = px - pxe, vy = py - pye;
        var dist = Math.sqrt(vx * vx + vy * vy);
        if (dist < LENS_R && dist > 0.01) {
          var tt = dist / LENS_R, fo = (1 - tt) * (1 - tt);
          var th = TWIST * fo;
          var cs = Math.cos(th), sn = Math.sin(th);
          var rx = vx * cs - vy * sn, ry = vx * sn + vy * cs;
          var inv = 1 / dist;
          px = pxe + rx + rx * inv * SCAT_R * fo + Math.cos(p.ph * 7.3) * SCAT_J * fo;
          py = pye + ry + ry * inv * SCAT_R * fo + Math.sin(p.ph * 5.1) * SCAT_J * fo;
          mag = 1 + LENS_MAG * fo;
        }
      }

      if (px < -40 || px > W + 40 || py < -40 || py > H + 40) continue;

      /* 裁切邊界要化開,不要切出一條直線浮在空白裡 */
      var edge = Math.min(1,
        Math.min(Math.min(p.u, 1 - p.u), Math.min(p.v, 1 - p.v)) / 0.04);

      var nc = navClear(px, py);       // 靠近導覽列就淡掉
      if (nc <= 0) continue;

      var d2 = p.sz * scale * mag;
      ctx.globalAlpha = p.a * vis * edge * segA * nc;
      ctx.drawImage(p.sp[p.si], px - d2 / 2, py - d2 / 2, d2, d2);

      if (px < bbL) bbL = px;
      if (px > bbR) bbR = px;
      if (py < bbT) bbT = py;
      if (py > bbB) bbB = py;
    }
    ctx.globalAlpha = 1;
    callout(sg, vis, bbL, bbT, bbR, bbB);
  }

  /* ══ 標註:引線 + 方形節點 + 小面板 ══
     這一塊是整個風格層的簽名。它讓碎片**被說明** ——
     碎片因此不再是「一個粒子特效」,而是「一張技術圖上被標註的東西」,
     跟旁邊那些平面圖、立面圖變成同一件事(Zakk:「粒子跟印在紙上沒什麼相關」)。

     ⚠️ 畫在**同一張 canvas** 上,不用 DOM ——
     碎片的位置每幀都在動(擺動、換頁位移、滑鼠散開),
     用 DOM 疊上去一定會脫鉤。同一張畫布就永遠對得準。 */
  function callout(sg, vis, l, tp, r, b) {
    if (!sg.tag || l > r) return;
    var a = vis * 0.9;
    if (a <= 0.02) return;

    /* ⚠️ 面板不能放在骨頭左邊:骨頭常常一路貼到欄位左緣,
       面板會落進左緣那 90px 的遮罩裡直接消失(實測 lx=12)。
       放**下方** —— 三段的骨頭下面都有空間,而且圖說本來就在圖的下面。 */
    var nx = l + (r - l) * 0.34;         // 節點釘在骨頭下半部
    var ny = b - (b - tp) * 0.10;
    var lx = 104;                        // 面板固定貼欄位左緣(避開遮罩)
    var ly = Math.min(H - 40, b + 74);

    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = BLUE;
    ctx.fillStyle = BLUE;
    ctx.lineWidth = 1;

    // 引線:從節點斜下來,再走一小段水平接到標籤 —— 製圖引線的畫法
    ctx.beginPath();
    ctx.moveTo(nx, ny);
    ctx.lineTo(lx + 74, ly - 26);
    ctx.lineTo(lx, ly - 26);
    ctx.stroke();

    // 方形節點(空心,中間留白 —— 實心會變成一個突兀的點)
    ctx.strokeRect(nx - 3.5, ny - 3.5, 7, 7);

    // 標籤
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 11px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(sg.tag, lx, ly - 10);

    ctx.globalAlpha = a * 0.6;
    ctx.font = '400 9.5px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(sg.tagSub, lx, ly + 6);
    ctx.restore();
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    if (++tick & 1) return;      // 30fps:背景裝飾,看不出來但省一半
    t += 0.032;
    render();
  }

  /* 三張圖各自載入,各自建自己的碎片 */
  var loaded = 0, imgs = {};
  Object.keys(SEGS).forEach(function (id) {
    var im = new Image();
    imgs[id] = im;
    im.onload = im.onerror = function () {
      if (im.naturalWidth) { layout(); sets[id] = buildSeg(im, SEGS[id]); }
      if (++loaded === 3 && !raf) frame();
    };
    var self = (document.currentScript && document.currentScript.src) || '';
    im.src = (self ? self.replace(/js\/main\.js.*$/, '') : '') + 'assets/3d/' + SEGS[id].src;
  });

  /* 畫布是 pointer-events: none,所以滑鼠事件掛在 window 上 */
  window.addEventListener('mousemove', function (e) {
    var b = canvas.getBoundingClientRect();
    pxm = e.clientX - b.left;
    pym = e.clientY - b.top;
    tay = (e.clientX / window.innerWidth - 0.5) * 0.9;      // 左右轉
    tax = (e.clientY / window.innerHeight - 0.5) * -0.6;    // 上下俯仰
  }, { passive: true });

  window.addEventListener('resize', function () {
    layout();
    Object.keys(SEGS).forEach(function (id) {
      if (imgs[id] && imgs[id].naturalWidth) sets[id] = buildSeg(imgs[id], SEGS[id]);
    });
  });
}());


/* ═══════════════════════════════════════════════════════
   自訂游標:準星
   平常是空心方框 + 中心點;碰到可按的東西就放大、並跳出一行說明。

   ⚠️ 只在有滑鼠的裝置啟用(pointer: fine)。觸控裝置沒有游標,
   藏掉系統游標等於什麼都沒有。
   ⚠️ 也不接管 prefers-reduced-motion —— 延遲追隨對前庭敏感的人不舒服,
   而系統游標本來就是最穩的那個。
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  if (!window.matchMedia('(pointer: fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var root = document.documentElement;
  var el = document.createElement('div');
  el.className = 'cursor';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML =
    '<i class="cursor__box"></i><i class="cursor__dot"></i><span class="cursor__tag"></span>';
  document.body.appendChild(el);
  var tagEl = el.querySelector('.cursor__tag');
  root.classList.add('cursor-on');

  /* 目標位置與實際位置分開 —— 中間插值,游標才有重量。
     完全跟手是「一個貼在滑鼠上的圖案」,慢一點才像儀器在追蹤。 */
  var tx = -100, ty = -100, cx = -100, cy = -100, raf = null;

  function loop() {
    cx += (tx - cx) * 0.28;
    cy += (ty - cy) * 0.28;
    el.style.setProperty('--cx', cx.toFixed(1) + 'px');
    el.style.setProperty('--cy', cy.toFixed(1) + 'px');
    /* 距離夠近就停,不要空轉一整個 rAF 迴圈 */
    if (Math.abs(tx - cx) < 0.1 && Math.abs(ty - cy) < 0.1) { raf = null; return; }
    raf = requestAnimationFrame(loop);
  }

  document.addEventListener('mousemove', function (e) {
    tx = e.clientX; ty = e.clientY;
    if (!raf) raf = requestAnimationFrame(loop);
  }, { passive: true });

  /* 離開視窗就把游標移走,免得它卡在邊緣 */
  document.addEventListener('mouseleave', function () {
    tx = -100; ty = -100;
    if (!raf) raf = requestAnimationFrame(loop);
  }, { passive: true });

  document.addEventListener('mousedown', function () { el.classList.add('is-down'); }, { passive: true });
  document.addEventListener('mouseup',   function () { el.classList.remove('is-down'); }, { passive: true });

  /* 碰到可互動的東西 → 鎖定 + 說明。
     ⚠️ 說明的文字要講「會發生什麼事」,不是重複那個元素的名字。
     data-cursor 可以個別指定;沒指定就用連結本身的性質推。 */
  function labelFor(a) {
    if (a.dataset.cursor) return a.dataset.cursor;
    var href = a.getAttribute('href') || '';
    if (a.hasAttribute('download')) return 'Download';
    if (href.indexOf('mailto:') === 0) return 'Write';
    if (a.target === '_blank') return 'Open ↗';
    if (href.indexOf('#') === 0) return 'Jump';
    return 'View';
  }

  document.addEventListener('mouseover', function (e) {
    var a = e.target.closest && e.target.closest('a, button, [data-cursor]');
    if (!a) return;
    tagEl.textContent = labelFor(a);
    el.classList.add('is-live');
  }, { passive: true });

  document.addEventListener('mouseout', function (e) {
    var a = e.target.closest && e.target.closest('a, button, [data-cursor]');
    if (!a) return;
    /* 移到同一個連結的子元素上不算離開 */
    if (e.relatedTarget && a.contains(e.relatedTarget)) return;
    el.classList.remove('is-live');
  }, { passive: true });
}());
