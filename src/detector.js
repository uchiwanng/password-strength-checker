/**
 * detector.js — 核心算法层（纯函数，不接触 DOM）
 * detect(password, options) -> 结果对象，见 README「接口」一节
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./rules.js'));
  } else {
    root.PWD_DETECTOR = factory(root.PWD_RULES);
  }
})(typeof self !== 'undefined' ? self : this, function (RULES) {
  'use strict';

  var MAX_LEN = RULES.MAX_LEN;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function levelOf(score) {
    for (var i = 0; i < RULES.LEVELS.length; i++) {
      if (score >= RULES.LEVELS[i].min) return RULES.LEVELS[i];
    }
    return RULES.LEVELS[RULES.LEVELS.length - 1];
  }

  /** 字符类别 */
  function classify(ch) {
    var cp = ch.codePointAt(0);
    if (ch >= 'a' && ch <= 'z') return 'lower';
    if (ch >= 'A' && ch <= 'Z') return 'upper';
    if (ch >= '0' && ch <= '9') return 'digit';
    if (cp > 127) return 'other';
    return 'symbol';
  }

  /** 骨架串：小写 + leetspeak 还原，用于字典与相似度比较 */
  function skeleton(str, oneAs) {
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      var low = ch.toLowerCase();
      if (low === '1' && oneAs) {
        out += oneAs;
      } else if (RULES.LEET[low]) {
        out += RULES.LEET[low];
      } else {
        out += low;
      }
    }
    return out;
  }

  /** 精确查字典 */
  function lookupExact(sk) {
    if (!sk || sk.length < 3) return null;
    var idx = RULES.WEAK_INDEX.get(sk);
    if (idx === undefined) return null;
    return { word: sk, index: idx, exact: true };
  }

  /**
   * 字典查询：先精确命中；再剥离结尾 1~4 位数字/符号后命中，
   * 用于识别 password123 / admin2026 一类"词 + 后缀"的变形。
   * 只剥离数字和符号——剥字母会把 aaaaaa 之类的重复串误判成字典词。
   */
  function lookupDict(lower, skFn) {
    var hit = lookupExact(skFn(lower));
    if (hit) return hit;
    for (var cut = 1; cut <= 4; cut++) {
      var idx = lower.length - cut;
      if (idx < 3) break;
      var ch = lower.charAt(idx);
      if (!/[0-9\W_]/.test(ch)) break;
      var base = lower.slice(0, idx);
      var h = lookupExact(skFn(base));
      if (h) return { word: h.word, index: h.index, exact: false };
    }
    return null;
  }

  /** 连续重复：同字符连续 >= 3，或整串按周期重复 */
  function detectRepeat(chars) {
    var run = 1;
    var maxRun = { ch: chars[0], n: 1 };
    for (var i = 1; i < chars.length; i++) {
      if (chars[i] === chars[i - 1]) {
        run++;
        if (run > maxRun.n) maxRun = { ch: chars[i], n: run };
      } else {
        run = 1;
      }
    }
    if (maxRun.n >= 3) {
      return { type: 'run', char: maxRun.ch, count: maxRun.n };
    }
    var len = chars.length;
    if (len >= 6) {
      for (var p = 1; p <= len / 2; p++) {
        if (len % p !== 0) continue;
        var ok = true;
        for (var j = p; j < len; j++) {
          if (chars[j] !== chars[j - p]) { ok = false; break; }
        }
        if (ok) {
          return { type: 'period', unit: chars.slice(0, p).join(''), times: len / p };
        }
      }
    }
    return null;
  }

  /** 键盘序列（含反向），min 位起 */
  function detectKeyboard(lower, min) {
    for (var r = 0; r < RULES.KEYBOARD_ROWS.length; r++) {
      var row = RULES.KEYBOARD_ROWS[r];
      var rev = row.split('').reverse().join('');
      var variants = [row, rev];
      for (var v = 0; v < variants.length; v++) {
        var s = variants[v];
        for (var i = 0; i + min <= s.length; i++) {
          var seg = s.slice(i, i + min);
          if (lower.indexOf(seg) !== -1) return seg;
        }
      }
    }
    return null;
  }

  /** 连续递增/递减（相邻码点差恒为 ±1），返回命中的片段 */
  function detectSequence(chars, min) {
    var dir = 0;
    var start = 0;
    for (var i = 1; i < chars.length; i++) {
      var d = chars[i].codePointAt(0) - chars[i - 1].codePointAt(0);
      if (d === 1 || d === -1) {
        if (dir !== d) {
          dir = d;
          start = i - 1;
        }
        if (i - start + 1 >= min) {
          return chars.slice(start, i + 1).join('');
        }
      } else {
        dir = 0;
        start = i;
      }
    }
    return null;
  }

  /** 日期 / 年份 */
  function detectDate(pwd) {
    var m = pwd.match(/(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])/);
    if (m) return m[0];
    m = pwd.match(/(?:0[1-9]|[12]\d|3[01])(?:0[1-9]|1[0-2])(?:19|20)\d{2}/);
    if (m) return m[0];
    m = pwd.match(/(?:19|20)\d{2}/);
    if (m) return m[0];
    return null;
  }

  /** Levenshtein 距离（超长输入截断，保证性能） */
  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    a = a.slice(0, 40);
    b = b.slice(0, 40);
    var prev = [];
    var i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      var cur = [i];
      for (j = 1; j <= b.length; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function emptyResult(truncated) {
    return {
      score: 0,
      level: null,
      levelLabel: '',
      entropy: 0,
      length: 0,
      charsetCount: 0,
      pool: 0,
      unique: 0,
      transitions: 0,
      truncated: !!truncated,
      breakdown: { length: 0, diversity: 0, structure: 0, entropyBonus: 0, penalty: 0 },
      issues: [],
      suggestions: [],
      weakWord: null,
      vetoed: false
    };
  }

  function detect(password, options) {
    options = options || {};
    var raw = typeof password === 'string' ? password : '';
    var truncated = raw.length > MAX_LEN;
    var pwd = truncated ? raw.slice(0, MAX_LEN) : raw;
    var chars = Array.from(pwd);
    var len = chars.length;
    if (len === 0) return emptyResult(truncated);

    var W = RULES.WEIGHTS;
    var P = RULES.PENALTIES;

    /* ---------- 步骤 1/2：字符集分析 ---------- */
    var counts = { lower: 0, upper: 0, digit: 0, symbol: 0, other: 0 };
    var classes = [];
    for (var i = 0; i < len; i++) {
      var cls = classify(chars[i]);
      counts[cls]++;
      classes.push(cls);
    }
    var charsetCount = 0;
    ['lower', 'upper', 'digit', 'symbol', 'other'].forEach(function (k) {
      if (counts[k] > 0) charsetCount++;
    });

    var transitions = 0;
    for (var t = 1; t < classes.length; t++) {
      if (classes[t] !== classes[t - 1]) transitions++;
    }

    var unique = new Set(chars).size;
    var pool = 26 * (counts.lower ? 1 : 0) + 26 * (counts.upper ? 1 : 0) +
      10 * (counts.digit ? 1 : 0) + 32 * (counts.symbol ? 1 : 0) +
      100 * (counts.other ? 1 : 0);
    if (pool < 1) pool = 1;

    /* ---------- 步骤 3：字典匹配 ---------- */
    var lower = pwd.toLowerCase();
    var skL = function (s) { return skeleton(s, 'l'); };
    var dict = lookupDict(lower, skL);
    if (!dict) dict = lookupDict(lower, function (s) { return skeleton(s, 'i'); });
    var sk = skL(pwd);
    var vetoed = !!(dict && dict.index < RULES.HIGH_RISK_COUNT);

    /* ---------- 步骤 4：模式检测 ---------- */
    var issues = [];

    if (dict) {
      issues.push({
        code: 'dictionary',
        severity: 3,
        penalty: P.dictionary,
        detail: dict.word,
        message: '命中了常见弱口令「' + dict.word + '」' +
          (dict.exact ? '' : '（去掉结尾的数字或符号后命中）'),
        suggestion: '「' + dict.word + '」在公开泄露字典里排在最前面，加数字或符号的变形同样会被优先尝试，建议换成与它完全无关的组合'
      });
    }

    var rep = detectRepeat(chars);
    if (rep) {
      issues.push({
        code: 'repeat',
        severity: 2,
        penalty: P.repeat,
        detail: rep.type === 'run' ? rep.char + ' × ' + rep.count : rep.unit + ' × ' + rep.times,
        message: rep.type === 'run'
          ? '存在 ' + rep.count + ' 个连续重复的「' + rep.char + '」，重复不增加安全性'
          : '整串由「' + rep.unit + '」重复 ' + rep.times + ' 次构成，实际信息量只有 ' + rep.unit.length + ' 位',
        suggestion: rep.type === 'run'
          ? '连续重复的字符几乎不增加破解难度，把它们换成不相关的字符'
          : '「' + rep.unit + '」的重复等于把长度优势作废，建议整段重写'
      });
    }

    var kb = detectKeyboard(lower, 4);
    if (kb) {
      issues.push({
        code: 'keyboard',
        severity: 2,
        penalty: P.keyboard,
        detail: kb,
        message: '包含键盘上相邻的按键序列「' + kb + '」，是攻击者优先尝试的组合',
        suggestion: '键盘上挨着的按键（如 ' + kb + '）在字典攻击里出现率极高，尽量避开'
      });
    }

    var seq = kb ? null : detectSequence(chars, 4);
    if (seq) {
      issues.push({
        code: 'sequence',
        severity: 1,
        penalty: P.sequence,
        detail: seq,
        message: '包含连续递增或递减的片段「' + seq + '」',
        suggestion: '「' + seq + '」属于可预测序列，打乱顺序比继续加长更有效'
      });
    }

    var date = detectDate(pwd);
    if (date) {
      issues.push({
        code: 'date',
        severity: 1,
        penalty: P.date,
        detail: date,
        message: '包含疑似年份或日期「' + date + '」，生日与年份是最早被尝试的范围',
        suggestion: '把「' + date + '」这类年份换成与个人信息无关的字符'
      });
    }

    if (counts.digit === len) {
      issues.push({
        code: 'allDigits',
        severity: 3,
        penalty: P.allDigits,
        detail: String(len),
        message: '整串只有数字，搜索空间仅 10^' + len,
        suggestion: '纯数字即使很长也扛不住穷举，至少混入字母与符号'
      });
    } else if ((counts.lower + counts.upper) === len && len < 12) {
      issues.push({
        code: 'allLetters',
        severity: 1,
        penalty: P.allLetters,
        detail: String(len),
        message: '整串只有字母且长度不足 12 位',
        suggestion: '加入数字或符号能把可能的字符池扩大数倍'
      });
    }

    var uname = String(options.username || '').trim().toLowerCase();
    var email = String(options.email || '').trim().toLowerCase();
    var identity = uname.length >= 3 ? uname : (email.length >= 3 ? email.split('@')[0] : '');
    if (identity.length >= 3) {
      var idSk = skeleton(identity, 'l');
      var similar = false;
      if (sk.indexOf(idSk) !== -1 || (sk.length >= 3 && idSk.indexOf(sk) !== -1)) {
        similar = true;
      } else if (Math.abs(sk.length - idSk.length) <= 2 && levenshtein(sk, idSk) <= 2) {
        similar = true;
      }
      if (similar) {
        issues.push({
          code: 'similar',
          severity: 3,
          penalty: P.similar,
          detail: identity,
          message: '与用户名 / 邮箱「' + identity + '」高度相似',
          suggestion: '把账号名放进密码里，等于让攻击者省掉一半工作，建议完全避开'
        });
      }
    }

    /* ---------- 步骤 5：熵 ---------- */
    var entropy = len * Math.log2(pool);
    if (unique / len < 0.5) entropy *= 0.6;

    /* ---------- 步骤 6：评分 ---------- */
    var lengthScore = Math.min(len, W.lengthCap) * W.lengthFactor;
    var diversityScore = charsetCount * W.diversityFactor;
    var structureScore = transitions >= W.structureFastThreshold
      ? W.structureCap
      : Math.min(transitions * W.structureStep, W.structureCap);
    var entropyBonus = clamp((entropy - W.entropyBase) / W.entropyDivisor, 0, W.entropyBonusCap);

    var penalty = 0;
    for (var k = 0; k < issues.length; k++) penalty += issues[k].penalty;
    penalty = clamp(penalty, P.floor, 0);

    var base = lengthScore + diversityScore + structureScore + entropyBonus;
    var score = clamp(base + penalty, 0, 100);
    if (vetoed) score = Math.min(score, RULES.VETO_CAP);
    score = Math.round(score);

    var level = levelOf(score);

    /* ---------- 步骤 7：建议 ---------- */
    var suggestions = issues.slice().sort(function (a, b) {
      return a.penalty - b.penalty;
    }).slice(0, 3).map(function (it) { return it.suggestion; });

    if (len < 12) {
      var need = 12 - len;
      suggestions.unshift('再增加 ' + need + ' 位长度（到 12 位），这是最划算的提升方式');
    }
    suggestions = suggestions.slice(0, 3);
    if (!suggestions.length) {
      suggestions.push('强度已经足够，注意不要在多处复用，建议配合密码管理器');
    }

    return {
      score: score,
      level: level.key,
      levelLabel: level.label,
      levelColor: level.color,
      levelHint: level.hint,
      entropy: Math.round(entropy * 10) / 10,
      length: len,
      charsetCount: charsetCount,
      pool: pool,
      unique: unique,
      transitions: transitions,
      truncated: truncated,
      breakdown: {
        length: Math.round(lengthScore * 10) / 10,
        diversity: diversityScore,
        structure: structureScore,
        entropyBonus: Math.round(entropyBonus * 10) / 10,
        penalty: penalty
      },
      issues: issues,
      suggestions: suggestions,
      weakWord: dict ? dict.word : null,
      vetoed: vetoed
    };
  }

  return {
    detect: detect,
    _internals: {
      classify: classify,
      skeleton: skeleton,
      lookupDict: lookupDict,
      detectRepeat: detectRepeat,
      detectKeyboard: detectKeyboard,
      detectSequence: detectSequence,
      detectDate: detectDate,
      levenshtein: levenshtein,
      levelOf: levelOf
    }
  };
});
