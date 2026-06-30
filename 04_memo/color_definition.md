# Color Definition

## Purpose

This document defines the semantic color rules used by Job Hunt Note.
Colors communicate one meaning at a time. Do not reuse a company status color for an event type.

## Company Status

| Status | Meaning | Token | Intended ribbon color |
| --- | --- | --- | --- |
| 検討中 | Information gathering or not actively in selection | `neutral` | Slate |
| 選考中 | Active selection company | `brand` | Blue |
| 辞退 | User stopped the selection | `withdrawn` | Amber |
| 落選 | Selection ended unsuccessfully | `danger` | Red |
| 内定 | Offer received | `offer` | Violet |

Legacy company statuses are normalized in the UI only:

| Legacy status | Display as |
| --- | --- |
| 通過 | 選考中 |
| 保留 | 検討中 |

When a company is `検討中` but has an active selection event, the UI may display it as `選考中` without rewriting the Sheets value.

Company status ribbons are for company-centric UI only: the timeline company column, company list, company popover, and company karte. Do not add a company ribbon to calendar events because event-type colors already occupy that role.

## Event Status

| Status | Meaning | Token | Dot color |
| --- | --- | --- | --- |
| 予定 | Not yet done | `brand` | Blue |
| 完了 | Attended or submitted; no result implied | `neutral` | Slate |
| 結果待ち | Waiting for a selection/test result | `warning` | Yellow |
| 通過 | Passed | `success` | Green |
| 保留 | Waiting | `warning` | Yellow |
| 辞退 | Withdrawn | `withdrawn` | Amber |
| 落選 | Rejected | `danger` | Red |
| 内定 | Offer received | `offer` | Violet |

## Event Attribute Colors

Event colors identify the type of activity, not pass/fail status. The same mapping is used by calendar dots, timeline markers and labels, activity logs, and local draft markers.

| Group | Default event types | Token | Surface color |
| --- | --- | --- | --- |
| Submission | ES, 履歴書提出, 課題提出 | `submission` | Sky / Blue |
| Test | テスト, SPI, 適性検査, 玉手箱, 筆記試験, コーディングテスト | `test` | Emerald / Green |
| Participation | 説明会, セミナー, 面談, インターン, OB/OG訪問 | `participation` | Violet / Purple |
| Selection | 選考会, GD, グループワーク, ケース面接, 面接 | `selection` | Amber / Orange |
| Other | Other values | `neutral` | Slate |

`選考` を含む値は、たとえば「説明選考会」であっても Selection として表示します。

## Date-only Tasks

Events with `time_mode = date_only` are date tasks, not all-day appointments.

| Event Status | Marker | Meaning |
| --- | --- | --- |
| 予定 | `○` | Not completed yet |
| Any other status | `✓` | Activity is complete, regardless of result |

Date-only tasks appear before timed events in a calendar day. They keep a compact chip treatment. Timed events use an event-type dot and plain one-line text.

## Update Checklist

When adding or changing a status or event type, update all of the following together:

1. `src/types/company.ts` or `src/types/event.ts`
2. `src/lib/planning.ts` status and event-type mappings
3. `src/components/home-client.tsx` timeline and karte mappings
4. `src/components/calendar-month-view.tsx` calendar dot mapping
5. This document
