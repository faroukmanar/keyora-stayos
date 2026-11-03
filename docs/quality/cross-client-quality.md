# Cross-client quality budget

KEYORA targets WCAG 2.2 AA for both Expo native and web surfaces. Interactive controls use semantic roles and labels, visible errors, 44px minimum targets, keyboard-safe forms, safe-area layouts, and a shared tokenized contrast system. Focus order follows visual order; icon controls require labels; color never carries state alone.

## Localization and time

Supported presentation locales are English, French, and Arabic. Arabic is RTL-ready (`isRtl('ar')`), while English/French remain LTR. The property timezone (`Africa/Casablanca` in the synthetic test property) governs operational dates, availability, quiet hours, and reservation boundaries. A user locale changes only rendering via `Intl`; it never changes stored dates or property time.

## Measurable local budgets

| Surface | Budget | Local check |
| --- | --- | --- |
| API read latency | p95 < 100 ms on the local performance fixture | `npm run api:performance` |
| Web interaction | no horizontal overflow at 375/768/1024/1440 px | `npm run web:e2e` |
| Web loading | no unbounded retries; 30s query staleness, one retry | React Query defaults |
| Native startup | no blocking persisted state beyond one encrypted refresh lookup | secure session bootstrap |
| Large lists | virtualized where data volume requires it | FlashList policy |

## Review journeys

Test sign-in validation, role-restricted tabs, room and reservation deep links, table selection and Escape/search shortcuts, and notification routing with TalkBack/VoiceOver plus keyboard navigation on web. Test browser zoom and native largest text scale; controls must remain discoverable and no content may sit beneath system bars.

## Remediation policy

Failures of a budget block release. Capture a local trace/screenshot, fix the regression, add a targeted test, and rerun the relevant command before release approval.
