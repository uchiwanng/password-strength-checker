# 简易密码强度检测工具

输入即评分，**完全在浏览器本机运行**：不上传、不存储、不发起任何网络请求。

- 直接使用：双击 `index.html`（单文件，38 KB，无任何依赖）
- 单元测试：`node tests/detector.test.js && node tests/artifact.test.js`
- 重新打包：`node build.js`
- 需求与验收依据见 [`简易密码强度检测工具-任务书.md`](./简易密码强度检测工具-任务书.md)

---

## 1. 目录结构

```
.
├── index.html                     # 单文件成品（由 build.js 生成，可直接分发）
├── build.js                       # 拼装脚本，零依赖（--check 用于 CI 校验同步）
├── src/
│   ├── template.html              # 页面骨架（含 CSP），用 __CSS__ 等占位符
│   ├── style.css                  # 样式
│   ├── rules.js                   # 字典、权重、阈值、等级、键盘序列
│   ├── detector.js                # 核心算法（纯函数，可单独复用）
│   └── app.js                     # 视图绑定、渲染、可访问性
├── tests/
│   ├── detector.test.js           # 30 项断言：验收用例、边界、契约、性能、偏差记录
│   └── artifact.test.js           # 11 项断言：隐私承诺、外链、可访问性、体积、同步
├── data/                          # 预留：外置字典（见第 7 节）
├── .github/workflows/pages.yml    # 测试通过后发布到 GitHub Pages
└── package.json                   # 仅声明脚本，无任何依赖
```

`index.html` 是产物，**不要直接改它**；改 `src/` 后执行 `node build.js`。
`node build.js --check` 会在产物与源码不一致时以非 0 退出，CI 与本地都能用。

## 2. 评分模型

```
长度分      = min(长度, 20) × 2.5                    → 最高 50
多样性分    = 字符类别数 × 7                          → 最高 35（5 类）
结构分散分  = 类别切换 ≥3 次 ? 15 : 切换次数 × 5      → 最高 15
熵加成      = clamp((H − 40) / 10, 0, 10)            → 最高 10
基础分      = 以上四项之和
惩罚分      = 各模式扣分累加，最低 −60
总分        = clamp(基础分 + 惩罚分, 0, 100)
一票否决    = 命中字典前 100 条 → 总分封顶 15
```

| 分数 | 等级 | 颜色 |
| --- | --- | --- |
| 0–29 | 极弱 | `#d93025` |
| 30–49 | 弱 | `#e8710a` |
| 50–69 | 中 | `#c99a06` |
| 70–84 | 强 | `#1e8e3e` |
| 85–100 | 极强 | `#137333` |

惩罚项：字典命中 −40、重复（连续 ≥3 或整串周期重复）−25、键盘序列 −20、
连续递增/递减 −15、日期/年份 −10、纯数字 −25、纯字母且 <12 位 −10、与用户名相似 −30。

熵 `H = 长度 × log2(字符池)`，去重率 < 0.5 时折损 40%。

**为什么不用黑盒权重**：每一项扣分都能翻译成一句用户看得懂的话，评分变化可解释、可回归测试。
`P@ssw0rd` 会被判为"极弱"而不是"强"，正是靠 leetspeak 还原 + 字典一票否决实现的。

## 3. 接口（可在业务系统中复用）

```js
var r = PWD_DETECTOR.detect(password, { username: 'admin', email: 'a@b.com' });

r.score           // 0-100
r.level           // 'very-weak' | 'weak' | 'medium' | 'strong' | 'very-strong'
r.levelLabel      // '极弱' … '极强'
r.entropy         // bit
r.breakdown       // { length, diversity, structure, entropyBonus, penalty }
r.issues          // [{ code, severity:1-3, penalty, detail, message, suggestion }]
r.suggestions     // string[]，最多 3 条
r.weakWord        // 命中的字典词 / null
r.vetoed          // 是否被一票否决
r.truncated       // 是否因超过 128 位被截断
```

Node 环境：

```js
var detect = require('./src/detector.js').detect;
console.log(detect('123456').score); // 0
```

`detect` 是纯函数，不读 DOM、不读全局状态，可直接做单测或在服务端复用。
浏览器里 `src/rules.js` 挂 `window.PWD_RULES`，`src/detector.js` 挂 `window.PWD_DETECTOR`，
都是 UMD 写法，同一份代码在两边跑。

## 4. 隐私设计

| 措施 | 实现 |
| --- | --- |
| 不联网 | CSP `default-src 'none'; connect-src 'none'`，页面无任何外链资源 |
| 不落盘 | 不写 localStorage / sessionStorage / Cookie / console |
| 不传值 | 复制结果只含等级、分数、建议，不含密码本身 |
| 默认遮罩 | `type="password"`，显示为显式点击动作 |
| 防超长攻击 | 超过 128 位截断检测并提示，单次检测约 0.02ms |

这些承诺不只写在文档里：`tests/artifact.test.js` 会扫描产物里的 `fetch`、
`XMLHttpRequest`、`localStorage`、`console.*`、`<link>`、`http(s)` 外链，
一旦有人破坏承诺，CI 直接红。

## 5. 测试

```
$ npm test          # 等价于下面两条
$ node tests/detector.test.js
  ... 通过 30 项，失败 0 项，共 30 项          # 单次检测 0.013–0.045 ms
$ node tests/artifact.test.js
  ... 通过 11 项，失败 0 项，共 11 项          # 产物 38.4 KB，无外链无存储
```

`detector.test.js` 覆盖任务书 6.1 全部用例，另含中文重复串、日期串、邮箱相似、
纯数字/纯字母边界、128/129 位超长串、非字符串输入、等级阈值边界、确定性与性能阈值。

## 6. 已知状态：与任务书的偏差

单测最后两条是 **characterization test**，专门把当前实现与任务书不一致的地方固定下来，
避免"以为已经做了"或"悄悄改了没发现"。两处都在 `src/detector.js`：

| 偏差 | 现象 | 影响 |
| --- | --- | --- |
| 未做首尾空白归一化 | 任务书 4.2 步骤 1 要求 trim 首尾空白，实现未做，`" password "` 不命中字典（但分数仍低） | 有人从别处粘贴带空格的口令时，会少算一次字典命中 |
| 骨架串会映射掉字典键里的数字 | `skeleton()` 把 `0→o`、`1→l`、`3→e` 等做 leetspeak 还原，但字典键没有同样处理，`WEAK_TOP` 里 `123456` 一类含数字的条目永远匹配不上 | 这类口令靠"纯数字 −25"兜底，分数仍为 0，但不会打上"命中字典"的标签 |

两处都不影响"极弱判极弱"的结论，属于准确性而非安全性问题。修掉会改变部分评分结果，
所以单独留作一次变更，改之前先跑测试确认哪些用例的期望值需要同步更新。

## 7. 扩展字典

`src/rules.js` 顶部 `WEAK_TOP` 即字典数组（当前 452 条），**下标顺序就是危险程度**：前 100 条命中即一票否决。
若要换成更大的字典（如 SecLists 的 10k-most-common）：

1. 把词表按行放入 `data/weak-top5000.txt`（去重、小写、剔除含空格项）；
2. 在 `build.js` 里读入并替换 `WEAK_TOP`；
3. 注意许可证与来源标注，不要使用来源不明或含真实用户数据的词表。

## 8. 开发与发布

```bash
node build.js        # src/ → index.html
node build.js --check
npm test
```

推送到 `main` 后，`.github/workflows/pages.yml` 会先跑三条校验，再发布到 GitHub Pages。
Pages 需要在仓库 Settings → Pages → Build and deployment 里把 Source 设为 **GitHub Actions**（只需设置一次）。

## 9. 已知取舍

- **不做**在线泄露查询（会破坏"零网络请求"承诺）；
- **不做**面向具体站点的规则校验（如"必须含符号"），只评估口令本身强度；
- 键盘序列命中时不再叠加递增序列扣分，避免同一现象重复惩罚；
- 词典只覆盖 452 条常见口令 + 变形，长尾弱口令靠长度与多样性规则兜底；
- 本工具仅评估口令本身，不能防止钓鱼、撞库与设备被控。

## 许可证

[MIT](./LICENSE)
