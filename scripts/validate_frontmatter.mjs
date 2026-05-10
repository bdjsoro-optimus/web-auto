#!/usr/bin/env node
// validate_frontmatter.mjs — frontmatter 스키마 검증
//
// 용도: 산출물 .md의 frontmatter가 표준 스키마와 일치하는지 검증
//       경로는 config.json의 output_dir에서 파생된 절대경로여야 함
//
// 사용:
//   node validate_frontmatter.mjs <절대경로> <type>
//   type: "진단" | "설계" | "지침"
//
// 출력 (stdout JSON):
//   { valid: bool, errors: [...], frontmatter: {...} }

import { readFileSync, existsSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';

const SCHEMAS = {
  진단: ['의뢰인', '분석 일시', '버전'],
  설계: ['의뢰인', '분석 일시', '진단 보고서', '버전'],
  지침: ['의뢰인', '분석 일시', '진단 보고서', '설계도', '설계도 버전', '버전'],
};

const VERSION_PATTERN = /^v\d+(\.\d+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FILENAME_PATTERN = /^AI자동화_(진단보고서|설계도|개발지침서)_.+_\d{4}-\d{2}-\d{2}\.md$/;

function emit(data, exitCode = 0) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  process.exit(exitCode);
}

const filePath = process.argv[2];
const type = process.argv[3];

if (!filePath || !type) {
  process.stderr.write('Usage: node validate_frontmatter.mjs <md-file-path> <type>\n');
  process.stderr.write('  type: "진단" | "설계" | "지침"\n');
  process.exit(1);
}

if (!SCHEMAS[type]) {
  emit({
    valid: false,
    errors: [`알 수 없는 타입: "${type}". 진단·설계·지침 중 하나여야 함.`],
    frontmatter: null,
  });
}

if (!isAbsolute(filePath)) {
  emit({
    valid: false,
    errors: [`절대경로여야 합니다: "${filePath}" — config.json의 output_dir 기반 경로를 전달해 주세요.`],
    frontmatter: null,
  });
}

const absPath = resolve(filePath);
if (!existsSync(absPath)) {
  emit({
    valid: false,
    errors: [`파일 없음: ${absPath}`],
    frontmatter: null,
  });
}

const content = readFileSync(absPath, 'utf8');
const lines = content.split(/\r?\n/);

// frontmatter 추출 — 첫 줄이 --- 인지 확인
if (lines[0].trim() !== '---') {
  emit({
    valid: false,
    errors: ['frontmatter 없음 — 첫 줄이 "---" 아님'],
    frontmatter: null,
  });
}

let endIdx = -1;
for (let i = 1; i < lines.length; i++) {
  if (lines[i].trim() === '---') {
    endIdx = i;
    break;
  }
}

if (endIdx === -1) {
  emit({
    valid: false,
    errors: ['frontmatter 닫힘 "---" 없음'],
    frontmatter: null,
  });
}

// YAML 간단 파싱 (key: value 한 줄씩, no nesting)
const frontmatter = {};
const parseErrors = [];
for (let i = 1; i < endIdx; i++) {
  const line = lines[i];
  if (!line.trim() || line.trim().startsWith('#')) continue;
  const match = line.match(/^([^:]+):\s*(.*)$/);
  if (!match) {
    parseErrors.push(`파싱 실패 라인 ${i + 1}: "${line}"`);
    continue;
  }
  const key = match[1].trim();
  const value = match[2].trim();
  frontmatter[key] = value;
}

// 검증
const errors = [...parseErrors];
const required = SCHEMAS[type];

// 필수 필드 존재
for (const field of required) {
  if (!(field in frontmatter)) {
    errors.push(`필수 필드 누락: ${field}`);
  }
}

// 형식 검증
if (frontmatter['버전'] && !VERSION_PATTERN.test(frontmatter['버전'])) {
  errors.push(`버전 형식 잘못됨: "${frontmatter['버전']}" (예상: "v1", "v2.1" 등)`);
}

if (frontmatter['설계도 버전'] && !VERSION_PATTERN.test(frontmatter['설계도 버전'])) {
  errors.push(`설계도 버전 형식 잘못됨: "${frontmatter['설계도 버전']}"`);
}

if (frontmatter['분석 일시']) {
  // 분석 일시는 YYYY-MM-DD 또는 YYYY-MM-DD HH:MM 등 — 최소 YYYY-MM-DD 형식 시작
  const dateValue = frontmatter['분석 일시'].split(/\s+/)[0];
  if (!DATE_PATTERN.test(dateValue)) {
    errors.push(`분석 일시 형식 잘못됨: "${frontmatter['분석 일시']}" (예상: "YYYY-MM-DD" 시작)`);
  }
}

// 파일명 명명 규칙 검증 (참조된 파일들)
if (frontmatter['진단 보고서'] && !FILENAME_PATTERN.test(frontmatter['진단 보고서'])) {
  errors.push(`진단 보고서 파일명 규칙 위반: "${frontmatter['진단 보고서']}"`);
}

if (frontmatter['설계도'] && !FILENAME_PATTERN.test(frontmatter['설계도'])) {
  errors.push(`설계도 파일명 규칙 위반: "${frontmatter['설계도']}"`);
}

emit({
  valid: errors.length === 0,
  errors,
  frontmatter,
});
