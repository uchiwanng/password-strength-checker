/**
 * artifact.test.js — 对交付产物 index.html 的静态核查
 *
 *   node tests/artifact.test.js
 *
 * 单测只保证算法对；这里保证"承诺"对：零网络请求、零存储、零外链、
 * 可访问性标记齐全、体积达标、产物与 src/ 同步。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'index.html');
const html = fs.readFileSync(FILE, 'utf8');

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

function eq(a, b, label) {
  if (a !== b) throw new Error((label || '值') + ' 期望 ' + JSON.stringify(b) + '，实际 ' + JSON.stringify(a));
}

function ok(cond, message) {
  if (!cond) throw new Error(message);
}

function mustNotMatch(re, label) {
  const m = html.match(re);
  if (m) throw new Error('发现 ' + label + '：' + m[0]);
}

function mustMatch(re, label) {
  if (!re.test(html)) throw new Error('缺少 ' + label);
}

process.stdout.write('\n交付产物核查（index.html）\n');

it('产物存在且体积 ≤ 500KB', () => {
  const kb = Buffer.byteLength(html) / 1024;
  process.stdout.write('      当前 ' + kb.toFixed(1) + ' KB\n');
  ok(kb <= 500, '体积 ' + kb.toFixed(1) + 'KB 超过 500KB 上限');
});

it('产物与 src/ 完全同步（node build.js --check）', () => {
  execFileSync(process.execPath, ['build.js', '--check'], { cwd: ROOT, stdio: 'pipe' });
});

it('无任何网络 API 调用', () => {
  mustNotMatch(/\bfetch\s*\(/, 'fetch()');
  mustNotMatch(/XMLHttpRequest/, 'XMLHttpRequest');
  mustNotMatch(/new\s+WebSocket/, 'WebSocket');
  mustNotMatch(/sendBeacon/, 'sendBeacon');
  mustNotMatch(/EventSource/, 'EventSource');
  mustNotMatch(/import\s*\(/, '动态 import');
});

it('无本地存储与日志写入', () => {
  mustNotMatch(/localStorage/, 'localStorage');
  mustNotMatch(/sessionStorage/, 'sessionStorage');
  mustNotMatch(/indexedDB/, 'indexedDB');
  mustNotMatch(/document\.cookie/, 'document.cookie');
  mustNotMatch(/\bconsole\.(log|info|warn|error|debug)\s*\(/, 'console 输出');
});

it('无第三方资源引用（无外链 / 无字体 / 无 CDN）', () => {
  mustNotMatch(/<link\b/i, '<link>');
  mustNotMatch(/<img\b/i, '<img>');
  mustNotMatch(/@import/, '@import');
  mustNotMatch(/<script[^>]+\bsrc=/i, '外链 script');
  mustNotMatch(/(src|href)\s*=\s*["']https?:/i, 'http(s) 资源引用');
});

it('CSP 声明 default-src none 与 connect-src none', () => {
  mustMatch(/default-src 'none'/, "default-src 'none'");
  mustMatch(/connect-src 'none'/, "connect-src 'none'");
  mustMatch(/form-action 'none'/, "form-action 'none'");
});

it('输入框默认遮罩且禁止自动填充', () => {
  mustMatch(/<input id="pwd"[^>]*type="password"/, 'type="password"');
  mustMatch(/autocomplete="new-password"/, 'autocomplete="new-password"');
});

it('可访问性：progressbar / aria-valuenow / aria-live', () => {
  mustMatch(/role="progressbar"/, 'role="progressbar"');
  mustMatch(/aria-valuenow="0"/, 'aria-valuenow');
  mustMatch(/aria-live="polite"/, 'aria-live="polite"');
  mustMatch(/<html lang="zh-CN">/, 'lang="zh-CN"');
});

it('移动端 viewport 与窄屏断点', () => {
  mustMatch(/name="viewport"/, 'viewport');
  mustMatch(/@media \(max-width: 620px\)/, '窄屏媒体查询');
});

it('无 innerHTML 拼接密码明文', () => {
  // innerHTML 只允许用于清空容器，不允许拼进用户输入
  const hits = html.match(/innerHTML\s*=\s*[^;]+/g) || [];
  hits.forEach((h) => {
    if (!/innerHTML\s*=\s*(''|"")\s*$/.test(h.trim())) {
      throw new Error('可疑的 innerHTML 赋值：' + h.trim());
    }
  });
});

it('复制结果不含密码明文（只拼装文案字段）', () => {
  const copyBlock = html.slice(html.indexOf("els.copy.addEventListener"));
  ok(copyBlock.indexOf('els.pwd.value') === -1, '复制逻辑里出现了密码值');
  ok(copyBlock.indexOf('r.length') !== -1, '复制逻辑应包含长度等派生信息');
});

const total = passed + failures.length;
process.stdout.write('\n' + '-'.repeat(52) + '\n');
process.stdout.write('通过 ' + passed + ' 项，失败 ' + failures.length + ' 项，共 ' + total + ' 项\n');
if (failures.length) process.exit(1);
