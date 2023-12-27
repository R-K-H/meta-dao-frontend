'use client';

import { useSearchParams } from 'next/navigation';
import { Layout } from '@/components/Layout/Layout';
import { OpenBookProvider } from '@/contexts/OpenBookContext';
import { MarketDetailCard } from '@/components/Markets/MarketDetailCard';

export default function ProposalsPage() {
  const params = useSearchParams();
  const marketId = params.get('id');

  return (
    <Layout>
      <OpenBookProvider marketId={marketId}>
        <MarketDetailCard />
      </OpenBookProvider>
    </Layout>
  );
}
