/**
 * detector.test.js — 核心算法单测（零依赖，node 直接跑）
 *
 *   node tests/detector.test.js
 *
 * 组织方式：
 *   1. 任务书 6.1 的 12 条验收用例（TC-01 ~ TC-12）
 *   2. 边界与异常输入
 *   3. 返回值契约与不变量
 *   4. 性能阈值
 *   5. 与任务书的偏差（characterization test，用于锁住现状并把偏差显性化）
 */
'use strict';

const { detect, _internals } = require('../src/detector.js');

let passed = 0;
const failures = [];

function it(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write('  \u2713 ' + name + '\n');
  } catch (err) {
    failures.push({ name, message: err.message });
    process.stdout.write('  \u2717 ' + name + '\n      ' + err.message + '\n');
  }
}

function group(title) {
  process.stdout.write('\n' + title + '\n');
}

function eq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error((label || '值') + ' 期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual));
  }
}

function ok(cond, message) {
  if (!cond) throw new Error(message);
}

function codes(r) {
  return r.issues.map((i) => i.code);
}

function has(list, item) {
  return list.indexOf(item) !== -1;
}

/** 确定性伪随机串，避免测试结果随环境变化 */
function pseudoRandom(len, seed) {
  const alpha = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*()_+-=';
  let s = seed >>> 0;
  let out = '';
  for (let i = 0; i < len; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out += alpha[(s >>> 16) % alpha.length];
  }
  return out;
}

/* ============================ 1. 验收用例 ============================ */
group('任务书 6.1 · 功能验收用例');

it('TC-01 123456 → 极弱，命中纯数字 + 键盘序列', () => {
  const r = detect('123456');
  eq(r.levelLabel, '极弱', '等级');
  ok(has(codes(r), 'allDigits'), '应命中 allDigits，实际 ' + codes(r).join(','));
  ok(has(codes(r), 'keyboard'), '应命中 keyboard，实际 ' + codes(r).join(','));
});

it('TC-02 password → 极弱，命中高危字典并一票否决', () => {
  const r = detect('password');
  eq(r.levelLabel, '极弱', '等级');
  ok(r.vetoed, '应被一票否决');
  eq(r.weakWord, 'password', '命中词');
});

it('TC-03 P@ssw0rd → 弱及以下（leetspeak 还原后命中字典）', () => {
  const r = detect('P@ssw0rd');
  ok(['极弱', '弱'].indexOf(r.levelLabel) !== -1, '等级应 ≤ 弱，实际 ' + r.levelLabel);
  ok(r.vetoed, '应被一票否决');
  ok(has(codes(r), 'dictionary'), '应命中字典，实际 ' + codes(r).join(','));
  eq(r.weakWord, 'password', '还原后的命中词');
});

it('TC-04 qwerty2024 → 弱及以下，命中键盘序列 + 年份', () => {
  const r = detect('qwerty2024');
  ok(['极弱', '弱'].indexOf(r.levelLabel) !== -1, '等级应 ≤ 弱，实际 ' + r.levelLabel);
  ok(has(codes(r), 'keyboard'), '应命中 keyboard');
  ok(has(codes(r), 'date'), '应命中 date');
});

it('TC-05 aaaaaaaa → 极弱，命中连续重复', () => {
  const r = detect('aaaaaaaa');
  eq(r.levelLabel, '极弱', '等级');
  ok(has(codes(r), 'repeat'), '应命中 repeat');
});

it('TC-06 abcabcabc → 弱及以下，命中周期性重复', () => {
  const r = detect('abcabcabc');
  ok(['极弱', '弱'].indexOf(r.levelLabel) !== -1, '等级应 ≤ 弱，实际 ' + r.levelLabel);
  ok(has(codes(r), 'repeat'), '应命中 repeat');
});

it('TC-07 Tr0ub4dor&3 → 强及以上', () => {
  const r = detect('Tr0ub4dor&3');
  ok(r.score >= 70, '分数应 ≥ 70，实际 ' + r.score);
  eq(r.issues.length, 0, '问题数');
});

it('TC-08 correct horse battery staple → 强及以上（实测极强）', () => {
  const r = detect('correct horse battery staple');
  ok(r.score >= 70, '分数应 ≥ 70，实际 ' + r.score);
  eq(r.issues.length, 0, '问题数');
});

it('TC-09 Xk9#mQ2$vL7@nR4 → 极强且无问题', () => {
  const r = detect('Xk9#mQ2$vL7@nR4');
  eq(r.levelLabel, '极强', '等级');
  eq(r.issues.length, 0, '问题数');
});

it('TC-10 空串 → 不显示等级，不抛异常', () => {
  const r = detect('');
  eq(r.level, null, 'level');
  eq(r.levelLabel, '', 'levelLabel');
  eq(r.score, 0, '分数');
  eq(r.issues.length, 0, '问题数');
});

it('TC-11 128 位随机串 → 极强，未截断，耗时 ≤ 5ms', () => {
  const pwd = pseudoRandom(128, 20261019);
  const t0 = process.hrtime.bigint();
  const r = detect(pwd);
  const cost = Number(process.hrtime.bigint() - t0) / 1e6;
  eq(r.truncated, false, 'truncated');
  eq(r.length, 128, '长度');
  eq(r.levelLabel, '极强', '等级');
  ok(cost <= 5, '耗时 ' + cost.toFixed(3) + 'ms 超过 5ms');
});

it('TC-12 username=admin + admin2026 → 极弱，命中相似 + 年份', () => {
  const r = detect('admin2026', { username: 'admin' });
  eq(r.levelLabel, '极弱', '等级');
  ok(has(codes(r), 'similar'), '应命中 similar');
  ok(has(codes(r), 'date'), '应命中 date');
});

/* ============================ 2. 边界 ============================ */
group('边界与异常输入');

it('单字符 a → 极弱且不报错', () => {
  const r = detect('a');
  eq(r.length, 1, '长度');
  eq(r.levelLabel, '极弱', '等级');
});

it('129 位 → truncated=true，且只按前 128 位计分', () => {
  const base = pseudoRandom(128, 42);
  const a = detect(base);
  const b = detect(base + 'Z');
  eq(b.truncated, true, 'truncated');
  eq(b.score, a.score, '截断后分数');
  eq(b.length, 128, '参与计分的长度');
});

it('纯中文重复 → 命中 repeat，长度按码点计', () => {
  const r = detect('中文中文中文中文');
  eq(r.length, 8, '码点长度');
  ok(has(codes(r), 'repeat'), '应命中 repeat');
});

it('纯 emoji → 按码点计数，不抛异常', () => {
  const r = detect('😀😀😀😀');
  eq(r.length, 4, '码点长度');
  ok(r.score >= 0 && r.score <= 100, '分数应在 0-100');
});

it('全角符号 → 归类为非 ASCII，不抛异常', () => {
  const r = detect('＊＊＊＊＊＊＊＊');
  ok(r.charsetCount >= 1, '字符类别数');
  ok(r.score >= 0 && r.score <= 100, '分数应在 0-100');
});

it('非字符串输入（null / undefined / 数字）→ 返回空结果', () => {
  [null, undefined, 123, {}, []].forEach((v) => {
    const r = detect(v);
    eq(r.level, null, String(v) + ' 的 level');
    eq(r.score, 0, String(v) + ' 的 score');
  });
});

it('options 省略或为空对象 → 行为一致', () => {
  eq(detect('Tr0ub4dor&3').score, detect('Tr0ub4dor&3', {}).score, '分数');
});

/* ============================ 3. 契约 ============================ */
group('返回值契约与不变量');

it('返回字段齐全', () => {
  const r = detect('Xk9#mQ2$vL7@nR4');
  ['score', 'level', 'levelLabel', 'entropy', 'length', 'charsetCount',
    'breakdown', 'issues', 'suggestions', 'weakWord', 'vetoed'].forEach((k) => {
    ok(Object.prototype.hasOwnProperty.call(r, k), '缺少字段 ' + k);
  });
  ['length', 'diversity', 'structure', 'entropyBonus', 'penalty'].forEach((k) => {
    ok(Object.prototype.hasOwnProperty.call(r.breakdown, k), 'breakdown 缺少 ' + k);
  });
});

it('一批输入的分数恒在 0-100 且等级与分数一致', () => {
  const samples = ['a', '123456', 'P@ssw0rd', 'Tr0ub4dor&3', 'Xk9#mQ2$vL7@nR4',
    '中文密码中文密码', 'correct horse battery staple', '  ', pseudoRandom(3, 1),
    pseudoRandom(16, 2), pseudoRandom(64, 7)];
  samples.forEach((p) => {
    const r = detect(p);
    ok(r.score >= 0 && r.score <= 100, JSON.stringify(p) + ' 分数越界: ' + r.score);
    if (r.level !== null) {
      eq(_internals.levelOf(r.score).key, r.level, JSON.stringify(p) + ' 的等级与分数不一致');
    }
  });
});

it('等级阈值边界：29/30、49/50、69/70、84/85 分属不同档', () => {
  eq(_internals.levelOf(29).label, '极弱', '29');
  eq(_internals.levelOf(30).label, '弱', '30');
  eq(_internals.levelOf(49).label, '弱', '49');
  eq(_internals.levelOf(50).label, '中', '50');
  eq(_internals.levelOf(69).label, '中', '69');
  eq(_internals.levelOf(70).label, '强', '70');
  eq(_internals.levelOf(84).label, '强', '84');
  eq(_internals.levelOf(85).label, '极强', '85');
});

it('建议最多 3 条，且问题最多 8 类', () => {
  ['a', '123456', 'admin2026', 'aaaaaa', 'qwerty2024'].forEach((p) => {
    const r = detect(p, { username: 'admin' });
    ok(r.suggestions.length <= 3, p + ' 建议条数 ' + r.suggestions.length);
    ok(r.suggestions.length >= 1, p + ' 至少给 1 条建议');
    ok(r.issues.length <= 8, p + ' 问题条数 ' + r.issues.length);
  });
});

it('同一条问题不重复出现', () => {
  const r = detect('qwerty2024', { username: 'qwerty' });
  const set = new Set(codes(r));
  eq(set.size, codes(r).length, '问题 code 唯一');
});

it('纯函数：同样输入两次结果完全一致', () => {
  const a = JSON.stringify(detect('P@ssw0rd', { username: 'bob' }));
  const b = JSON.stringify(detect('P@ssw0rd', { username: 'bob' }));
  eq(a, b, '序列化结果');
});

it('detect 不写全局状态（Node 下无 DOM 也能跑通）', () => {
  ok(typeof globalThis.window === 'undefined', '测试环境不应有 window');
  detect('Tr0ub4dor&3');
});

/* ============================ 4. 性能 ============================ */
group('性能');

it('1000 次检测平均单次 ≤ 5ms', () => {
  const pwd = 'Xk9#mQ2$vL7@nR4';
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 1000; i++) detect(pwd);
  const avg = Number(process.hrtime.bigint() - t0) / 1e6 / 1000;
  process.stdout.write('      实测 ' + avg.toFixed(4) + ' ms/次\n');
  ok(avg <= 5, '平均 ' + avg.toFixed(3) + 'ms 超过 5ms');
});

it('128 位串 1000 次检测平均单次 ≤ 5ms（暴露在超长输入上的性能）', () => {
  const pwd = pseudoRandom(128, 99);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 1000; i++) detect(pwd);
  const avg = Number(process.hrtime.bigint() - t0) / 1e6 / 1000;
  process.stdout.write('      实测 ' + avg.toFixed(4) + ' ms/次\n');
  ok(avg <= 5, '平均 ' + avg.toFixed(3) + 'ms 超过 5ms');
});

/* ====================== 5. 与任务书的偏差（记录现状） ====================== */
group('与任务书的偏差（characterization，改动算法时需同步更新）');

it('[偏差] 未做首尾空白归一化：\' password \' 不命中字典', () => {
  const r = detect(' password ');
  eq(r.weakWord, null, '命中词');
  ok(!r.vetoed, '不应被一票否决');
  ok(r.score > detect('password').score, '带空格的串反而分数更高');
});

it('[偏差] 含数字的字典条目永远不会被骨架串命中', () => {
  // skeleton() 会把数字按 leetspeak 映射掉，而字典键未做同样映射，
  // 因此 WEAK_TOP 里 "123456" 一类条目只靠纯数字规则兜底。
  const r = detect('123456');
  eq(r.levelLabel, '极弱', '等级仍为极弱（纯数字规则兜底）');
  ok(!has(codes(r), 'dictionary'), '实际未命中 dictionary');
});

/* ============================ 汇总 ============================ */
const total = passed + failures.length;
process.stdout.write('\n' + '-'.repeat(52) + '\n');
process.stdout.write('通过 ' + passed + ' 项，失败 ' + failures.length + ' 项，共 ' + total + ' 项\n');
if (failures.length) {
  failures.forEach((f) => process.stdout.write('  \u2717 ' + f.name + '\n'));
  process.exit(1);
}
