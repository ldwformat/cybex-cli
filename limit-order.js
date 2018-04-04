const { TransactionBuilder } = require("cybexjs");

const ID_TYPE_PATTERN = /^\d\.\d+?\.(\d+)$/;
const isIdType = (str) => ID_TYPE_PATTERN.test(str);
const getId = (str) => ID_TYPE_PATTERN.exec(str) || null;
const vToA = (value, precision) => Math.round(value * Math.pow(10, precision));

exports.sell =
  (daemon) =>
    async (_quote, _base, price, valueToSell, expirationDuration = 86400000) => {
      let [quote, base] = await daemon.lookupAssetSymbols([_quote.toUpperCase(), _base.toUpperCase()]);
      let baseValue = (price * valueToSell).toFixed(base.precision); // 1.23142 * 4.231442 = 5.xxxxxxxxxxx;

      let limitOrder = {
        fee: {
          asset_id: "1.3.0",
          amount: 0
        },
        seller: daemon.daemonAccountInfo.get("id"),
        amount_to_sell: {
          asset_id: quote.id,
          amount: vToA(valueToSell, quote.precision)
        },
        min_to_receive: {
          asset_id: base.id,
          amount: vToA(baseValue, base.precision)
        },
        expiration: parseInt((Date.now() + expirationDuration) / 1000),
        fill_or_kill: false,
      };
      console.log("Order: ", limitOrder);
      let tr = new TransactionBuilder();
      let op = tr.get_type_operation("limit_order_create", limitOrder);

      return await daemon.performTransaction(tr, op);
    }