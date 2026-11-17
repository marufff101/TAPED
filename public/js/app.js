(function(){
  "use strict";
  var $ = function(id){ return document.getElementById(id); };

  /* ================= WORDS ================= */
  var BANK = ("the be to of and a in that have it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us is water long find here thing great little own under name very through form much before line right too mean old same tell boy follow came show around three small set put end does another large must big turn why ask went men read need land different home move try kind hand picture again change off play spell air away animal house point page letter mother answer found study still learn should world high every near add food between below country plant last school father keep tree never start city earth eye light thought head story saw left few while along might close something seem next hard open example begin life always those both paper together got group often run important until children side feet car mile night walk white sea began grow took river four carry state once book hear stop without second late miss idea enough eat face watch far real almost let above girl sometimes mountain cut young talk soon list song being leave family " +
    "quiz quick quiet quote queen quality question square equal require request liquid puzzle zero zone size prize amazing lazy crazy dozen jazz jump just joy join journey major enjoy object project subject reject box fix next six text exact example expert extra explain excuse taxi relax mix vivid vote visit voice value very view heavy above never over move save give have love drive river driver weave valley verb kitchen knock knife knee know keyboard keep kind key kick pocket package pickup popular paper people purple pepper simple apple maximum magic memory number moment machine meaning remember summer common comment mom money month monkey").split(" ");
  var BANK_UNIQ = []; (function(){ var seen = {}; BANK.forEach(function(w){ if(w && !seen[w]){ seen[w] = 1; BANK_UNIQ.push(w); } }); })();
  var QUOTES = [
    "Practice is the quiet work that makes the loud moments possible.",
    "Speed follows accuracy, and accuracy follows attention, and attention follows rest.",
    "Every key you miss today is a key you will own by the end of the month.",
    "A steady hand beats a fast one that keeps stumbling over the same letters.",
    "The keyboard does not care how you feel about Mondays, so just begin.",
    "Small daily gains add up to a skill nobody can take away from you.",
    "Fingers learn what the mind repeats without complaint, so repeat it slowly first.",
    "Typing well is mostly about typing often, and typing calmly."
  ];
  var TIME_OPTS = [15, 30, 60, 120];
  var WORD_OPTS = [10, 25, 50, 100];
  var MAX_EXTRA = 8;

  /* ================= STATE ================= */
  var S = {
    mode:"time", timeTarget:30, wordsTarget:25,
    words:[], idx:0, typed:"", committed:[],
    started:false, finished:false, startMs:0, timer:null,
    keys:0, keyOk:0, keyBad:0, correctWordChars:0,
    sec:[], keyStats:{}, pairs:{}, wordMiss:{}, weakKeys:[], last:null
  };
  var el = {
    words:$("words"), disp:$("textDisplay"), card:$("card"), input:$("hiddenInput"),
    live:$("live"), liveTime:$("liveTime"), liveWpm:$("liveWpm"), liveAcc:$("liveAcc"),
    viewType:$("viewType"), viewStats:$("viewStats"), viewCommunity:$("viewCommunity"), viewHost:$("viewHost"),
    testArea:$("testArea"), results:$("results")
  };
  var currentView = "type";

  /* ================= PROFILE STORE ================= */
  // Guests keep stats in localStorage. Signed-in members keep them in the server database.
  var LOCAL_KEY = "taped_profile_v1";
  var Store = { cloud:false, profile:null };

  function api(method, url, body){
    var opt = { method:method, credentials:"same-origin", headers:{} };
    if(body !== undefined){ opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
    return fetch(url, opt).then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(data){
        if(!res.ok){ var err = new Error(data.error || "Request failed."); err.status = res.status; throw err; }
        return data;
      });
    });
  }

  function emptyProfile(){
    return { v:1, tests:0, ms:0, history:[], bests:{}, bestAcc:0, keys:{}, pairs:{}, words:{}, ach:{}, notifs:[], seen:0 };
  }
  function normalize(p){
    var e = emptyProfile();
    if(!p || typeof p !== "object") return e;
    Object.keys(e).forEach(function(k){ if(p[k] !== undefined && p[k] !== null) e[k] = p[k]; });
    return e;
  }
  function localLoad(){
    try{ var raw = localStorage.getItem(LOCAL_KEY); return raw ? JSON.parse(raw) : null; }catch(e){ return null; }
  }
  function localSave(){
    try{ localStorage.setItem(LOCAL_KEY, JSON.stringify(Store.profile)); }catch(e){}
  }
  var guestProfile = normalize(localLoad());
  Store.profile = guestProfile;
  function P(){ return Store.profile; }

  function topN(obj, n){
    var arr = Object.keys(obj).map(function(k){ return [k, obj[k]]; }).sort(function(a,b){ return b[1]-a[1]; }).slice(0, n);
    var out = {}; arr.forEach(function(p){ out[p[0]] = p[1]; }); return out;
  }
  function persist(){ if(!Store.cloud) localSave(); }


  /* ================= THEME ================= */
  var ICON_MOON = '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';
  var ICON_SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
  function isDark(){
    var t = document.documentElement.getAttribute("data-theme");
    if(t) return t === "dark";
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
  function paintThemeIcon(){ $("themeIcon").innerHTML = isDark() ? ICON_SUN : ICON_MOON; }
  try{ var savedTheme = localStorage.getItem("taped_theme"); if(savedTheme === "dark" || savedTheme === "light") document.documentElement.setAttribute("data-theme", savedTheme); }catch(e){}
  paintThemeIcon();
  $("themeBtn").addEventListener("click", function(){
    var next = isDark() ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try{ localStorage.setItem("taped_theme", next); }catch(e){}
    paintThemeIcon();
  });

  /* ================= FORMAT HELPERS ================= */
  function fmtAcc(a){
    if(a >= 100) return "100%";
    return (Math.floor(a * 10) / 10).toFixed(1) + "%";
  }
  function fmtDur(ms){
    var s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    if(h) return h + "h " + (m < 10 ? "0" : "") + m + "m";
    if(m) return m + "m " + (r < 10 ? "0" : "") + r + "s";
    return r + "s";
  }
  function rel(ts){
    var d = Date.now() - ts, m = Math.floor(d / 60000);
    if(m < 1) return "just now";
    if(m < 60) return m + " min ago";
    var h = Math.floor(m / 60);
    if(h < 24) return h + " h ago";
    var dd = Math.floor(h / 24);
    if(dd < 7) return dd + " d ago";
    return new Date(ts).toLocaleDateString();
  }
  function chOf(code){ return String.fromCharCode(+code); }
  function mk(tag, cls, text){
    var n = document.createElement(tag);
    if(cls) n.className = cls;
    if(text !== undefined) n.textContent = text;
    return n;
  }

  /* ================= TEST BUILD ================= */
  function randWord(){ return BANK_UNIQ[Math.floor(Math.random() * BANK_UNIQ.length)]; }

  function weakWords(){
    var keys = P().keys;
    var arr = Object.keys(keys).map(function(code){
      var s = keys[code], n = s.c + s.i;
      return { ch: chOf(code), n: n, acc: n ? s.c / n : 1, miss: s.i };
    }).filter(function(s){ return s.n >= 6 && s.miss > 0 && /[a-z]/.test(s.ch); })
      .sort(function(a, b){ return a.acc - b.acc || b.miss - a.miss; }).slice(0, 5);
    S.weakKeys = arr.map(function(a){ return a.ch; });
    var out = [], i;
    if(!arr.length){
      for(i = 0; i < 30; i++) out.push(randWord());
      return out;
    }
    var scored = BANK_UNIQ.map(function(w){
      var sc = 0; S.weakKeys.forEach(function(k){ sc += w.split(k).length - 1; });
      return { w:w, sc:sc };
    }).filter(function(x){ return x.sc > 0; });
    if(scored.length < 8){ for(i = 0; i < 30; i++) out.push(randWord()); return out; }
    var bag = []; scored.forEach(function(x){ for(var j = 0; j < x.sc * x.sc; j++) bag.push(x.w); });
    for(i = 0; i < 36; i++) out.push(bag[Math.floor(Math.random() * bag.length)]);
    return out;
  }

  function isFixed(){ return S.mode !== "time"; }

  function buildTest(){
    clearInterval(S.timer); S.timer = null;
    S.idx = 0; S.typed = ""; S.committed = [];
    S.started = false; S.finished = false; S.startMs = 0;
    S.keys = 0; S.keyOk = 0; S.keyBad = 0; S.correctWordChars = 0;
    S.sec = []; S.keyStats = {}; S.pairs = {}; S.wordMiss = {}; S.weakKeys = [];
    el.input.value = "";
    var i;
    if(S.mode === "time"){ S.words = []; for(i = 0; i < 80; i++) S.words.push(randWord()); }
    else if(S.mode === "words"){ S.words = []; for(i = 0; i < S.wordsTarget; i++) S.words.push(randWord()); }
    else if(S.mode === "quote"){ S.words = QUOTES[Math.floor(Math.random() * QUOTES.length)].split(" "); }
    else { S.words = weakWords(); }
    el.live.classList.remove("on");
    el.liveTime.textContent = S.mode === "time" ? String(S.timeTarget) : "0s";
    el.liveWpm.textContent = "0"; el.liveAcc.textContent = "100%";
    el.card.classList.remove("done", "flash");
    el.results.hidden = true; el.testArea.hidden = false;
    renderModeBar();
    renderAllWords();
    fitViewport();
    paintCurrent(); scrollLine();
    if(currentView === "type") focusInput();
  }

  function renderAllWords(){
    el.words.textContent = "";
    S.words.forEach(function(_, i){
      el.words.appendChild(buildWordEl(i));
      el.words.appendChild(document.createTextNode(" "));
    });
    el.words.style.transform = "translateY(0)";
  }
  function buildWordEl(i){
    var w = mk("span", "word"); w.dataset.i = i;
    var t = S.words[i];
    for(var c = 0; c < t.length; c++) w.appendChild(mk("span", "char", t[c]));
    return w;
  }
  function appendWords(n){
    for(var k = 0; k < n; k++){
      var i = S.words.length; S.words.push(randWord());
      el.words.appendChild(buildWordEl(i)); el.words.appendChild(document.createTextNode(" "));
    }
  }
  function wordEl(i){ return el.words.children[i]; }
  function lineH(){ return parseFloat(getComputedStyle(el.words).lineHeight) || 51; }
  function fitViewport(){ el.disp.style.height = (lineH() * 3) + "px"; }
  function scrollLine(){
    var cur = wordEl(S.idx); if(!cur) return;
    var lh = lineH();
    var line = Math.round(cur.offsetTop / lh);
    el.words.style.transform = "translateY(" + (-Math.max(0, line - 1) * lh) + "px)";
  }
  window.addEventListener("resize", function(){ fitViewport(); scrollLine(); });

  /* ================= PAINTING ================= */
  function paintCurrent(){
    var w = wordEl(S.idx); if(!w) return;
    var target = S.words[S.idx], typed = S.typed, i;
    var old = w.querySelectorAll(".extra"); for(i = 0; i < old.length; i++) old[i].remove();
    var chars = w.querySelectorAll(".char");
    for(i = 0; i < chars.length; i++){
      chars[i].className = "char";
      if(i < typed.length) chars[i].classList.add(typed[i] === target[i] ? "correct" : "incorrect");
    }
    for(i = target.length; i < typed.length; i++) w.appendChild(mk("span", "char extra", typed[i]));
    var all = w.querySelectorAll(".char");
    if(typed.length < target.length) all[typed.length].classList.add("caret");
    else all[all.length - 1].classList.add("caret-end");
  }
  function paintDone(i, typed){
    var w = wordEl(i); if(!w) return;
    var target = S.words[i], k;
    var old = w.querySelectorAll(".extra"); for(k = 0; k < old.length; k++) old[k].remove();
    var chars = w.querySelectorAll(".char");
    for(k = 0; k < chars.length; k++){
      chars[k].className = "char";
      if(k < typed.length) chars[k].classList.add(typed[k] === target[k] ? "correct" : "incorrect");
      else chars[k].classList.add("missed");
    }
    for(k = target.length; k < typed.length; k++) w.appendChild(mk("span", "char extra", typed[k]));
    if(typed !== target) w.classList.add("mistyped");
  }
  var flashTimer = null;
  function flashError(){
    el.card.classList.add("flash");
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function(){ el.card.classList.remove("flash"); }, 180);
  }

  /* ================= ENGINE ================= */
  function elapsedMs(){ return S.started ? performance.now() - S.startMs : 0; }

  function startIfNeeded(){
    if(S.started) return;
    S.started = true; S.startMs = performance.now();
    el.live.classList.add("on");
    S.timer = setInterval(tick, 100);
  }
  function timeUp(){
    if(S.mode === "time" && elapsedMs() >= S.timeTarget * 1000){ finish(); return true; }
    return false;
  }
  function bucket(){
    var i = Math.floor(elapsedMs() / 1000);
    while(S.sec.length <= i) S.sec.push({ k:0, b:0 });
    return S.sec[i];
  }
  function bumpKey(map, code, ok){
    var s = map[code] || (map[code] = { c:0, i:0 });
    if(ok) s.c++; else s.i++;
  }
  function recordKey(ok, expected, got){
    var b = bucket();
    S.keys++; b.k++;
    if(ok) S.keyOk++; else { S.keyBad++; b.b++; }
    if(expected !== undefined){
      bumpKey(S.keyStats, expected.charCodeAt(0), ok);
      if(!ok && got !== undefined && got !== " "){
        var pk = expected.charCodeAt(0) + "_" + got.charCodeAt(0);
        S.pairs[pk] = (S.pairs[pk] || 0) + 1;
      }
    }
  }
  function partialCorrect(){
    var t = S.words[S.idx] || "";
    return (S.typed.length && t.indexOf(S.typed) === 0) ? S.typed.length : 0;
  }
  function netWpmNow(){
    var ms = elapsedMs(); if(ms < 1000) return 0;
    return Math.round((S.correctWordChars + partialCorrect()) / 5 / (ms / 60000));
  }
  function accNow(){ return S.keys ? (S.keyOk / S.keys) * 100 : 100; }
  function updateLive(){
    el.liveAcc.textContent = fmtAcc(accNow());
    el.liveWpm.textContent = String(netWpmNow());
  }
  function tick(){
    var ms = elapsedMs();
    if(S.mode === "time"){
      if(ms >= S.timeTarget * 1000){ finish(); return; }
      el.liveTime.textContent = String(Math.max(0, Math.ceil((S.timeTarget * 1000 - ms) / 1000)));
    } else {
      el.liveTime.textContent = Math.floor(ms / 1000) + "s";
    }
    updateLive();
  }

  function typeChar(ch){
    if(S.finished) return;
    if(ch === " "){ if(S.typed.length) commitWord(true); return; }
    var target = S.words[S.idx];
    if(S.typed.length >= target.length + MAX_EXTRA) return;
    startIfNeeded();
    if(timeUp()) return;
    var pos = S.typed.length;
    var ok = pos < target.length && ch === target[pos];
    recordKey(ok, target[pos], ch);
    S.typed += ch;
    paintCurrent();
    if(!ok) flashError();
    updateLive();
    if(isFixed() && S.idx === S.words.length - 1 && S.typed === target) commitWord(false);
  }

  function commitWord(viaSpace){
    var target = S.words[S.idx], typed = S.typed, exact = typed === target, k;
    if(viaSpace){
      if(timeUp()) return;
      recordKey(typed.length >= target.length, undefined);
    }
    if(!exact){
      if(typed.length){
        var wk = target + ">" + typed;
        S.wordMiss[wk] = (S.wordMiss[wk] || 0) + 1;
      }
      for(k = typed.length; k < target.length; k++) bumpKey(S.keyStats, target.charCodeAt(k), false);
    } else {
      S.correctWordChars += target.length + (viaSpace ? 1 : 0);
    }
    S.committed.push(typed);
    paintDone(S.idx, typed);
    S.idx++; S.typed = ""; el.input.value = "";
    if(S.idx >= S.words.length){ finish(); return; }
    if(S.mode === "time" && S.idx > S.words.length - 30) appendWords(40);
    paintCurrent(); scrollLine(); updateLive();
  }

  /* ---- scoring helpers ---- */
  function charBreakdown(){
    var cor = 0, inc = 0, ext = 0, mis = 0;
    function cmp(target, typed, complete){
      var n = Math.min(target.length, typed.length), i;
      for(i = 0; i < n; i++){ if(target[i] === typed[i]) cor++; else inc++; }
      if(typed.length > target.length) ext += typed.length - target.length;
      else if(complete) mis += target.length - typed.length;
    }
    for(var i = 0; i < S.committed.length; i++) cmp(S.words[i], S.committed[i], true);
    if(S.typed.length && S.words[S.idx] !== undefined) cmp(S.words[S.idx], S.typed, false);
    return { cor:cor, inc:inc, ext:ext, mis:mis };
  }

  // Per-second raw wpm from keystrokes. Last bucket absorbs the leftover fraction of a second.
  function perSecond(elapsed){
    var n = Math.max(1, Math.round(elapsed / 1000)), out = [], cumOk = [], runningKeys = 0, runningBad = 0, errs = [];
    for(var i = 0; i < n; i++){
      var keys = 0, bad = 0, from = i, to = i;
      if(i === n - 1) to = Math.max(S.sec.length - 1, i);
      for(var j = from; j <= to; j++){ if(S.sec[j]){ keys += S.sec[j].k; bad += S.sec[j].b; } }
      var dur = (i === n - 1) ? Math.max(0.25, (elapsed - i * 1000) / 1000) : 1;
      out.push(keys / 5 * (60 / dur));
      runningKeys += keys; runningBad += bad;
      var mins = Math.min(elapsed, (i + 1) * 1000) / 60000;
      cumOk.push((runningKeys - runningBad) / 5 / Math.max(mins, 1/600));
      errs.push(bad > 0);
    }
    return { raw:out, net:cumOk, errs:errs };
  }
  // Monkeytype-style: 100 * (1 - tanh of a coefficient-of-variation series). Needs 3+ seconds of data.
  function consistencyOf(samples){
    if(samples.length < 3) return null;
    var mean = samples.reduce(function(a, b){ return a + b; }, 0) / samples.length;
    if(mean <= 0) return null;
    var variance = samples.reduce(function(a, b){ return a + (b - mean) * (b - mean); }, 0) / samples.length;
    var cv = Math.sqrt(variance) / mean;
    var x = cv + Math.pow(cv, 3) / 3 + Math.pow(cv, 5) / 5;
    var score = 100 * (1 - Math.tanh(x));
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function finish(){
    if(S.finished) return;
    S.finished = true;
    clearInterval(S.timer); S.timer = null;
    el.input.blur();
    el.card.classList.add("done");
    var elapsed = S.mode === "time" ? S.timeTarget * 1000 : Math.max(elapsedMs(), 500);
    var minutes = elapsed / 60000;
    var correctChars = S.correctWordChars + partialCorrect();
    var net = Math.round(correctChars / 5 / minutes);
    var raw = Math.round(S.keys / 5 / minutes);
    var acc = accNow();
    var ps = perSecond(elapsed);
    var cons = consistencyOf(ps.raw);
    var br = charBreakdown();
    var r = {
      mode:S.mode, target: S.mode === "time" ? S.timeTarget : (S.mode === "words" ? S.wordsTarget : null),
      net:net, raw:raw, acc:acc, cons:cons, bad:S.keyBad, keys:S.keys, elapsed:elapsed, br:br, ps:ps,
      keyStats:S.keyStats, pairs:S.pairs, wordMiss:S.wordMiss, pb:false
    };
    S.last = r;
    saveResult(r);
    renderResults(r);
  }

  /* ================= SAVE RESULT ================= */
  var ACH = [
    { id:"first", test:function(r, p){ return p.tests >= 1; }, text:"First test finished. Taped is tracking your weak keys now." },
    { id:"w40", test:function(r){ return r.net >= 40; }, text:"Badge unlocked: 40 wpm." },
    { id:"w60", test:function(r){ return r.net >= 60; }, text:"Badge unlocked: 60 wpm." },
    { id:"w80", test:function(r){ return r.net >= 80; }, text:"Badge unlocked: 80 wpm." },
    { id:"w100", test:function(r){ return r.net >= 100; }, text:"Badge unlocked: 100 wpm." },
    { id:"perfect", test:function(r){ return r.acc >= 100 && r.keys >= 40; }, text:"Badge unlocked: a perfect run, 100% accuracy over 40+ keys." },
    { id:"ten", test:function(r, p){ return p.tests >= 10; }, text:"Badge unlocked: 10 tests completed." }
  ];

  function saveResult(r){
    if(Store.cloud){ saveToServer(r); return; }
    var p = P(), now = Date.now();
    p.tests++; p.ms += r.elapsed;
    p.history.push({ t:now, m:r.mode, n:r.target, w:r.net, r:r.raw, a:Math.floor(r.acc * 10) / 10, c:r.cons, k:r.keys });
    if(p.history.length > 100) p.history = p.history.slice(-100);
    if(r.keys >= 20 && r.acc > p.bestAcc) p.bestAcc = Math.floor(r.acc * 10) / 10;
    if(r.mode === "time" || r.mode === "words"){
      var bk = r.mode + "_" + r.target, had = p.bests[bk] !== undefined;
      if(!had || r.net > p.bests[bk]){
        p.bests[bk] = r.net; r.pb = true;
        if(had) pushNotif("New personal best: " + r.net + " wpm on " + (r.mode === "time" ? r.target + "s" : r.target + " words") + ".");
      }
    }
    Object.keys(r.keyStats).forEach(function(code){
      var s = p.keys[code] || (p.keys[code] = { c:0, i:0 });
      s.c += r.keyStats[code].c; s.i += r.keyStats[code].i;
    });
    Object.keys(r.pairs).forEach(function(k){ p.pairs[k] = (p.pairs[k] || 0) + r.pairs[k]; });
    Object.keys(r.wordMiss).forEach(function(k){ p.words[k] = (p.words[k] || 0) + r.wordMiss[k]; });
    p.pairs = topN(p.pairs, 40); p.words = topN(p.words, 40);
    ACH.forEach(function(a){
      if(!p.ach[a.id] && a.test(r, p)){ p.ach[a.id] = now; pushNotif(a.text); }
    });
    renderBell();
    persist();
  }
  function pushNotif(text){
    var p = P();
    p.notifs.unshift({ id:Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t:Date.now(), x:text, read:false });
    if(p.notifs.length > 30) p.notifs = p.notifs.slice(0, 30);
  }

  var saveStatus = "";
  function saveToServer(r){
    setSaveNote("Saving to your account...");
    api("POST", "/api/tests", {
      mode:r.mode, target:r.target, net:r.net, raw:r.raw, acc:r.acc, cons:r.cons, keys:r.keys, bad:r.bad, elapsed:r.elapsed,
      keyStats:r.keyStats, pairs:r.pairs, wordMiss:r.wordMiss
    }).then(function(res){
      r.pb = !!res.pb && r.mode !== "quote";
      // The server only flags a personal best when it beat an earlier one; treat the very first run as a best too.
      return loadServerProfile().then(function(){
        var bk = r.mode + "_" + r.target;
        if((r.mode === "time" || r.mode === "words") && P().bests[bk] === r.net && P().history.filter(function(h){ return h.m === r.mode && h.n === r.target; }).length === 1) r.pb = true;
        $("rPb").hidden = !r.pb;
        setSaveNote("Saved to your account.");
        renderBell();
      });
    }).catch(function(err){
      setSaveNote("Couldn't save this run: " + err.message);
    });
  }
  function setSaveNote(t){ var n = $("saveNote"); if(n) n.textContent = t; }


  /* ================= RESULTS VIEW ================= */
  function renderResults(r){
    $("rWpm").textContent = r.net;
    $("rAcc").textContent = fmtAcc(r.acc);
    $("rRaw").textContent = r.raw;
    $("rCons").textContent = r.cons === null ? "n/a" : r.cons + "%";
    $("rCons").title = r.cons === null ? "Consistency needs at least 3 seconds of typing." : "How steady your speed was from second to second.";
    $("rErr").textContent = r.bad;
    $("rTime").textContent = fmtDur(r.elapsed);
    $("rPb").hidden = !r.pb;

    drawGraph(r.ps);

    var kv = $("rChars"); kv.textContent = "";
    [["Correct", r.br.cor, false], ["Wrong letter", r.br.inc, true], ["Extra letters", r.br.ext, true], ["Skipped letters", r.br.mis, true],
     ["Keys pressed", r.keys, false]].forEach(function(row){
      kv.appendChild(mk("dt", "", row[0]));
      kv.appendChild(mk("dd", row[2] && row[1] > 0 ? "bad" : "", String(row[1])));
    });

    var keys = $("rKeys"); keys.textContent = "";
    var slipped = Object.keys(r.keyStats).map(function(code){
      var s = r.keyStats[code], n = s.c + s.i;
      return { ch:chOf(code), acc:n ? s.c / n * 100 : 100, miss:s.i };
    }).filter(function(s){ return s.miss > 0 && s.ch.trim(); }).sort(function(a, b){ return b.miss - a.miss || a.acc - b.acc; }).slice(0, 8);
    if(!slipped.length) keys.appendChild(mk("div", "empty", "No slips. Every key landed."));
    slipped.forEach(function(s){
      var c = mk("div", "keychip bad");
      c.appendChild(mk("div", "k", s.ch));
      c.appendChild(mk("div", "a", s.miss + (s.miss === 1 ? " miss" : " misses")));
      keys.appendChild(c);
    });

    var wl = $("rWords"); wl.textContent = "";
    var wm = Object.keys(r.wordMiss).sort(function(a, b){ return r.wordMiss[b] - r.wordMiss[a]; }).slice(0, 6);
    if(!wm.length) wl.appendChild(mk("li", "empty", "No wrong words."));
    wm.forEach(function(k){
      var parts = k.split(">"), li = mk("li");
      li.appendChild(mk("span", "", parts[0] + " → " + parts[1]));
      li.appendChild(mk("span", "x", "×" + r.wordMiss[k]));
      wl.appendChild(li);
    });
    el.testArea.hidden = true; el.results.hidden = false;
    $("practiceBtn").textContent = S.mode === "weak" ? "Practice again" : "Practice weak keys";
    window.scrollTo(0, 0);
  }

  function svgEl(name, attrs){
    var n = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.keys(attrs || {}).forEach(function(k){ n.setAttribute(k, attrs[k]); });
    return n;
  }
  function drawGraph(ps){
    var svg = $("graph"); svg.textContent = "";
    var W = 640, H = 230, L = 40, R = 14, T = 14, B = 30, n = ps.raw.length;
    var maxV = Math.max.apply(null, ps.raw.concat(ps.net).concat([20]));
    var step = maxV > 200 ? 100 : maxV > 100 ? 50 : 20;
    var top = Math.ceil(maxV / step) * step;
    function X(i){ return n === 1 ? (L + W - R) / 2 : L + (W - L - R) * i / (n - 1); }
    function Y(v){ return T + (H - T - B) * (1 - v / top); }
    for(var g = 0; g <= top; g += step){
      svg.appendChild(svgEl("line", { x1:L, x2:W - R, y1:Y(g), y2:Y(g), "class":"grid" }));
      var t = svgEl("text", { x:L - 8, y:Y(g) + 4, "text-anchor":"end" }); t.textContent = g; svg.appendChild(t);
    }
    var every = Math.max(1, Math.ceil(n / 8));
    for(var i = 0; i < n; i++){
      if(i % every === 0 || i === n - 1){
        var xt = svgEl("text", { x:X(i), y:H - 8, "text-anchor":"middle" }); xt.textContent = (i + 1) + "s"; svg.appendChild(xt);
      }
    }
    if(n === 1){
      svg.appendChild(svgEl("circle", { cx:X(0), cy:Y(ps.net[0]), r:4, fill:"var(--accent)" }));
      return;
    }
    function pts(a){ return a.map(function(v, i){ return X(i) + "," + Y(v); }).join(" "); }
    svg.appendChild(svgEl("polyline", { points:pts(ps.raw), "class":"raw" }));
    svg.appendChild(svgEl("polyline", { points:pts(ps.net), "class":"net" }));
    ps.errs.forEach(function(e, i){ if(e) svg.appendChild(svgEl("circle", { cx:X(i), cy:H - B - 8, r:3.5, "class":"errdot" })); });
  }

  /* ================= MODE BAR ================= */
  function renderModeBar(){
    var seg = $("modeSeg").querySelectorAll("button");
    for(var i = 0; i < seg.length; i++) seg[i].setAttribute("aria-pressed", String(seg[i].dataset.mode === S.mode));
    var chips = $("chips"); chips.textContent = "";
    var hint = "";
    function add(list, cur, set, suffix){
      list.forEach(function(v){
        var b = mk("button", "chip", v + suffix); b.type = "button";
        b.setAttribute("aria-pressed", String(v === cur));
        b.addEventListener("click", function(){ set(v); buildTest(); });
        chips.appendChild(b);
      });
    }
    if(S.mode === "time"){ add(TIME_OPTS, S.timeTarget, function(v){ S.timeTarget = v; }, "s"); hint = "Type until the clock runs out."; }
    else if(S.mode === "words"){ add(WORD_OPTS, S.wordsTarget, function(v){ S.wordsTarget = v; }, ""); hint = "Finish every word. No clock."; }
    else if(S.mode === "quote"){ hint = "A short passage with capitals and punctuation."; }
    else { hint = S.weakKeys.length ? "Drilling: " + S.weakKeys.join(", ") : "Finish a few tests and this fills with your weak keys."; }
    $("modeHint").textContent = hint;
  }
  $("modeSeg").addEventListener("click", function(e){
    var b = e.target.closest("button"); if(!b) return;
    S.mode = b.dataset.mode; showView("type"); buildTest();
  });

  /* ================= INPUT ================= */
  function focusInput(){ try{ el.input.focus({ preventScroll:true }); }catch(e){ el.input.focus(); } }
  el.card.addEventListener("mousedown", function(e){ e.preventDefault(); focusInput(); });
  el.card.addEventListener("touchstart", function(){ focusInput(); }, { passive:true });
  el.input.addEventListener("focus", function(){ el.card.classList.add("focused"); });
  el.input.addEventListener("blur", function(){ el.card.classList.remove("focused"); });

  el.input.addEventListener("keydown", function(e){
    if(e.key === "Tab"){ e.preventDefault(); buildTest(); return; }
    if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","Enter","Delete"].indexOf(e.key) !== -1) e.preventDefault();
  });
  ["paste", "drop", "cut"].forEach(function(n){ el.input.addEventListener(n, function(e){ e.preventDefault(); }); });
  el.input.addEventListener("beforeinput", function(e){
    if(e.inputType && /^insertFrom(Paste|Drop)/.test(e.inputType)) e.preventDefault();
  });
  el.input.addEventListener("input", function(){
    if(S.finished){ el.input.value = ""; return; }
    var v = el.input.value, prev = S.typed;
    if(v.length < prev.length && prev.indexOf(v) === 0){
      S.typed = v; paintCurrent(); return;
    }
    if(v.length > prev.length && v.indexOf(prev) === 0){
      var add = v.slice(prev.length);
      for(var i = 0; i < add.length; i++){ typeChar(add[i]); if(S.finished) break; }
    }
    el.input.value = S.typed;
  });
  document.addEventListener("keydown", function(e){
    if(currentView !== "type" || !el.results.hidden) return;
    var t = e.target;
    if(t && (t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && t !== el.input) || t.tagName === "BUTTON")) return;
    if(e.key === "Tab"){ e.preventDefault(); buildTest(); return; }
    if(e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement !== el.input) focusInput();
  });
  $("restartBtn").addEventListener("click", buildTest);
  $("againBtn").addEventListener("click", buildTest);
  $("practiceBtn").addEventListener("click", function(){ S.mode = "weak"; buildTest(); });
  $("shareBtn").addEventListener("click", function(){
    var r = S.last; if(!r) return;
    var where = r.mode === "time" ? r.target + "s" : r.mode === "words" ? r.target + " words" : r.mode;
    showView("community");
    var ta = $("commentText");
    ta.value = "Just typed " + r.net + " wpm at " + fmtAcc(r.acc) + " accuracy (" + where + ").";
    updateCount(); if(!ta.disabled) ta.focus();
  });

  /* ================= VIEWS ================= */
  function showView(name){
    currentView = name;
    el.viewType.hidden = name !== "type";
    el.viewStats.hidden = name !== "stats";
    el.viewCommunity.hidden = name !== "community";
    var nav = $("mainNav").querySelectorAll("button");
    for(var i = 0; i < nav.length; i++){
      if(nav[i].dataset.view === name) nav[i].setAttribute("aria-current", "page"); else nav[i].removeAttribute("aria-current");
    }
    el.viewHost.hidden = name !== "host";
    if(name === "stats") renderStats();
    if(name === "host") renderHost();
    if(name === "type" && el.results.hidden) focusInput();
    closePops();
  }
  $("mainNav").addEventListener("click", function(e){
    var b = e.target.closest("button"); if(b) showView(b.dataset.view);
  });

  /* ================= STATS VIEW ================= */
  function cell(n, l){ var c = mk("div", "cell"); c.appendChild(mk("div", "n", n)); c.appendChild(mk("div", "l", l)); return c; }
  function renderStats(){
    var p = P();
    var ov = $("sOverview"); ov.textContent = "";
    var hist = p.history, last20 = hist.slice(-20);
    var bestWpm = hist.reduce(function(m, h){ return Math.max(m, h.w); }, 0);
    var avg = last20.length ? Math.round(last20.reduce(function(a, h){ return a + h.w; }, 0) / last20.length) : 0;
    ov.appendChild(cell(String(p.tests), "tests completed"));
    ov.appendChild(cell(bestWpm ? String(bestWpm) : "—", "best wpm"));
    ov.appendChild(cell(avg ? String(avg) : "—", "average wpm, last 20"));
    ov.appendChild(cell(p.bestAcc ? fmtAcc(p.bestAcc) : "—", "best accuracy"));
    ov.appendChild(cell(p.ms ? fmtDur(p.ms) : "—", "practice time"));
    var bt = $("sBestTime"); bt.textContent = "";
    TIME_OPTS.forEach(function(t){ var v = p.bests["time_" + t]; bt.appendChild(cell(v !== undefined ? String(v) : "—", t + " seconds")); });
    var bw = $("sBestWords"); bw.textContent = "";
    WORD_OPTS.forEach(function(w){ var v = p.bests["words_" + w]; bw.appendChild(cell(v !== undefined ? String(v) : "—", w + " words")); });

    var bars = $("sBars"); bars.textContent = "";
    if(!last20.length){ bars.appendChild(mk("div", "empty", "Finish a test and it shows up here.")); }
    else {
      var mx = Math.max.apply(null, last20.map(function(h){ return h.w; }).concat([10]));
      last20.forEach(function(h){
        var b = mk("div", "bar"); b.style.height = Math.max(4, Math.round(h.w / mx * 88)) + "px";
        b.title = h.w + " wpm, " + fmtAcc(h.a) + " accuracy, " + (h.m === "time" ? h.n + "s" : h.m);
        b.setAttribute("role", "img"); b.setAttribute("aria-label", b.title);
        bars.appendChild(b);
      });
    }
    var kc = $("sKeys"); kc.textContent = "";
    var keyArr = Object.keys(p.keys).map(function(code){
      var s = p.keys[code], n = s.c + s.i;
      return { ch:chOf(code), n:n, acc:n ? s.c / n * 100 : 100, miss:s.i };
    }).filter(function(s){ return s.n >= 8 && s.miss > 0 && s.ch.trim(); }).sort(function(a, b){ return a.acc - b.acc; }).slice(0, 10);
    if(!keyArr.length) kc.appendChild(mk("div", "empty", "Not enough data yet. Weak keys appear after a few tests."));
    keyArr.forEach(function(s){
      var c = mk("div", "keychip" + (s.acc < 90 ? " bad" : ""));
      c.appendChild(mk("div", "k", s.ch)); c.appendChild(mk("div", "a", fmtAcc(s.acc)));
      kc.appendChild(c);
    });
    var pl = $("sPairs"); pl.textContent = "";
    var pk = Object.keys(p.pairs).sort(function(a, b){ return p.pairs[b] - p.pairs[a]; }).slice(0, 6);
    if(!pk.length) pl.appendChild(mk("li", "empty", "None recorded."));
    pk.forEach(function(k){
      var parts = k.split("_"), li = mk("li");
      li.appendChild(mk("span", "", "typed " + chOf(parts[1]) + " instead of " + chOf(parts[0])));
      li.appendChild(mk("span", "x", "×" + p.pairs[k])); pl.appendChild(li);
    });
    var wl = $("sWords"); wl.textContent = "";
    var wk = Object.keys(p.words).sort(function(a, b){ return p.words[b] - p.words[a]; }).slice(0, 6);
    if(!wk.length) wl.appendChild(mk("li", "empty", "None recorded."));
    wk.forEach(function(k){
      var parts = k.split(">"), li = mk("li");
      li.appendChild(mk("span", "", parts[0] + " → " + parts[1]));
      li.appendChild(mk("span", "x", "×" + p.words[k])); wl.appendChild(li);
    });
    renderStorageNote(); renderHistory();
  }
  function renderStorageNote(){
    $("storageNote").textContent = Store.cloud ? "Saved to your account." : "Saved on this device only. Create an account to keep it across devices.";
  }
  var resetArmed = false, resetTimer = null;
  $("resetBtn").addEventListener("click", function(){
    var b = $("resetBtn");
    if(!resetArmed){
      resetArmed = true; b.textContent = "Click again to erase all stats";
      resetTimer = setTimeout(function(){ resetArmed = false; b.textContent = "Reset my stats"; }, 4000);
      return;
    }
    clearTimeout(resetTimer); resetArmed = false; b.textContent = "Reset my stats";
    if(Store.cloud){
      api("DELETE", "/api/profile").then(loadServerProfile).then(function(){ renderStats(); renderBell(); }).catch(function(e){ $("storageNote").textContent = e.message; });
    } else { Store.profile = guestProfile = emptyProfile(); persist(); renderStats(); renderBell(); }
  });


  /* ================= POPOVERS ================= */
  var pops = [["bellBtn", "bellPop"], ["acctBtn", "acctPop"]];
  function closePops(except){
    pops.forEach(function(p){
      if(p[1] === except) return;
      var pop = $(p[1]);
      if(!pop.hidden){ pop.hidden = true; $(p[0]).setAttribute("aria-expanded", "false"); if(p[1] === "bellPop") markRead(); }
    });
  }
  function togglePop(btnId, popId, onOpen){
    var pop = $(popId), open = pop.hidden;
    closePops(popId);
    pop.hidden = !open; $(btnId).setAttribute("aria-expanded", String(open));
    if(open && onOpen) onOpen();
    if(!open && popId === "bellPop") markRead();
  }
  document.addEventListener("click", function(e){
    var path = e.composedPath ? e.composedPath() : []; // the clicked node may already be re-rendered away
    var inside = path.some(function(n){ return n.classList && n.classList.contains("pop-wrap"); });
    if(!inside) closePops();
  });
  document.addEventListener("keydown", function(e){ if(e.key === "Escape") closePops(); });

  /* ================= ACCOUNT, UPDATES, COMMENTS ================= */
  var Auth = { user:null, mode:"login", busy:false, err:"", info:"", email:"" };
  var Updates = { list:[] };
  var Comments = { items:[], err:null, posting:false };
  var Hist = { rows:[], total:0, loading:false };

  function signedIn(){ return !!Auth.user; }
  function isHost(){ return !!(Auth.user && Auth.user.role === "host"); }

  function loadServerProfile(){
    return api("GET", "/api/profile").then(function(p){ Store.profile = normalize(p); Store.cloud = true; });
  }
  function loadUpdates(){
    return api("GET", "/api/updates").then(function(d){ Updates.list = d.updates || []; renderUpdates(); renderBell(); }).catch(function(){});
  }
  function loadComments(){
    return api("GET", "/api/comments").then(function(d){ Comments.items = d.comments || []; Comments.err = null; renderComments(); })
      .catch(function(e){ Comments.err = e; renderComments(); });
  }

  async function afterAuthChange(){
    if(signedIn()){
      try{ await loadServerProfile(); }catch(e){ Store.cloud = false; Store.profile = guestProfile; }
    } else { Store.cloud = false; Store.profile = guestProfile; Hist.rows = []; Hist.total = 0; }
    $("navHost").hidden = !isHost();
    if(!isHost() && currentView === "host") showView("type");
    renderAccount(); renderCommunity(); renderBell(); renderStorageNote();
    $("footNote").textContent = signedIn() ? "Your typing history is saved to your account." : "Your stats stay on this device until you sign up.";
    if(currentView === "stats") renderStats();
    loadComments(); loadUpdates();
  }
  async function initAuth(){
    try{ var d = await api("GET", "/api/auth/me"); Auth.user = d.user; }catch(e){ Auth.user = null; }
    await afterAuthChange();
  }

  /* ---- account popover: sign in / sign up form ---- */
  function renderAccount(){
    $("acctLabel").textContent = signedIn() ? Auth.user.name.split(" ")[0] : "Sign in";
    renderAcctPop();
  }
  function field(id, label, type, ac){
    var w = mk("div", "field"), l = mk("label", "", label); l.setAttribute("for", id);
    var i = document.createElement("input"); i.id = id; i.type = type; i.autocomplete = ac; i.required = true;
    w.appendChild(l); w.appendChild(i); return w;
  }
  function renderAcctPop(){
    var pop = $("acctPop"); pop.textContent = "";
    if(signedIn()){
      pop.appendChild(mk("h4", "", Auth.user.name + (isHost() ? " · host" : "")));
      pop.appendChild(mk("p", "", Auth.user.email));
      pop.appendChild(mk("p", "", "Every finished test is saved to your account, so your history follows you across devices."));
      var row = mk("div", "row");
      var out = mk("button", "btn small", "Sign out"); out.type = "button";
      out.addEventListener("click", signOut);
      var hist = mk("button", "btn small", "My history"); hist.type = "button";
      hist.addEventListener("click", function(){ showView("stats"); var h = $("historyPanel"); if(h) h.scrollIntoView(); });
      row.appendChild(hist); row.appendChild(out); pop.appendChild(row);
      return;
    }
    var m = Auth.mode;
    if(m === "login" || m === "signup"){
      var tabs = mk("div", "seg authtabs");
      ["login", "signup"].forEach(function(t){
        var b = mk("button", "", t === "login" ? "Sign in" : "Create account"); b.type = "button";
        b.setAttribute("aria-pressed", String(m === t));
        b.addEventListener("click", function(){ Auth.mode = t; Auth.err = ""; renderAcctPop(); });
        tabs.appendChild(b);
      });
      pop.appendChild(tabs);
    } else {
      pop.appendChild(mk("h4", "", m === "verify" ? "Check your email" : m === "forgot" ? "Reset your password" : "Choose a new password"));
    }
    var form = document.createElement("form"); form.className = "authform";
    if(m === "signup") form.appendChild(field("fName", "Name", "text", "name"));
    if(m === "login" || m === "signup" || m === "forgot") form.appendChild(field("fEmail", "Email", "email", "email"));
    if(m === "login" || m === "signup") form.appendChild(field("fPass", m === "signup" ? "Choose a password (8+ characters)" : "Password", "password", m === "signup" ? "new-password" : "current-password"));
    if(m === "verify" || m === "reset"){
      pop.appendChild(mk("p", "", Auth.info || ("We sent a 6-digit code to " + Auth.email + ".")));
      var c = field("fCode", "6-digit code", "text", "one-time-code"); c.querySelector("input").inputMode = "numeric"; c.querySelector("input").maxLength = 6; c.querySelector("input").pattern = "[0-9]{6}";
      form.appendChild(c);
    }
    if(m === "reset") form.appendChild(field("fPass", "New password (8+ characters)", "password", "new-password"));
    if(Auth.err) form.appendChild(mk("div", "err-text", Auth.err));
    var label = { login:"Sign in", signup:"Email me a code", verify:"Verify and create account", forgot:"Email me a code", reset:"Set password and sign in" }[m];
    var go = mk("button", "btn primary", Auth.busy ? "Please wait..." : label); go.type = "submit"; go.disabled = Auth.busy;
    form.appendChild(go);
    form.addEventListener("submit", function(e){ e.preventDefault(); submitAuth(); });
    pop.appendChild(form);
    var links = mk("div", "row authlinks");
    function link(text, fn){ var b = mk("button", "link-btn", text); b.type = "button"; b.addEventListener("click", fn); links.appendChild(b); }
    if(m === "login") link("Forgot password?", function(){ Auth.mode = "forgot"; Auth.err = ""; Auth.info = ""; renderAcctPop(); });
    if(m === "verify") link("Send a new code", resendCode);
    if(m === "verify" || m === "forgot" || m === "reset") link("Back", function(){ Auth.mode = "login"; Auth.err = ""; Auth.info = ""; renderAcctPop(); });
    if(links.childNodes.length) pop.appendChild(links);
    if(m === "signup") pop.appendChild(mk("p", "fineprint", "We email you a code to confirm the address. Your history, badges and notifications are saved to your account."));
    if(m === "login") pop.appendChild(mk("p", "fineprint", "Not signed in? You can still type. Stats stay in this browser until you create an account."));
    var f = pop.querySelector("input"); if(f && !pop.hidden) setTimeout(function(){ f.focus(); }, 0);
  }
  function devNote(res){ return res && res.dev ? " (No email server is set up on this copy, so the code is printed in the server terminal.)" : ""; }
  async function submitAuth(){
    var m = Auth.mode;
    Auth.busy = true; Auth.err = ""; var snapshot = {};
    ["fName", "fEmail", "fPass", "fCode"].forEach(function(id){ var n = $(id); if(n) snapshot[id] = n.value; });
    renderAcctPop();
    try{
      if(m === "login"){
        var d = await api("POST", "/api/auth/login", { email:snapshot.fEmail, password:snapshot.fPass });
        Auth.user = d.user; Auth.busy = false; await afterAuthChange(); closePops(); return;
      }
      if(m === "signup"){
        var r = await api("POST", "/api/auth/signup", { name:snapshot.fName, email:snapshot.fEmail, password:snapshot.fPass });
        Auth.email = r.email; Auth.mode = "verify"; Auth.info = "We sent a 6-digit code to " + r.email + ". It expires in 10 minutes." + devNote(r);
      } else if(m === "verify"){
        var v = await api("POST", "/api/auth/verify", { email:Auth.email, code:snapshot.fCode });
        Auth.user = v.user; Auth.busy = false; Auth.mode = "login"; Auth.info = ""; await afterAuthChange(); closePops(); return;
      } else if(m === "forgot"){
        await api("POST", "/api/auth/forgot", { email:snapshot.fEmail });
        Auth.email = (snapshot.fEmail || "").trim().toLowerCase(); Auth.mode = "reset";
        Auth.info = "If " + Auth.email + " has an account, we sent it a 6-digit code.";
      } else if(m === "reset"){
        var x = await api("POST", "/api/auth/reset", { email:Auth.email, code:snapshot.fCode, password:snapshot.fPass });
        Auth.user = x.user; Auth.busy = false; Auth.mode = "login"; Auth.info = ""; await afterAuthChange(); closePops(); return;
      }
      Auth.busy = false; renderAcctPop();
    }catch(e){ Auth.busy = false; Auth.err = e.message; renderAcctPop(); }
  }
  async function resendCode(){
    Auth.err = "";
    try{ var r = await api("POST", "/api/auth/resend", { email:Auth.email }); Auth.info = "A new code is on its way to " + Auth.email + "." + devNote(r); }
    catch(e){ Auth.err = e.message; }
    renderAcctPop();
  }
  async function signOut(){
    try{ await api("POST", "/api/auth/logout", {}); }catch(e){}
    Auth.user = null; Auth.mode = "login";
    await afterAuthChange(); closePops();
  }
  $("acctBtn").addEventListener("click", function(){ togglePop("acctBtn", "acctPop"); });

  /* ---- typing history table (signed in) ---- */
  function loadHistory(reset){
    if(!signedIn() || Hist.loading) return Promise.resolve();
    if(reset){ Hist.rows = []; Hist.total = 0; }
    Hist.loading = true;
    return api("GET", "/api/tests?limit=25&offset=" + Hist.rows.length).then(function(d){
      Hist.rows = Hist.rows.concat(d.tests); Hist.total = d.total;
    }).catch(function(){}).then(function(){ Hist.loading = false; drawHistory(); });
  }
  function renderHistory(){
    var panel = $("historyPanel");
    panel.hidden = !signedIn();
    if(signedIn()) loadHistory(true);
  }
  function modeLabel(h){ return h.m === "time" ? h.n + "s" : h.m === "words" ? h.n + " words" : h.m === "quote" ? "quote" : "weak keys"; }
  function drawHistory(){
    var box = $("historyBody"); box.textContent = "";
    $("historyCount").textContent = Hist.total ? Hist.total + " tests saved" : "";
    if(!Hist.rows.length){ box.appendChild(mk("tr")).appendChild(mk("td", "empty", "No saved tests yet. Finish a test and it appears here.")).colSpan = 6; $("historyMore").hidden = true; return; }
    Hist.rows.forEach(function(h){
      var tr = mk("tr");
      [new Date(h.t).toLocaleString([], { dateStyle:"medium", timeStyle:"short" }), modeLabel(h), String(h.w), String(h.r), fmtAcc(h.a), h.c === null ? "n/a" : h.c + "%"].forEach(function(v, i){
        var td = mk("td", i > 1 ? "num" : "", v); tr.appendChild(td);
      });
      box.appendChild(tr);
    });
    $("historyMore").hidden = Hist.rows.length >= Hist.total;
  }
  $("historyMore").addEventListener("click", function(){ loadHistory(false); });

  /* ---- host dashboard ---- */
  function renderHost(){
    if(!isHost()) return;
    var ov = $("hOverview"); ov.textContent = "";
    api("GET", "/api/admin/overview").then(function(o){
      ov.appendChild(cell(String(o.users), "members"));
      ov.appendChild(cell(String(o.newUsers7d), "new this week"));
      ov.appendChild(cell(String(o.tests), "tests saved"));
      ov.appendChild(cell(String(o.tests7d), "tests this week"));
      ov.appendChild(cell(String(o.comments), "comments"));
      ov.appendChild(cell(String(o.topWpm), "top wpm"));
    }).catch(function(){});
    var body = $("hUsers"); body.textContent = "";
    $("hDetail").hidden = true;
    api("GET", "/api/admin/users").then(function(d){
      d.users.forEach(function(u){
        var tr = mk("tr");
        tr.appendChild(mk("td", "", u.name + (u.role === "host" ? " (host)" : "")));
        tr.appendChild(mk("td", "", u.email));
        tr.appendChild(mk("td", "num", String(u.tests)));
        tr.appendChild(mk("td", "num", u.bestWpm ? String(u.bestWpm) : "—"));
        tr.appendChild(mk("td", "", u.lastTest ? rel(u.lastTest) : "never"));
        var act = mk("td", "acts");
        var v = mk("button", "link-btn", "History"); v.type = "button";
        v.addEventListener("click", function(){ showMemberHistory(u); });
        act.appendChild(v);
        if(u.role !== "host"){
          var del = mk("button", "link-btn", "Remove"); del.type = "button";
          del.addEventListener("click", function(){
            if(del.dataset.armed){ api("DELETE", "/api/admin/users/" + u.id).then(renderHost).catch(function(e){ alert(e.message); }); return; }
            del.dataset.armed = "1"; del.textContent = "Click to confirm";
          });
          act.appendChild(document.createTextNode(" ")); act.appendChild(del);
        }
        tr.appendChild(act); body.appendChild(tr);
      });
    }).catch(function(){});
  }
  function showMemberHistory(u){
    $("hDetail").hidden = false;
    $("hDetailTitle").textContent = u.name + "'s recent tests";
    var b = $("hDetailBody"); b.textContent = "";
    api("GET", "/api/admin/users/" + u.id + "/tests?limit=30").then(function(d){
      if(!d.tests.length){ var tr = mk("tr"); var td = mk("td", "empty", "No tests yet."); td.colSpan = 6; tr.appendChild(td); b.appendChild(tr); return; }
      d.tests.forEach(function(h){
        var tr = mk("tr");
        [new Date(h.t).toLocaleString([], { dateStyle:"medium", timeStyle:"short" }), modeLabel(h), String(h.w), String(h.r), fmtAcc(h.a), h.c === null ? "n/a" : h.c + "%"].forEach(function(v, i){ tr.appendChild(mk("td", i > 1 ? "num" : "", v)); });
        b.appendChild(tr);
      });
    }).catch(function(){});
  }

  /* ---- notifications ---- */
  var seenAtOpen = 0;
  function unreadCount(){
    var p = P(), n = 0;
    p.notifs.forEach(function(x){ if(!x.read) n++; });
    if(signedIn()) Updates.list.forEach(function(u){ if(u.ts > p.seen) n++; });
    return n;
  }
  function renderBell(){
    var n = unreadCount(), b = $("bellBadge");
    b.hidden = n === 0; b.textContent = n > 9 ? "9+" : String(n);
    if(!$("bellPop").hidden) renderBellPop();
  }
  function renderBellPop(){
    var pop = $("bellPop"); pop.textContent = "";
    var p = P(), items = [];
    if(signedIn()) Updates.list.forEach(function(u){ items.push({ t:u.ts, title:u.title, body:u.body, unread:u.ts > seenAtOpen, kind:"Update" }); });
    p.notifs.forEach(function(x){ items.push({ t:x.t, title:"", body:x.x, unread:!x.read, kind:"" }); });
    items.sort(function(a, b){ return b.t - a.t; });
    pop.appendChild(mk("h4", "", "Notifications"));
    if(!signedIn()) pop.appendChild(mk("p", "", "Create an account to get product updates from Taped. Badges and personal bests show up here either way."));
    if(!items.length){ pop.appendChild(mk("p", "", "Nothing yet. Finish a test and your badges and personal bests land here.")); return; }
    items.slice(0, 20).forEach(function(it){
      var row = mk("div", "pop-item");
      var head = mk("div", "t");
      if(it.unread) head.appendChild(mk("span", "unread-dot"));
      head.appendChild(document.createTextNode(it.title || it.body));
      row.appendChild(head);
      if(it.title && it.body) row.appendChild(mk("div", "b", it.body));
      row.appendChild(mk("div", "w", (it.kind ? it.kind + " · " : "") + rel(it.t)));
      pop.appendChild(row);
    });
  }
  function markRead(){
    var p = P(), changed = false;
    p.notifs.forEach(function(x){ if(!x.read){ x.read = true; changed = true; } });
    if(signedIn()){
      var newest = Updates.list.reduce(function(m, u){ return Math.max(m, u.ts); }, 0);
      if(newest > p.seen){ p.seen = newest; changed = true; }
      if(changed){ renderBell(); api("POST", "/api/notifications/read", {}).catch(function(){}); }
    } else if(changed){ persist(); renderBell(); }
  }
  $("bellBtn").addEventListener("click", function(){
    seenAtOpen = P().seen;
    togglePop("bellBtn", "bellPop", renderBellPop);
  });

  /* ---- comments: everyone reads, signed-in members post ---- */
  function updateCount(){ $("commentCount").textContent = $("commentText").value.length + "/500"; }
  $("commentText").addEventListener("input", updateCount);

  function renderCommunity(){
    var notice = $("composerNotice"); notice.textContent = "";
    var ta = $("commentText"), btn = $("commentBtn");
    if(!signedIn()){
      var n = mk("div", "notice", "Anyone can read the comments. To post one, ");
      var a = mk("button", "link-btn", "create an account or sign in"); a.type = "button";
      a.addEventListener("click", function(){ Auth.mode = "signup"; renderAcctPop(); togglePop("acctBtn", "acctPop"); });
      n.appendChild(a); n.appendChild(document.createTextNode(".")); notice.appendChild(n);
    }
    ta.disabled = !signedIn(); btn.disabled = !signedIn() || Comments.posting;
    ta.placeholder = signedIn() ? "Write a comment" : "Sign in to comment";
    renderComments(); renderUpdates();
  }
  function renderComments(){
    var list = $("commentList"); list.textContent = "";
    if(Comments.err){ list.appendChild(mk("li", "empty", "Comments couldn't load. Reload the page to try again.")); return; }
    if(!Comments.items.length){ list.appendChild(mk("li", "empty", "No comments yet. Be the first to share how a run went.")); return; }
    Comments.items.forEach(function(c){
      var li = mk("li", "comment");
      li.appendChild(mk("div", "avatar", (c.name || "?").charAt(0).toUpperCase()));
      var body = mk("div");
      var who = mk("div", "who", signedIn() && c.uid === Auth.user.id ? "You" : c.name);
      if(c.host) who.appendChild(mk("span", "hostbadge", "host"));
      who.appendChild(mk("span", "when", rel(c.t)));
      body.appendChild(who);
      body.appendChild(mk("div", "txt", c.body));
      if(signedIn() && (c.uid === Auth.user.id || isHost())){
        var acts = mk("div", "acts"), del = mk("button", "link-btn", "Delete"); del.type = "button";
        del.addEventListener("click", function(){
          api("DELETE", "/api/comments/" + c.id).then(loadComments).catch(function(e){ var eb = $("commentErr"); eb.textContent = e.message; eb.hidden = false; });
        });
        acts.appendChild(del); body.appendChild(acts);
      }
      li.appendChild(body); list.appendChild(li);
    });
  }
  async function postComment(){
    var ta = $("commentText"), errBox = $("commentErr");
    var text = ta.value.trim();
    errBox.hidden = true;
    if(!text || !signedIn() || Comments.posting) return;
    Comments.posting = true; $("commentBtn").disabled = true;
    try{
      await api("POST", "/api/comments", { body:text });
      ta.value = ""; updateCount(); await loadComments();
    }catch(e){ errBox.textContent = e.message; errBox.hidden = false; }
    Comments.posting = false; $("commentBtn").disabled = !signedIn();
  }
  $("commentBtn").addEventListener("click", postComment);

  /* ---- updates: posted by the host ---- */
  function renderUpdates(){
    var box = $("updatesBox"); box.textContent = "";
    $("updateComposer").hidden = !isHost();
    if(!Updates.list.length){ box.appendChild(mk("div", "empty", "No updates yet.")); return; }
    Updates.list.forEach(function(u){
      var d = mk("div", "update");
      d.appendChild(mk("div", "t", u.title));
      if(u.body) d.appendChild(mk("div", "b", u.body));
      var w = mk("div", "w", rel(u.ts));
      if(isHost()){
        w.appendChild(document.createTextNode(" · "));
        var del = mk("button", "link-btn", "Delete"); del.type = "button";
        del.addEventListener("click", function(){ api("DELETE", "/api/updates/" + u.id).then(loadUpdates).catch(function(){}); });
        w.appendChild(del);
      }
      d.appendChild(w); box.appendChild(d);
    });
  }
  $("updBtn").addEventListener("click", async function(){
    var t = $("updTitle").value.trim(), b = $("updBody").value.trim();
    if(!t || !isHost()) return;
    $("updBtn").disabled = true;
    try{ await api("POST", "/api/updates", { title:t, body:b }); $("updTitle").value = ""; $("updBody").value = ""; await loadUpdates(); }catch(e){}
    $("updBtn").disabled = false;
  });

  /* ================= INIT ================= */
  buildTest();
  renderAccount(); renderCommunity(); renderBell();
  initAuth();
  window.addEventListener("load", function(){ if(currentView === "type") focusInput(); });
})();
