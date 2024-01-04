import { useCallback, useState } from 'react';
import {
  ActionIcon,
  Stack,
  Text,
  SegmentedControl,
  TextInput,
  Grid,
  GridCol,
  Button,
  NativeSelect,
  Group,
} from '@mantine/core';
import { IconWallet } from '@tabler/icons-react';
import numeral from 'numeral';
import { OpenBookOrderBook as _OrderBook } from '@/lib/types';
import { BASE_FORMAT, NUMERAL_FORMAT } from '../../lib/constants';
import { useOpenBookMarket } from '@/contexts/OpenBookMarketContext';

export function OrderConfigurationCard({
  setPrice,
  price,
  orderBookObject,
}: {
  setPrice: (price: string) => void;
  price: string;
  orderBookObject: _OrderBook;
}) {
  // TODO: Review this as anything less than this fails to work
  const minMarketPrice = 10;
  // TODO: Review this number as max safe doesn't work
  const maxMarketPrice = 10000000000;
  const [orderType, setOrderType] = useState<string>('Limit');
  const [orderSide, setOrderSide] = useState<string>('Buy');
  const [amount, setAmount] = useState<number>(0);
  // STUBS
  const baseBalance = 100000;
  const quoteBalance = 100000;
  const isAskSide = orderSide === 'Sell';
  const isLimitOrder = orderType === 'Limit';
  const [priceError, setPriceError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const { placeOrder } = useOpenBookMarket();

  const _orderPrice = () => {
    if (isLimitOrder) {
      if (Number(price) > 0) {
        return Number(price);
      }
      // TODO: This is not a great value or expected behavior.. We need to throw error..
      return 0;
    }
    if (orderSide === 'Sell') {
      return minMarketPrice;
    }
    return maxMarketPrice;
  };

  const handlePlaceOrder = useCallback(async () => {
    try {
      setIsPlacingOrder(true);
      await placeOrder(amount, _orderPrice(), isLimitOrder, isAskSide);
    } finally {
      setIsPlacingOrder(false);
    }
  }, [placeOrder, amount, isLimitOrder, isAskSide]);

  const changeOrderSide = (side: string) => {
    // Clear out our errors
    setPriceError(null);
    setAmountError(null);
    // Reset amount
    setAmount(0);
    // Check and change values to match order type
    if (isLimitOrder) {
      // We can safely reset our price to nothing
      setPrice('');
    } else if (side === 'Buy') {
      // Sets up the market order for the largest value
      setPrice(maxMarketPrice.toString());
    } else {
      // Sets up the market order for the smallest value
      setPrice(minMarketPrice.toString());
    }
  };
  const priceValidator = (value: string) => {
    if (isLimitOrder) {
      if (Number(value) > 0) {
        if (isAskSide) {
          if (Number(value) <= Number(orderBookObject?.toB.topBid)) {
            setPriceError('You will cross the books with a taker order');
            return;
          }
          setPriceError(null);
          return;
        }
        if (Number(value) >= Number(orderBookObject?.toB.topAsk)) {
          setPriceError('You will cross the books with a taker order');
          return;
        }
        setPriceError(null);
      } else {
        setPriceError('Enter a value greater than 0');
      }
    }
  };

  const maxOrderAmount = () => {
    if (isAskSide) {
      if (Number(baseBalance) > 0) {
        return Number(baseBalance);
      }
      return 0;
    }
    if (quoteBalance && price) {
      const _maxAmountRatio = Math.floor(Number(quoteBalance) / Number(price));
      return _maxAmountRatio;
    }
    return 0;
  };

  const amountValidator = (value: number) => {
    if (value > 0) {
      if (!isLimitOrder) {
        setAmountError(`A market order may execute at an 
        extremely ${isAskSide ? 'low' : 'high'} price
        be sure you know what you're doing`);
        return;
      }
      if (value > maxOrderAmount()) {
        setAmountError("You don't have enough funds");
      } else {
        setAmountError(null);
      }
    } else {
      setAmountError('You must enter a whole number');
    }
  };

  const isOrderAmountNan = () => {
    const _orderAmount = numeral(maxOrderAmount()).format(isAskSide ? BASE_FORMAT : NUMERAL_FORMAT);
    return Number.isNaN(Number(_orderAmount));
  };

  return (
    <Stack>
        <SegmentedControl
          style={{ marginTop: '10px' }}
          color={isAskSide ? 'red' : 'green'}
          classNames={{
            label: 'label',
          }}
          data={['Buy', 'Sell']}
          value={orderSide}
          onChange={(e) => {
            setOrderSide(e);
            changeOrderSide(e);
          }}
          fullWidth
        />
        <NativeSelect
          style={{ marginTop: '10px' }}
          data={['Limit', 'Market']}
          value={orderType}
          onChange={(e) => {
            setOrderType(e.target.value);
            if (e.target.value === 'Market') {
              if (isAskSide) {
                setPrice(minMarketPrice.toString());
              } else {
                setPrice(maxMarketPrice.toString());
              }
            } else {
              setPrice('');
            }
            setPriceError(null);
            setAmountError(null);
          }}
        />
        <TextInput
          label="Price"
          placeholder="Enter price..."
          type="number"
          value={!isLimitOrder ? '' : price}
          disabled={!isLimitOrder}
          error={priceError}
          onChange={(e) => {
            setPrice(e.target.value);
            priceValidator(e.target.value);
          }}
        />
        <TextInput
          label={
            <Group justify="space-between" align="center">
              <Text>Amount QUOTE</Text>
              <Group align="center" gap={0}>
                  <>
                    <IconWallet height={12} />
                    <Text size="xs">
                      QUOTE/BASE WALLET BALANCE
                    </Text>
                  </>
              </Group>
            </Group>
          }
          placeholder="Enter amount..."
          type="number"
          value={amount || ''}
          rightSectionWidth={100}
          rightSection={
            <ActionIcon
              size={20}
              radius="md"
              w={80}
              color="grey"
              onClick={() => {
                setAmount(maxOrderAmount()! ? maxOrderAmount()! : 0);
                amountValidator(maxOrderAmount()! ? maxOrderAmount()! : 0);
              }}
              disabled={!isLimitOrder ? !!isOrderAmountNan() : !price}
            >
              <Text size="xs">
                Max{' '}
                {maxOrderAmount()
                  ? !isOrderAmountNan()
                    ? numeral(maxOrderAmount()).format(BASE_FORMAT)
                    : ''
                  : ''}
              </Text>
            </ActionIcon>
          }
          error={amountError}
          onChange={(e) => {
            setAmount(Number(e.target.value));
            amountValidator(Number(e.target.value));
          }}
        />
        <Grid>
          <GridCol span={12}>
            <Button
              fullWidth
              color={isAskSide ? 'red' : 'green'}
              onClick={handlePlaceOrder}
              variant="light"
              disabled={!amount || (isLimitOrder ? !price : false)}
              loading={isPlacingOrder}
            >
              {orderSide} QUOTE
            </Button>
          </GridCol>
        </Grid>
    </Stack>
  );
}
