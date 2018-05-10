const { pseudoRandomBytes } = require("crypto");

const { CybexDaemon, KEY_MODE } = require("./CybexDaemon");
const { EVENT_ON_NEW_HISTORY } = require("./constants");
const { TransactionBuilder, PrivateKey, ChainTypes } = require("cybexjs");
const { execSync } = require("child_process");
const moment = require("moment");
const { inspect } = require("util");
const {
  genKeysFromSeed,
  getTransferOpWithMemo,
  getOpFromHistory,
  filterHistoryByOp,
  getRandomLetter,
  genNameSet
} = require("./utils");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const demo = require("./demo");
const stream = require("stream");
const { sell } = require("./limit-order");
const { getWalletReader } = require("./wallet");
const createCommittee = require("./plugins/create-committee");

const orderLimits = require("./plugins/top-limit");
const findWhoHas = require("./plugins/find-who-has");

const argv = process.argv;

const isTest = argv.indexOf("--test") !== -1;

const DEFAULT_ARGS = {
  api: "wss://shenzhen.51nebula.com/",
  user: "owner1",
  seed: "qwer1234qwer1234"
};

const cliArgs = argv.splice(2).reduce((all, arg) => {
  let [argName, argValue] = arg.replace(/--/g, "").split("=");
  return {
    ...all,
    [argName]: argValue
  };
}, DEFAULT_ARGS);
// console.log("ARGS: ", cliArgs);

const NODE_URL = cliArgs.api;
// ? "wss://shenzhen.51nebula.com/"
// : "wss://shanghai.51nebula.com/";
const DAEMON_USER = cliArgs.user;
const DAEMON_PASSWORD = cliArgs.seed;

const WITHDRAW_MEMO_PATTERN = new RegExp(
  `^withdraw\:${"CybexGatewayDev"}\:(eth|btc|eos|usdt|bat|ven|omg|snt|nas|knc|pay|eng)\:(.*)$`,
  "i"
);
const DEPOSIT_MEMO_PATTERN = new RegExp(
  `^deposit\:${"CybexGatewayDev"}\:(eth|btc|eos|usdt|bat|ven|omg|snt|nas|knc|pay|eng)\:(.+)\:(.+)$`,
  "i"
);

const logger = console;

function getRendom() {
  return Math.floor(Math.random() * 3000) + 30000;
}

const cmdRex = /^\s*(.+?)\s*$/;
function splitCmd(cmdLine) {
  // console.log("200");
  return ([cmd, ...args] = cmdLine.match(cmdRex)[1].split(" "));
}

const getCompleter = commandsArray => line => {
  let hits = commandsArray.filter(cmd => cmd.startsWith(line));
  return [hits, line];
};

async function createCli(
  {
    prompt,
    context = { daemon: null, cmds: {} },
    notDefaultCmd = false,
    isSubCmd = false,
    supCmd
  },
  customCmds = {}
) {
  let params = { prompt, context, notDefaultCmd, isSubCmd, supCmd };
  const DEFAULT_CMDS = {
    test: () => {
      console.log("Test: ", 1);
    },
    exit: () => {
      if (!isSubCmd) {
        return process.exit(0);
      }
      supCmd.resume();
      return supCmd.prompt();
    }
  };
  let commands = {
    ...customCmds,
    ...DEFAULT_CMDS
  };

  let cli = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: getCompleter(Object.keys(customCmds)),
    prompt
  });
  if (isSubCmd) {
    if (!supCmd) {
      throw Error("Not set approperate super cmd module");
    }
    supCmd.close();
  } else {
    context.cli = cli;
    // console.log("Context: ", context);
  }

  for (let cmd in context.cmds) {
    context.cmds[cmd] = context.cmds[cmd].bind(context);
  }

  cli.on("line", async line => {
    // console.log("SLIN")
    if (!line) {
      return cli.prompt();
    }
    // console.log("133")        
    let [cmd, ...args] = splitCmd(line);
    // console.log("134")        
    if (!cmd) return cli.prompt();
    // console.log("135")        
    let impl = commands[cmd.toLowerCase()]; 
    // console.log("136")    
    if (!impl) {
      console.error("Command not found: ", cmd);
      return cli.prompt();
    }
    // cli.close();
    impl = impl.bind(context);
    await impl(...args);
    return cli.prompt(true);

    // createCli(params, customCmds);
  });
  cli.on("SIGINT", () => {
    cli.close();
    console.log("\nBye~~");
    process.exit();
  });
  return cli.prompt(true);
}

async function getAccountFullHistory(accountId, numOfRecord, daemon) {
  let res = await daemon.Apis.instance()
    .history_api()
    .exec("get_account_history", [accountId, "1.11.0", numOfRecord, "1.11.0"]);
  // let history = await daemon.Apis.instance().history_api().exec("get_account_history", ["1.2.27965", "1.11.0", 5, "1.11.4908018"]);
  if (res.length < numOfRecord) {
    return res;
  }
  let then;
  do {
    let lastId = parseInt(res[res.length - 1].id.split(".")[2]) - 1;
    console.log("LastId: ", lastId);
    then = await daemon.Apis.instance()
      .history_api()
      .exec("get_account_history", [
        accountId,
        "1.11.0",
        numOfRecord,
        "1.11." + lastId
      ]);
    res = [...res, ...then];
    console.log("Then: ", then.length);
  } while (then.length);
  return res;
}

async function getObject(id = "1.1.1") {
  console.log(`Get object ${id}`);
  return await this.daemon.Apis.instance()
    .db_api()
    .exec("get_objects", [[id]]);
}

let blocks = {};

async function getBlock(blockNum, { daemon } = this) {
  if (!blocks[blockNum]) {
    blocks[blockNum] = {
      ...(await daemon.Apis.instance()
        .db_api()
        .exec("get_block", [blockNum])),
      blockNum
    };
  }
  return blocks[blockNum];
}

async function getBlocks(start, numOfBlock = 1) {
  console.log(`Get ${numOfBlock} blocks info from ` + start);
  if (!numOfBlock || numOfBlock <= 0) {
    throw Error("The num of block and start num must greater than 0!");
  }
  numOfBlock = parseInt(numOfBlock);
  let numArray = new Array(numOfBlock)
    .fill(1)
    .map((v, i) => parseInt(start) + i);
  let pArray = numArray.map(blockNum =>
    this.daemon.Apis.instance()
      .db_api()
      .exec("get_block", [blockNum])
  );
  let bs = await Promise.all(pArray);
  return bs;
}

async function getGlobalDynamic() {
  let dynamicGlobalObject = await this.daemon.Apis.instance()
    .db_api()
    .exec("get_dynamic_global_properties", []);
  return dynamicGlobalObject;
}

const isId = str => /[12]\..+\..+/.test(str);

async function getAccountInfo(accountIdOrName, { daemon } = this) {
  if (!accountIdOrName) {
    throw Error("Account id/name must be provided");
  }
  return isId(accountIdOrName)
    ? (await daemon.Apis.instance()
        .db_api()
        .exec("get_accounts", [[accountIdOrName]]))[0]
    : await daemon.getAccountByName(accountIdOrName);
}
async function getAccountFullInfo(...ids) {
  return await daemon.Apis.instance()
    .db_api()
    .exec("get_full_accounts", [ids, false]);
}

function getPrintFn(fn, splitter = "--") {
  return async function(...args) {
    let bashArgs;
    let splitIndex = args.indexOf(splitter);
    if (splitIndex !== -1) {
      bashArgs = args.splice(splitIndex).splice(1);
    }
    try {
      let res = await fn.apply(this, args);

      if (bashArgs) {
        let output = "./.output";
        fs.writeFileSync(output, JSON.stringify(res));
        let resOfExec = execSync(`cat ./.output ${bashArgs.join(" ")}`);
        console.log(resOfExec.toString());
      } else {
        console.log(
          inspect(res, {
            depth: null,
            colors: true
          })
        );
      }
    } catch (e) {
      console.error("Error: ", e);
    }
  };
}

async function main() {
  getPrintFn = getPrintFn.bind(this);
  // 新建一个守护账号
  let daemon = (this.daemon = new CybexDaemon(
    NODE_URL,
    DAEMON_USER,
    DAEMON_PASSWORD
    // KEY_MODE.WIF
  ));
  console.log("Daemon Created");
  // await daemon.init(); // 配置守护链接的初始化
  await daemon.init(); // 配置守护链接的初始化

  console.log(`Daemon Setup: User: ${DAEMON_USER}`);

  // Set Plugin
  const sellAsset = sell(daemon);
  const readWallet = getWalletReader();

  // daemon.performTransfer(transferObj);
  // daemon.performTransfer(transferObj1);
  async function getOneAccount(accountId) {
    let incomes = {};

    let history = await getAccountFullHistory(accountId, 50, daemon);
    let transferOps = history
      .filter(tx => {
        return tx.op[0] === 0;
      })
      .map(tx => {
        return tx.op[1];
      })
      .forEach(op => {
        let { amount, to } = op;
        if (!(amount.asset_id in incomes)) {
          incomes[amount.asset_id] = 0;
        }
        if (to === accountId) {
          incomes[amount.asset_id] += amount.amount;
        }
      });
    for (let i in incomes) {
      if (incomes[i] < 0) {
        incomes[i] = 0;
      }
    }
    return incomes;
  }

  async function getAccountHistory(accountId) {
    let { daemon } = this;
    let history = await getAccountFullHistory(accountId, 100, daemon);
    fs.writeFileSync(
      "./outputs/history_" + accountId + ".json",
      JSON.stringify(history)
    );
    return {
      size: history.length,
      history
    };
  }

  async function compareWithdrawOrder() {
    let { daemon } = this;
    let { findOrder } = require("./db/find-order");
    let allWithdrawOrder = await findOrder({
      cybexTxID: { $gt: "1.11.294399", fundType: "WITHDRAW" }
    });
    let histories = require("./outputs/history_1.2.4733.json");
    let hisWithMemo = filterHistoryByOp(histories, 0)
      // .filter(his => his.op)
      // .map(getOpFromHistory)
      .map(tr =>
        getTransferOpWithMemo(tr, [daemon.privKey, daemon.privKeys.owner])
      )
      .filter(tr => tr.memoContent === "***");
    // let hisWithMemo = histories.map(getTransferOpWithMemo).filter(his => his.memoContent.startsWith("withdraw"));
    fs.writeFileSync("Withdraw_star.json", JSON.stringify(hisWithMemo));
  }

  async function getLatestFillOrder(
    base = "1.3.0",
    quote = "1.3.1",
    { daemon } = this
  ) {
    return await daemon.Apis.instance()
      .history_api()
      .exec("get_fill_order_history", [base, quote, 1]);
  }

  async function getLatestPrice(_base = "1.3.0", _quote = "1.3.2") {
    let [base, quote] = await getAsset(_base, _quote);
    let d = new Date().toISOString().slice(0, 19);
    let latestTrade = (await daemon.Apis.instance()
      .db_api()
      .exec("get_trade_history", [
        base.id,
        quote.id,
        d,
        // start,
        `2018-02-24T00:00:00`,
        // stop,
        1
      ]))[0] || { price: 0 };
    return latestTrade.price;
  }
  async function getTradeHistory(
    base = "1.3.0",
    quote = "1.3.2",
    { daemon } = this
  ) {
    let start = new Date().toISOString();
    let stop = new Date(Date.now() - 3600 * 1000).toISOString();
    let time = [9, 8, 7, 6, 5, 4];
    let history = (await Promise.all(
      time.map(p =>
        daemon.Apis.instance()
          .db_api()
          .exec("get_trade_history", [
            base,
            quote,
            `2018-04-24T0${p}:00:00`,
            // start,
            `2018-04-24T0${p - 1}:00:00`,
            // stop,
            100
          ])
      )
    )).reduce((all, next) => [...all, ...next]);
    fs.writeFile("./24h.json", JSON.stringify(history));
    // let history = await Promise.all([
    //   daemon.Apis.instance()
    //     .db_api()
    //     .exec("get_trade_history", [
    //       base,
    //       quote,
    //       "2018-04-24T09:00:00",
    //       // start,
    //       "2018-04-24T05:00:00",
    //       // stop,
    //       100
    //     ])
    // ]);

    console.log(history.length);
  }

  // const warningConfig = require("./warning-config.json");

  class Price {
    constructor(asset_id, price) {
      this.base = {
        asset_id: "1.3.0",
        amount: 100000
      };
      this.quote = {
        asset_id,
        amount: 100000 * price
      };
    }
  }
  const feedPrice = async function(_asset, baseAmount, quoteAmount) {
    let asset = (await getAsset(_asset))[0];
    console.log("Asset: ", asset, daemon.daemonAccountInfo.get("id"));
    let price = quoteAmount / baseAmount;
    price = price * Math.pow(10, asset.precision) / Math.pow(10, 5);
    let denominator = 1;
    let numerator = Math.round(price * denominator);
    let price_feed = {
      settlement_price: {
        quote: {
          asset_id: "1.3.0",
          amount: denominator
        },
        base: {
          asset_id: asset["id"],
          amount: numerator
        }
      },
      maintenance_collateral_ratio: 1750,
      maximum_short_squeeze_ratio: 1200,
      core_exchange_rate: {
        quote: {
          asset_id: "1.3.0",
          amount: parseInt(denominator * 1.05)
        },
        base: {
          asset_id: asset["id"],
          amount: numerator
        }
      }
    };
    let feed = {
      fee: {
        asset_id: "1.3.0",
        amount: 0
      },
      // publisher: "1.2.0",
      publisher: daemon.daemonAccountInfo.get("id"),
      asset_id: asset.id,
      feed: price_feed
    };
    let tx = new TransactionBuilder();
    let op = tx.get_type_operation("asset_publish_feed", feed);
    await daemon.performTransaction(tx, op);
  };

  async function getLimitOrder(quoteAsset, baseAsset, limit = 100) {
    let [quote, base] = await getAsset(quoteAsset, baseAsset);
    assert(quote && base, "Assets should be a pair");
    let { daemon } = this;
    return {
      base,
      quote,
      limits: await daemon.Apis.instance()
        .db_api()
        .exec("get_limit_orders", [quote.id, base.id, limit])
    };
  }

  async function patchSellerNameIntoOrders(orders) {
    return await Promise.all(
      orders.map(async order => {
        order.seller_name = (await getAccountInfo.bind(this)(
          order.seller
        )).name;
        return order;
      })
    );
  }

  async function topBuyLimits(quoteAsset, baseAsset, limit = 100) {
    let limits = await getLimitOrder.bind(this)(quoteAsset, baseAsset);
    let buyOrders = (await orderLimits(limits, false)).slice(0, limit);
    return await patchSellerNameIntoOrders(buyOrders);
  }
  async function topSellLimits(quoteAsset, baseAsset, limit = 100) {
    let limits = await getLimitOrder.bind(this)(quoteAsset, baseAsset);
    return await patchSellerNameIntoOrders(
      (await orderLimits(limits, true, false)).slice(0, limit)
    );
  }

  async function getAccountBalance(nameOrId, ...assets) {
    assert(nameOrId, "An account's name or id must be provided");
    // console.log("Assets To Find: ", assets, assets[0]);
    if (assets.length && !isId(assets[0])) {
      assets = (await getAsset(...assets)).map(asset => asset.id);
      // console.log("Asset To Find: ", assets);
    }
    if (!isId(nameOrId)) {
      return await getAccountBalanceByAccountName(nameOrId, assets);
    } else {
      return await getAccountBalanceByAccountId(nameOrId, assets);
    }
  }

  async function sanitize() {
    let sellers = [...tshirt, ...dinner].map(sell => {
      let sellAsset = sell.sell_price.base;
      // if (sellAsset.asset_id === "1.3.14")
      return {
        id: sell.seller,
        bal: [
          {
            asset_id: sellAsset.asset_id,
            amount: sellAsset.amount
          }
        ]
      };
    });
    let after = [...james, ...sellers];
    after = after.map(entry => ({
      ...entry,
      val: entry.bal.reduce(
        (all, bal) => ({ ...all, [bal.asset_id]: bal.amount }),
        {}
      )
    }));
    // return after;
    let res = after.reduce((all, entry) => {
      if (all[entry.id]) {
        for (let asset in entry.val) {
          if (all[entry.id][asset]) {
            all[entry.id][asset] += entry.val[asset];
          } else {
            all[entry.id][asset] = entry.val[asset];
          }
        }
      } else {
        all[entry.id] = entry.val;
      }
      return all;
    }, {});
    return res;
  }

  async function getAccountBalanceByAccountId(accountId, assets = []) {
    let bals = await daemon.Apis.instance()
      .db_api()
      .exec("get_account_balances", [accountId, assets]);
    return bals;
  }

  async function getAccountBalanceByAccountName(accountName, assets = []) {
    let bals = await daemon.Apis.instance()
      .db_api()
      .exec("get_named_account_balances", [accountName, assets]);
    return bals;
  }

  async function getAsset(...assets) {
    if (isId(assets[0])) {
      return await Promise.all(assets.map(id => getObject(id)));
    }
    return await daemon.Apis.instance()
      .db_api()
      .exec("lookup_asset_symbols", [assets]);
  }

  async function checkAccountBalance(accountName, _all = false) {
    let all = _all === "true";
    let assets = await getAsset(Object.keys(warningConfig));
    assets = assets.reduce((acc, next) => {
      acc[next.id] = next;
      return acc;
    }, {});
    let balances = await getAccountBalance(accountName);
    // console.log("Assets: ", assets, warningConfig, balances);
    let validBals = !all
      ? balances.filter(bal => assets[bal.asset_id])
      : balances;
    validBals = validBals
      .map(bal => ({
        value: bal.amount / Math.pow(10, assets[bal.asset_id].precision),
        warningValue: warningConfig[assets[bal.asset_id].symbol],
        symbol: assets[bal.asset_id].symbol,
        ...bal
      }))
      .map(bal => ({
        isDanger: bal.value <= bal.warningValue,
        ...bal
      }));
    return validBals;
  }
  // update feed
  async function updateFeedProducer(_asset, producer) {
    let { daemon } = this;
    let asset = (await getAsset(_asset))[0];
    console.log("Issuer: ", daemon.daemonAccountInfo.get("id"));
    let feed = {
      fee: {
        asset_id: "1.3.0",
        amount: 0
      },
      issuer: daemon.daemonAccountInfo.get("id"),
      new_feed_producers: [daemon.daemonAccountInfo.get("id")],
      asset_to_update: asset.id,
      extensions: []
    };

    let tr = new TransactionBuilder();
    let op = tr.get_type_operation("asset_update_feed_producers", feed);
    return await daemon.performTransaction(tr, op);
  }
  // update feed
  async function settleAsset(_asset, base, quote) {
    let { daemon } = this;
    let asset = (await getAsset(_asset))[0];
    console.log("Issuer: ", daemon.daemonAccountInfo.get("id"));
    let feed = {
      fee: {
        asset_id: "1.3.0",
        amount: 0
      },
      issuer: daemon.daemonAccountInfo.get("id"),
      settle_price: {
        base: {
          asset_id: asset.id,
          amount: base
        },
        quote: {
          asset_id: "1.3.0",
          amount: quote
        }
      },
      asset_to_settle: asset.id,
      extensions: []
    };

    let tr = new TransactionBuilder();
    let op = tr.get_type_operation("asset_global_settle", feed);
    return await daemon.performTransaction(tr, op);
  }

  async function createAccount(accountName, seed) {
    let { daemon } = this;
    return await createAccountImpl(accountName, seed);
  }

  async function createAccountImpl(
    name,
    seed,
    { accounts = null, weightBase = 1 } = {},
    daemonInstance = daemon
  ) {
    let { pubKeys } = genKeysFromSeed(name, seed);
    let account_auths =
      (accounts && accounts.map(name => [name, weightBase])) || [];
    let createParams = {
      fee: {
        amount: 0,
        asset_id: 0
      },
      registrar: daemonInstance.daemonAccountInfo.get("id"),
      referrer: daemonInstance.daemonAccountInfo.get("id"),
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
    return await daemonInstance.performTransaction(tr, op);
  }

  async function testCreateAccount(
    times = 20,
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
      console.log("COUnte: ", counter);
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
          console.error(`${counter}, Creat error: ${name}, seed: ${seed}`);
          fs.writeFileSync(`./outputs/${logPrefix}_err.log`, record, {
            flag: "a+"
          });
        });
      if (counter < times) {
        setTimeout(testOnce.bind(this, counter), interval);
      }
    })(counter);
  }

  async function getValue(accountId) {
    let incomes = await getOneAccount(accountId);
    let bals = (await getAccountBalance(accountId, incomes)).map(bal => ({
      value: bal.amount * rate[bal.asset_id],
      ...bal
    }));
    let account = (await daemon.Apis.instance()
      .db_api()
      .exec("get_accounts", [[accountId]]))[0].name;
    let value = bals.reduce((acc, next) => acc + next.value, 0) / 10000;
    return {
      accountId,
      incomes,
      bals,
      account,
      value
    };
  }

  async function transfer(account, value, memo, asset = "1.3.0") {
    let { daemon } = this;
    let to_account;
    if (!isId(account)) {
      to_account = (await daemon.getAccountByName(account))["id"];
    } else {
      to_account = account;
    }
    let a = (await getAsset(asset))[0][0];
    console.log("A: ", a);
    let tx = {
      to_account,
      amount: parseInt(value * Math.pow(10, a.precision)),
      asset,
      memo
    };
    return await daemon.performTransfer(tx);
  }

  async function verifyAccountExist(file) {
    let list = require(file);
    assert(list && list.length);
    let res = await Promise.all(list.map(l => getAccountByName(l)));
    let final = res
      .filter(account => !!account)
      .map(account => account.name)
      .sort();
    fs.writeFileSync("./verify_result.json", JSON.stringify(final));
    return final;

    // let notExist = [];
    // res.forEach((one, index) => (one.result == null ? notExist.push[res[index]["name"]] : 0));
    // return notExist.length ? notExist : "All Currect!";
  }

  const MEMOS = ["SJInPuvqG", "S18gu_vcM", "Hk9tj88qG", "HyiosLI9G"];
  async function testImpl(counter, amount = 20000) {
    let { daemon } = this;
    let tx = {
      to_account: "1.2.38",
      amount: amount + counter,
      asset: "1.3.41",
      memo:
        "withdraw:CybexGatewayDev:ETH:0xbe79a5a868312f8EAfBCc2a24a10d6FCf501cE2D"
    };
    return await daemon.performTransfer(tx);
  }
  async function testGateway(amount = 100, interval = 200) {
    let counter = 1;
    let starter = Date.now();
    let doTest = testImpl.bind(this);
    (function doOnce(counter) {
      doTest(counter)
        // sendPrizeImpl(id, 66, `Prize`)
        .then(res => console.log(`No.${counter} done`))
        .catch(err => {
          console.error("Failed: ", err);
        });
      if (counter < amount) {
        setTimeout(() => {
          doOnce(counter + 1);
        }, interval);
      } else {
        let duration = (Date.now() - starter) / 1000;
        console.log("Total: ", duration);
      }
    })(counter);
  }

  async function genPub(accountName, seed) {
    const role = ["active", "owner"];
    const res = role.map(r => {
      const s = `${accountName}${r}${seed}`;
      console.log("Now Seed: ", s);
      let privKey = PrivateKey.fromSeed(s);
      let pubKey = privKey.toPublicKey().toPublicKeyString();
      console.log("Address: ", privKey.toPublicKey().toAddressString());
      return pubKey;
    });
    return res;
  }

  const { correctMarketPair } = require("./utils/index");

  async function statVolume() {
    let { daemon } = this;
    let assets = await daemon.Apis.instance()
      .db_api()
      .exec("list_assets", ["", 100]);
    let assetSymbols = assets.map(asset => asset.symbol);
    let rawPairs = assetSymbols.reduce((allPairs, next, i, arr) => {
      arr.forEach(symbol => {
        if (symbol !== next) {
          allPairs.push([symbol, next]);
        }
      });
      return allPairs;
    }, []);
    let orderedPairs = rawPairs
      .map(pair => correctMarketPair(...pair))
      .map(pair => `${pair.quote}_${pair.base}`);
    let validMarkets = Array.from(new Set(orderedPairs));
    let marketsVol = await Promise.all(
      validMarkets.map(pair => getVol(...pair.split("_")))
    );
    let marketsVolByAsset = marketsVol.reduce((summary, vol) => {
      if (vol.base in summary) {
        summary[vol.base] += Number(vol.base_volume);
      } else {
        summary[vol.base] = Number(vol.base_volume);
      }
      if (vol.quote in summary) {
        summary[vol.quote] += Number(vol.quote_volume);
      } else {
        summary[vol.quote] = Number(vol.quote_volume);
      }
      return summary;
    }, {});
    console.log("As: ", JSON.stringify(marketsVolByAsset));
    let priceOfCybEth = await getLatestPrice("JADE.ETH", "CYB");
    let volByEth = await Promise.all(
      Object.getOwnPropertyNames(marketsVolByAsset).map(async asset => {
        let res = {
          asset,
          vol: marketsVolByAsset[asset]
        };
        let price = await getLatestPrice("JADE.ETH", asset);
        if (!price) {
          price = (await getLatestPrice("CYB", asset)) * priceOfCybEth;
          res.byCYB = true;
        }
        res.volByEther = price * marketsVolByAsset[asset].toFixed(6);

        return res;
      })
    );

    let res = {
      details: volByEth,
      sum: volByEth.reduce((acc, next) => acc + Number(next.volByEther), 0)
    };
    console.log("Res: ", res);
  }

  async function getDB(apiName, ...args) {
    let { daemon } = this;
    return await daemon.Apis.instance()
      .db_api()
      .exec(apiName, [...args]);
  }

  let assets = {};
  async function getValueFromAmount({ asset_id, amount }, { daemon } = this) {
    if (!assets[asset_id]) {
      assets[asset_id] = (await daemon.Apis.instance()
        .db_api()
        .exec("get_assets", [[asset_id]]))[0];
    }
    let asset = assets[asset_id];
    let { precision } = asset;
    return amount / Math.pow(10, precision);
  }
  async function getAssetName({ asset_id }, { daemon } = this) {
    if (!assets[asset_id]) {
      assets[asset_id] = (await daemon.Apis.instance()
        .db_api()
        .exec("get_assets", [[asset_id]]))[0];
    }
    let asset = assets[asset_id];
    return asset.symbol;
  }

  async function getAccountByName(accountName) {
    return await this.daemon.getAccountByName(accountName);
  }

  async function translateTransfer(transfer, { daemon } = this) {
    // console.log("Transer: ", transfer);
    let { fee, from, to, amount, memoContent, blockNum } = transfer;
    let block = await getBlock(blockNum, this);
    return {
      time: moment.utc(block.timestamp).toISOString(),
      blockNum: block.blockNum,
      from: (await getAccountInfo(from, { daemon })).name,
      to: (await getAccountInfo(to, { daemon })).name,
      fee: {
        value: await getValueFromAmount(fee, { daemon }),
        asset: await getAssetName(fee, this)
      },
      amount: {
        value: await getValueFromAmount(amount, { daemon }),
        asset: await getAssetName(amount, this)
      },
      memoContent
    };
  }
  async function sanTransfer(transfer, { daemon } = this) {
    console.log("Transer: ", transfer);
    let { fee, from, to, amount, memoContent, blockNum, timestamp } = transfer;
    let block = await getBlock(blockNum, this);
    return {
      time: timestamp,
      blockNum: block.blockNum || blockNum,
      from: (await getAccountInfo(from, { daemon })).name,
      to: (await getAccountInfo(to, { daemon })).name,
      fee: {
        value: await getValueFromAmount(fee, { daemon }),
        asset: await getAssetName(fee, this)
      },
      amount: {
        value: await getValueFromAmount(amount, { daemon }),
        asset: await getAssetName(amount, this)
      },
      memoContent
    };
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

  function genAddress(seed) {
    assert(seed && seed.length > 12);
    let pub = PrivateKey.fromSeed(seed).toPublicKey();
    return {
      pubkey: pub.toPublicKeyString(),
      address: pub.toAddressString()
    };
  }

  async function statAccountTransfer(
    account,
    startBlock,
    stopBlock,
    { daemon } = this
  ) {
    let accountId;
    if (!isId(account)) {
      accountId = (await daemon.getAccountByName(account))["id"];
    } else {
      accountId = account;
    }
    let transfers = await statAccountTransferHistory.call(
      this,
      accountId,
      startBlock,
      stopBlock
    );
    let transfersWithMemo =
      accountId == daemon.daemonAccountInfo.get("id")
        ? transfers.map(transfer =>
            getTransferOpWithMemo.call(this, transfer, [
              daemon.privKey,
              daemon.privKeys.owner
            ])
          )
        : transfers.map(history => ({
            ...history.op[1],
            timestamp: history.timestamp,
            blockNum: history.blockNum
          }));
    let res = await Promise.all(
      transfersWithMemo.map(
        async transfer => await sanTransfer.call(this, transfer)
      )
    );
    console.log("RES: ", res);
    fs.writeFileSync("./cybex_has_send.json", JSON.stringify(res));
    return res;
  }

  function txFilterForLimit(blocks, startNumOfBlock) {
    return blocks
      .filter(block => block.transactions.length)
      .map((block, index) => ({
        blockNum: parseInt(startNumOfBlock) + index,
        timestamp: block.timestamp,
        limits: block.transactions.filter(
          tx => tx.operations[0][0] === 1 || tx.operations[0][0] === 2
        )
      }));
    //     .map(tx => ({
    //       name: tx.operations[0][1].name,
    //       registrar: tx.operations[0][1].registrar,
    //       id: tx.operation_results[0][1]
    //     }))
    // }))
    // .filter(tx => tx.users.length);
  }
  function txFilterForRegStat(blocks, startNumOfBlock) {
    return blocks
      .map((block, index) => ({
        blockNum: parseInt(startNumOfBlock) + index,
        timestamp: block.timestamp,
        users: block.transactions
          .filter(tx => tx.operations[0][0] === 5)
          .map(tx => ({
            name: tx.operations[0][1].name,
            registrar: tx.operations[0][1].registrar,
            id: tx.operation_results[0][1]
          }))
      }))
      .filter(tx => tx.users.length);
  }
  function txFilterForTransferOfAccount(blocks, startNumOfBlock, accountId) {
    return blocks
      .map((block, index) =>
        block.transactions
          .filter(
            tx =>
              tx.operations[0][0] === 0 &&
              (tx.operations[0][1]["from"] == accountId ||
                tx.operations[0][1]["to"] == accountId)
          )
          .map(tx => ({
            blockNum: parseInt(startNumOfBlock) + index,
            timestamp: block.timestamp,
            op: tx.operations[0]
          }))
      )
      .filter(txs => txs.length > 0);
  }

  async function getFillOrder(_base, _quote, limit = 100) {
    let [base, quote] = isId(_base)
      ? [_base, _quote]
      : (await getAsset(_base, _quote)).map(asset => asset.id);
    let { daemon } = this;
    let r = await daemon.Apis.instance()
      .history_api()
      .exec("get_fill_order_history", [base, quote, limit]);
    // fs.writeFileSync("./rj.json", JSON.stringify(r));
    return r;
  }

  async function get24() {
    let start = new Date("2018-04-24T07:10:00Z").valueOf();
    let end = new Date("2018-04-24T07:13:00Z").valueOf();
    let orders = await getFillOrder("1.3.0", "1.3.2", (limit = 30000));
    const isValid = time => {
      let timestamp = new Date(time + "Z").valueOf();
      return timestamp >= start && timestamp <= end;
    };
    let _24 = orders.filter(order => isValid(order.time));
    fs.writeFileSync("24.json", JSON.stringify(_24));
  }

  async function loadFillOrder(...args) {
    const isValid = time => {
      let timestamp = new Date(time + "Z").valueOf();
      return timestamp >= 1524463200000 && timestamp <= 1524492000000
        ? 1
        : timestamp >= 1524492000000 && timestamp <= 1524578400000;
      // ? 2
      // : timestamp >= 1524636000000 && timestamp <= 1524664800000
      //   ? 3
      //   : 0;
    };
    let bots = (await Promise.all(
      [
        "rockets-2018",
        "karl-malone",
        "carmelo-anthony",
        "sz-zhanxiaorong",
        "polar-bear",
        "huzp1980",
        "jamesbond-007",
        "ding-ding",
        "sunminghui123",
        "miaomiao-miao",
        "milan-win2018",
        "fin-3-acen",
        "cz334455",
        "shenl-01",
        "nexu-jane",
        "oo-55yie",
        "stene-cui",
        "wxx-1991",
        "point-one",
        "robin-hood"
      ].map(getAccountByName)
    )).map(a => a.id);

    let file = `./outputs/fill/fill_${args.join("_")}_${Date.now()}.json`;
    let validFile = `./outputs/fill/valid_${args.join("_")}_${Date.now()}.json`;
    let resultFile = `./outputs/fill/result_${args.join(
      "_"
    )}_${Date.now()}.json`;
    let sanitizeFile = `./outputs/fill/sum_${args.join(
      "_"
    )}_${Date.now()}.json`;
    let orders = await getFillOrder(...args);
    fs.writeFileSync(file, JSON.stringify(orders));
    let sanitized = orders
      .filter(order => bots.indexOf(order.op.account_id) === -1)
      .reduce(
        (sum, order) => {
          let v = isValid(order.time);
          if (!v) return sum;
          let day = sum[v];
          if (order.op.account_id in day) {
            day[order.op.account_id].push({
              time: order.time,
              order_id: order.order_id
            });
          } else {
            day[order.op.account_id] = [
              {
                time: order.time,
                order_id: order.order_id
              }
            ];
          }
          sum["totalOf" + v] = Object.getOwnPropertyNames(day).length;
          return sum;
        },
        { 1: {}, 2: {}, 3: {} }
      );

    fs.writeFileSync(sanitizeFile, JSON.stringify(sanitized));
    let validList = [];

    validList[1] = Object.getOwnPropertyNames(sanitized[1]).filter(
      id => bots.indexOf(id) === -1
    );
    validList[2] = Object.getOwnPropertyNames(sanitized[2]).filter(
      id => bots.indexOf(id) === -1
    );
    validList[3] = Object.getOwnPropertyNames(sanitized[3]).filter(
      id => bots.indexOf(id) === -1
    );
    fs.writeFileSync(validFile, JSON.stringify(validList));

    let result = [];
    result[0] = (await Promise.all(
      validList[1].map(id => getAccountInfo(id))
    )).map(a => ({ id: a.id, name: a.name }));
    result[1] = (await Promise.all(
      validList[2].map(id => getAccountInfo(id))
    )).map(a => ({ id: a.id, name: a.name }));
    result[2] = (await Promise.all(
      validList[3].map(id => getAccountInfo(id))
    )).map(a => ({ id: a.id, name: a.name }));
    fs.writeFileSync(resultFile, JSON.stringify(result));

    return file;
  }

  async function removeDetails(file) {
    assert(file);
    let records = require(file);
    console.log("Record:", records);
    for (let record of records) {
      delete record.details;
    }
    return records;
  }

  async function statRegister(_startBlock = 1, _endBlock) {
    let startBlock = parseInt(_startBlock);
    let endBlock =
      parseInt(_endBlock) ||
      (await getGlobalDynamic.bind(this)()).last_irreversible_block_num + 1;
    let numOfBlocks = endBlock - startBlock;
    let regTxs = [];
    // For Memory

    while (startBlock <= endBlock) {
      let blocknumOfZone = Math.min(endBlock - startBlock, 20000);
      console.log(`Stat ${blocknumOfZone} Blocks From ${startBlock}`);
      if (!blocknumOfZone) break;
      let blocks = await getBlocks.bind(this)(startBlock, blocknumOfZone);
      // console.log("BLOCK:", blocks);
      blocks = txFilterForRegStat(blocks, startBlock);
      fs.writeFileSync(
        `./register/${startBlock}.json`,
        JSON.stringify(blocks),
        {
          flag: "a+"
        }
      );

      // regTxs = regTxs.concat();
      startBlock += blocknumOfZone;
    }

    return regTxs;
  }
  async function statAccountTransferHistory(
    accountId,
    _startBlock = 1,
    _endBlock
  ) {
    let startBlock = parseInt(_startBlock);
    let endBlock =
      parseInt(_endBlock) ||
      (await getGlobalDynamic.bind(this)()).last_irreversible_block_num + 1;
    let numOfBlocks = endBlock - startBlock;
    let regTxs = [];
    // For Memory

    while (startBlock <= endBlock) {
      let blocknumOfZone = Math.min(endBlock - startBlock, 20000);
      console.log(
        `Stat Account Transfer ${blocknumOfZone} Blocks From ${startBlock}`
      );
      if (!blocknumOfZone) break;
      let blocks = await getBlocks.bind(this)(startBlock, blocknumOfZone);
      // console.log("BLOCK:", blocks);
      let txs = txFilterForTransferOfAccount(blocks, startBlock, accountId);
      fs.writeFileSync(`./account/${startBlock}.json`, JSON.stringify(txs), {
        flag: "a+"
      });

      regTxs = regTxs.concat(txs);
      startBlock += blocknumOfZone;
    }

    return regTxs.reduce((all, next) => [...all, ...next], []);
  }
  async function statLimit(_startBlock = 1, _endBlock) {
    let startBlock = parseInt(_startBlock);
    let endBlock =
      parseInt(_endBlock) ||
      (await getGlobalDynamic.bind(this)()).last_irreversible_block_num + 1;
    let numOfBlocks = endBlock - startBlock;
    let regTxs = [];
    // For Memory

    while (startBlock <= endBlock) {
      let blocknumOfZone = Math.min(endBlock - startBlock, 20000);
      console.log(`Stat ${blocknumOfZone} Blocks From ${startBlock}`);
      if (!blocknumOfZone) break;
      let blocks = await getBlocks.bind(this)(startBlock, blocknumOfZone);
      // console.log("BLOCK:", blocks);
      blocks = txFilterForLimit(blocks, startBlock);
      fs.writeFileSync(`./limits/${startBlock}.json`, JSON.stringify(blocks), {
        flag: "w+"
      });

      // regTxs = regTxs.concat();
      startBlock += blocknumOfZone;
    }

    return regTxs;
  }
  async function sendCode() {
    let nx = require("./xn_final.json");
    let names = [
      { name: "owner6", code: "sadfasdf" },
      { name: "owner5", code: "12sdfa" }
    ];
    let failedNames = [];
    let counter = 0;
    let starter = Date.now();
    let doTransfer = transfer.bind(this);
    (function doOnce(counter) {
      let { name, code } = nx[counter];
      doTransfer(name, 2, `Award Code: ${code}`)
        .then(res => console.log(`No.${counter} ${name} done`))
        .catch(err => {
          console.error("Failed: ", err);
          failedNames.push(nx[counter]);
          fs.writeFile("./failed.json", JSON.stringify(failedNames));
        });
      if (counter + 1 < nx.length) {
        setTimeout(() => {
          doOnce(counter + 1);
        }, 200);
      } else {
        let duration = (Date.now() - starter) / 1000;
        console.log("Total: ", duration);
      }
    })(counter);
    return true;
  }
  let counterT = 0;
  async function sendCodeWinner() {
    if (counterT++ > 0) return;
    // let res = require("./inputs/airdrop-test.json");
    // let res = require("./inputs/airdrop-fill.json");
    // let list = res[0];
    // let list = [
    //   { name: "earth", block: 1559232, value: 1, CYB: 2, MT: 10 },
    //   { name: "april", block: 1559232, value: 1, CYB: 2, MT: 11 },
    //   { name: "fairystar", block: 1559232, value: 1, CYB: 6, MT: 11 },
    // ];
    // let list = require("./pool/MT.json");
    // let list = require("./pool/ETH.json");
    let list = require("./verify_b.json");
    return console.log(list);

    // let res = { "1.2.7": { "1.3.14": 0, "1.3.15": 6 } };
    // let list = Object.keys(res);
    // let s = "1.3.0";
    // let list = ["earth"];
    let failedNames = [];
    let counter = 0;
    let starter = Date.now();
    let doTransfer = transfer.bind(this);
    (function doOnce(counter) {
      let name = list[counter];
      // let { name, id, MT, CYB } = list[counter];
      // console.log("ID: ", name);
      // doTransfer(id, CYB, `4月25日交易MT奖励CYB`, "1.3.0")
      doTransfer(name, 50, `活动注册奖励MT`, "1.3.19")
        .then(res => console.log(`No.${counter} ${name} done`))
        .catch(err => {
          console.error("Failed: ", err);
          failedNames.push(list[counter]);
          fs.writeFile(
            `./air_reg_failed_24m.json`,
            JSON.stringify(failedNames)
          );
        });
      if (counter + 1 < list.length) {
        setTimeout(() => {
          doOnce(counter + 1);
        }, 150);
      } else {
        let duration = (Date.now() - starter) / 1000;
        console.log("Total: ", duration);
      }
    })(counter);
    return true;
  }
  // let account = (await daemon.Apis.instance().db_api().exec("get_accounts", [["1.2.28018"]]))[0].name;
  // console.log("Account: ", account)
  async function stat(accountId) {
    return await statWhiteList(
      (await getAccountHistory.bind(this)(accountId)).history
    );
  }

  async function statWhiteList(txs) {
    let ops = txs.filter(tx => tx.op[0] === 0).map(tx => tx.op[1]);
    let codeOps = ops.filter(op => op.amount.amount === 1);
    let sendOps = ops.filter(op => op.amount.amount === 30000000);
    return {
      verifyCode: {
        size: codeOps.length,
        record: codeOps
      },
      sendCoin: {
        size: sendOps.length,
        record: sendOps
      }
    };
  }

  async function updateParams(file) {
    let { daemon } = this;
    let tx = new TransactionBuilder();
    tx.update_head_block();
    let newOp = require(file);
    let now = new Date();
    now.setHours(now.getHours + 1);
    // newOp.expiration_time = now;

    let op = tx.get_type_operation("proposal_create", newOp);
    return await daemon.performTransaction(tx, op);
  }

  async function sanitizeAccountTransfer(
    accountName,
    _assets, // JADE.ETH,JADE.MT => split => ["JADE.ETH", "JADE.MT"]
    startBlock = 0,
    _endBlock
  ) {
    let assets = !_assets ? [] : _assets.trim().split(",");
    let endBlock =
      _endBlock || (await getGlobalDynamic()).last_irreversible_block_num;
    let list = await statAccountTransfer(accountName, startBlock, endBlock);
    let res = list.filter(
      transfer =>
        transfer.blockNum >= startBlock && transfer.blockNum <= endBlock
    );
    // .filter(
    //   transfer =>
    //     _assets ? assets.indexOf(transfer.amount.asset) !== -1 : true
    // );
    fs.writeFileSync("./account/" + accountName + ".json", JSON.stringify(res));
    res.overview = res.reduce(
      (all, transfer) => {
        if (transfer.from === accountName) {
          all.deposit += transfer.amount.value;
        } else {
          all.withdraw += transfer.amount.value;
        }
        return all;
      },
      { withdraw: 0, deposit: 0 }
    );
    return res;
  }

  async function statGatewayOrder(
    asset = "JADE.ETH",
    fundType = "DEPOSIT",
    _startTime,
    _endTime
  ) {
    let startTime =
      _startTime ||
      moment
        .utc()
        .subtract(5, "d")
        .toISOString();
    let endTime = _endTime || moment.utc().toISOString();
    let Db = require("./db");
    // let ISODate = Db.ISODate;
    let db = await Db.getDb();
    console.log(startTime);
    let res = await db
      .find({
        fundType,
        isCybexFinished: true,
        asset,
        finishedAt: {
          $gt: new Date(startTime),
          $lt: new Date(endTime)
        }
      })
      .toArray();
    console.log(res);
  }

  async function initDaemon() {
    let { daemon } = this;
    return daemon.init();
  }

  async function getVol(quote, base) {
    return await this.daemon.Apis.instance()
      .db_api()
      .exec("get_24_volume", [quote, base]);
  }

  async function findAccounts() {
    let { daemon } = this;
    let ids = [];
    for (let winner of winners) {
      let [name, code] = winner;
      let n = await daemon.getAccountByName(name);
      console.log("Winner: ", name, ":", n && n.id, code);
      if (!n) {
        console.error("Null: ", name, code);
      } else {
        ids.push(n.id);
      }
    }
    return ids;
  }

  /**
   * 专用于MT空投活动第二波用
   *
   * @param {any} startBlock
   * @param {any} endBlock
   */
  async function statDeposit(startBlock = 1493794, _endBlock) {
    let endBlock =
      _endBlock || (await getGlobalDynamic()).last_irreversible_block_num;
    let d = `${startBlock}_${endBlock}_${new Date().toISOString()}`;
    fs.mkdirSync(`./outputs/deposit/${d}`);
    let gatewayAccounts = ["cybex-jadegateway", "jade-reserve"];
    let fundRecords = (await Promise.all(
      gatewayAccounts.map(acc =>
        sanitizeAccountTransfer(acc, "JADE.ETH,JADE.MT", startBlock, endBlock)
      )
    )).reduce((acc, next) => [...acc, ...next]);
    fs.writeFileSync(
      `./outputs/deposit/${d}/raw_${d}.json`,
      JSON.stringify(fundRecords)
    );
    let ordered = fundRecords.reduce(
      (all, rec) => {
        let cate, accountName;
        if (gatewayAccounts.indexOf(rec.from) !== -1) {
          cate = all.deposit;
          accountName = rec.to;
        } else {
          cate = all.withdraw;
          accountName = rec.from;
        }
        if (accountName in cate) {
          cate[accountName][rec.amount.asset].push(rec);
        } else {
          let r = {
            [rec.amount.asset]: [rec],
            [rec.amount.asset === "JADE.ETH" ? "JADE.MT" : "JADE.ETH"]: []
          };
          cate[accountName] = r;
        }
        return all;
      },
      {
        deposit: {},
        withdraw: {}
      }
    );
    fs.writeFileSync(
      `./outputs/deposit/${d}/ordered_${d}.json`,
      JSON.stringify(ordered)
    );

    let { deposit, withdraw } = ordered;
    function summary(all, next) {
      all.total += parseFloat(next.amount.value.toFixed(6));
      all.firstTime = Math.min(all.firstTime, next.blockNum);
      return all;
    }
    let delta = {};
    Object.keys(deposit).forEach(user => {
      let withd = withdraw[user]
        ? {
            "JADE.ETH": withdraw[user]["JADE.ETH"].reduce(summary, {
              total: 0,
              firstTime: 200000000
            }),
            "JADE.MT": withdraw[user]["JADE.MT"].reduce(summary, {
              total: 0,
              firstTime: 200000000
            })
          }
        : {
            "JADE.ETH": { total: 0 },
            "JADE.MT": { total: 0 }
          };
      // console.log("WIth: ", withd);
      delta[user] = {
        "JADE.ETH": deposit[user]["JADE.ETH"].reduce(summary, {
          total: -withd["JADE.ETH"].total,
          firstTime: 200000000
        }),
        "JADE.MT": deposit[user]["JADE.MT"].reduce(summary, {
          total: -withd["JADE.MT"].total,
          firstTime: 200000000
        })
      };
    });

    fs.writeFileSync(
      `./outputs/deposit/${d}/delta_${d}.json`,
      JSON.stringify(delta)
    );

    let eth = 0;
    let ethIncome = 0;
    let mt = 0;
    let mtIncome = 0;
    let pNumOfEth = 0;
    let pNumOfEthWinner = 0;
    let pNumOfMt = 0;
    let pNumOfMtWinner = 0;
    let ethWinner = [];
    let ethToSend = 0;
    let mtWinner = [];
    let mtToSend = 0;
    for (let name in delta) {
      let user = delta[name];
      eth += user["JADE.ETH"].total;
      mt += user["JADE.MT"].total;
      user["JADE.ETH"].total > 0 ? (ethIncome += user["JADE.ETH"].total) : 0;
      user["JADE.MT"].total > 0 ? (mtIncome += user["JADE.MT"].total) : 0;
      user["JADE.ETH"].total > 0 ? pNumOfEth++ : 0;
      user["JADE.MT"].total > 0 ? pNumOfMt++ : 0;
      user["JADE.ETH"].toSend = Math.floor(user["JADE.ETH"].total / 1);
      user["JADE.MT"].toSend = Math.floor(user["JADE.MT"].total / 1000);
      if (user["JADE.ETH"].toSend > 0) {
        pNumOfEthWinner++;
        ethWinner.push({
          name,
          block: user["JADE.ETH"].firstTime,
          value: user["JADE.ETH"].toSend
        });
        ethToSend += user["JADE.ETH"].toSend;
      }
      if (user["JADE.MT"].toSend > 0) {
        pNumOfMtWinner++;
        mtWinner.push({
          name,
          block: user["JADE.MT"].firstTime,
          value: user["JADE.MT"].toSend
        });
        mtToSend += user["JADE.MT"].toSend;
      }
    }
    let sum = {
      startBlock,
      endBlock,
      eth,
      mt,
      mtIncome,
      ethIncome,
      pNumOfEthWinner,
      pNumOfMtWinner,
      mtToSend,
      ethToSend,
      pNumOfMt,
      pNumOfEth,
      mtWinner,
      ethWinner
    };
    fs.writeFileSync(
      `./outputs/deposit/${d}/sum_${d}.json`,
      JSON.stringify(sum)
    );
    fs.writeFileSync(
      `./outputs/deposit/${d}/final_${d}.json`,
      JSON.stringify(delta)
    );
  }

  const commands = {
    // Explorer
    "get-account": getPrintFn(getAccountInfo, "getAccount"),
    "get-full-account": getPrintFn(getAccountFullInfo, "getAccount"),
    "get-balance": getPrintFn(getAccountBalance),
    gah: getPrintFn(getAccountHistory),
    "show-agent": getPrintFn(function() {
      return this.daemon.daemonAccountInfo;
    }),
    block: getPrintFn(getBlocks),
    get: getPrintFn(getObject),
    // Transactions
    "create-account": getPrintFn(createAccount),
    transfer: getPrintFn(transfer),
    ggd: getPrintFn(getGlobalDynamic),
    init: getPrintFn(initDaemon),
    fill: getPrintFn(getFillOrder),
    trade: getPrintFn(getTradeHistory),
    "gen-key": ``,
    // Temp
    code: getPrintFn(genCode),
    // "test-code": getPrintFn(testCode),
    // "fix-code": getPrintFn(fixCode),
    // "send-code": getPrintFn(sendCodeWinner),
    stat: getPrintFn(stat),
    fa: getPrintFn(findAccounts),
    // "send-prize": getPrintFn(sendCodeWinner),
    "check-balance": getPrintFn(checkAccountBalance),
    compare: getPrintFn(compareWithdrawOrder),
    "gen-pub": getPrintFn(genPub),
    "gen-address": getPrintFn(genAddress),
    "get-db": getPrintFn(getDB),
    "get-limits": getPrintFn(getLimitOrder),
    "get-24": getPrintFn(get24),
    "get-filled": getPrintFn(getFillOrder),
    "get-trade-history": getPrintFn(getTradeHistory),
    "load-filled": getPrintFn(loadFillOrder),
    "top-buy": getPrintFn(topBuyLimits),
    "top-sell": getPrintFn(topSellLimits),
    "get-asset": getPrintFn(getAsset),
    "update-params": getPrintFn(updateParams),
    "get-vol": getPrintFn(getVol),
    "get-latest-price": getPrintFn(getLatestPrice),
    "stat-vol": getPrintFn(statVolume),
    "test-gateway": getPrintFn(testGateway),
    "test-create": getPrintFn(testCreateAccount),
    "stat-account": getPrintFn(statAccountTransfer),
    "stat-register": getPrintFn(statRegister),
    "stat-limit": getPrintFn(statLimit),
    "stat-deposit": getPrintFn(statDeposit),
    "stat-gateway-order": getPrintFn(statGatewayOrder),
    "sanitize-transfer": getPrintFn(sanitizeAccountTransfer),
    "update-feed-producer": getPrintFn(updateFeedProducer),
    "verify-list": getPrintFn(verifyAccountExist),
    "feed-price": getPrintFn(feedPrice),
    "settle-asset": getPrintFn(settleAsset),
    "remove-details": getPrintFn(removeDetails),
    sell: getPrintFn(sellAsset),
    sanitize: getPrintFn(sanitize),
    "create-committee": getPrintFn(createCommittee),
    "find-who-has": getPrintFn(findWhoHas),
    "read-wallet": getPrintFn(readWallet)
    // "test-pub": getPrintFn(demo.keyTest),
  };

  let cmds = {
    getAccount: getAccountInfo,
    getBalance: getAccountBalance
  };

  let root = await createCli(
    {
      prompt: "Cybex>",
      context: {
        daemon,
        cmds
      }
    },
    commands
  );

  // root.prompt();
}

main().catch(err => console.error(err));
