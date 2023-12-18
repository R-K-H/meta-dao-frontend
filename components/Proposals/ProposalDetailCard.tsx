import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  ActionIcon,
  Button,
  Divider,
  Flex,
  Group,
  HoverCard,
  Loader,
  Space,
  Stack,
  Tabs,
  Text,
} from '@mantine/core';
import Link from 'next/link';
import { useConnection } from '@solana/wallet-adapter-react';
import { IconExternalLink, IconQuestionMark } from '@tabler/icons-react';
import { useTokens } from '@/hooks/useTokens';
import { useTokenAmount } from '@/hooks/useTokenAmount';
import { ProposalOrdersCard } from './ProposalOrdersCard';
import { ConditionalMarketCard } from '../Markets/ConditionalMarketCard';
import { useExplorerConfiguration } from '@/hooks/useExplorerConfiguration';
import { useAutocrat } from '@/contexts/AutocratContext';
import { shortKey } from '@/lib/utils';
import { StateBadge } from './StateBadge';
import { SLOTS_PER_10_SECS } from '../../lib/constants';
import { useTransactionSender } from '../../hooks/useTransactionSender';
import { useConditionalVault } from '../../hooks/useConditionalVault';
import { useProposal } from '@/contexts/ProposalContext';
import { MarketCard } from './MarketCard';
import { MintConditionalTokenCard } from './MintConditionalTokenCard';

export function ProposalDetailCard() {
  const { connection } = useConnection();
  const { fetchProposals, daoState } = useAutocrat();
  const { redeemTokensTransactions } = useConditionalVault();
  const { proposal, markets, finalizeProposalTransactions } = useProposal();
  const sender = useTransactionSender();
  const { amount: basePassAmount } = useTokenAmount(
    markets?.baseVault.conditionalOnFinalizeTokenMint,
  );
  const { amount: baseFailAmount } = useTokenAmount(
    markets?.baseVault.conditionalOnRevertTokenMint,
  );
  const { amount: quotePassAmount } = useTokenAmount(
    markets?.quoteVault.conditionalOnFinalizeTokenMint,
  );
  const { amount: quoteFailAmount } = useTokenAmount(
    markets?.quoteVault.conditionalOnRevertTokenMint,
  );
  const { tokens } = useTokens();
  const { generateExplorerLink } = useExplorerConfiguration();
  const [lastSlot, setLastSlot] = useState<number>();
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [isFinalizing, setIsFinalizing] = useState<boolean>(false);
  const [isRedeeming, setIsRedeeming] = useState<boolean>(false);

  const remainingSlots = useMemo(() => {
    if (!proposal || !markets || !daoState) return;

    // Proposal need to be old enough
    const endSlot = proposal.account.slotEnqueued.toNumber() + daoState.slotsPerProposal.toNumber();

    // TWAPs need to be old enough as well
    const passEndSlot = endSlot - markets.passTwap.twapOracle.lastUpdatedSlot.toNumber();
    const failEndSlot = endSlot - markets.failTwap.twapOracle.lastUpdatedSlot.toNumber();
    return Math.max(endSlot - (lastSlot || endSlot), passEndSlot, failEndSlot, 0);
  }, [proposal, lastSlot, daoState]);

  useEffect(() => {
    setSecondsLeft(((remainingSlots || 0) / SLOTS_PER_10_SECS) * 10);
  }, [remainingSlots]);
  useEffect(() => {
    const interval = setInterval(
      () => (secondsLeft && secondsLeft > 0 ? setSecondsLeft((old) => old - 1) : 0),
      1000,
    );

    return () => clearInterval(interval);
  });

  const timeLeft = useMemo(() => {
    const seconds = secondsLeft;
    const days = Math.floor(seconds / (60 * 60 * 24));
    const hours = Math.floor((seconds % (60 * 60 * 24)) / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);
    const secLeft = Math.floor(seconds % 60);

    return `${String(days).padStart(2, '0')}:${String(hours).padStart(2, '0')}:${String(
      minutes,
    ).padStart(2, '0')}:${String(secLeft).padStart(2, '0')}`;
  }, [secondsLeft]);

  const handleFinalize = useCallback(async () => {
    setIsFinalizing(true);
    const txs = await finalizeProposalTransactions();
    if (!txs) return;
    try {
      await sender.send(txs);
      await fetchProposals();
    } finally {
      setIsFinalizing(false);
    }
  }, [sender, finalizeProposalTransactions, fetchProposals]);

  const handleRedeem = useCallback(async () => {
    if (!markets || !proposal) return;
    setIsRedeeming(true);
    const baseTxs = await redeemTokensTransactions({
      publicKey: proposal.account.baseVault,
      account: markets.baseVault,
    });
    const quoteTxs = await redeemTokensTransactions({
      publicKey: proposal.account.quoteVault,
      account: markets.quoteVault,
    });
    if (!baseTxs || !quoteTxs) {
      throw new Error('Failed creating redeem txs, some accounts are missing values');
    }
    const txs = baseTxs.concat(quoteTxs);
    try {
      await sender.send(txs);
    } finally {
      setIsRedeeming(false);
    }
  }, [sender, redeemTokensTransactions, fetchProposals]);

  useEffect(() => {
    if (lastSlot) return;
    async function fetchSlot() {
      setLastSlot(await connection.getSlot());
    }

    fetchSlot();
  }, [connection, lastSlot]);

  return !proposal || !markets ? (
    <Group justify="center">
      <Loader />
    </Group>
  ) : (
    <Stack gap="0">
      <Flex justify="flex-start" align="flex-start" direction="row" wrap="wrap">
        <Accordion w="100%" pb="md">
          <Accordion.Item value={proposal.publicKey.toString()}>
            <Accordion.Control>
              <Stack>
                <Group justify="space-between">
                  <Text size="xl" fw={500}>
                    Proposal #{proposal.account.number + 1}
                  </Text>
                  <Text fw="bold">Ends in {timeLeft}</Text>
                  <StateBadge proposal={proposal} />
                </Group>
              </Stack>
            </Accordion.Control>
            <Accordion.Panel p="0" style={{ padding: '0' }}>
              <Stack gap="sm">
                <Link href={proposal.account.descriptionUrl}>
                  <Group gap="sm">
                    <Text>Go to description</Text>
                    <IconExternalLink />
                  </Group>
                </Link>
                <Text>
                  Proposer{' '}
                  <a
                    href={generateExplorerLink(proposal.account.proposer.toString(), 'account')}
                    target="blank"
                  >
                    {shortKey(proposal.account.proposer.toString())}
                  </a>
                </Text>
                <Text>
                  Pass Market{' '}
                  <a
                    href={generateExplorerLink(
                      proposal.account.openbookPassMarket.toString(),
                      'account',
                    )}
                    target="blank"
                  >
                    {shortKey(proposal.account.openbookPassMarket.toString())}
                  </a>
                </Text>
                <Text>
                  Fail Market{' '}
                  <a
                    href={generateExplorerLink(
                      proposal.account.openbookFailMarket.toString(),
                      'account',
                    )}
                    target="blank"
                  >
                    {shortKey(proposal.account.openbookFailMarket.toString())}
                  </a>
                </Text>
                <Text>
                  Pass TWAP Market{' '}
                  <a
                    href={generateExplorerLink(
                      proposal.account.openbookTwapPassMarket.toString(),
                      'account',
                    )}
                    target="blank"
                  >
                    {shortKey(proposal.account.openbookTwapPassMarket.toString())}
                  </a>
                </Text>
                <Text>
                  Fail TWAP Market{' '}
                  <a
                    href={generateExplorerLink(
                      proposal.account.openbookTwapFailMarket.toString(),
                      'account',
                    )}
                    target="blank"
                  >
                    {shortKey(proposal.account.openbookTwapFailMarket.toString())}
                  </a>
                </Text>
                <Text>
                  Conditional USDC Vault{' '}
                  <a
                    href={generateExplorerLink(proposal.account.quoteVault.toString(), 'account')}
                    target="blank"
                  >
                    {shortKey(proposal.account.quoteVault.toString())}
                  </a>
                </Text>
                <Text>
                  Conditional META Vault{' '}
                  <a
                    href={generateExplorerLink(proposal.account.baseVault.toString(), 'account')}
                    target="blank"
                  >
                    {shortKey(proposal.account.baseVault.toString())}
                  </a>
                </Text>
                {proposal.account.state.pending ? (
                  <Button
                    disabled={(remainingSlots || 0) > 0}
                    loading={isFinalizing}
                    onClick={handleFinalize}
                  >
                    Finalize
                  </Button>
                ) : null}
                {proposal.account.state.passed ? (
                  <Button color="green" loading={isRedeeming} onClick={handleRedeem}>
                    Redeem
                  </Button>
                ) : null}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
        <Space w="md" />
        <Group align="center" justify="center" m="auto" pos="relative" w="100%">
          <HoverCard>
            <HoverCard.Target>
              <Group pos="absolute" top="0" left="0" justify="center" align="flex-start">
                <ActionIcon variant="transparent" pos="absolute" top="0" left="0">
                  <IconQuestionMark />
                </ActionIcon>
              </Group>
            </HoverCard.Target>
            <HoverCard.Dropdown w="22rem">
              <Text>
                Conditional tokens are the tokens used to trade on conditional markets. You can mint
                some by depositing $META or $USDC. These tokens will be locked up until the proposal
                is finalized.
                <br />
                <Text span fw="bold">
                  Pass tokens (pTokens)
                </Text>{' '}
                are used to trade on the Pass Market, while{' '}
                <Text span fw="bold">
                  Fail tokens (fTokens)
                </Text>{' '}
                are used to trade on the Fail Market.
              </Text>
            </HoverCard.Dropdown>
          </HoverCard>
          {tokens?.meta ? <MintConditionalTokenCard token={tokens.meta} /> : null}
          {tokens?.usdc ? <MintConditionalTokenCard token={tokens.usdc} /> : null}
        </Group>
      </Flex>
      <Divider m={20} />
      <Stack>
        <Tabs defaultValue="order-book">
          <Tabs.List>
            <Tabs.Tab value="order-book">Order Book</Tabs.Tab>
            <Tabs.Tab value="bet">Bet</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="order-book">
            {markets ? (
              <Group gap="md" justify="space-around" p="sm" pt="xl">
                <ConditionalMarketCard
                  isPassMarket
                  quoteBalance={quotePassAmount?.uiAmountString}
                  baseBalance={basePassAmount?.uiAmountString}
                />
                <ConditionalMarketCard
                  isPassMarket={false}
                  quoteBalance={quoteFailAmount?.uiAmountString}
                  baseBalance={baseFailAmount?.uiAmountString}
                />
              </Group>
            ) : null}
          </Tabs.Panel>
          <Tabs.Panel value="bet">
            <MarketCard />
          </Tabs.Panel>
        </Tabs>
        <ProposalOrdersCard />
      </Stack>
    </Stack>
  );
}
