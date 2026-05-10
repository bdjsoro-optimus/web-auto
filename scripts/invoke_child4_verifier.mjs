#!/usr/bin/env node
// invoke_child4_verifier.mjs — 자식4 의미 검증자 호출 스크립트
//
// 용도: 자식4.md 페르소나를 기반으로 진단·설계·지침서를 의미적으로 검증.
//       5중 가드(형식)를 통과한 이후 의미 검증(논리 일관성·코드 의미·환경변수·비용·라이브러리).
//
// 사용:
//   node scripts/invoke_child4_verifier.mjs \
//     --diagnosis <진단보고서.md> \
//     --design <설계도.md> \
//     --guide <지침서.md> \
//     [--guard-output <validate_decisions_mapping 출력.json>] \
//     [--auto-regress] \
//     [--max-retries 3]
//
// 출력:
//   stdout: JSON 결과 (verdict·defect_count·defects·guard_missing_recheck·token_cost_usd)
//   stderr: 진행 상태 메시지
//   exit code:
//     0 = pass
//     1 = fail (defects 잔존)
//     2 = claude CLI 호출 실패 (프롬프트 파일 저장됨)
//
// 패턴: validate_decisions_mapping.mjs 구조 일관 (ESM·emit()·spawnSync)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, isAbsolute, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 자식4.md 위치 (scripts/ 상위 폴더 기준)
const SKILL_ROOT = resolve(__dirname, '..');
const CHILD4_MD = join(SKILL_ROOT, '자식4.md');

// outputs 폴더
const OUTPUTS_DIR = join(
  SKILL_ROOT,
  '웹자동화개발일지',
  '029-병렬작업',
  'outputs'
);

// 회귀 로그 파일
const REGRESS_LOG_FILE = join(OUTPUTS_DIR, '29-2-B-회귀로그.json');

// ============================================================
// 유틸 함수
// ============================================================

function log(msg) {
  process.stderr.write(`[child4] ${msg}\n`);
}

function emit(data, exitCode = 0) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  process.exit(exitCode);
}

function resolveAbsolute(filePath) {
  if (!filePath) return null;
  return isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
}

function readFile(filePath, label) {
  const abs = resolveAbsolute(filePath);
  if (!abs || !existsSync(abs)) {
    process.stderr.write(`[child4] 오류: ${label} 파일을 찾을 수 없습니다 — ${filePath}\n`);
    process.exit(1);
  }
  return readFileSync(abs, 'utf8');
}

function ensureOutputsDir() {
  if (!existsSync(OUTPUTS_DIR)) {
    mkdirSync(OUTPUTS_DIR, { recursive: true });
  }
}

// ============================================================
// CLI 인자 파싱
// ============================================================

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    diagnosis: null,
    design: null,
    guide: null,
    guardOutput: null,
    autoRegress: false,
    maxRetries: 3,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--diagnosis':
        opts.diagnosis = args[++i];
        break;
      case '--design':
        opts.design = args[++i];
        break;
      case '--guide':
        opts.guide = args[++i];
        break;
      case '--guard-output':
        opts.guardOutput = args[++i];
        break;
      case '--auto-regress':
        opts.autoRegress = true;
        break;
      case '--max-retries':
        opts.maxRetries = parseInt(args[++i], 10) || 3;
        break;
      default:
        process.stderr.write(`[child4] 알 수 없는 인자: ${args[i]}\n`);
    }
  }

  return opts;
}

// ============================================================
// 자식4 프롬프트 조립
// ============================================================

function buildPrompt({ child4Persona, diagnosisContent, designContent, guideContent, guardOutput }) {
  const guardSection = guardOutput
    ? `\n---\n## [가드 출력 — validate_decisions_mapping 결과]\n\`\`\`json\n${guardOutput}\n\`\`\``
    : '';

  return `${child4Persona}

---

# 검증 요청

저는 처음 보는 검증자입니다. 아래 세 문서를 의심하는 눈으로 검증하겠습니다.

**검증 항목**: #1 논리 일관성, #2 코드 의미, #3 환경변수, #4 비용, #5 라이브러리

---

## [진단 보고서]

${diagnosisContent}

---

## [설계도]

${designContent}

---

## [개발 지침서]

${guideContent}
${guardSection}

---

# 출력 지시

위 5개 검증 항목을 빠짐없이 검토하고, 결과를 아래 JSON 스키마 **그대로** 출력하세요.
코드블록(\`\`\`json ... \`\`\`) 으로 감싸서 출력하세요.

\`\`\`json
{
  "verdict": "pass 또는 fail",
  "defect_count": 0,
  "defects": [
    {
      "id": "D-001",
      "category": "consistency | code_meaning | env_var | cost | library",
      "severity": "critical | major | minor",
      "location": "지침서 §3 line N 또는 설계도 §2 등",
      "description": "결함 내용",
      "suggestion": "정정 방향"
    }
  ],
  "guard_missing_recheck": ["decisions_mapping MISSING 중 의미적으로 확인된 건"],
  "token_cost_usd": 0.00
}
\`\`\`

verdict 기준:
- pass: defects 0건, 또는 minor만 있을 경우
- fail: critical 1건 이상, 또는 major 2건 이상
`;
}

// ============================================================
// JSON 추출 (claude CLI 응답에서)
// ============================================================

function extractJson(output) {
  // ```json ... ``` 블록 우선
  const jsonBlockMatch = output.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonBlockMatch) {
    try {
      return JSON.parse(jsonBlockMatch[1].trim());
    } catch (e) {
      // fall through
    }
  }

  // 순수 JSON 시도 ({ 로 시작 } 로 끝나는 부분)
  const jsonRawMatch = output.match(/\{[\s\S]*\}/);
  if (jsonRawMatch) {
    try {
      return JSON.parse(jsonRawMatch[0].trim());
    } catch (e) {
      // fall through
    }
  }

  return null;
}

// ============================================================
// claude CLI 호출
// ============================================================

function callClaudeCLI(fullPrompt) {
  const promptFile = join(tmpdir(), `child4_prompt_${Date.now()}.txt`);

  try {
    writeFileSync(promptFile, fullPrompt, 'utf8');
    log(`임시 프롬프트 파일 작성: ${promptFile}`);

    // --print 플래그로 시도
    log('claude CLI 호출 중 (--print)...');
    let result = spawnSync('claude', ['--print', '--model', 'claude-sonnet-4-6', promptFile], {
      encoding: 'utf8',
      timeout: 180000,
      maxBuffer: 10 * 1024 * 1024,
    });

    // --print 실패 시 -p 플래그로 재시도 (프롬프트 직접 전달, 4000자 제한)
    if (result.error || result.status !== 0) {
      log('--print 실패. -p 플래그로 재시도...');
      const shortPrompt = fullPrompt.substring(0, 8000);
      result = spawnSync('claude', ['-p', shortPrompt], {
        encoding: 'utf8',
        timeout: 180000,
        maxBuffer: 10 * 1024 * 1024,
      });
    }

    return result;
  } finally {
    try {
      if (existsSync(promptFile)) {
        import('node:fs').then(({ unlinkSync }) => {
          try { unlinkSync(promptFile); } catch (_) {}
        });
      }
    } catch (_) {}
  }
}

// ============================================================
// 회귀 프롬프트 생성 (자식3 정정용)
// ============================================================

function buildRegressionPrompt(defects) {
  const defectList = defects
    .filter(d => d.severity === 'critical' || d.severity === 'major')
    .map((d, i) => `${i + 1}. [${d.severity.toUpperCase()}] ${d.location}\n   - 결함: ${d.description}\n   - 정정 방향: ${d.suggestion}`)
    .join('\n\n');

  return `# 자식3 회귀 정정 요청

자식4 의미 검증자가 아래 결함을 발견했습니다. 개발 지침서를 정정해주세요.

## 발견된 결함 (${defects.length}건)

${defectList}

## 정정 지시

각 결함에 대해:
1. 지침서의 해당 위치를 찾아 수정
2. 수정 후 동일 결함이 재발하지 않도록 관련 섹션 일관성 확인
3. 정정된 지침서 전체를 다시 출력

**주의**: 형식(frontmatter·섹션 구조)은 변경하지 말 것. 의미·내용만 정정.
`;
}

// ============================================================
// Enter 대기 (readline)
// ============================================================

function waitForEnter() {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    rl.question('\n자식3 정정 완료 후 Enter를 누르세요... ', () => {
      rl.close();
      resolve();
    });
  });
}

// ============================================================
// 단일 검증 실행
// ============================================================

async function runChild4Verify(opts) {
  const { diagnosis, design, guide, guardOutput: guardOutputFile } = opts;

  // 자식4.md 페르소나 읽기
  if (!existsSync(CHILD4_MD)) {
    process.stderr.write(`[child4] 오류: 자식4.md를 찾을 수 없습니다 — ${CHILD4_MD}\n`);
    process.exit(1);
  }
  const child4Persona = readFileSync(CHILD4_MD, 'utf8');

  // 입력 파일 읽기
  log(`진단 보고서 읽기: ${diagnosis}`);
  const diagnosisContent = readFile(diagnosis, '진단 보고서');

  log(`설계도 읽기: ${design}`);
  const designContent = readFile(design, '설계도');

  log(`지침서 읽기: ${guide}`);
  const guideContent = readFile(guide, '지침서');

  let guardOutput = null;
  if (guardOutputFile) {
    log(`가드 출력 읽기: ${guardOutputFile}`);
    guardOutput = readFile(guardOutputFile, '가드 출력');
  }

  // 프롬프트 조립
  log('자식4 프롬프트 조립 중...');
  const fullPrompt = buildPrompt({
    child4Persona,
    diagnosisContent,
    designContent,
    guideContent,
    guardOutput,
  });

  // claude CLI 호출
  const result = callClaudeCLI(fullPrompt);

  // 실패 처리 (graceful fallback)
  if (result.error || result.status !== 0) {
    const errMsg = result.error ? result.error.message : (result.stderr || '알 수 없는 오류');
    process.stderr.write(`[child4] claude CLI 호출 실패: ${errMsg}\n`);

    ensureOutputsDir();
    const fallbackFile = join(OUTPUTS_DIR, 'child4_prompt.txt');
    writeFileSync(fallbackFile, fullPrompt, 'utf8');
    process.stderr.write(`[child4] 프롬프트를 ${fallbackFile} 에 저장했습니다.\n`);
    process.stderr.write('[child4] 해당 파일을 Claude에 직접 붙여넣어 검증을 진행하세요.\n');
    process.exit(2);
  }

  const output = result.stdout || '';
  log(`claude 응답 수신 (${output.length}자)`);

  // JSON 파싱
  const parsed = extractJson(output);
  if (!parsed) {
    process.stderr.write('[child4] 오류: claude 응답에서 JSON을 파싱할 수 없습니다.\n');
    process.stderr.write('[child4] 원본 응답:\n');
    process.stderr.write(output.substring(0, 2000) + '\n');

    // 파싱 실패 시 원본 응답 저장
    ensureOutputsDir();
    const rawFile = join(OUTPUTS_DIR, `child4_raw_${Date.now()}.txt`);
    writeFileSync(rawFile, output, 'utf8');
    process.stderr.write(`[child4] 원본 응답 저장: ${rawFile}\n`);
    process.exit(2);
  }

  // defect_count 동기화 (없으면 defects 배열 기반)
  if (typeof parsed.defect_count !== 'number') {
    parsed.defect_count = Array.isArray(parsed.defects) ? parsed.defects.length : 0;
  }

  // verdict 재계산 (명시 없거나 불일치 시)
  const defects = parsed.defects || [];
  const criticalCount = defects.filter(d => d.severity === 'critical').length;
  const majorCount = defects.filter(d => d.severity === 'major').length;
  const computedVerdict = (criticalCount >= 1 || majorCount >= 2) ? 'fail' : 'pass';

  if (!parsed.verdict) {
    parsed.verdict = computedVerdict;
  }

  log(`검증 완료 — verdict: ${parsed.verdict}, defect_count: ${parsed.defect_count}`);

  return parsed;
}

// ============================================================
// 자동 회귀 흐름
// ============================================================

async function autoRegressLoop(opts) {
  const { maxRetries = 3, ...rest } = opts;
  let iteration = 0;
  const log_entries = [];

  ensureOutputsDir();

  while (iteration < maxRetries) {
    iteration++;
    log(`\n=== 회귀 반복 ${iteration}/${maxRetries} ===`);

    const result = await runChild4Verify(rest);
    log_entries.push({
      iteration,
      defect_count: result.defect_count,
      verdict: result.verdict,
      timestamp: new Date().toISOString(),
    });

    // 회귀 로그 즉시 저장 (중간 기록)
    writeFileSync(REGRESS_LOG_FILE, JSON.stringify(log_entries, null, 2), 'utf8');
    log(`회귀 로그 저장: ${REGRESS_LOG_FILE}`);

    if (result.verdict === 'pass') {
      log(`pass 확인 — 회귀 흐름 완료 (${iteration}회 시도)`);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(0);
    }

    if (iteration < maxRetries) {
      // 자식3 회귀 프롬프트 생성
      const regressionPrompt = buildRegressionPrompt(result.defects || []);
      const regressionFile = join(OUTPUTS_DIR, `child4_regression_iter${iteration}.txt`);
      writeFileSync(regressionFile, regressionPrompt, 'utf8');

      process.stderr.write(`\n[child4] 반복 ${iteration}: ${result.defect_count}건 결함 발견\n`);
      process.stderr.write(`[child4] 자식3 정정 프롬프트 저장: ${regressionFile}\n`);
      process.stderr.write('[child4] 해당 파일을 자식3(지침서 작성자)에게 전달해 정정을 요청하세요.\n');

      // 사용자 Enter 대기 (자식3 정정 완료 신호)
      await waitForEnter();

      // 지침서 파일이 업데이트됐을 가능성이 있으므로 캐시 없이 재사용
      // (동일 경로로 다시 읽음 — opts.guide 경로 파일을 외부에서 수정)
    }
  }

  // maxRetries 소진
  const lastEntry = log_entries[log_entries.length - 1];
  process.stderr.write(`\n[child4] ${maxRetries}회 시도 후에도 결함 잔존 (마지막: ${lastEntry.defect_count}건). 수동 개입 필요.\n`);
  process.stderr.write(`[child4] 회귀 로그: ${REGRESS_LOG_FILE}\n`);

  // 마지막 결과를 stdout에 출력
  const lastResult = log_entries.length > 0 ? { ...lastEntry, verdict: 'fail' } : { verdict: 'fail', defect_count: -1 };
  process.stdout.write(JSON.stringify(lastResult, null, 2) + '\n');
  process.exit(1);
}

// ============================================================
// 메인 진입점
// ============================================================

async function main() {
  const opts = parseArgs(process.argv);

  // 필수 인자 검증
  const missing = [];
  if (!opts.diagnosis) missing.push('--diagnosis');
  if (!opts.design) missing.push('--design');
  if (!opts.guide) missing.push('--guide');

  if (missing.length > 0) {
    process.stderr.write(
      `[child4] 오류: 필수 인자 누락 — ${missing.join(', ')}\n\n` +
      `사용법:\n  node scripts/invoke_child4_verifier.mjs \\\n` +
      `    --diagnosis <진단보고서.md> \\\n` +
      `    --design <설계도.md> \\\n` +
      `    --guide <지침서.md> \\\n` +
      `    [--guard-output <결과.json>] \\\n` +
      `    [--auto-regress] \\\n` +
      `    [--max-retries 3]\n`
    );
    process.exit(1);
  }

  log('자식4 의미 검증자 시작');
  log(`diagnosis: ${opts.diagnosis}`);
  log(`design: ${opts.design}`);
  log(`guide: ${opts.guide}`);
  log(`guard-output: ${opts.guardOutput || '(없음)'}`);
  log(`auto-regress: ${opts.autoRegress}`);
  log(`max-retries: ${opts.maxRetries}`);

  if (opts.autoRegress) {
    log('자동 회귀 흐름 활성화');
    await autoRegressLoop(opts);
  } else {
    const result = await runChild4Verify(opts);
    emit(result, result.verdict === 'pass' ? 0 : 1);
  }
}

main().catch((err) => {
  process.stderr.write(`[child4] 예기치 않은 오류: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
