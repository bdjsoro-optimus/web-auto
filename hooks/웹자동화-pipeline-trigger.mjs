#!/usr/bin/env node
// PostToolUse 훅 — 웹자동화 파이프라인 산출물 저장 감지 + 결정론 가드 자동 호출
//
// 발동 조건: Write|Edit 후 파일명이 AI자동화_*.md이고 경로에 outputs 포함
// 동작:
//   1. 검증 스크립트 4개 자동 호출 (frontmatter + sections + later + checklist_meta)
//   2. 모두 valid: true → 다음 단계 안내 (진단→설계→지침→사이클 완료)
//   3. 일부 valid: false → errors 출력 + 자식N 회귀 안내

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_DIR = resolve(__dirname, '..', 'scripts');

// stdin JSON 읽기
const raw = readFileSync(0, 'utf8');
let event;
try {
  event = JSON.parse(raw);
} catch {
  process.exit(0);
}

const { tool_name, tool_input } = event;

if (tool_name !== 'Write' && tool_name !== 'Edit') process.exit(0);

const filePath = tool_input?.file_path ?? '';
if (!filePath) process.exit(0);

const fileName = basename(filePath);

// 필터: AI자동화_*.md 패턴 + 경로에 outputs 포함
if (!fileName.startsWith('AI자동화_') || !fileName.endsWith('.md')) process.exit(0);
if (!filePath.includes('outputs')) process.exit(0);

// 파일 타입 판별
let type = null;
if (fileName.includes('진단보고서')) type = '진단';
else if (fileName.includes('설계도')) type = '설계';
else if (fileName.includes('개발지침서')) type = '지침';

if (!type) process.exit(0);

// 검증 스크립트 호출 헬퍼
function runValidator(scriptName, args) {
  const scriptPath = resolve(SCRIPT_DIR, scriptName);
  if (!existsSync(scriptPath)) {
    return { valid: false, errors: [`스크립트 없음: ${scriptName}`] };
  }
  try {
    const cmd = `node "${scriptPath}" ${args.map(a => `"${a}"`).join(' ')}`;
    const output = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(output);
  } catch (err) {
    return { valid: false, errors: [`스크립트 실행 실패 (${scriptName}): ${err.message}`] };
  }
}

// 검증 스크립트 4개 호출
const validators = [
  { name: 'frontmatter', script: 'validate_frontmatter.mjs', args: [filePath, type] },
  { name: 'sections', script: 'validate_sections.mjs', args: [filePath, type] },
  { name: 'later', script: 'validate_later.mjs', args: [filePath] },
  { name: 'checklist_meta', script: 'validate_checklist_meta.mjs', args: [filePath, type] },
];

const results = validators.map(v => ({
  name: v.name,
  result: runValidator(v.script, v.args),
}));

const allValid = results.every(r => r.result.valid);

// 검증 실패 시 errors 출력 + 자식N 회귀 안내
if (!allValid) {
  let msg = `[웹자동화] ${type} 검증 실패 — 자식N 자동 회귀 필요 (사이클 N+1, 한도 3회):\n\n`;
  for (const r of results) {
    if (!r.result.valid) {
      msg += `  [${r.name}]\n`;
      const errors = r.result.errors || [];
      for (const e of errors) {
        msg += `    - ${e}\n`;
      }
      // later_markers 별도 처리
      if (r.name === 'later' && r.result.later_markers?.length > 0) {
        for (const m of r.result.later_markers) {
          msg += `    - 라인 ${m.line}: ${m.text}\n`;
        }
      }
    }
  }
  msg += '\n자식N가 부족 항목을 보강해 다시 작성합니다.\n';
  process.stdout.write(msg);
  process.exit(0);
}

// 모두 통과 — 다음 단계 안내
if (type === '진단') {
  process.stdout.write('[웹자동화] 진단 보고서 검증 통과 (4중 가드) → 자식2(설계도) 작성을 시작합니다.\n');
} else if (type === '설계') {
  process.stdout.write('[웹자동화] 설계도 검증 통과 (4중 가드) → 자식3(개발지침서) 작성을 시작합니다.\n');
} else if (type === '지침') {
  const cycleDir = dirname(filePath);
  let msg = '[웹자동화] 지침서 검증 통과 (4중 가드) → 사이클 완료!\n\n생성된 산출물:\n';

  if (existsSync(cycleDir)) {
    const files = readdirSync(cycleDir)
      .filter(f => f.startsWith('AI자동화_') && f.endsWith('.md'))
      .sort();
    for (const f of files) {
      msg += `  - ${cycleDir}\\${f}\n`;
    }
  }

  msg += '\n새 사이클을 시작하려면 /웹자동화 를 다시 실행하세요.\n';
  process.stdout.write(msg);
}

process.exit(0);
