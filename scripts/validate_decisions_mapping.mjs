#!/usr/bin/env node
// validate_decisions_mapping.mjs — 설계→지침서 결정 매핑 가드 (5번째 가드)
//
// 용도: 설계도(§2 P0/P1/P2 + §3 외부 시스템 + §6 API 엔드포인트)에서 추출한
//       결정사항이 지침서(§1·§3·§4·§5·§6·§7)에 모두 반영됐는지 검증.
//
// v1 (2026-05-10): 초기 — 필라테스 도메인 하드코딩 ALIASES 기반
// v2 (2026-05-10): 도메인 하드코딩 제거 → 설계도 직접 파싱 + 동적 검색
//   - ALIASES 사전 완전 제거 (범용화)
//   - §4(API 구현) 추가 (가중치 4 — API 경로의 표준 위치)
//   - §7(개발 로드맵) 추가 (가중치 1 — 기능명 재등장 위치)
//   - §3 서비스 추출: bold·목록 패턴으로 직접 추출
//   - §6 API 경로: 경로 문자열 직접 검색
//   - §2 기능명: 핵심 토큰화 후 검색
//
// 사용:
//   node validate_decisions_mapping.mjs <설계.md> <지침서.md>

import { readFileSync, existsSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';

// ============================================================
// 상수
// ============================================================

// 한국어 기능명 토큰화 시 제외할 범용 단어 (최소한으로 유지)
const KR_STOPWORDS = new Set([
  '및', '또는', '포함', '통합', '자동', '처리', '연동',
]);

// 가중 점수 (합계 11점)
// §4(API 구현)에 최고 비중 — API 경로 정의의 표준 섹션
const SECTION_WEIGHTS = {
  guide_section_1: 2, // 아키텍처·라이브러리 (서비스명 첫 등장)
  guide_section_3: 2, // 워크플로·코드 (기능 구현 코드)
  guide_section_4: 4, // API 구현 (API 경로 정의의 표준 위치) ← NEW
  guide_section_5: 1, // 배포·환경변수
  guide_section_6: 1, // 비용 분석
  guide_section_7: 1, // 개발 로드맵 (기능명 재등장) ← NEW
};

// 판정 임계 (max=11)
// MISSING: 어디에도 없음 / WARNING: 일부만 반영 / OK: 충분히 반영
const THRESHOLDS = {
  missing: 2, // score < 2  → MISSING
  warning: 4, // score < 4  → WARNING, score >= 4 → OK
};

// ============================================================
// 유틸
// ============================================================

function emit(data, exitCode = 0) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  process.exit(exitCode);
}

function readMd(absPath, errors) {
  if (!isAbsolute(absPath)) {
    errors.push(`절대경로여야 합니다: "${absPath}"`);
    return null;
  }
  if (!existsSync(absPath)) {
    errors.push(`파일 없음: ${absPath}`);
    return null;
  }
  return readFileSync(absPath, 'utf8');
}

// case-insensitive 포함 검색
function textHit(haystack, term) {
  if (!haystack || !term) return false;
  return haystack.toLowerCase().includes(term.toLowerCase());
}

// ============================================================
// 결정사항 → 검색 토큰 빌드 (도메인 독립)
// ============================================================

function buildSearchTerms(decision, designSource) {
  // §6 API 경로: 경로 문자열 직접 사용 (가장 신뢰도 높음)
  if (designSource.includes('§6 API')) {
    const pathMatch = decision.match(/\/api\/[\w\-\/\[\]]+/);
    if (pathMatch) return [pathMatch[0]];
    return [decision];
  }

  // §3 외부 서비스: 서비스 이름 자체가 토큰 (고유명사 직접 검색)
  if (designSource.includes('§3 외부')) {
    // 괄호·공백·콜론 앞 첫 단어만 (예: "Next.js 14" → "Next.js")
    const main = decision.split(/[\s(:]/)[0].trim();
    return (main && main !== decision) ? [main, decision] : [decision];
  }

  // §2 P0/P1/P2 기능명: 한국어 의미 토큰 추출
  const tokens = decision
    .split(/[·\s,+&·\/]+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !KR_STOPWORDS.has(t));

  return tokens.length > 0 ? tokens : [decision];
}

// ============================================================
// 설계.md 파서 — §2 P0/P1/P2 기능 + §3 외부 시스템 + §6 API
// ============================================================

function parseDesignDecisions(content) {
  const decisions = [];
  const lines = content.split(/\r?\n/);
  const sections = splitByHeading(lines, /^##\s+/);

  for (const sec of sections) {
    const heading = sec.heading || '';

    // §2 기능 요구사항 — 표에서 P0/P1/P2 기능명 추출
    if (/^##\s+2\.\s/.test(heading) || heading.includes('기능 요구사항')) {
      for (const row of extractTableRows(sec.body)) {
        const prio = (row[0] || '').trim();
        if (/^P[012]$/.test(prio)) {
          const feature = (row[1] || '').trim();
          if (feature) {
            decisions.push({
              decision: feature,
              design_source: `§2 ${prio} 기능`,
              priority: prio,
            });
          }
        }
      }
    }

    // §3 시스템 아키텍처 — 외부 서비스명 직접 추출 (도메인 독립)
    if (/^##\s+3\.\s/.test(heading) || heading.includes('시스템 아키텍처')) {
      const seen = new Set();

      const addService = (word) => {
        const clean = word.split(/[:·(\s]/)[0].trim();
        if (clean.length >= 2 && !seen.has(clean)) {
          seen.add(clean);
          decisions.push({
            decision: clean,
            design_source: '§3 외부 서비스/기술 스택',
            priority: 'tech',
          });
        }
      };

      // 패턴 1: **ServiceName** — bold 텍스트가 직접 서비스명인 경우 (ASCII 포함)
      // 예: "**Solapi**: 카카오 알림톡", "**Next.js**: ..."
      for (const m of sec.body.matchAll(/\*\*([^*\n]+)\*\*/g)) {
        const word = m[1].split(/[:·\s(]/)[0].trim();
        if (/[A-Za-z]/.test(word)) {
          addService(word);
        }
      }

      // 패턴 2: **한국어라벨**: ServiceName — bold 라벨 뒤 값이 서비스명
      // 예: "**프론트엔드**: Next.js 14", "**데이터베이스**: Supabase"
      for (const m of sec.body.matchAll(/\*\*[^*]*\*\*\s*:\s*([A-Z][a-zA-Z0-9.\-]+)/gm)) {
        addService(m[1].trim());
      }

      // 패턴 3: 리스트 항목 첫 단어가 대문자 영어 서비스명
      // 예: "- Vercel: Next.js 공식 플랫폼"
      for (const m of sec.body.matchAll(/^[-*]\s+([A-Z][a-zA-Z0-9.\-]+)/gm)) {
        addService(m[1].trim());
      }
    }

    // §6 API 명세 — 표에서 엔드포인트 경로 추출
    if (/^##\s+6\.\s/.test(heading) || heading.includes('API 명세') || heading.includes('API 엔드포인트')) {
      for (const row of extractTableRows(sec.body)) {
        const path = (row[1] || '').trim();
        if (/^\/api\//.test(path)) {
          const method = (row[0] || '').trim();
          decisions.push({
            decision: `${method} ${path}`,
            design_source: '§6 API 엔드포인트',
            priority: 'api',
          });
        }
      }
    }
  }

  // 중복 제거 (decision 문자열 기준)
  const seen = new Set();
  return decisions.filter(d => {
    if (seen.has(d.decision)) return false;
    seen.add(d.decision);
    return true;
  });
}

// ============================================================
// 지침서.md 파서 — §1·§3·§4·§5·§6·§7 본문 추출
// ============================================================

function parseGuideSections(content) {
  const lines = content.split(/\r?\n/);
  const sections = splitByHeading(lines, /^##\s+/);

  const result = {
    guide_section_1: '', // 아키텍처·라이브러리
    guide_section_3: '', // 워크플로·코드
    guide_section_4: '', // API 구현 ← NEW
    guide_section_5: '', // 배포·환경변수
    guide_section_6: '', // 비용 분석
    guide_section_7: '', // 개발 로드맵 ← NEW
  };

  for (const sec of sections) {
    const heading = sec.heading || '';
    if (/^##\s+1\.\s/.test(heading)) result.guide_section_1 += sec.body + '\n';
    if (/^##\s+3\.\s/.test(heading)) result.guide_section_3 += sec.body + '\n';
    if (/^##\s+4\.\s/.test(heading)) result.guide_section_4 += sec.body + '\n';
    if (/^##\s+5\.\s/.test(heading)) result.guide_section_5 += sec.body + '\n';
    if (/^##\s+6\.\s/.test(heading)) result.guide_section_6 += sec.body + '\n';
    if (/^##\s+7\.\s/.test(heading)) result.guide_section_7 += sec.body + '\n';
  }
  return result;
}

// ============================================================
// 공통 — Markdown 헤더 split / 표 행 추출
// ============================================================

function splitByHeading(lines, headingRe) {
  const sections = [];
  let cur = { heading: '', body: '' };
  for (const line of lines) {
    if (headingRe.test(line)) {
      if (cur.heading || cur.body) sections.push(cur);
      cur = { heading: line, body: '' };
    } else {
      cur.body += line + '\n';
    }
  }
  if (cur.heading || cur.body) sections.push(cur);
  return sections;
}

function extractTableRows(body) {
  const rows = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) continue;
    if (/^\|[\s\-:|]+\|$/.test(trimmed)) continue;
    rows.push(trimmed.slice(1, -1).split('|').map(c => c.trim()));
  }
  return rows;
}

// ============================================================
// 매칭·판정 로직
// ============================================================

function evaluateDecision(decision, designSource, guideSections) {
  const terms = buildSearchTerms(decision, designSource);

  const guideCheck = {};
  let score = 0;
  for (const [secKey, weight] of Object.entries(SECTION_WEIGHTS)) {
    // terms 중 하나라도 해당 섹션에 등장하면 hit
    const hit = terms.some(t => textHit(guideSections[secKey], t));
    guideCheck[secKey] = hit;
    if (hit) score += weight;
  }

  let verdict;
  if (score < THRESHOLDS.missing) verdict = 'MISSING';
  else if (score < THRESHOLDS.warning) verdict = 'WARNING';
  else verdict = 'OK';

  return {
    decision,
    design_source: designSource,
    search_terms: terms,
    guide_check: guideCheck,
    score,
    verdict,
  };
}

// ============================================================
// 메인
// ============================================================

const designPath = process.argv[2];
const guidePath  = process.argv[3];

if (!designPath || !guidePath) {
  process.stderr.write('Usage: node validate_decisions_mapping.mjs <설계.md> <지침서.md>\n');
  process.exit(1);
}

const errors    = [];
const designAbs = isAbsolute(designPath) ? designPath : resolve(designPath);
const guideAbs  = isAbsolute(guidePath)  ? guidePath  : resolve(guidePath);

const designContent = readMd(designAbs, errors);
const guideContent  = readMd(guideAbs,  errors);

if (errors.length > 0) {
  emit({
    valid: false,
    errors,
    matrix: [],
    summary: { total_decisions: 0, ok: 0, warning: 0, missing: 0 },
    config: {},
  }, 1);
}

const decisions    = parseDesignDecisions(designContent);
const guideSections = parseGuideSections(guideContent);

const matrix = decisions.map(d =>
  evaluateDecision(d.decision, d.design_source, guideSections)
);

let ok = 0, warning = 0, missing = 0;
for (const m of matrix) {
  if      (m.verdict === 'OK')      ok++;
  else if (m.verdict === 'WARNING') warning++;
  else                              missing++;
}

for (const m of matrix) {
  if (m.verdict === 'MISSING') {
    errors.push(
      `결정 누락 — "${m.decision}" (${m.design_source}): score=${m.score}/11 ` +
      `— 지침서 §1/§3/§4/§5/§6/§7 어디에도 충분히 반영되지 않음`
    );
  }
}

emit({
  valid:   errors.length === 0,
  errors,
  matrix,
  summary: {
    total_decisions: matrix.length,
    ok,
    warning,
    missing,
  },
  config: {
    weights:   SECTION_WEIGHTS,
    threshold: THRESHOLDS,
    max_score: 11,
  },
});
