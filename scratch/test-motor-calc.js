const { calculateMotorDisplacement } = require('../server/server');

console.log('--- 測試 calculateMotorDisplacement ---');

const testCases = [
  {
    name: 'D <= 0 (原文全為關鍵字或超短)',
    text: '你好世界',
    keywords: ['你好', '世界'],
    expectedD: 0,
    expectedMotor: 0,
  },
  {
    name: 'D = 16 (在 50 字以內)',
    text: '這是一段很長很長的測試內容文字，關鍵字很少', // 21 字
    keywords: ['測試', '關鍵字'], // 2 + 3 = 5 字 -> K = 5, D = 16
    expectedD: 16,
    expectedMotor: Math.round((16 / 50) * 180), // 58
  },
  {
    name: 'D = 50 (剛好 50 字邊界)',
    text: 'A'.repeat(56),
    keywords: ['AAAAAA'], // 6 字 -> D = 50
    expectedD: 50,
    expectedMotor: 180,
  },
  {
    name: 'D = 115 (介於 50 與 180 之間)',
    text: 'A'.repeat(125),
    keywords: ['AAAAA', 'AAAAA'], // 10 字 -> D = 115
    expectedD: 115,
    expectedMotor: Math.round(180 + ((115 - 50) / 130) * 75), // 180 + 37.5 = 218
  },
  {
    name: 'D = 180 (正好滿額 255)',
    text: 'A'.repeat(180),
    keywords: [],
    expectedD: 180,
    expectedMotor: 255,
  },
  {
    name: 'D = 300 (超過 180，Math.min 上限封頂 255)',
    text: 'A'.repeat(300),
    keywords: [],
    expectedD: 300,
    expectedMotor: 255,
  },
];

let allPassed = true;
for (const tc of testCases) {
  const result = calculateMotorDisplacement(tc.text, tc.keywords);
  const passD = result.D === tc.expectedD;
  const passMotor = result.motorValue === tc.expectedMotor;
  console.log(`[Test] ${tc.name}:`);
  console.log(`  > D: ${result.D} (期望: ${tc.expectedD}) -> ${passD ? 'PASS' : 'FAIL'}`);
  console.log(`  > Motor: ${result.motorValue} (期望: ${tc.expectedMotor}) -> ${passMotor ? 'PASS' : 'FAIL'}`);

  if (!passD || !passMotor) {
    allPassed = false;
  }
}

console.log('\n--- 結論 ---');
if (allPassed) {
  console.log('✅ 所有測試案例均通過！');
  process.exit(0);
} else {
  console.error('❌ 測試未通過！');
  process.exit(1);
}
