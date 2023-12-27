import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import { useProvider } from '@/hooks/useProvider';
import { OPENBOOK_PROGRAM_ID } from '@/lib/constants';
import { IDL as OPENBOOK_IDL, OpenbookV2 } from '@/lib/idl/openbook_v2';
import {
  MarketAccountWithKey,
  OpenOrdersAccountWithKey,
  LeafNode,
  OpenBookMarket,
  OpenBookOrderBook,
} from '@/lib/types';
import { useOpenbookTwap } from '@/hooks/useOpenbookTwap';
import { getLeafNodes } from '../lib/openbook';
import { debounce } from '../lib/utils';
import { useTransactionSender } from '@/hooks/useTransactionSender';

export interface OpenBookInterface {
  market?: OpenBookMarket;
  orders?: OpenOrdersAccountWithKey[];
  orderBookObject?: OpenBookOrderBook;
  loading: boolean;
  isCranking: boolean;
  crankMarket: (individualEvent?: PublicKey) => Promise<void>;
  fetchOpenOrders: (owner: PublicKey) => Promise<void>;
  fetchMarketInfo: () => Promise<void>;
  placeOrderTransactions: (
    amount: number,
    price: number,
    market: MarketAccountWithKey,
    limitOrder?: boolean | undefined,
    ask?: boolean | undefined,
    pass?: boolean | undefined,
    indexOffset?: number | undefined,
  ) => Promise<any>;
  placeOrder: (
    amount: number,
    price: number,
    limitOrder?: boolean,
    ask?: boolean,
    pass?: boolean,
  ) => Promise<void>;
}

export const openBookContext = createContext<OpenBookInterface | undefined>(undefined);

export const useOpenBook = () => {
  const context = useContext(openBookContext);
  if (!context) {
    throw new Error('useProposal must be used within a ProposalContextProvider');
  }
  return context;
};

export function OpenBookProvider({
  children,
  marketId,
}: {
  children: React.ReactNode;
  marketId: string | undefined | null;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const provider = useProvider();
  const { placeOrderTransactions } = useOpenbookTwap();
  const sender = useTransactionSender();
  const [loading, setLoading] = useState(false);
  const [market, setMarket] = useState<OpenBookMarket>();
  const [orders, setOrders] = useState<OpenOrdersAccountWithKey[]>([]);
  const [isCranking, setIsCranking] = useState<boolean>(false);
  const { crankMarketTransactions } = useOpenbookTwap();
  const openbook = useMemo(() => {
    if (!provider) {
      return;
    }
    return new Program<OpenbookV2>(OPENBOOK_IDL, OPENBOOK_PROGRAM_ID, provider);
  }, [provider]);

  const { program: openbookTwap } = useOpenbookTwap();

  const fetchMarketInfo = useCallback(
    debounce(async () => {
      if (!marketId || !openbook || !openbookTwap || !openbookTwap.views || !connection) {
        return;
      }
      const accountInfos = await connection.getMultipleAccountsInfo([
        new PublicKey(marketId),
      ]);
      if (!accountInfos || accountInfos.indexOf(null) >= 0) return;

      const _market = await openbook.coder.accounts.decode('market', accountInfos[0]!.data);

      const bookAccountInfos = await connection.getMultipleAccountsInfo([
        _market.asks,
        _market.bids,
      ]);
      const asks = getLeafNodes(
        await openbook.coder.accounts.decode('bookSide', bookAccountInfos[0]!.data),
        openbook,
      );
      const bids = getLeafNodes(
        await openbook.coder.accounts.decode('bookSide', bookAccountInfos[1]!.data),
        openbook,
      );

      setMarket({
        asks,
        bids,
        market: _market,
      });
    }, 1000),
    [marketId, openbook, connection],
  );
  const fetchOpenOrders = useCallback(
    debounce<[PublicKey]>(async (owner: PublicKey) => {
      if (!openbook || !marketId) {
        return;
      }
      const _orders = await openbook.account.openOrdersAccount.all([
        { memcmp: { offset: 8, bytes: owner.toBase58() } },
        { memcmp: { offset: 40, bytes: new PublicKey(marketId).toBase58() } },
      ]);
      setOrders(
        _orders
          .sort((a, b) => (a.account.accountNum < b.account.accountNum ? 1 : -1)),
      );
    }, 1000),
    [openbook, marketId],
  );

  useEffect(() => {
    if (wallet.publicKey) {
      fetchOpenOrders(wallet.publicKey);
    }
  }, [market, fetchOpenOrders]);

  useEffect(() => {
    if (!market) {
      fetchMarketInfo();
    }
  }, [market, fetchMarketInfo]);

  const orderBookObject = useMemo(() => {
    const getSide = (side: LeafNode[], isBidSide?: boolean) => {
      if (side.length === 0) {
        return null;
      }
      const parsed = side
        .map((e) => ({
          price: e.key.shrn(64).toNumber(),
          size: e.quantity.toNumber(),
        }))
        .sort((a, b) => a.price - b.price);

      const sorted = isBidSide
        ? parsed.sort((a, b) => b.price - a.price)
        : parsed.sort((a, b) => a.price - b.price);

      const deduped = new Map();
      sorted.forEach((order) => {
        if (deduped.get(order.price) === undefined) {
          deduped.set(order.price, order.size);
        } else {
          deduped.set(order.price, deduped.get(order.price) + order.size);
        }
      });

      const total = parsed.reduce((a, b) => ({
        price: a.price + b.price,
        size: a.size + b.size,
      }));
      return { parsed, total, deduped };
    };

    const orderBookSide = (orderBookForSide: LeafNode[], isBidSide?: boolean) => {
      if (orderBookForSide) {
        const _orderBookSide = getSide(orderBookForSide, isBidSide);
        if (_orderBookSide) {
          return Array.from(_orderBookSide.deduped?.entries()).map((side) => [
            (side[0] / 10_000).toFixed(4),
            side[1],
          ]);
        }
      }
      if (isBidSide) {
        return [[0, 0]];
      }
      return [[69, 0]];
    };

    const getToB = (bids: LeafNode[], asks: LeafNode[]) => {
      const _bids = orderBookSide(bids, true);
      const _asks = orderBookSide(asks);
      const tobAsk: number = Number(_asks[0][0]);
      const tobBid: number = Number(_bids[0][0]);
      return {
        topAsk: tobAsk,
        topBid: tobBid,
      };
    };

    const getSpreadString = (bids: LeafNode[], asks: LeafNode[]) => {
      const { topAsk, topBid } = getToB(bids, asks);
      const spread: number = topAsk - topBid;
      const spreadPercent: string = ((spread / topAsk) * 100).toFixed(2);

      return spread === topAsk
        ? '∞ (100.00%)'
        : `${spread.toFixed(2).toString()} (${spreadPercent}%)`;
    };

    if (market) {
      return {
        bidsProcessed: getSide(market.bids, true),
        asksProcessed: getSide(market.asks),
        bidsArray: orderBookSide(market.bids, true),
        asksArray: orderBookSide(market.asks),
        toB: getToB(market.bids, market.asks),
        spreadString: getSpreadString(market.bids, market.asks),
      };
    }
    return undefined;
  }, [market]);

  const placeOrder = useCallback(
    async (amount: number, price: number, limitOrder?: boolean, ask?: boolean, pass?: boolean) => {
      if (!marketId || !market) return;
      const _market = { publicKey: new PublicKey(marketId), account: market.market };
      const placeTxs = await placeOrderTransactions(
        amount,
        price,
        _market,
        limitOrder,
        ask,
        pass);

      if (!placeTxs || !wallet.publicKey) {
        return;
      }

      try {
        setLoading(true);

        await sender.send(placeTxs);
        await fetchMarketInfo();
        await fetchOpenOrders(wallet.publicKey);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [
      wallet,
      marketId,
      connection,
      sender,
      placeOrderTransactions,
      fetchMarketInfo,
      fetchOpenOrders,
    ],
  );

  const crankMarket = useCallback(
    async (individualEvent?: PublicKey) => {
      if (!market || !marketId || !wallet?.publicKey) return;
      try {
        setIsCranking(true);
        const marketTxs = await crankMarketTransactions(
          {
            publicKey: new PublicKey(marketId),
            account: market.market,
          },
          market.market.eventHeap,
          individualEvent,
        );
        if (!marketTxs) return;
        const txs = [...marketTxs].filter(Boolean);
        await sender.send(txs as VersionedTransaction[]);
        fetchOpenOrders(wallet.publicKey);
      } catch (err) {
        console.error(err);
      } finally {
        setIsCranking(false);
      }
    },
    [market, marketId, wallet.publicKey, sender, crankMarketTransactions, fetchOpenOrders],
  );

  return (
    <openBookContext.Provider
      value={{
        market,
        orders,
        orderBookObject,
        loading,
        isCranking,
        fetchOpenOrders,
        fetchMarketInfo,
        crankMarket,
        placeOrderTransactions,
        placeOrder,
      }}
    >
      {children}
    </openBookContext.Provider>
  );
}
