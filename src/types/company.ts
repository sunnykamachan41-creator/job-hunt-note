export const companyStatuses = ["検討中", "選考中", "辞退", "落選", "内定"] as const;

export type CompanyStatus = (typeof companyStatuses)[number];

export type Company = {
  company_id: string;
  company_name: string;
  industry: string;
  status: CompanyStatus | string;
  recruitment_source: string;
  order_index: string;
  mypage_url: string;
  memo: string;
  created_at: string;
  updated_at: string;
  application_source: string;
};

export type CompanyInput = Omit<Company, "company_id" | "created_at" | "updated_at">;

export const companyColumns = [
  "company_id",
  "company_name",
  "industry",
  "status",
  "recruitment_source",
  "order_index",
  "mypage_url",
  "memo",
  "created_at",
  "updated_at",
  "application_source"
] as const satisfies readonly (keyof Company)[];
