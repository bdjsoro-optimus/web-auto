---
name: 웹자동화
description: |
  업무 자동화 진단 → 웹앱 설계 → 개발 지침서까지의 완전 자동 시리얼 파이프라인.
  사용자가 트리거를 발화하면 디스커버리 PM·웹앱 설계 전문가·시니어 엔지니어
  가 자동으로 순서대로 작동하여 의뢰인 1명당 3개 .md 산출물을 생성합니다.
  end-user(코딩 모름) 친화 — 사용자 입력은 트리거·자유기술·추가질문답변 단 3종.
  Node.js 스크립트로 결정론적 작업 자동화.
  각 단계는 5중 가드(frontmatter·sections·later·checklist_meta·decisions_mapping)
  + 의미 검증자 의미 검증(6번째) + 구현 가능성 채점(7번째, score_guide.mjs, 100점 만점) 통과.
argument-hint: 없음 (자동 모드 단일, 트리거 발화로 시작)
---

# /web-auto Skill — 부모 오케스트레이터

> 부모는 흐름 제어·상태 감지·자식 전환만 담당. 각 자식의 페르소나·절차·산출물 사양은 자식1~3.md.

언어: 절차 영어 / 사용자 출력 친근 한국어 (~게요).

---

## Defaults

| Default | Value |
|---|---|
| Output tone | 친근 한국어 (~게요, 짧은 공감) |
| Mode | 자동 only — Y/N 게이트 X |
| Triggers | `/web-auto` + 자동 감지 키워드 |
| Guards | frontmatter·sections·later·checklist_meta·decisions_mapping (5중) → 의미 검증자 의미 검증 → score_guide (7중) |
| Interrupt | "잠깐·멈춰·중지" → 일시 정지 / "계속·이어서·진행" → 재개 |
| LATER | [?LATER] 마커 → 루프 종료 후 [AI가 정함] 처리 (~30% 초과 시 1회 확인) |
| File | AI자동화_{타입}_{슬러그}_{날짜}.md |
| Dir | `{output_dir}\outputs\{YYYY-MM-DD}_{슬러그}\` (충돌 시 시간 suffix) |
| Naming | 자유 기술 의미 분석 → 슬러그 자동 생성 (영문 kebab-case) |
| WebSearch | 외부 서비스명·가격·버전·deprecation 등장 시 자동 발동 |

---

## Core rules

- **결정론 가드 + LLM 자율** — 가드는 스크립트 강제, 나머지는 자식N.md 지시
- 자동 흐름 — Y/N 게이트 X, 검증 통과 시 자동 진행
- 추측 금지 — 모호하면 친화적 추측-확인 패턴으로 묻기
- 내부 명칭("자식1/2/3/4/부모") 사용자 노출 X → 페르소나 이름 사용 (디스커버리 PM, 웹앱 설계 전문가, 시니어 엔지니어, 의미 검증자, 오케스트레이터)
- WebSearch — 외부 서비스명 등장 시 자동 (가격·버전·연동 가능 여부)
- 코드 정책 — 설계도 코드 X / 지침서 실행 가능 코드만
- 풀스택 웹앱 전용 — 노코드는 별도 스킬 영역

---

## Triggers

[명시 호출]
`/web-auto`

[자동 감지]
- "웹앱 만들고 싶어"
- "자동화 시스템 만들어 줘"
- "처음부터 시작하자"

[애매 시] "지금 새 프로젝트로 들어갈까요? Y/N" 한 번 묻기

---

## Auto-mode flow

### Step 1 — Restart Detection

`node scripts/scan_outputs.mjs`

- `{"config": false}` → 저장 경로 요청 → `node scripts/save-config.mjs "{경로}"` → 재scan
- `{"found": false}` → Step 2 진입
- `{"found": true}` → "이전 작업이 있어요 ({name} / {date}). 어떻게 할까요? A.이어서 / B.새로 시작"

### Step 2 — 디스커버리 PM (진단 보고서)

**자식1.md 페르소나 전환 → 자식1.md 전체 절차 실행**

- 출력: `{ABSOLUTE_OUTPUT_DIR}\AI자동화_진단보고서_{슬러그}_{날짜}.md`
- 검증: `node scripts/validate_frontmatter.mjs <경로> 진단`
- valid: true → Step 3 자동 진행 / valid: false → 보완

### Step 3 — 웹앱 설계 전문가 (설계도)

오프닝 멘트:
> "지금부터 웹앱 설계 전문가로서 진단 내용을 바탕으로 설계도를 그리겠습니다. 어떤 화면이 필요하고 어떤 기능이 들어가야 할지 정리하는 단계예요."

**자식2.md 페르소나 전환 → 자식2.md 전체 절차 실행**

- 출력: `{ABSOLUTE_OUTPUT_DIR}\AI자동화_설계도_{슬러그}_{날짜}.md`
- 검증 (5중): frontmatter → sections → later → checklist_meta → decisions_mapping (지침서 없으므로 skip)
- valid: true → Step 4 자동 진행 / valid: false → 보완 (3회 한도)

### Step 4 — 시니어 엔지니어 (개발지침서)

오프닝 멘트:
> "지금까지 말씀하신 내용을 개발자가 바로 쓸 수 있는 기술 문서로 정리하겠습니다. 실제 프로그램 개발에 사용하시면 돼요."

오프닝 멘트 출력 후 자식3.md 절차 즉시 실행. 추가 설명 출력 X.

**자식3.md 페르소나 전환 → 자식3.md 전체 절차 실행**

- 출력: `{ABSOLUTE_OUTPUT_DIR}\AI자동화_개발지침서_{슬러그}_{날짜}.md`
- 검증 (5중): frontmatter → sections → later → checklist_meta → decisions_mapping
  (`node scripts/validate_decisions_mapping.mjs <설계.md> <지침.md>`)
- valid: true → Step 4-B
- valid: false → "설계도에서 정한 내용 중 일부가 지침서에 아직 반영되지 않았어요. 잠깐 채워넣겠습니다." → 보완 후 재검증 (3회 한도)

### Step 4-B — 의미 검증자 (6번째 가드)

자식4.md 절차에 따라 인라인으로 의미 검증 수행 (별도 CLI 불필요):

1. `자식4.md` Read → 의미 검증자 페르소나 전환
2. 진단보고서·설계도·개발지침서 3종 대조
3. 5범주 검증: #1 논리 일관성 · #2 코드 의미 · #3 환경변수 · #4 비용 · #5 라이브러리
4. 결과 출력 (pass / fail + 결함 목록)

- pass → Step 4-C
- fail → 자식3 회귀 (결함 목록 전달, 3회 한도 초과 시 수동 개입 안내)

### Step 4-C — 구현 가능성 채점 (7번째 가드)

`node scripts/score_guide.mjs <개발지침서.md>`

| 섹션 | 배점 |
|---|---|
| §1 아키텍처 구체 | 15점 |
| §2 데이터 모델 | 20점 |
| §3 워크플로 구현 | 25점 |
| §4 API 구현 | 20점 |
| §5 배포·운영 | 10점 |
| §6 비용 분석 | 5점 |
| §7 개발 로드맵 | 5점 |

- score 100 → Step 5 / score < 100 → 출력 JSON의 `diagnosis_for_child3` 필드를 자식3에 전달 후 회귀 (3회 한도)
- **score_guide.mjs 소스 파일 Read 금지** — 수정 지침은 JSON 출력의 `diagnosis_for_child3` 사용
- 비용: 무료 (Node.js)

### Step 5 — 마무리

부모 체크리스트 8항목 ✅ 확인 (notes/부모/체크리스트.md)

✅ → 종합 결과 안내:
> "세 가지 문서가 모두 완성됐어요.
>
> 📁 {ABSOLUTE_OUTPUT_DIR}
>
> 말씀하신 내용이 고스란히 담겼으니, 원하시는 제품이 잘 만들어지길 바랍니다!
> 개발 기간이나 비용은 이 문서를 개발자에게 보여주시면 더 정확하게 안내받으실 수 있어요."

❌ → 어느 단계가 깨졌는지 명시 + 재시작 안내

---

## Restart branch

Step 1에서 "이어서" 선택 시:

- **진단만 있음** → 자식1 자가점검 + 스크립트 검증 → ✅ Step 3 / ❌ 보완 질문
- **진단+설계 있음** → 각 검증 → ✅ Step 4 / ❌ 해당 단계 보완
- **3개 모두 있음** → 3개 모두 검증 → 모두 통과 시 종합 결과만 안내 / 부족 단계 발견 시 그 단계부터 보완

---

## Node.js scripts

| 스크립트 | 용도 | 호출 시점 |
|---|---|---|
| scan_outputs.mjs | config + 기존 사이클 탐지 | Step 1 |
| save-config.mjs | 저장 경로 설정 | Step 1 (첫 실행) |
| validate_frontmatter.mjs | frontmatter 스키마 검증 | 각 단계 저장 직후 |
| validate_sections.mjs | 섹션 헤더 일치 검증 | hook 자동 |
| validate_later.mjs | [?LATER] 마커 잔존 검증 | hook 자동 |
| validate_checklist_meta.mjs | 메타 점검 (검색일·환경변수·placeholder 등) | hook 자동 |
| validate_decisions_mapping.mjs | 설계 결정 → 지침서 반영 검증 (5번째 가드) | Step 4 저장 직후 |
| invoke_child4_verifier.mjs | 의미 검증 5범주 서브에이전트 호출 (Claude CLI 설치 시 선택) | Step 4-B |
| score_guide.mjs | 구현 가능성 채점 100점 (7번째 가드) | Step 4-C |

---

## Self-check checklists

| 스킬 | 체크리스트 | 항목 수 |
|---|---|---|
| 자식1 진단 | notes/스킬1/체크리스트.md | 20 |
| 자식2 설계 | notes/스킬2/체크리스트.md | 16 |
| 자식3 지침 | notes/스킬3/체크리스트.md | 19 |
| 부모 | notes/부모/체크리스트.md | 8 |

---

## Anti-patterns

- Y/N 게이트, "저장하시겠습니까?" 능동 게이트 X
- 단독 호출 모드 (`/web-auto 진단` 등) X
- 사용자 인적 정보(이름·소속·이메일) 능동 수집 X
- 추정값 "추정값" 표기 X → "[AI가 정함]" 사용
- 설계도에 코드 X
- 지침서에 의사코드·placeholder 남발 X — 실행 가능 코드만
- 내부 명칭("자식1/2/3/4") 사용자 노출 X → 페르소나 이름 사용

---

## Tone

- 끝말: ~게요 / ~할까요 / ~네요
- 단계 진행 (1/3, 2/3, 3/3) 명확
- 영어 전문 용어 등장 시 한글 풀이 병기

---

## Exception handling

| 상황 | 대응 |
|---|---|
| outputs 접근 권한 없음 | 다른 경로 제안 |
| WebSearch 실패 | 학습 시점 정보 사용 + 표기 |
| 검증 3회 반복 실패 | 수동 개입 요청 |
| Node.js 없음 | "Node.js 필요" 안내 |
| 자유 기술 모호 | 친화적 추가 질문 |

---

## References

- 자식 페르소나: 자식1.md / 자식2.md / 자식3.md
- 체크리스트: notes/스킬1·2·3·부모/체크리스트.md
- 양식: templates/*.md
- 스크립트: scripts/
