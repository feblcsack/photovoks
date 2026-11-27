import { PaymentsManager } from '@/components/payments/PaymentsManager';

export default async function EventPaymentsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PaymentsManager scope="event" code={code.toUpperCase()} />;
}
