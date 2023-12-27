'use client';

import { Container, Stack } from '@mantine/core';
import { Layout } from '@/components/Layout/Layout';
import MarketsList from '@/components/Markets/MarketsList';

export default function MarketsPage() {
  return (
    <Layout>
      <Container p="0">
        <Stack gap="15">
          <MarketsList />
        </Stack>
      </Container>
    </Layout>
  );
}
