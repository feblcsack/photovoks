import { redirect } from 'next/navigation';

/** Old URL — settings now live in one place. */
export default async function SettingsRedirect({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/event/${code}/booth`);
}
