const {
  genKeysFromSeed,
  getTransferOpWithMemo,
  getOpFromHistory,
  filterHistoryByOp,
  getRandomLetter,
  genNameSet
} = require("./../utils");
const {
  TransactionBuilder,
  PrivateKey,
  ChainTypes,
  ChainStore
} = require("cybexjs");
const fs = require("fs");

async function getAsset(...assets) {
  let { daemon } = this;
  if (isId(assets[0])) {
    return await Promise.all(assets.map(id => getObject(id)));
  }
  return await daemon.Apis.instance()
    .db_api()
    .exec("lookup_asset_symbols", [assets]);
}
const isId = str => /[12]\..+\..+/.test(str);

async function createLimitOrder(
  base,
  baseAmount,
  quote,
  quoteAmount,
  fee = "1.3.0",
  feeAmount = 0
) {
  let { daemon } = this;

  let [baseID, quoteID, feeID] = (await getAsset(base, quote, fee)).map(
    asset => asset.id
  );
  let createParams = {
    fee: {
      asset_id: feeID,
      amount: feeAmount
    },
    seller: daemon.daemonAccountInfo.get("id"),
    amount_to_sell: {
      asset_id: baseID,
      amount: baseAmount
    },
    min_to_receive: {
      asset_id: quoteID,
      amount: quoteAmount
    },
    expiration: "2018-10-20T20:00:00",
    fill_or_kill: false
  };

  let tr = new TransactionBuilder();
  let op = tr.get_type_operation("limit_order_create", createParams);
  return await daemon.performTransaction(tr, op);
}
async function cancelLimitOrder(order) {
  let { daemon } = this;
  let createParams = {
    fee: {
      amount: 0,
      asset_id: "1.3.0"
    },
    fee_paying_account: daemon.daemonAccountInfo.get("id"),
    order
  };

  let tr = new TransactionBuilder();
  let op = tr.get_type_operation("limit_order_cancel", createParams);
  return await daemon.performTransaction(tr, op);
}


module.exports = {
  createLimitOrder,
  cancelLimitOrder
};
