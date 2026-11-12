# 업보 룰렛 (okerry-karma-roulette)

모임 참가자의 질문 응답을 바탕으로 독박 결제 담당자를 추첨하거나 총액을 나누는 모바일 정산 유틸리티입니다.

## 문서 안내

기존 문서는 목적별로 `docs/` 아래에 모았습니다. 파일명과 본문은 유지하고 이동에 따른 참조 경로만 수정했습니다.

| 디렉터리 | 용도 | 문서 |
| --- | --- | --- |
| `docs/planning/` | 기획·정책·작업 계획 | [MVP 요청서](docs/planning/mvp.md), [PRD](docs/planning/PRD.md), [미확정 정책 및 결정 기록](docs/planning/OPEN_QUESTIONS.md), [개발 백로그](docs/planning/TASK_BACKLOG.md) |
| `docs/specs/` | 기능·사용자 흐름·화면 명세 | [기능 명세](docs/specs/FUNCTIONAL_SPEC.md), [사용자 흐름](docs/specs/USER_FLOW.md), [화면 명세](docs/specs/SCREEN_SPEC.md) |
| `docs/reviews/` | 명세와 구현의 QA·UX 검토 | [기능 명세 QA](docs/reviews/QA_REVIEW_FUNCTIONAL_SPEC.md), [정책 질문 QA](docs/reviews/QA_REVIEW_OPEN_QUESTIONS.md), [통합 문서 UX](docs/reviews/UX_INTEGRATION_REVIEW.md), [구현 UX 정적 검토](docs/reviews/UX_STATIC_REVIEW.md), [구현 요구사항 QA](docs/reviews/QA_REQUIREMENTS_STATIC_REVIEW.md) |
| `docs/reports/` | 구현·보완·인수인계 보고 | [구현 보고서](docs/reports/IMPLEMENTATION_REPORT.md), [후속 보완 보고서](docs/reports/FOLLOWUP_FIX_REPORT.md), [결과 취합 보고서](docs/reports/FINAL_HANDOFF_REPORT.md) |

문서를 처음 읽는다면 MVP 요청서 → PRD → 미확정 정책 및 결정 기록 → 기능·화면 명세 순서로 확인하면 됩니다. 구현 및 검토 이력은 보고서와 검토 문서에서 확인할 수 있습니다.

최근 작업과 실제 검증 결과: [개발 진행 기록](docs/reports/DEVELOPMENT_PROGRESS.md).

모바일 화면·작은 다크 테마 변경: [모바일 UI 보완 보고](docs/reports/MOBILE_UI_REPORT.md).

## 로컬 실행과 검증

Node.js 24 이상이 필요합니다.

```sh
npm ci
npm run dev
```

```sh
npm test
npm run typecheck
npm run build
npx playwright install webkit chromium
npm run test:e2e
```

기본 개발 화면은 작은 크기의 다크 테마입니다. 현재 앱인토스 공식 안내는 라이트 모드 기준 출시이므로 라이트 테마 웹 산출물은 `npm run build:toss`로 만듭니다. 이 명령은 웹 빌드만 수행하며 `.ait` 번들 생성이나 업로드는 하지 않습니다. [공식 디자인 안내](https://developers-apps-in-toss.toss.im/design/prepare/design)

현재 질문·입력 정책은 미확정 상태여서 응답 시작을 차단합니다. 정산·질문 공개·실제 공유 및 앱인토스 연결도 미완료입니다. 테스트의 합성 정책은 상태 전이를 검증하기 위한 전용 데이터이며 앱에서 활성화되지 않습니다.
