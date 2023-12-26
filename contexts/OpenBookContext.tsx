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
  markets?: OpenBookMarket;
  orders?: OpenOrdersAccountWithKey[];
  orderBookObject?: OpenBookOrderBook;
  loading: boolean;
  isCranking: boolean;
  crankMarkets: (individualEvent?: PublicKey) => Promise<void>;
  fetchOpenOrders: (owner: PublicKey) => Promise<void>;
  fetchMarketsInfo: () => Promise<void>;
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
  market,
}: {
  children: React.ReactNode;
  market: MarketAccountWithKey;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const provider = useProvider();
  const { placeOrderTransactions } = useOpenbookTwap();
  const sender = useTransactionSender();
  const [loading, setLoading] = useState(false);
  const [markets, setMarkets] = useState<OpenBookMarket>();
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

  const fetchMarketsInfo = useCallback(
    debounce(async () => {
      if (!market || !openbook || !openbookTwap || !openbookTwap.views || !connection) {
        return;
      }
      const accountInfos = await connection.getMultipleAccountsInfo([
        market.publicKey,
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

      setMarkets({
        asks,
        bids,
        market: _market,
      });
    }, 1000),
    [markets, openbook, connection],
  );
  const fetchOpenOrders = useCallback(
    debounce<[PublicKey]>(async (owner: PublicKey) => {
      if (!openbook || !market) {
        return;
      }
      const _orders = await openbook.account.openOrdersAccount.all([
        { memcmp: { offset: 8, bytes: owner.toBase58() } },
        { memcmp: { offset: 40, bytes: market.publicKey.toBase58() } },
      ]);
      setOrders(
        _orders
          .sort((a, b) => (a.account.accountNum < b.account.accountNum ? 1 : -1)),
      );
    }, 1000),
    [openbook, market],
  );

  useEffect(() => {
    if (wallet.publicKey) {
      fetchOpenOrders(wallet.publicKey);
    }
  }, [markets, fetchOpenOrders]);

  useEffect(() => {
    if (!markets) {
      fetchMarketsInfo();
    }
  }, [markets, fetchMarketsInfo]);

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

    if (markets) {
      return {
        bidsProcessed: getSide(markets.bids, true),
        asksProcessed: getSide(markets.asks),
        bidsArray: orderBookSide(markets.bids, true),
        asksArray: orderBookSide(markets.asks),
        toB: getToB(markets.bids, markets.asks),
        spreadString: getSpreadString(markets.bids, markets.asks),
      };
    }
    return undefined;
  }, [markets]);

  const placeOrder = useCallback(
    async (amount: number, price: number, limitOrder?: boolean, ask?: boolean, pass?: boolean) => {
      if (!markets) return;
      const placeTxs = await placeOrderTransactions(amount, price, market, limitOrder, ask, pass);

      if (!placeTxs || !wallet.publicKey) {
        return;
      }

      try {
        setLoading(true);

        await sender.send(placeTxs);
        await fetchMarketsInfo();
        await fetchOpenOrders(wallet.publicKey);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [
      wallet,
      markets,
      connection,
      sender,
      placeOrderTransactions,
      fetchMarketsInfo,
      fetchOpenOrders,
    ],
  );

  const crankMarkets = useCallback(
    async (individualEvent?: PublicKey) => {
      if (!markets || !wallet?.publicKey) return;
      try {
        setIsCranking(true);
        const passTxs = await crankMarketTransactions(
          {
            publicKey: market.publicKey,
            account: markets.market,
          },
          markets.market.eventHeap,
          individualEvent,
        );
        const failTxs = await crankMarketTransactions(
          { publicKey: market.publicKey, account: markets.market },
          markets.market.eventHeap,
          individualEvent,
        );
        if (!passTxs || !failTxs) return;
        const txs = [...passTxs, ...failTxs].filter(Boolean);
        await sender.send(txs as VersionedTransaction[]);
        fetchOpenOrders(wallet.publicKey);
      } catch (err) {
        console.error(err);
      } finally {
        setIsCranking(false);
      }
    },
    [markets, wallet.publicKey, sender, crankMarketTransactions, fetchOpenOrders],
  );

  return (
    <openBookContext.Provider
      value={{
        markets,
        orders,
        orderBookObject,
        loading,
        isCranking,
        fetchOpenOrders,
        fetchMarketsInfo,
        crankMarkets,
        placeOrderTransactions,
        placeOrder,
      }}
    >
      {children}
    </openBookContext.Provider>
  );
}
