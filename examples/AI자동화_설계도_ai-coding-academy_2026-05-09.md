---
의뢰인: ai-coding-academy
분석 일시: 2026-05-09
진단 보고서: AI자동화_진단보고서_ai-coding-academy_2026-05-09.md
버전: v1
---

# 🏗️ 웹앱 설계도

> **개발 AI 대상** - "이런 걸 만들 거야" (WHAT/WHY)

---

## 1. 프로젝트 개요

- **프로젝트명**: 넥스트AI아카데미 수강 신청·관리 통합 시스템 (← 진단 §1 분석 주제 + §2 자동화 요청)
- **목적**: CEO 대상 AI 코딩 양성 과정의 수강 신청·결제·일정·자격증 발급까지 매일 3시간 수기 운영을 약 30분으로 단축, 신규 코스 기획·CEO 1:1 응대에 집중 (← 진단 §3·§7 시간 분석)
- **대상 사용자**: 수강생(CEO 등 일반 회원) + 운영팀(박지훈 팀장 등 admin) — 2 역할 분리 (← 진단 §2 자동화 요청 4번)
- **핵심 가치**: 신뢰 가능한 결제·자격증 시스템 + 운영 인력 절감. 월 50시간 자유 시간 확보 (← 진단 §7)

---

## 2. 기능 요구사항

### 기능 목록

| 우선순위 | 기능 | 설명 | 출처 |
|----------|------|------|------|
| P0 | 회원가입·인증 | 이메일+비밀번호 / 카카오 OAuth (선택) | 진단 §6 Step 1 |
| P0 | 코스 카탈로그·수강 신청 | 1·2·3단계 코스 선택, 신청 흐름 | 진단 §2 자동화 요청 1번 |
| P0 | 결제 | 포트원 통합(카드·계좌이체·간편결제·세금계산서) | 진단 §2 자동화 요청 2번 + §6 Step 1 |
| P0 | 수강생 대시보드 | 본인 진도·강의 일정·결제 내역·자격증 조회 | 진단 §6 Step 2 |
| P1 | 운영자 관리 페이지 | 수강생 목록·출결 입력·문의 응대·환불 처리 | 진단 §6 Step 3 |
| P1 | 강의 일정 + 화상 링크 자동 발송 | 강의 24h·1h 전 알림, Zoom API로 미팅 자동 생성 | 진단 §6 Step 4 |
| P1 | 자격증 자동 발급 | 수료 조건(출석≥80% + 과제 통과) 자동 감지 → PDF + QR 코드 | 진단 §6 Step 5 + §8 코칭 팁 3 |
| P2 | 환불 처리 + 세금계산서 | 포트원 부분 환불 + 사업자 등록번호 기반 발행 | 진단 §2 자동화 요청 2번 |
| P2 | 알림 통합 | 이메일(Resend) + SMS(선택) 단일 모듈 | 진단 §4 추천 도구 4 |

### 데이터 흐름

1. 비회원 → 코스 카탈로그 조회 → 코스 선택
2. 회원가입 (이메일·비밀번호 또는 카카오 OAuth) → Supabase Auth 토큰 발급
3. 수강 신청 → 포트원 결제 페이지 → 결제 완료 콜백 (`/api/payments/portone`)
4. 수강 등록(`enrollments`) + 결제 기록(`payments`) DB 저장 → 신청 완료 메일 발송 (Resend)
5. 강의 진행 → 운영자가 출결 입력 또는 자동 체크인
6. cron(매일 새벽) → 수료 조건 충족자 자동 감지 → 자격증 PDF 생성 → Storage 저장 → DB 발급 이력 기록 → 수강생 메일 발송

---

## 3. 시스템 아키텍처 (상위)

### 전체 구조도 (텍스트 다이어그램)
```
[수강생 / 운영자]
       ↓ (HTTPS)
[Vercel Edge Network · CDN]
       ↓
[Next.js 14 (App Router)]
   ├─ 서버 컴포넌트 (UI)
   ├─ API Routes (/api/*)
   └─ Cron Jobs (자격증 자동 발급)
       ↓
[Supabase]
   ├─ Auth (이메일·카카오 OAuth)
   ├─ PostgreSQL (수강·결제·출결·자격증)
   └─ Storage (자격증 PDF)
       ↓
[외부 서비스]
   ├─ 포트원 (PG)
   ├─ Resend (이메일)
   └─ Zoom API (화상 미팅 자동 생성)
```

### 기술 스택 (선택 이유 포함)

- **풀스택 프레임워크**: Next.js 14 App Router (← 진단 §4 추천 도구 1위 / 검색일 2026-05-09)
  - 이유: 프론트·백엔드 단일 코드베이스, SSR로 SEO + 빠른 첫 로딩, API Routes로 결제 콜백·cron 통합 가능. Vercel 호환 최적.
- **데이터·인증·스토리지**: Supabase (← 진단 §4 추천 도구 2위)
  - 이유: PostgreSQL + 인증 + Storage 통합 BaaS. RLS(Row Level Security)로 본인 데이터만 노출 가능. 월 $25 Pro 티어로 시작 후 성장.
- **결제**: 포트원 (← 진단 §4 추천 도구 3위)
  - 이유: 한국 PG 통합, 세금계산서 발행 가능, 법인 결제 안정. 카드·계좌이체·간편결제 단일 API.
- **이메일·알림**: Resend (← 진단 §4 추천 도구 4위)
  - 이유: 개발자 친화 트랜잭션 이메일, React Email 템플릿. 무료 티어 100/일로 초기 운영 가능.
- **호스팅**: Vercel (← 진단 §4 추천 도구 5위 / 검색일 2026-05-09)
  - 이유: Next.js 최적, Git push 자동 배포, 프리뷰 환경, Cron 함수 내장.

※ 구체 버전·라이브러리·설정은 **지침서 §1로 위임** (코드 한 줄도 X — 002 원칙)

### AI 도구 연동 (계약 수준)
- 본 시스템은 AI 모델 직접 호출 없음 — 도구 자동화로 충분 (← 진단 §4·§5)
- (선택) **ChatGPT API**: CEO 응대 메시지 톤 다듬기 — 후순위 (← 진단 §8 코칭 팁 2)

---

## 4. 데이터 모델 (추상)

### 주요 엔티티

#### User (수강생·운영자 통합)
- **필드**: 사용자 ID·이메일·이름·역할(student/admin)·연락처·카카오 ID(선택)·가입일
- **출처**: 진단 §6 Step 1·3 / Q7 권한 분리

#### Course (코스)
- **필드**: 코스 ID·단계(1/2/3)·제목·총 시간·정가·할인가·정원·설명
- **출처**: 진단 §2 업무 설명 "1·2·3단계 코스"

#### Enrollment (수강 등록)
- **필드**: 등록 ID·사용자 ID·코스 ID·상태(pending/active/completed/refunded)·등록일
- **출처**: 진단 §2 자동화 요청 1번

#### Payment (결제)
- **필드**: 결제 ID·등록 ID·금액·결제수단·상태(paid/refunded/failed)·포트원 imp_uid·결제일
- **출처**: 진단 §2 자동화 요청 2번 / 진단 §8 코칭 팁 1

#### Schedule (강의 일정)
- **필드**: 일정 ID·코스 ID·회차·시작일시·종료일시·타입(offline/online)·Zoom 링크·장소
- **출처**: 진단 §2 업무 설명 "현장 + 화상 병행" / 진단 §6 Step 4

#### Attendance (출결)
- **필드**: 출결 ID·등록 ID·일정 ID·상태(present/absent/late)·체크 시각
- **출처**: 진단 §6 Step 3·5

#### Certificate (자격증)
- **필드**: 자격증 ID·등록 ID·발급 번호·발급일·PDF URL·QR 코드 데이터
- **출처**: 진단 §2 업무 설명 "자격증 발급" / 진단 §8 코칭 팁 3

#### Inquiry (문의)
- **필드**: 문의 ID·사용자 ID·제목·내용·상태(open/answered/closed)·작성일·답변일
- **출처**: 진단 §6 Step 3 "문의 응대"

### 관계
- User → Enrollment: 1:N
- Course → Enrollment: 1:N
- Enrollment → Payment: 1:1
- Course → Schedule: 1:N
- Enrollment → Attendance: 1:N (Schedule 1개당 Attendance 1개)
- Enrollment → Certificate: 1:1 (수료 조건 충족 시 1개 발급)
- User → Inquiry: 1:N

※ 실제 schema 코드(SQL DDL)는 **지침서 §2로 위임**

---

## 5. UI/UX 설계

### 화면 구성

**공개 영역 (비로그인)**
1. **메인·코스 카탈로그**: 1·2·3단계 코스 카드, 가격·시간·다음 모집 일정
2. **회원가입·로그인**: 이메일+비밀번호 폼, 카카오 OAuth 버튼

**수강생 영역 (로그인 필요, role=student)**
3. **수강 신청 + 결제**: 코스 선택 → 결제 폼 → 포트원 위젯 → 완료 페이지
4. **수강생 대시보드**: 본인 진도 그래프, 다음 강의 카드, 결제 내역, 자격증 다운로드 버튼
5. **코스 상세·자료실**: 회차별 일정, 강의 자료 다운로드, 화상 강의 입장 링크
6. **자격증 조회·검증**: 공개 페이지 (`/certificates/{발급번호}`) — 위변조 방지 검증

**운영자 영역 (로그인 필요, role=admin)**
7. **수강생 관리**: 목록·검색·상태 필터·상세
8. **출결 입력**: 강의별 출석 체크, 일괄 입력
9. **문의 응대**: 문의함, 답변 작성, 상태 변경
10. **환불 처리**: 부분/전체 환불, 세금계산서 발행 트리거

### 사용자 플로우

**수강생 (신규):**
```
메인 → 코스 카드 클릭 → 회원가입 → 결제 → 신청 완료 메일 → 대시보드 진입
→ 강의 알림 메일 → 화상 링크 클릭 → 수강 → 출결 자동 기록
→ 수료 조건 충족 → 자격증 메일 받음 → 다운로드 + 검증 페이지 공유
```

**운영자 (박지훈 팀장):**
```
관리자 로그인 → 대시보드(통계) → 수강생 목록 → 출결 입력
→ 문의 답변 → 환불 요청 처리
```

### 핵심 UI 컴포넌트 목록

- **CourseCard**: 코스 카드 (가격·시간·신청 버튼)
- **PaymentForm**: 포트원 결제 위젯 컨테이너
- **ProgressChart**: 수강 진도 시각화 (회차별 출석)
- **ScheduleCalendar**: 강의 일정 캘린더 + 화상 링크
- **CertificateCard**: 자격증 카드 + 다운로드·검증 링크
- **InquiryThread**: 문의-답변 스레드 컴포넌트
- **AdminDataTable**: 운영자용 정렬·필터·페이지네이션 표

### 디바이스·권한 (사용자 확인 결과)
- 디바이스: 웹 (데스크톱 + 모바일 반응형) (← Q7)
- 권한: student / admin 2단계 분리 (← Q7 + Q12 운영 팀 규모)

---

## 6. API 명세 (계약 수준)

### 엔드포인트 목록

| 메서드 | 경로 | 용도 | 요청 포맷 | 응답 포맷 |
|--------|------|------|-----------|-----------|
| POST | /api/auth/signup | 회원가입 | JSON {email, password, name} | JSON {user, session} |
| POST | /api/auth/login | 로그인 | JSON {email, password} | JSON {session} |
| GET | /api/courses | 코스 목록 | — | JSON {courses[]} |
| POST | /api/enrollments | 수강 신청 (결제 전) | JSON {course_id} | JSON {enrollment_id, payment_url} |
| POST | /api/payments/portone | 포트원 결제 콜백 | JSON {imp_uid, merchant_uid, status} | JSON {success: true} |
| GET | /api/dashboard/me | 수강생 본인 정보 | (Auth 필요) | JSON {user, enrollments, schedules, certificates} |
| POST | /api/admin/attendance | 출결 입력 (admin) | JSON {schedule_id, entries[]} | JSON {updated: N} |
| POST | /api/admin/refunds | 환불 처리 (admin) | JSON {payment_id, amount, reason} | JSON {refund_id} |
| GET | /api/certificates/:cert_no | 자격증 공개 검증 | — | JSON {cert, valid: true/false} |
| POST | /api/cron/issue-certificates | 일일 자격증 자동 발급 (cron) | (Vercel Cron) | JSON {issued: N} |

※ 인증·에러 코드·rate limit 같은 구체 구현은 **지침서 §4로 위임**

### 외부 시스템 연동

- **포트원 (PortOne)**: 결제 위젯 + 결제 검증 webhook (← 진단 §4 추천 도구 3 / 검색일 2026-05-09)
- **Zoom API**: 화상 강의 미팅 자동 생성·수강생 등록 (OAuth 2.0 Server-to-Server)
- **Resend**: 트랜잭션 이메일 (수강 안내·자격증 발송) (← 진단 §4 추천 도구 4)
- **카카오 OAuth (선택)**: 소셜 로그인 — 후순위 P2

---

> **생성 정보**
> - 생성일: 2026-05-09 (자동)
> - AI 엔진: Claude
> - 검색일: 2026-05-09 (WebSearch 결과 기반)
> - 입력: AI자동화_진단보고서_ai-coding-academy_2026-05-09.md
