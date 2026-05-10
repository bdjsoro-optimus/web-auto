#!/usr/bin/env node
// validate_checklist_meta.mjs — 체크리스트 메타 점검 결정론적 검증
//
// 체크리스트 메타 점검 항목 중 정규식·문자열 검색으로 판별 가능한 항목들 자동 검증.
// 의미적 판단(P0 명확성·톤 친근 등)은 LLM 자율 영역이라 본 스크립트에서 제외.
//
// 사용:
//   node validate_checklist_meta.mjs <절대경로> <type>
//   type: "진단" | "설계" | "지침"
//
// 출력 (stdout JSON):
//   { valid: bool, checks: { ... }, errors: [...] }

import { readFileSync, existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';

function emit(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  process.exit(0);
}

const filePath = process.argv[2];
const type = process.argv[3];

if (!filePath || !type) {
  process.stderr.write('Usage: node validate_checklist_meta.mjs <md-file-path> <type>\n');
  process.stderr.write('  type: "진단" | "설계" | "지침"\n');
  process.exit(1);
}

if (!['진단', '설계', '지침'].includes(type)) {
  emit({ valid: false, checks: {}, errors: [`알 수 없는 타입: "${type}"`] });
}

if (!isAbsolute(filePath) || !existsSync(filePath)) {
  emit({ valid: false, checks: {}, errors: [`파일 없음 또는 절대경로 아님: ${filePath}`] });
}

const content = readFileSync(filePath, 'utf8');

// 공통 검증 함수
const hasSearchDateFooter = () => /검색일:\s*\d{4}-\d{2}-\d{2}/.test(content);
const countCodeBlocks = () => (content.match(/```/g) || []).length / 2;

// 검색일이 오늘 날짜와 일치하는지 검증 (LLM 학습 시점 옛 정보 차단)
const checkSearchDateIsToday = () => {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const allDates = [...content.matchAll(/검색일:?\s*(\d{4}-\d{2}-\d{2})/g)].map(m => m[1]);
  if (allDates.length === 0) return { ok: false, today, found: [] };
  const uniqueDates = [...new Set(allDates)];
  const allMatch = uniqueDates.every(d => d === today);
  return { ok: allMatch, today, found: uniqueDates };
};
const countPlaceholders = () => {
  // {{...}}, [TODO], [XXX], <FILL_HERE> 같은 미완성 마커
  const patterns = [/\{\{[^}]+\}\}/g, /\[TODO\]/gi, /\[XXX\]/gi, /<FILL[_\s]*HERE>/gi];
  return patterns.reduce((sum, p) => sum + (content.match(p) || []).length, 0);
};

const checks = {};
const errors = [];

if (type === '진단') {
  // 1. 검색일 푸터
  checks['검색일_푸터'] = hasSearchDateFooter();
  if (!checks['검색일_푸터']) errors.push('검색일 YYYY-MM-DD 푸터 누락');

  // 1-2. 검색일이 오늘 날짜와 일치 (LLM 학습 시점 옛 정보 차단)
  const dateCheck = checkSearchDateIsToday();
  checks['검색일_오늘'] = dateCheck.ok;
  if (!dateCheck.ok) errors.push(`검색일이 오늘(${dateCheck.today})과 불일치 — 발견: ${dateCheck.found.join(', ') || '없음'} (WebSearch 미실행 의심)`);

  // 2. 실행 코드 없음 (진단 보고서엔 실행 코드 X — 단 §2 자동화 요청의 텍스트 박스 ``` 는 OK)
  // ``` 단순 카운트 X — 실제 코드 키워드(function·const·class·=>) 검사
  const hasRealCode = /(?:function\s+\w|const\s+\w+\s*=|class\s+\w+|=>)/.test(content);
  checks['실행_코드_없음'] = !hasRealCode;
  if (!checks['실행_코드_없음']) errors.push('실행 가능 코드 발견 — 진단 보고서엔 코드 X (설계도·지침서 영역)');

  // 3. 인적 정보 수집 안 함 — §1 분석 주제에 "이름·소속·이메일" 필드 없는지
  const hasPersonalInfo = /\*\*이름\*\*|\*\*소속\*\*|\*\*이메일\*\*/.test(content);
  checks['인적_정보_없음'] = !hasPersonalInfo;
  if (!checks['인적_정보_없음']) errors.push('§1 분석 주제에 인적 정보(이름·소속·이메일) 발견 — v4 결정 위반');

  // 4. 양식 헤더 이모지 사용 (10섹션 모두)
  const requiredEmojis = ['📋', '🎯', '🤖', '🛠️', '📦', '📝', '⏱️', '💡', '📚'];
  const missingEmojis = requiredEmojis.filter((e) => !content.includes(e));
  checks['양식_이모지_사용'] = missingEmojis.length === 0;
  if (!checks['양식_이모지_사용']) errors.push(`양식 헤더 이모지 누락: ${missingEmojis.join(' · ')}`);
}

if (type === '설계') {
  // 1. inline (← 진단 §N) 출처 표기 1개 이상
  const inlineSourceCount = (content.match(/\(←\s*진단\s*§\d+/g) || []).length;
  checks['inline_출처_표기'] = inlineSourceCount > 0;
  if (!checks['inline_출처_표기']) errors.push('inline (← 진단 §N) 출처 표기 0개 — 모든 결정에 출처 명시 원칙 위반');

  // 2. 코드 블록 없음 (설계도엔 코드 X — 002 원칙)
  // 단 텍스트 다이어그램은 ``` 코드 블록 사용 가능 — 따라서 코드 키워드 검사로 우회
  // 실제 코드 패턴 (function, const, class, =>) 검사
  const hasRealCode = /(?:function\s+\w|const\s+\w+\s*=|class\s+\w+|=>)/.test(content);
  checks['실행_코드_없음'] = !hasRealCode;
  if (!checks['실행_코드_없음']) errors.push('실행 가능 코드 발견 — 설계도엔 코드 X (지침서 영역)');

  // 3. 검색일 푸터
  checks['검색일_푸터'] = hasSearchDateFooter();
  if (!checks['검색일_푸터']) errors.push('검색일 YYYY-MM-DD 푸터 누락');

  // 3-2. 검색일이 오늘 날짜와 일치
  const dateCheckS = checkSearchDateIsToday();
  checks['검색일_오늘'] = dateCheckS.ok;
  if (!dateCheckS.ok) errors.push(`검색일이 오늘(${dateCheckS.today})과 불일치 — 발견: ${dateCheckS.found.join(', ') || '없음'} (WebSearch 미실행 의심)`);

  // 4. "지침서 §N로 위임" 명시 1개 이상
  const delegateCount = (content.match(/지침서\s*§\d+로?\s*위임/g) || []).length;
  checks['지침서_위임_명시'] = delegateCount > 0;
  if (!checks['지침서_위임_명시']) errors.push('"지침서 §N로 위임" 명시 0개 — 002 원칙 위반');
}

if (type === '지침') {
  // 1. inline (← 설계 §N) 출처 표기 1개 이상
  const inlineSourceCount = (content.match(/\(←\s*설계\s*§\d+/g) || []).length;
  checks['inline_출처_표기'] = inlineSourceCount > 0;
  if (!checks['inline_출처_표기']) errors.push('inline (← 설계 §N) 출처 표기 0개 — 모든 구현 결정에 출처 명시 원칙 위반');

  // 2. placeholder/미완성 마커 0개
  const phCount = countPlaceholders();
  checks['placeholder_없음'] = phCount === 0;
  if (!checks['placeholder_없음']) errors.push(`placeholder/미완성 마커 ${phCount}개 발견 — 모든 코드 실행 가능해야 함`);

  // 3. 환경 변수 ⚠️ 보안 권고 명시
  const hasSecurityWarning = /⚠️/.test(content) && /(\.env|PropertiesService|API[_\s]?KEY|시크릿|secret)/i.test(content);
  checks['환경변수_보안_권고'] = hasSecurityWarning;
  if (!checks['환경변수_보안_권고']) errors.push('환경 변수 ⚠️ 보안 권고 명시 누락');

  // 4. 검색일 푸터
  checks['검색일_푸터'] = hasSearchDateFooter();
  if (!checks['검색일_푸터']) errors.push('검색일 YYYY-MM-DD 푸터 누락');

  // 4-2. 검색일이 오늘 날짜와 일치
  const dateCheckG = checkSearchDateIsToday();
  checks['검색일_오늘'] = dateCheckG.ok;
  if (!dateCheckG.ok) errors.push(`검색일이 오늘(${dateCheckG.today})과 불일치 — 발견: ${dateCheckG.found.join(', ') || '없음'} (WebSearch 미실행 의심)`);
}

emit({
  valid: errors.length === 0,
  checks,
  errors,
});
