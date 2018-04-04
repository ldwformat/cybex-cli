const { pseudoRandomBytes } = require("crypto");

const { CybexDaemon, KEY_MODE } = require("./CybexDaemon");
const { EVENT_ON_NEW_HISTORY } = require("./constants");
const { TransactionBuilder, PrivateKey, ChainTypes } = require("cybexjs");
const { execSync } = require("child_process");
const { inspect } = require("util");
const {
  genKeysFromSeed,
  getTransferOpWithMemo,
  filterHistoryByOp
} = require("./utils");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const demo = require("./demo");
const moment = require("moment");
const stream = require("stream");
const { sell } = require("./limit-order");
const { getWalletReader } = require("./wallet");

const orderLimits = require("./plugins/top-limit");

const argv = process.argv;
const isTest = argv.some(arg => arg === "--test");

const NODE_URL = isTest
  ? "wss://shenzhen.51nebula.com/"
  : "wss://shanghai.51nebula.com/";
// const DAEMON_USER = "init0";
const DAEMON_USER = isTest ? "jade-gateway" : "create-test20";
const DAEMON_PASSWORD = "qwer1234qwer1234";
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
  return ([cmd, ...args] = cmdLine.match(cmdRex)[1].split(" "));
}

const getCompleter = commandsArray => line => {
  let hits = commandsArray.filter(cmd => cmd.startsWith(line));
  return [hits, line];
};

async function createCli(
  {
    prompt,
    context = { daemon: null },
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

  cli.on("line", async line => {
    if (!line) {
      return cli.prompt();
    }
    let [cmd, ...args] = splitCmd(line);
    if (!cmd) return cli.prompt();
    let impl = commands[cmd.toLowerCase()];
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
    then = await daemon.Apis.instance()
      .history_api()
      .exec("get_account_history", [
        accountId,
        "1.11.0",
        numOfRecord,
        "1.11." + lastId
      ]);
    res = [...res, ...then];
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

async function getAccountInfo(accountId, { daemon } = this) {
  if (!accountId) {
    throw Error("Account id must be provided");
  }
  return (await daemon.Apis.instance()
    .db_api()
    .exec("get_accounts", [[accountId]]))[0];
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
        let resOfExec = execSync(
          `echo "${inspect(res, {
            depth: null,
            maxArrayLength: null
          })}" ${bashArgs.join(" ")}`
        );
        console.log(resOfExec.toString());
      } else {
        console.log(res);
      }
    } catch (e) {
      console.error("Error: ", e);
    }
  };
}

async function main() {
  // 新建一个守护账号
  let daemon = new CybexDaemon(
    NODE_URL,
    DAEMON_USER,
    DAEMON_PASSWORD
    // KEY_MODE.WIF
  );
  console.log("Daemon Created");
  // await daemon.init(); // 配置守护链接的初始化
  daemon.init(); // 配置守护链接的初始化

  console.log("Daemon Setup");

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
    let history = await getAccountFullHistory(accountId, 50, daemon);
    return {
      size: history.length,
      history
    };
  }

  async function getFillOrder(
    base = "1.3.0",
    quote = "1.3.1",
    { daemon } = this
  ) {
    return await daemon.Apis.instance()
      .history_api()
      .exec("get_fill_order_history", [base, quote, 1]);
  }
  async function getTradeHistory(
    base = "1.3.0",
    quote = "1.3.1",
    { daemon } = this
  ) {
    let start = new Date().toISOString();
    let stop = new Date(Date.now() - 3600 * 1000).toISOString();
    return await daemon.Apis.instance()
      .db_api()
      .exec("get_trade_history", [
        base,
        quote,
        "2018-03-15T10:26:27",
        "2018-02-01T10:26:27",
        100
      ]);
  }

  const warningConfig = require("./warning-config.json");

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
  const feedPrice = async function(_asset, price) {
    let asset = (await getAsset(_asset))[0];
    console.log("Asset: ", asset, daemon.daemonAccountInfo.get("id"));
    let base = 5;
    price = price * Math.pow(10, asset.precision) / Math.pow(10, 5);
    let denominator = 5;
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

  async function topBuyLimits(quoteAsset, baseAsset, limit = 100) {
    let limits = await getLimitOrder.bind(this)(quoteAsset, baseAsset);
    return (await orderLimits(limits, false)).slice(0, limit);
  }
  async function topSellLimits(quoteAsset, baseAsset, limit = 100) {
    let limits = await getLimitOrder.bind(this)(quoteAsset, baseAsset);
    return (await orderLimits(limits, true, false)).slice(0, limit);
  }

  async function getAccountBalance(accountName) {
    let bals = await daemon.Apis.instance()
      .db_api()
      .exec("get_named_account_balances", [accountName, []]);
    return bals;
  }

  async function getAsset(...assets) {
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
    let { pubKeys } = genKeysFromSeed(seed);
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

  async function transfer(account, value, memo) {
    let { daemon } = this;
    let to_account = (await daemon.getAccountByName(account))["id"];
    let tx = {
      to_account,
      amount: value * 100000,
      asset: "1.3.0",
      memo
    };
    return await daemon.performTransfer(tx);
  }

  const MEMOS = ["SJInPuvqG", "S18gu_vcM", "Hk9tj88qG", "HyiosLI9G"];
  async function testImpl(counter, amount = 60000) {
    let { daemon } = this;
    let tx = {
      to_account: "1.2.28030",
      amount: amount + counter,
      asset: "1.3.0",
      memo: MEMOS[Math.floor(Math.random() * MEMOS.length)]
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
      return pubKey;
    });
    return res;
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

  async function translateTransfer(transfer, { daemon } = this) {
    let { fee, from, to, amount, memoContent, blockNum } = transfer;
    let block = await getBlock(blockNum, this);
    return {
      time: moment.utc(block.timestamp).toString(),
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

  async function statAccountTransfer(accountId, { daemon } = this) {
    let history = await getAccountHistory.call(this, accountId);
    let transfers = await filterHistoryByOp.call(this, history.history, 0);
    let transfersWithMemo = transfers.map(transfer =>
      getTransferOpWithMemo.call(this, transfer, [
        daemon.privKey,
        daemon.privKeys.owner
      ])
    );
    let res = await Promise.all(
      transfersWithMemo.map(
        async transfer => await translateTransfer.call(this, transfer)
      )
    );
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
      .filter(block => block.transactions.length)
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
  async function sendCodeWinner() {
    let nx = require("./final.json");
    let names = [
      { name: "owner6", code: "sadfasdf" },
      { name: "owner5", code: "12sdfa" }
    ];
    let failedNames = [];
    let counter = 0;
    let starter = Date.now();
    let doTransfer = transfer.bind(this);
    (function doOnce(counter) {
      let [name, value, awards, code] = nx[counter];
      doTransfer(name, 2, `Prize Code: ${code}`)
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

  async function initDaemon() {
    let { daemon } = this;
    return daemon.init();
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

  const commands = {
    // Explorer
    "get-account": getPrintFn(getAccountInfo),
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
    // "code": getPrintFn(genCode),
    // "test-code": getPrintFn(testCode),
    // "fix-code": getPrintFn(fixCode),
    // "send-code": getPrintFn(sendCodeWinner),
    stat: getPrintFn(stat),
    fa: getPrintFn(findAccounts),
    // "send-prize": getPrintFn(sendPrize),
    "check-balance": getPrintFn(checkAccountBalance),
    "gen-pub": getPrintFn(genPub),
    "get-db": getPrintFn(getDB),
    "get-limits": getPrintFn(getLimitOrder),
    "top-buy": getPrintFn(topBuyLimits),
    "top-sell": getPrintFn(topSellLimits),
    "get-asset": getPrintFn(getAsset),
    "test-gateway": getPrintFn(testGateway),
    "stat-account": getPrintFn(statAccountTransfer),
    "stat-register": getPrintFn(statRegister),
    "stat-limit": getPrintFn(statLimit),
    "feed-price": getPrintFn(feedPrice),
    sell: getPrintFn(sellAsset),
    "read-wallet": getPrintFn(readWallet)
    // "test-pub": getPrintFn(demo.keyTest),
  };

  let root = await createCli(
    {
      prompt: "Cybex>",
      context: {
        daemon
      }
    },
    commands
  );

  // root.prompt();
}

main().catch(err => console.error(err));
