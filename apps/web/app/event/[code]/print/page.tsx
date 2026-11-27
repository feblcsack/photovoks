import { loadEventByCode } from '@/lib/access';
import { PrintStation } from '@/components/event/PrintStation';
import { getSettings } from '@/lib/settings';

export default async function PrintStationPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { event } = (await loadEventByCode(code))!;
  const { performance } = await getSettings();
  return <PrintStation code={event.code} defaultPaper={event.printPaper} pollMs={performance.printPollSeconds * 1000} />;
}
