/**
 * build.js — 把 src/ 拼装成单文件 index.html
 *
 * 为什么不用打包器：交付物要能在断网的内网里双击打开、被人逐行审阅。
 * 这里只做字符串替换，没有依赖、没有 sourcemap、没有构建缓存。
 *
 *   node build.js            # 生成 index.html
 *   node build.js --check    # 只校验 index.html 是否与 src/ 同步（CI 用）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'index.html');

const PARTS = [
  { token: '__CSS__', file: 'src/style.css' },
  { token: '__RULES__', file: 'src/rules.js' },
  { token: '__DETECTOR__', file: 'src/detector.js' },
  { token: '__APP__', file: 'src/app.js' }
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\s+$/, '');
}

function render() {
  // 模板统一以单个换行结尾，保证反复构建的产物稳定可比对
  let html = read('src/template.html') + '\n';
  for (const part of PARTS) {
    if (html.indexOf(part.token) === -1) {
      throw new Error('模板里找不到占位符 ' + part.token);
    }
    // 占位符单独占一行，替换时补一个换行，保持与手写版一致的排版
    html = html.replace(part.token, () => read(part.file) + '\n');
  }
  return html;
}

const output = render();
const checkOnly = process.argv.indexOf('--check') !== -1;

if (checkOnly) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (current !== output) {
    console.error('index.html 与 src/ 不同步，请运行 node build.js');
    process.exit(1);
  }
  console.log('index.html 与 src/ 同步（' + Buffer.byteLength(output) + ' 字节）');
  process.exit(0);
}

fs.writeFileSync(OUT, output);
const kb = (Buffer.byteLength(output) / 1024).toFixed(1);
console.log('已生成 index.html（' + kb + ' KB）');
