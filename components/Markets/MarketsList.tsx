'use client';

import { useRouter } from 'next/navigation';
//import { useMemo } from 'react';
import { Group, Loader, Stack, Text, UnstyledButton } from '@mantine/core';

export default function MarketsList() {
  const router = useRouter();
  // TODO: Need to fetch all openbookv2 markets
  //const markets = useMemo();
  const markets: [any] = [{ publicKey: '123123' }];

  if (markets === undefined) {
    return (
      <Group justify="center">
        <Loader />
      </Group>
    );
  }

  return (
    <Stack>
      {markets.length > 0 ? (
        <Stack gap="xl">
          {markets?.map((market) => (
            <UnstyledButton onClick={() => router.push(`/market?id=${market.publicKey}`)}>
            <Text opacity={0.6}>
                Market 1
            </Text>
            </UnstyledButton>
          ))}
        </Stack>
      ) : (
        <Text size="lg" ta="center" fw="bold">
          There are no markets yet
        </Text>
      )}
    </Stack>
  );
}
