import { loadEventByCode } from '@/lib/access';
import { SessionHistory } from '@/components/event/SessionHistory';

export default async function SessionsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { event } = (await loadEventByCode(code))!;
  return <SessionHistory code={event.code} printPaper={event.printPaper} />;
}
