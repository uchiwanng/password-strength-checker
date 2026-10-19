/**
 * rules.js — 规则与数据（无逻辑，便于替换与审阅）
 * 浏览器：挂到 window.PWD_RULES；Node：module.exports
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PWD_RULES = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * 弱口令字典。下标越小越高危；下标 < HIGH_RISK_COUNT 视为"一票否决"级。
   * 前 100 条来自公开常见弱口令榜单，其后为常见词/年份/键盘变形等补充。
   */
  var WEAK_TOP = [
    '123456', 'password', '12345678', 'qwerty', '123456789', '12345', '1234', '111111',
    '1234567', 'dragon', '123123', 'baseball', 'abc123', 'football', 'monkey', 'letmein',
    'shadow', 'master', '666666', 'qwertyuiop', '123321', 'mustang', '1234567890', 'michael',
    '654321', 'superman', '1qaz2wsx', '7777777', '121212', '000000', 'qazwsx', '123qwe',
    'killer', 'trustno1', 'jordan', 'jennifer', 'zxcvbnm', 'asdfgh', 'hunter', 'buster',
    'soccer', 'harley', 'batman', 'andrew', 'tigger', 'sunshine', 'iloveyou', 'charlie',
    'robert', 'thomas', 'hockey', 'ranger', 'daniel', 'starwars', '112233', 'george',
    'computer', 'michelle', 'jessica', 'pepper', '1111', 'zxcvbn', '555555', '11111111',
    '131313', 'freedom', '777777', 'pass', 'maggie', '159753', 'aaaaaa', 'ginger',
    'princess', 'joshua', 'cheese', 'amanda', 'summer', 'ashley', '6969', 'nicole',
    'chelsea', 'biteme', 'matthew', 'access', 'yankees', '987654321', 'dallas', 'austin',
    'thunder', 'taylor', 'matrix', 'admin', 'root', 'passw0rd', 'password1', 'password123',
    'admin123', '1q2w3e4r', 'qwerty123', 'welcome',

    'welcome1', 'welcome123', 'welcome2024', 'letmein1', 'letmein123', 'shadow1', 'michael1',
    'jesus', 'jesus1', 'ninja', 'ninja1', 'azerty', 'zaq12wsx', 'qwe123', 'asd123', 'zxc123',
    'qweasd', 'qweasdzxc', 'qazwsxedc', '1qaz2wsx3edc', '1q2w3e4r5t', '1qaz2wsx3edc4rfv',
    'q1w2e3r4', 'q1w2e3r4t5', '1qaz1qaz', 'zaq1zaq1', '!qaz2wsx', 'qazwsx123', 'qazwsx1',
    '12341234', '11223344', '12344321', '111222333', '1122334455', '123123123',
    '5201314', 'woaini', 'woaini1314', 'woaini520', '1314520', '1314521', '520520',
    '7758521', '584520', '888888', '88888888', '666888', '123456a', 'a123456',
    'a123456789', '123456789a', 'qq123456', 'aa123456', 'aa123456789', '1qaz@wsx',
    'abcdef', 'abcdefg', 'abcabc', 'a1b2c3', 'abc123456', 'abc1234', 'abcd1234',
    '1234abcd', '1234qwer', 'qwer123', 'qwer1234', 'qwer4321', 'asdf1234', 'zxcv1234',
    '11qq22ww', 'zzzzzz', '1q2w3e', '12345678910', '000000000', '999999', '12121212',
    '147258', '147258369', '741852963', '951753', '789456', '159357', '456789', '987654',
    '654321a', 'qazxsw', 'wsxedc', 'edcrfv', 'tgbnhy', '55555', '77777', '88888',
    '99999', '00000', '11111', '22222', '33333', '44444', '66666', '123abc', 'abc12345',
    'pass1234', 'pass123456', 'pass123', 'test123', 'test', 'test1234', 'testtest',
    'test12345', 'guest', 'guest123', 'user', 'user123', 'default', 'changeme', 'secret',
    'secret123', 'secret1', 'private', 'private1', 'personal', 'personal1', 'account',
    'account1', 'login', 'login123', 'signin', 'demo', 'demo123', 'sample', 'example',
    'iloveu', 'loveyou', 'loveyou1', 'lovelove', 'iloveyou1', 'iloveyou2', 'love123',
    'love1234', 'love2024', 'baby', 'baby123', 'honey', 'darling', 'sweetheart', 'angel',
    'angel123', 'monster', 'sunshine1', 'princess1', 'flower', 'purple', 'orange', 'banana',
    'apple', 'apple123', 'chocolate', 'cookie', 'coffee', 'hello', 'hello123', 'whatever',
    'killer1', 'master1', 'ranger1', 'buster1', 'soccer1', 'hockey1', 'dallas1', 'austin1',
    'thunder1', 'starwars1', 'superman1', 'batman1', 'pokemon', 'pokemon1', 'naruto', 'goku',
    'sasuke', 'luffy', 'onepiece', 'minecraft', 'fortnite', 'roblox', 'playstation', 'xbox',
    'nintendo', 'google', 'facebook', 'twitter', 'instagram', 'linkedin', 'youtube',
    'netflix', 'spotify', 'amazon', 'microsoft', 'samsung', 'huawei', 'xiaomi', 'tencent',
    'wechat', 'taobao', 'alipay', 'baidu', 'qq123456789', '123456qq',
    'qwertyui', 'asdfghjkl', 'poiuytrewq', 'lkjhgfdsa', 'mnbvcxz', '1qazxsw2', '2wsx3edc',
    '2010', '2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019',
    '2020', '2021', '2022', '2023', '2024', '2025', '2026',
    'summer2023', 'summer2024', 'winter2024', 'spring2023', 'spring2024', 'autumn2024',
    'forever', 'forever1', 'family', 'family1', 'mother', 'father', 'brother', 'sister',
    'friend', 'friends', 'buddy', 'buddy1', 'charlie1', 'sophie', 'oliver', 'harry',
    'potter', 'hogwarts', 'frodo', 'gandalf', 'legolas', 'aragorn', 'skywalker', 'vader',
    'yoda', 'terminator', 'predator', 'alien', 'matrix1', 'neo', 'trinity', 'morpheus',
    'james', 'bond', 'jamesbond', '007007', 'agent007',
    'password12', 'password1234', 'password2023', 'password2024', 'password!', 'password1!',
    'passw0rd1', '1password', 'lastpass', 'bitwarden', 'keepass', 'trustme', 'trustno1234',
    'adminadmin', 'administrator', 'administrator1', 'sysadmin', 'webmaster', 'manager',
    'manager1', 'office', 'office123', 'company', 'company1', 'school', 'school123',
    'student', 'student1', 'teacher', 'teacher1', 'employee', 'employee1', 'hr123456',
    'finance', 'finance1', 'sales', 'sales123', 'support', 'support1', 'service',
    'service1', 'system', 'system123', 'network', 'network1', 'server', 'server1',
    'database', 'database1', 'backup', 'backup1', 'temp', 'temp123', 'temp1234',
    'aaa111', 'mima', 'mima123', 'mimashi', 'p@ssword', 'p@ssw0rd', 'p@ssw0rd1',
    'pa55word', 'pa$$word', 's3cr3t', 's3cret', 'secret!', 'admin@123', 'admin@1234',
    'root@123', 'test@123', 'password@123', 'password@1', '123456!', '123456789!',
    'qwerty!', 'abc123!', 'qweasdzxc1', 'qazwsxedc1'
  ];

  var WEAK_INDEX = new Map();
  for (var i = 0; i < WEAK_TOP.length; i++) {
    if (!WEAK_INDEX.has(WEAK_TOP[i])) WEAK_INDEX.set(WEAK_TOP[i], i);
  }

  /** leetspeak 还原表：用于识别 P@ssw0rd / pa$$word 一类"看似复杂"的变形 */
  var LEET = {
    '@': 'a', '4': 'a', '0': 'o', '3': 'e', '$': 's', '5': 's',
    '7': 't', '+': 't', '!': 'i', '|': 'l', '1': 'l', '8': 'b'
  };

  var KEYBOARD_ROWS = [
    'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
    '1234567890', '!@#$%^&*()',
    'qazwsxedc', 'wsxedc', 'edcrfv'
  ];

  var WEIGHTS = {
    lengthCap: 20,
    lengthFactor: 2.5,
    diversityFactor: 7,
    structureCap: 15,
    structureStep: 5,
    structureFastThreshold: 3,
    entropyBase: 40,
    entropyDivisor: 10,
    entropyBonusCap: 10
  };

  var PENALTIES = {
    dictionary: -40,
    repeat: -25,
    keyboard: -20,
    sequence: -15,
    date: -10,
    allDigits: -25,
    allLetters: -10,
    similar: -30,
    floor: -60
  };

  var VETO_CAP = 15;
  var HIGH_RISK_COUNT = 100;
  var MAX_LEN = 128;

  var LEVELS = [
    { key: 'very-strong', label: '极强', min: 85, color: '#137333', hint: '强度优秀，注意不要在多处复用' },
    { key: 'strong', label: '强', min: 70, color: '#1e8e3e', hint: '安全性良好，可放心使用' },
    { key: 'medium', label: '中', min: 50, color: '#c99a06', hint: '勉强可用，建议再加长并混入符号' },
    { key: 'weak', label: '弱', min: 30, color: '#e8710a', hint: '容易被字典或规则攻击命中' },
    { key: 'very-weak', label: '极弱', min: 0, color: '#d93025', hint: '几乎瞬间可被破解，请立即更换' }
  ];

  return {
    WEAK_TOP: WEAK_TOP,
    WEAK_INDEX: WEAK_INDEX,
    HIGH_RISK_COUNT: HIGH_RISK_COUNT,
    MAX_LEN: MAX_LEN,
    LEET: LEET,
    KEYBOARD_ROWS: KEYBOARD_ROWS,
    WEIGHTS: WEIGHTS,
    PENALTIES: PENALTIES,
    VETO_CAP: VETO_CAP,
    LEVELS: LEVELS
  };
});
