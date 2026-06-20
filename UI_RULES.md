# UI_RULES.md — 就活ノート Design System

## 1. Design Philosophy

このアプリは「就活の記録帳」ではなく、
**就活の流れを俯瞰し、次に何をすべきかを一目で判断できるOS** を目指す。

UIコンセプト：

* Clean
* Minimal
* Professional
* Dense but readable
* Google Workspace / Linear / Notion の中間

重視するもの：

1. 情報の優先順位が明確
2. 一覧で流れが見える
3. 余計な装飾を排除
4. 面接直前でも素早く情報確認できる

禁止：

* 過剰なグラデーション
* 派手なアニメーション
* 装飾目的の影
* 情報密度を下げる巨大余白

---

# 2. Master Reference

全UI実装は以下を最優先で参照すること：

* docs/ui-spec.png

画像の構成を基本レイアウトとして扱うこと。

新しい画面を作る際も、
既存レイアウトへ無理に継ぎ足すのではなく、
必要ならレイアウトごと再構築する。

---

# 3. Color System

## Primary

Blue 600
`#2563EB`

用途：

* Active tab
* CTA button
* Today marker
* Selected state

---

## Background

Main Background
`#F8FAFC`

Card Background
`#FFFFFF`

---

## Border

Default Border
`#E5E7EB`

Muted Border
`#F1F5F9`

---

## Text

Primary Text
`#111827`

Secondary Text
`#6B7280`

Muted Text
`#94A3B8`

---

## Status Colors

予定

* bg: #DBEAFE
* text: #1D4ED8

通過

* bg: #DCFCE7
* text: #15803D

落選

* bg: #FEE2E2
* text: #DC2626

辞退

* bg: #FEF3C7
* text: #D97706

保留

* bg: #F3E8FF
* text: #7E22CE

内定

* bg: #EDE9FE
* text: #6D28D9

---

# 4. Typography

Font:

* Noto Sans JP
* Inter (fallback)

Page Title

* 24px
* font-bold

Section Title

* 18px
* font-semibold

Card Title

* 16px
* font-semibold

Body

* 14px
* font-normal

Caption

* 12px
* text-muted

Rule:
フォントサイズを乱立させないこと。

使用可能サイズ：

* 12
* 14
* 16
* 18
* 24

のみ。

---

# 5. Spacing System

使用可能 spacing：

* 4
* 8
* 12
* 16
* 24
* 32

Tailwind換算：

* p-1
* p-2
* p-3
* p-4
* p-6
* p-8

禁止：
中途半端な spacing。

例：

* p-[13px]
* gap-[7px]

は禁止。

---

# 6. Radius

Default Radius
8px

Large Card
16px

Tailwind：

* rounded-lg
* rounded-xl
* rounded-2xl

---

# 7. Shadow

基本：

shadow-sm のみ

例外：
Floating Action Button のみ shadow-md

禁止：
shadow-xl 以上

---

# 8. Layout Rules

Desktop:

3-column layout

1. Left Sidebar

* width: 240-280px
* fixed

2. Main Content

* flex-1

3. Optional Summary Panel

* 280-360px

---

Mobile:

* Bottom Tab Navigation
* Floating Add Button
* Drawer for settings

---

# 9. Core Components

## Sidebar

必須：

* Logo
* Timeline
* Schedule
* Analytics
* Settings

Active state:

* blue background
* blue text

---

## Card

Default:

* white
* border
* rounded-xl
* shadow-sm

Padding:
16-24

---

## Badge

用途：

* status
* event type

Rules:

* pastel color
* small
* rounded-full

Height:
24-28px

---

## Button

Primary:

* blue fill
* white text

Secondary:

* white fill
* border

Danger:

* red

---

## Modal

用途：

* add
* edit
* settings

Rules:

* centered desktop
* bottom-sheet mobile

---

# 10. Timeline Rules

このアプリの主役UI。

必須：

* 横軸 = date
* 縦軸 = company
* event block = badge-like card

Event Block:

Contains:

* event type
* date
* time (optional)

Color:
event type or status based

---

# 11. Coding Rules for AI

Claude / Codex must follow:

1.

新機能追加時、まず既存UIに継ぎ足さず
Design System に合わせて再構築を検討する

2.

新コンポーネントは可能なら
src/components/ui
に共通化する

3.

以下を優先して再利用する：

* Button
* Card
* Badge
* Modal
* Tabs

4.

Tailwind class の重複を減らす

5.

新しいUIを作る前に必ず確認：

「このUIは ui-spec.png と一致しているか？」

一致していなければ修正すること。
