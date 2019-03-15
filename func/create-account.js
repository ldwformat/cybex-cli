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

async function createAccount(accountName, seed) {
  let { daemon } = this;
  return await createAccountImpl.call(this, accountName, seed);
}
async function createAccountWithBlocking(accountName, seed) {
  let { daemon } = this;
  let res = await createAccountImpl.call(this, accountName, seed);
  let opResult = res[0]["trx"]["operation_results"][0][1];
  return await updateAccountWhitelist(
    daemon.daemonAccountInfo.get("id"),
    opResult,
    2
  );
}

async function updateAccountWhitelist(
  authorizing_account,
  account_to_list,
  new_listing
) {
  let { daemon } = this;
  let createParams = {
    fee: {
      amount: 0,
      asset_id: 0
    },
    new_listing,
    account_to_list,
    authorizing_account
  };

  let tr = new TransactionBuilder();
  let op = tr.get_type_operation("account_whitelist", createParams);
  return await daemon.performTransaction(tr, op);
}

async function upgradeAccount(accountID) {
  let { daemon } = this;
  let createParams = {
    fee: {
      amount: 0,
      asset_id: 0
    },
    account_to_upgrade: accountID,
    upgrade_to_lifetime_member: true
  };

  let tr = new TransactionBuilder();
  let op = tr.get_type_operation("account_upgrade", createParams);
  return await daemon.performTransaction(tr, op);
}

async function createAccountImpl(
  name,
  seed,
  { accounts = null, weightBase = 1 } = {}
) {
  let { daemon } = this;
  let { pubKeys, privKeys } = genKeysFromSeed(name, seed);
  let account_auths =
    (accounts && accounts.map(name => [name, weightBase])) || [];
  let createParams = {
    fee: {
      amount: 0,
      asset_id: 0
    },
    registrar: daemon.daemonAccountInfo.get("id"),
    referrer: daemon.daemonAccountInfo.get("id"),
    referrer_percent: 0,
    name: name,
    owner: {
      weight_threshold: account_auths.length * weightBase || 1,
      account_auths,
      key_auths: [[pubKeys.owner, 1]],
      address_auths: []
    },
    active: {
      weight_threshold: account_auths.length * weightBase || 1,
      account_auths,
      key_auths: [[pubKeys.active, 1]],
      address_auths: []
    },
    options: {
      memo_key: pubKeys.owner,
      voting_account: "1.2.5",
      num_witness: 0,
      num_committee: 0,
      votes: []
    }
  };
  let tr = new TransactionBuilder();
  let op = tr.get_type_operation("account_create", createParams);
  return await daemon.performTransaction(tr, op);
}

function genCode(size = 1, codeLength = 12) {
  let res = [];
  for (let i = 0; i < size; i++) {
    res.push(
      PrivateKey.fromSeed(
        Math.floor(Math.random() * Math.pow(10, codeLength)).toString()
      )
        .toPublicKey()
        .toPublicKeyString()
        .slice(0, codeLength)
    );
  }
  return res;
}

async function testCreateAccount(
  times = 10,
  interval = 200,
  logPrefix = "res_create_account_" + Date.now()
) {
  let createAcc = createAccount.bind(this);
  let names = Array.from(genNameSet(times));
  console.log("Names", names);
  let counter = 0;
  let res = [];
  let failedRes = [];
  (function testOnce(counter) {
    let name = names[counter++];
    let seed = name + genCode();
    console.log(`${counter}, Creating account: ${name}, seed: ${seed}`);
    let record =
      JSON.stringify({
        name,
        seed
      }) + ",";
    createAcc(name, seed)
      .then(res => {
        console.log(`${counter}, Creat done: ${name}, seed: ${seed}`);
        fs.writeFileSync(`./outputs/${logPrefix}_done.log`, record, {
          flag: "a+"
        });
      })
      .catch(err => {
        console.error(`${counter}, Create error: ${name}, seed: ${seed}`);
        console.error(err);
        fs.writeFileSync(`./outputs/${logPrefix}_err.log`, record, {
          flag: "a+"
        });
      });
    if (counter < times) {
      setTimeout(testOnce.bind(this, counter), interval);
    }
  })(counter);
}

module.exports = {
  createAccount,
  createAccountWithBlocking,
  upgradeAccount,
  testCreateAccount
};
