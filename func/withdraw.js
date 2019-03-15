const isId = str => /[12]\..+\..+/.test(str);
const fs = require("fs");
const {
  TransactionBuilder,
  PrivateKey,
  ChainTypes,
  ChainStore
} = require("cybexjs");
async function getObject(id = "1.1.1") {
  return await this.daemon.Apis.instance()
    .db_api()
    .exec("get_objects", [[id]]);
}

a = {
  "account": "harley",
  "expiration_time": 600,
  "changed_fees":{
     "10":{ "symbol3": "100000000000",
                  "symbol4": "1000000000",
                  "long_symbol": "50000000",
                  "price_per_kbyte": 100000 }
 }
 }

async function getAsset(...assets) {
  let { daemon } = this;
  if (isId(assets[0])) {
    return await Promise.all(assets.map(id => getObject.call(this, id)));
  }
  return await daemon.Apis.instance()
    .db_api()
    .exec("lookup_asset_symbols", [assets]);
}

async function getAccountID(account) {
  let { daemon } = this;
  let to_account;
  if (!isId(account)) {
    to_account = (await daemon.getAccountByName(account))["id"];
  } else {
    to_account = account;
  }
  return to_account;
}

// withdraw-create ldw-format CYB 20000000 60 200 2018-09-28T01:02:00Z

async function withdrawCreate(
  account,
  withdrawal_limit_asset,
  withdrawal_limit_amount,
  withdrawal_period_sec,
  periods_until_expiration,
  period_start_time
) {
  let { daemon } = this;

  let a = (await getAsset.call(this, withdrawal_limit_asset))[0].id;
  let authorized_account = await getAccountID.call(this, account);
  let starter = new Date(period_start_time).toISOString();
  console.log("Start From: ", starter);
  let tx = {
    fee: {
      amount: 0,
      asset_id: 0
    },
    withdraw_from_account: daemon.daemonAccountInfo.get("id"),
    authorized_account,
    withdrawal_limit: {
      asset_id: a,
      amount: withdrawal_limit_amount
    },
    withdrawal_period_sec: parseInt(withdrawal_period_sec),
    periods_until_expiration: parseInt(periods_until_expiration),
    period_start_time: starter.substring(0, starter.length - 1)
  };

  let tr = new TransactionBuilder();
  let op = tr.get_type_operation("withdraw_permission_create", tx);
  return await daemon.performTransaction(tr, op);
}

// withdraw-claim 1.12.0 owner1 ldw-format CYB 100
async function withdrawClaim(
  withdraw_permission,
  _withdraw_from_account,
  _withdraw_to_account,
  amount_to_withdraw_asset,
  amount_to_withdraw_amount
) {
  let { daemon } = this;

  let a = (await getAsset.call(this, amount_to_withdraw_asset))[0];
  let starter = new Date().toISOString();

  let [withdraw_from_account, withdraw_to_account] = await Promise.all(
    [_withdraw_from_account, _withdraw_to_account].map(a =>
      getAccountID.call(this, a)
    )
  );

  let tx = {
    fee: {
      amount: 0,
      asset_id: 0
    },
    withdraw_permission,
    withdraw_from_account,
    withdraw_to_account,
    amount_to_withdraw: {
      asset_id: a.id,
      amount: amount_to_withdraw_amount
    }
  };

  let tr = new TransactionBuilder();
  let op = tr.get_type_operation("withdraw_permission_claim", tx);
  return await daemon.performTransaction(tr, op);
}

module.exports = {
  withdrawClaim,
  withdrawCreate
};
