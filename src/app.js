/**
 * app.js — 控制层：状态、渲染、可访问性
 * 只消费 PWD_DETECTOR.detect() 的返回值，不包含任何评分逻辑
 */
(function () {
  'use strict';

  var D = window.PWD_DETECTOR;
  if (!D) return;

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    pwd: $('pwd'),
    toggle: $('toggle'),
    clear: $('clear'),
    fill: $('fill'),
    level: $('level'),
    score: $('score'),
    hint: $('meter-hint'),
    result: $('result'),
    issues: $('issues'),
    suggestions: $('suggestions'),
    breakdown: $('breakdown'),
    entropyNote: $('entropy-note'),
    copy: $('copy'),
    copied: $('copied'),
    live: $('live'),
    username: $('username'),
    email: $('email')
  };

  var lastResult = null;
  var lastLevel = null;
  var timer = null;

  function resetMeter() {
    els.fill.style.width = '0%';
    els.fill.style.backgroundColor = '#c9ced6';
    els.level.textContent = '等待输入';
    els.level.style.color = 'var(--text-mute)';
    els.score.textContent = '— / 100';
    els.hint.textContent = '建议使用 12 位以上、混合多种字符的密码';
    els.result.hidden = true;
    lastResult = null;
    var bar = document.getElementById('meter');
    if (bar) bar.setAttribute('aria-valuenow', '0');
  }

  function renderMeter(r) {
    els.fill.style.width = r.score + '%';
    els.fill.style.backgroundColor = r.levelColor;
    els.level.textContent = r.levelLabel;
    els.level.style.color = r.levelColor;
    els.score.textContent = r.score + ' / 100';
    els.hint.textContent = r.levelHint;
    var bar = document.getElementById('meter');
    if (bar) bar.setAttribute('aria-valuenow', String(r.score));
  }

  function renderIssues(r) {
    els.issues.innerHTML = '';
    if (!r.issues.length) {
      var ok = document.createElement('li');
      ok.className = 'ok';
      ok.textContent = '未发现明显问题';
      els.issues.appendChild(ok);
      return;
    }
    r.issues.forEach(function (it) {
      var li = document.createElement('li');
      li.className = 'sev-' + it.severity;
      li.textContent = it.message;
      els.issues.appendChild(li);
    });
  }

  function renderSuggestions(r) {
    els.suggestions.innerHTML = '';
    r.suggestions.forEach(function (s) {
      var li = document.createElement('li');
      li.textContent = s;
      els.suggestions.appendChild(li);
    });
  }

  function cell(tr, text, cls) {
    var td = document.createElement('td');
    td.textContent = text;
    if (cls) td.className = cls;
    tr.appendChild(td);
  }

  function renderBreakdown(r) {
    var b = r.breakdown;
    els.breakdown.innerHTML = '';
    var rows = [
      ['长度分（' + r.length + ' 位，上限 20 位）', '+' + b.length],
      ['多样性分（' + r.charsetCount + ' 类字符）', '+' + b.diversity],
      ['结构分散分（' + r.transitions + ' 次类别切换）', '+' + b.structure],
      ['熵加成（H = ' + r.entropy + ' bit）', '+' + b.entropyBonus],
      ['模式与字典扣分', (b.penalty === 0 ? '0' : String(b.penalty))]
    ];
    rows.forEach(function (row, i) {
      var tr = document.createElement('tr');
      cell(tr, row[0]);
      cell(tr, row[1], i === rows.length - 1 && b.penalty < 0 ? 'neg' : '');
      els.breakdown.appendChild(tr);
    });

    var note = '字符池 ' + r.pool + ' 种 · 去重字符 ' + r.unique + ' 个 · 熵约 ' +
      r.entropy + ' bit（每增加 1 bit，攻击者的尝试次数翻一倍）';
    if (r.vetoed) {
      note += ' · 命中高危弱口令，已锁定为极弱';
    }
    if (r.truncated) {
      note += ' · 输入超过 128 位，仅检测前 128 位';
    }
    els.entropyNote.textContent = note;
  }

  function render() {
    var pwd = els.pwd.value;
    if (!pwd) {
      resetMeter();
      if (lastLevel !== null) {
        els.live.textContent = '已清空';
        lastLevel = null;
      }
      return;
    }

    var r = D.detect(pwd, {
      username: els.username.value,
      email: els.email.value
    });

    lastResult = r;
    renderMeter(r);
    renderIssues(r);
    renderSuggestions(r);
    renderBreakdown(r);
    els.result.hidden = false;

    if (r.level !== lastLevel) {
      els.live.textContent = '强度：' + r.levelLabel + '，评分 ' + r.score + ' 分';
      lastLevel = r.level;
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(render, 80);
  }

  function setPwd(value) {
    els.pwd.value = value;
    render();
  }

  /* ---------- 事件 ---------- */
  els.pwd.addEventListener('input', schedule);
  els.username.addEventListener('input', schedule);
  els.email.addEventListener('input', schedule);

  els.toggle.addEventListener('click', function () {
    var show = els.pwd.type === 'password';
    els.pwd.type = show ? 'text' : 'password';
    els.toggle.textContent = show ? '隐藏' : '显示';
    els.toggle.setAttribute('aria-pressed', show ? 'true' : 'false');
  });

  els.clear.addEventListener('click', function () {
    els.pwd.value = '';
    els.username.value = '';
    els.email.value = '';
    els.pwd.type = 'password';
    els.toggle.textContent = '显示';
    els.toggle.setAttribute('aria-pressed', 'false');
    els.pwd.focus();
    render();
  });

  Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (btn) {
    btn.addEventListener('click', function () {
      setPwd(btn.getAttribute('data-pwd'));
      els.pwd.focus();
    });
  });

  els.copy.addEventListener('click', function () {
    if (!lastResult) return;
    var r = lastResult;
    var lines = [
      '密码强度：' + r.levelLabel + '（' + r.score + '/100）',
      '长度：' + r.length + ' 位 · 字符类别：' + r.charsetCount + ' 类 · 熵：' + r.entropy + ' bit',
      '问题：' + (r.issues.length ? r.issues.map(function (i) { return i.message; }).join('；') : '未发现明显问题'),
      '建议：' + r.suggestions.join('；')
    ];
    var text = lines.join('\n');
    els.copied.hidden = true;

    function done() {
      els.copied.hidden = false;
      setTimeout(function () { els.copied.hidden = true; }, 1600);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {});
    }
    els.live.textContent = '检测结果已复制，内容不含密码本身';
  });

  resetMeter();
})();
