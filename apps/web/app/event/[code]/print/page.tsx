import { loadEventByCode } from '@/lib/access';
import { PrintStation } from '@/components/event/PrintStation';

export default async function PrintStationPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { event } = (await loadEventByCode(code))!;
  return <PrintStation code={event.code} defaultPaper={event.printPaper} />;
}
