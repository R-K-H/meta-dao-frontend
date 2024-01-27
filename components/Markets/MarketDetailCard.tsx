import { useCallback, useState } from 'react';
import {
  Text,
  Group,
  Loader,
  Button,
  Stack,
  Card,
} from '@mantine/core';
import { utf8 } from '@coral-xyz/anchor/dist/cjs/utils/bytes';
import { useOpenBookMarket } from '@/contexts/OpenBookMarketContext';
import { OrderBookCard } from '../OrderBook/OrderBookCard';
import { OrderConfigurationCard } from '../OrderBook/OrderConfigurationCard';
import { useOpenbook } from '@/hooks/useOpenbook';

export function MarketDetailCard() {
  const openBookMarket = useOpenBookMarket();
  const [price, setPrice] = useState<string>('');
  const setPriceFromOrderBook = (value: string) => {
    setPrice(value);
  };
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const openbook = useOpenbook();

  const _orderPrice = () => Number(price);

  const handlePlaceOrder = useCallback(async () => {
//     if (!openBookMarket) return;
//     try {
//       setIsPlacingOrder(true);
//       await openbook.placeOrder(
//         // openOrdersPublicKey
//         openBookMarket.orders[0].publicKey,
//         // marketPublicKey
//         openBookMarket.marketPubkey,
//         // market
//         openBookMarket.market,
//         // userTokenAccount

//         // openOrdersAdmin
//         // args
//         // remainingAccounts
//         // openOrdersDelegate
//         .false,
//         openBookMarket.market?.market
//         .wallet.account,
//         openBookMarket.market?.market.openOrdersAdmin,

//         amount,
// _orderPrice(),
// isLimitOrder,
// isAskSide);
//     } finally {
//       setIsPlacingOrder(false);
//     }
  }, []);

  //placeOrder, amount, isLimitOrder, isAskSide

  return openBookMarket.loading || !openBookMarket.market ? (
    <Group justify="center">
      <Loader />
    </Group>
  ) : (
    <>
      <Text>
        {utf8.decode(new Uint8Array(openBookMarket.market.market.name)).split('\x00')[0]}
      </Text>
        <Stack>
          Base
          <Text>Mint: {openBookMarket.market.market.baseMint.toString()}</Text>
          <Text>Decimals: {openBookMarket.market.market.baseDecimals.toString()}</Text>
          <Text>Lot Size: {openBookMarket.market.market.baseLotSize.toString()}</Text>
          <Text>Deposit Total: {openBookMarket.market.market.baseDepositTotal.toString()}</Text>
          <Text>Market Vault: {openBookMarket.market.market.marketBaseVault.toString()}</Text>
        </Stack>
        <Stack>
          Quote
          <Text> Mint: {openBookMarket.market.market.quoteMint.toString()}</Text>
          <Text>Decimals: {openBookMarket.market.market.quoteDecimals.toString()}</Text>
          <Text>Lot Size: {openBookMarket.market.market.quoteLotSize.toString()}</Text>
          <Text>Deposit Total: {openBookMarket.market.market.quoteDepositTotal.toString()}</Text>
          <Text>Market Vault: {openBookMarket.market.market.marketQuoteVault.toString()}</Text>
        </Stack>
        <Stack>
          <Text>Event Heap Account: {openBookMarket.market.market.eventHeap.toString()}</Text>
          <Text>Taker Fee: {openBookMarket.market.market.takerFee.toString()}</Text>
          <Text>Maker Fee: {openBookMarket.market.market.makerFee.toString()}</Text>
        </Stack>
        <Group>
        <Text>Event Heap Size: {openBookMarket.eventHeapCount}</Text>
        <Button
          onClick={() => openBookMarket.crankMarket()}
        >
          Crank
        </Button>
        </Group>
        <Card>
          <OrderBookCard
            orderBookObject={openBookMarket.orderBookObject}
            setPriceFromOrderBook={setPriceFromOrderBook}
          />
          <OrderConfigurationCard
            setPrice={setPrice}
            price={price}
            orderBookObject={openBookMarket.orderBookObject}
            handlePlaceOrder={handlePlaceOrder}
            isPlacingOrder={isPlacingOrder}
          />
        </Card>
    </>
  );
}
