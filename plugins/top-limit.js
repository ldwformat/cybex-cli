const calcPrice = (_baseAsset, _quoteAsset, { base, quote }, sell = true) => {
  if (_baseAsset.id === base.asset_id) {
    base.precision = _baseAsset.precision;
    quote.precision = _quoteAsset.precision;
  } else {
    quote.precision = _baseAsset.precision;
    base.precision = _quoteAsset.precision;
  }
  let price =
    base.amount / quote.amount * Math.pow(10, quote.precision - base.precision);
  return !sell ? price : 1 / price;
  // return price;
};
const getId = idStr => parseInt(idStr.slice(idStr.lastIndexOf(".")), 10);
const sortId = (pre, next) => getId(pre.id) - getId(next.id);

module.exports = ({ limits, base, quote }, sell = true, decentOrder = true) =>
  limits
    .filter(
      order =>
        !sell
          ? order.sell_price.base.asset_id === base.id
          : order.sell_price.quote.asset_id === base.id
    )
    .map(order => {
      let price = calcPrice(base, quote, order.sell_price, sell);
      let priceToDisplay = price.toFixed(5);
      let amountToDisplay = order.for_sale / Math.pow(10, 5).toFixed(5);
      return {
        price: calcPrice(base, quote, order.sell_price, sell),
        priceToDisplay,
        amountToDisplay,
        ...order
      };
    })
    .sort(sortId)
    .sort(
      (prevOrder, nextOrder) =>
        decentOrder
          ? nextOrder.price - prevOrder.price
          : prevOrder.price - nextOrder.price
    );
