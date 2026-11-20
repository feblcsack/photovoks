import { redirect } from 'next/navigation';

/** Old URL — frames are managed inside Pengaturan Booth. */
export default async function FramesRedirect({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/event/${code}/booth#frame`);
}
