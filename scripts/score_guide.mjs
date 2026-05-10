#!/usr/bin/env node
// score_guide.mjs — 개발지침서 구현 가능성 채점 (7번째 가드, 결정론적)
// Usage: node scripts/score_guide.mjs <개발지침서.md>
// Exit 0: 100점 (pass) / Exit 1: 오류 / Exit 2: 100점 미만 (fail)

import { readFileSync } from 'fs';

const [,, guidePath] = process.argv;

if (!guidePath) {
  console.log(JSON.stringify({ error: '사용법: node scripts/score_guide.mjs <개발지침서.md>' }));
  process.exit(1);
}

let content;
try {
  content = readFileSync(guidePath, 'utf-8');
} catch {
  console.log(JSON.stringify({ error: `파일을 읽을 수 없습니다: ${guidePath}` }));
  process.exit(1);
}

function extractSection(text, num) {
  const re = new RegExp(`## ${num}\\.[^\\n]*\\n([\\s\\S]*?)(?=\\n## \\d+\\.|$)`);
  const m = text.match(re);
  return m ? m[1] : '';
}

function countCodeBlocks(text) {
  return (text.match(/```[\s\S]*?```/g) || []).length;
}

function hasPlaceholders(text) {
  // ${ 앞에 $ 있는 TypeScript template literal은 오탐 제외
  return /(?<!\$)\{[A-Za-z가-힣][^}\n]{0,40}\}/.test(text);
}

const RUBRIC = [
  {
    sectionNum: 1,
    name: '§1 아키텍처 구체',
    maxPoints: 15,
    checks: [
      {
        name: '기술 스택 테이블 ≥3행',
        points: 5,
        test: s => {
          const rows = (s.match(/^\|[^|\n]+\|/gm) || []).filter(r => !r.includes('---'));
          return rows.length >= 3;
        },
        diagnosis: '§1 기술 스택 테이블에 행이 3개 미만입니다. 프론트엔드·백엔드·DB 최소 3개 스택을 버전과 함께 작성하세요.'
      },
      {
        name: '라이브러리 테이블 ≥3행',
        points: 5,
        test: s => {
          const libSection = s.match(/핵심 라이브러리[\s\S]*?(?=\n###|\n##|$)/i)?.[0] || '';
          const rows = (libSection.match(/^\|[^|\n]+\|/gm) || []).filter(r => !r.includes('---'));
          return rows.length >= 3;
        },
        diagnosis: '§1 핵심 라이브러리 테이블에 항목이 3개 미만입니다. 주요 라이브러리를 버전·용도와 함께 3개 이상 명시하세요.'
      },
      {
        name: '버전 번호 명시',
        points: 5,
        test: s => /\d+\.\d+/.test(s) && !hasPlaceholders(s),
        diagnosis: '§1 스택 버전이 없거나 플레이스홀더({ver})가 남아 있습니다. 구체적인 버전 번호(예: 14.2.x)를 채우세요.'
      }
    ]
  },
  {
    sectionNum: 2,
    name: '§2 데이터 모델 구체',
    maxPoints: 20,
    checks: [
      {
        name: 'CREATE TABLE SQL 코드 블록',
        points: 10,
        test: s => /```sql[\s\S]*?CREATE TABLE/i.test(s),
        diagnosis: '§2 데이터 모델에 SQL CREATE TABLE 코드가 없습니다. 실행 가능한 DDL SQL을 추가하세요.'
      },
      {
        name: '테이블 컬럼 ≥2개',
        points: 5,
        test: s => {
          const sqlBlocks = s.match(/```sql[\s\S]*?```/gi) || [];
          return sqlBlocks.some(b => {
            const cols = b.match(/^\s+\w+\s+(TEXT|UUID|INT|BOOLEAN|TIMESTAMPTZ|VARCHAR|BIGINT|JSONB|NUMERIC|SERIAL)/gim) || [];
            return cols.length >= 2;
          });
        },
        diagnosis: '§2 테이블 컬럼이 부족합니다. 각 테이블에 2개 이상의 컬럼 타입을 명시하세요.'
      },
      {
        name: '인덱스 또는 출처 매핑',
        points: 5,
        test: s => /인덱스|출처 매핑|INDEX|PRIMARY KEY|REFERENCES/i.test(s),
        diagnosis: '§2 인덱스 또는 출처 매핑이 없습니다. 주요 컬럼 인덱스나 설계도 출처(← 설계 §N)를 추가하세요.'
      }
    ]
  },
  {
    sectionNum: 3,
    name: '§3 워크플로 구현',
    maxPoints: 25,
    checks: [
      {
        name: 'Step ≥1개 정의',
        points: 5,
        test: s => /###\s*Step\s*\d+/i.test(s),
        diagnosis: '§3 워크플로에 Step이 정의되지 않았습니다. "### Step 1: {단계명}" 형식으로 구현 단계를 나누세요.'
      },
      {
        name: '코드 블록 ≥2개',
        points: 15,
        test: s => countCodeBlocks(s) >= 2,
        diagnosis: '§3 워크플로 구현에 코드 스니펫이 2개 미만입니다. 각 Step에 실행 가능한 코드 예시(```js/ts/py 등)를 추가하세요.'
      },
      {
        name: '에러 처리 명시',
        points: 5,
        test: s => /에러 처리|try\s*\{|catch\s*\(|\.catch\(|error handling/i.test(s),
        diagnosis: '§3 에러 처리 패턴이 없습니다. try/catch 또는 에러 처리 방식을 코드 내에 명시하세요.'
      }
    ]
  },
  {
    sectionNum: 4,
    name: '§4 API 구현',
    maxPoints: 20,
    checks: [
      {
        name: 'API 엔드포인트 ≥1개',
        points: 5,
        test: s => /(GET|POST|PUT|DELETE|PATCH)\s+\/(?:api\/)?[\w\-\/]+/i.test(s),
        diagnosis: '§4 API 엔드포인트가 정의되지 않았습니다. "POST /api/..." 형식으로 최소 1개 엔드포인트를 명시하세요.'
      },
      {
        name: 'API 코드 스니펫 ≥1개',
        points: 10,
        test: s => countCodeBlocks(s) >= 1,
        diagnosis: '§4 API 구현에 코드 스니펫이 없습니다. 최소 1개 엔드포인트의 구현 코드 예시를 추가하세요.'
      },
      {
        name: '인증 방식 명시',
        points: 5,
        test: s => /인증|JWT|OAuth|API.?Key|Bearer|supabase\.auth|session/i.test(s),
        diagnosis: '§4 인증 방식이 명시되지 않았습니다. JWT·OAuth·Supabase Auth 등 사용할 인증 방식을 명시하세요.'
      }
    ]
  },
  {
    sectionNum: 5,
    name: '§5 배포 및 운영',
    maxPoints: 10,
    checks: [
      {
        name: '환경변수 .env 블록',
        points: 5,
        test: s => /```(?:bash|env|sh)?[\s\S]*?(?:DATABASE_URL|API_KEY|SECRET|TOKEN|_URL=|_KEY=)/i.test(s),
        diagnosis: '§5 환경변수 .env 블록이 없습니다. DATABASE_URL·API_KEY 등 필요한 환경변수를 .env.example 형식으로 명시하세요.'
      },
      {
        name: '배포 플랫폼 명시',
        points: 5,
        test: s => /Vercel|Railway|AWS|GCP|Azure|Heroku|Fly\.io|Render|Netlify|Cloudflare/i.test(s),
        diagnosis: '§5 배포 플랫폼이 명시되지 않았습니다. Vercel·Railway·AWS 등 권장 플랫폼을 명시하세요.'
      }
    ]
  },
  {
    sectionNum: 6,
    name: '§6 비용 분석',
    maxPoints: 5,
    checks: [
      {
        name: '구체적 금액 또는 무료 티어 명시',
        points: 5,
        test: s => /\$\s*\d+|\d+\s*원|무료 티어|free tier|\$0/i.test(s),
        diagnosis: '§6 비용 분석에 구체적인 금액이 없습니다. 월 운영비($N) 또는 무료 티어 조건을 명시하세요.'
      }
    ]
  },
  {
    sectionNum: 7,
    name: '§7 개발 로드맵',
    maxPoints: 5,
    checks: [
      {
        name: 'Phase ≥2개 + 기간 명시',
        points: 5,
        test: s => {
          const phases = (s.match(/Phase\s*\d+/gi) || []).length;
          const hasDuration = /\d+\s*~?\s*\d*\s*주|\d+\s*~?\s*\d*\s*일|\d+\s*~?\s*\d*\s*개월/i.test(s);
          return phases >= 2 && hasDuration;
        },
        diagnosis: '§7 로드맵에 Phase가 2개 미만이거나 기간이 없습니다. Phase 1·2 이상 + "N~M주" 형식 기간을 작성하세요.'
      }
    ]
  }
];

let totalScore = 0;
const sectionResults = [];
const diagnoses = [];

for (const section of RUBRIC) {
  const sec = extractSection(content, section.sectionNum);
  let sectionScore = 0;
  const checkResults = [];

  for (const check of section.checks) {
    const passed = check.test(sec);
    const earned = passed ? check.points : 0;
    sectionScore += earned;
    if (!passed) {
      diagnoses.push({
        section: section.name,
        item: check.name,
        points_lost: check.points,
        fix: check.diagnosis
      });
    }
    checkResults.push({ name: check.name, passed, earned, max: check.points });
  }

  // 미치환 플레이스홀더 감점 (섹션당 최대 5점, 내용 있는 섹션만)
  if (sec.length > 50 && hasPlaceholders(sec)) {
    const penalty = Math.min(5, sectionScore);
    sectionScore = Math.max(0, sectionScore - penalty);
    diagnoses.push({
      section: section.name,
      item: '미치환 플레이스홀더',
      points_lost: penalty,
      fix: `${section.name}에 채워지지 않은 {플레이스홀더}가 있습니다. 실제 값으로 교체하세요.`
    });
  }

  totalScore += sectionScore;
  sectionResults.push({
    name: section.name,
    score: sectionScore,
    max: section.maxPoints,
    checks: checkResults
  });
}

const pass = totalScore >= 100;

const diagnosisForChild3 = diagnoses.length > 0
  ? [
      `개발지침서 구현 가능성 점수: ${totalScore}/100점. 아래 항목을 보완하여 100점을 달성하세요:`,
      ...diagnoses.map((d, i) => `${i + 1}. [${d.section}] ${d.fix} (${d.points_lost}점 회복 가능)`)
    ].join('\n')
  : null;

const result = {
  score: totalScore,
  max: 100,
  pass,
  sections: sectionResults,
  diagnosis: diagnoses,
  diagnosis_for_child3: diagnosisForChild3
};

console.log(JSON.stringify(result, null, 2));
process.exit(pass ? 0 : 2);
