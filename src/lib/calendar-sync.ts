const defaultOnKeywords = [
  "面接",
  "説明会",
  "面談",
  "インターン",
  "OB訪問",
  "グループディスカッション",
  "GD"
];

const defaultOffKeywords = [
  "ES",
  "Webテスト",
  "適性検査",
  "課題提出"
];

export function defaultCalendarSyncForEventType(eventType: string) {
  if (defaultOffKeywords.some((keyword) => eventType.includes(keyword))) {
    return false;
  }

  return defaultOnKeywords.some((keyword) => eventType.includes(keyword));
}
