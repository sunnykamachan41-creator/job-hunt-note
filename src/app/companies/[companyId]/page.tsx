import { redirect } from "next/navigation";

type CompanyDetailProps = {
  params: Promise<{
    companyId: string;
  }>;
};

/**
 * Kept for old bookmarks. Company details now live in the client-side karte,
 * so this route must not render the retired server forms.
 */
export default async function CompanyDetailRedirect({ params }: CompanyDetailProps) {
  const { companyId } = await params;
  redirect(`/?view=companies&company=${encodeURIComponent(companyId)}`);
}
