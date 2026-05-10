#!/usr/bin/env node
// validate_sections.mjs — 산출물 섹션 헤더가 양식과 일치하는지 검증
//
// 13번 검증의 핵심 위험("섹션 즉흥 생성")을 결정론적으로 차단.
// 양식의 ## 헤더(이모지·번호·이름) ↔ 산출물의 ## 헤더 비교.
//
// 사용:
//   node validate_sections.mjs <절대경로> <type>
//   type: "진단" | "설계" | "지침"
//
// 출력 (stdout JSON):
//   { valid: bool, errors: [...], expected_sections: [...], actual_sections: [...] }

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, '..', 'templates');

const TEMPLATE_FILES = {
  진단: '진단보고서_양식.md',
  설계: '설계도_양식.md',
  지침: '개발지침서_양식.md',
};

function emit(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  process.exit(0);
}

// ## 시작 헤더만 추출 (코드 블록 내부는 무시)
function extractH2Sections(content) {
  const lines = content.split(/\r?\n/);
  const sections = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    if (line.startsWith('## ')) {
      sections.push(line.slice(3).trim());
    }
  }
  return sections;
}

const filePath = process.argv[2];
const type = process.argv[3];

if (!filePath || !type) {
  process.stderr.write('Usage: node validate_sections.mjs <md-file-path> <type>\n');
  process.stderr.write('  type: "진단" | "설계" | "지침"\n');
  process.exit(1);
}

if (!TEMPLATE_FILES[type]) {
  emit({
    valid: false,
    errors: [`알 수 없는 타입: "${type}". 진단·설계·지침 중 하나여야 함.`],
    expected_sections: [],
    actual_sections: [],
  });
}

if (!isAbsolute(filePath)) {
  emit({
    valid: false,
    errors: [`절대경로여야 합니다: "${filePath}"`],
    expected_sections: [],
    actual_sections: [],
  });
}

if (!existsSync(filePath)) {
  emit({
    valid: false,
    errors: [`파일 없음: ${filePath}`],
    expected_sections: [],
    actual_sections: [],
  });
}

const templatePath = resolve(TEMPLATES_DIR, TEMPLATE_FILES[type]);
if (!existsSync(templatePath)) {
  emit({
    valid: false,
    errors: [`양식 파일 없음: ${templatePath}`],
    expected_sections: [],
    actual_sections: [],
  });
}

const expected = extractH2Sections(readFileSync(templatePath, 'utf8'));
const actual = extractH2Sections(readFileSync(filePath, 'utf8'));

const errors = [];

// 1. 섹션 개수 비교
if (expected.length !== actual.length) {
  errors.push(`섹션 개수 불일치: 양식 ${expected.length}개 / 산출물 ${actual.length}개`);
}

// 2. 각 섹션 헤더 비교 (순서대로)
const minLen = Math.min(expected.length, actual.length);
for (let i = 0; i < minLen; i++) {
  if (expected[i] !== actual[i]) {
    errors.push(`섹션 §${i + 1} 불일치: 양식 "${expected[i]}" / 산출물 "${actual[i]}"`);
  }
}

// 3. 양식에만 있는 섹션 (산출물에서 누락)
if (expected.length > actual.length) {
  for (let i = actual.length; i < expected.length; i++) {
    errors.push(`섹션 §${i + 1} 누락: "${expected[i]}"`);
  }
}

// 4. 산출물에만 있는 섹션 (양식에 없음)
if (actual.length > expected.length) {
  for (let i = expected.length; i < actual.length; i++) {
    errors.push(`섹션 §${i + 1} 양식에 없음 (추가됨): "${actual[i]}"`);
  }
}

emit({
  valid: errors.length === 0,
  errors,
  expected_sections: expected,
  actual_sections: actual,
});
