export const companyStatuses = ["選考中", "落選", "辞退", "保留", "内定"] as const;
export const companyCategories = ["インターン", "本選考", "その他"] as const;

export type CompanyStatus = (typeof companyStatuses)[number];
export type CompanyCategory = (typeof companyCategories)[number];

export type Company = {
  company_id: string;
  company_name: string;
  category: CompanyCategory | string;
  industry: string;
  status: CompanyStatus | string;
  recruitment_source: string;
  order_index: string;
  mypage_url: string;
  memo: string;
  created_at: string;
  updated_at: string;
};

export type CompanyInput = Omit<Company, "company_id" | "created_at" | "updated_at">;

export const companyColumns = [
  "company_id",
  "company_name",
  "category",
  "industry",
  "status",
  "recruitment_source",
  "order_index",
  "mypage_url",
  "memo",
  "created_at",
  "updated_at"
] as const satisfies readonly (keyof Company)[];
