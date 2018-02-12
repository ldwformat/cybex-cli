const { CybexDaemon, KEY_MODE } = require("./CybexDaemon");
const { EVENT_ON_NEW_HISTORY } = require("./constants");
const { TransactionBuilder } = require("cybexjs");

const fs = require("fs");
const path = require("path");

const readline = require("readline");

const NODE_URL = "wss://hangzhou.51nebula.com/";
// const NODE_URL = "ws://121.40.95.24:8090";
const DAEMON_USER = "jade-gateway";
const DAEMON_PASSWORD = "qwer1234qwer1234";

function getRendom() {
  return Math.floor(Math.random() * 3000) + 30000;
}

const cmdRex = /^\s*(.+?)\s*$/;
function splitCmd(cmdLine) {
  return [cmd, ...args] = cmdLine.match(cmdRex)[1].split(" ");
}

function createCli({ prompt, context = { daemon: null }, notDefaultCmd = false, isSubCmd = false, supCmd }, customCmds = {}) {
  const DEFAULT_CMDS = {
    exit: () => {
      if (!isSubCmd) {
        return process.exit(0)
      }
      return supCmd.prompt();
    }
  };
  let commands = {
    ...customCmds,
    ...DEFAULT_CMDS
  };
  if (isSubCmd) {
    if (!supCmd) {
      throw Error("Not set approperate super cmd module");
    }
    supCmd.close();
  }

  let cli = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt
  });
  console.log("Pro: ");

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
    await impl.apply(context, args);
    if (isSubCmd) {
      cli.close();
      return supCmd.prompt();
    }
    return cli.prompt();
  });

  return cli;
}

async function getAccountFullHistory(accountId, numOfRecord, daemon) {
  let res = await daemon.Apis.instance().history_api().exec("get_account_history", [accountId, "1.11.0", numOfRecord, "1.11.0"]);
  // let history = await daemon.Apis.instance().history_api().exec("get_account_history", ["1.2.27965", "1.11.0", 5, "1.11.4908018"]);
  if (res.length < numOfRecord) {
    return res;
  }
  let then;
  do {
    let lastId = parseInt(res[res.length - 1].id.split(".")[2]) - 1;
    then = await daemon.Apis.instance().history_api().exec("get_account_history", [accountId, "1.11.0", numOfRecord, "1.11." + lastId]);
    res = [...res, ...then];
  } while (then.length)
  return res;
}

async function transferDemo() {
  // 新建一个守护账号
  let daemon = new CybexDaemon(
    NODE_URL,
    DAEMON_USER,
    DAEMON_PASSWORD,
    // KEY_MODE.WIF
  );
  await daemon.init(); // 配置守护链接的初始化

  //getBlock
  // daemon.Apis.instance().db_api().exec("get_block", [name]);

  // 测试的转账
  // let transferObj = {
  //   from_account: "1.2.200006869",
  //   to_account: "1.2.92",
  //   amount: 210000,
  //   asset: "1.3.0",
  // };
  // let transferObj1 = {
  //   from_account: "1.2.200006868",
  //   to_account: "1.2.93",
  //   amount: 210000,
  //   asset: "1.3.0",
  // };

  // async function cancelLimit(orderID) {
  //   console.log("to Cancel: ", orderID);
  //   let tr = new TransactionBuilder();
  //   await daemon.updateAuthForOp(["active"]);
  //   let to_cancel = {
  //     fee: {
  //       amount: 0,
  //       asset_id: "1.3.0"
  //     },
  //     "fee_paying_account": daemon.daemonAccountInfo.get("id"),
  //     "order": orderID
  //   }
  //   let transfer_op = await tr.get_type_operation("limit_order_cancel", to_cancel);
  //   await daemon.performTransaction(tr, transfer_op);

  // }

  // async function tryLimit() {
  //   let tr = new TransactionBuilder();
  //   await daemon.updateAuthForOp(["active"])
  //   let expiration = new Date();
  //   expiration.setSeconds(expiration.getSeconds() + 120)
  //   let limit = {
  //     fee: {
  //       asset_id: "1.3.0",
  //       amount: 0
  //     },
  //     seller: daemon.daemonAccountInfo.get("id"),
  //     amount_to_sell: {
  //       asset_id: "1.3.0",
  //       amount: 1500000 + getRendom() / 3
  //     },
  //     min_to_receive: {
  //       asset_id: "1.3.1",
  //       amount: 150000
  //     },
  //     expiration,
  //     fill_or_kill: false,
  //   }
  //   let limitSell = {
  //     fee: {
  //       asset_id: "1.3.0",
  //       amount: 0
  //     },
  //     seller: daemon.daemonAccountInfo.get("id"),
  //     amount_to_sell: {
  //       asset_id: "1.3.1",
  //       amount: 100000
  //     },
  //     min_to_receive: {
  //       asset_id: "1.3.0",
  //       amount: 700000 + getRendom()
  //     },
  //     expiration,
  //     fill_or_kill: false,
  //   }
  //   let transfer_op = await tr.get_type_operation("limit_order_create", Math.random() >= 0.5 ? limitSell : limit);
  //   await daemon.performTransaction(tr, transfer_op);
  // }


  // EVENT_ON_NEW_HISTORY 发出代表该账号监听到一次区块变更，并取到了守护账号的最新信息。
  // 在某些时候这个信息是必要的
  // 这里只使用performTransfer测试一次转账操作
  daemon.on(EVENT_ON_NEW_HISTORY, history => {
    // history.forEach(op => {
    //   if (op.result && op.result[1] && /1\.7\..+/.test(op.result[1])) {
    //     let id = op.result[1].match(/1\.7\.(.+)/);
    //     console.log(op);
    //     cancelLimit(op.result[1]);
    //   }
    // })
  });

  // daemon.performTransfer(transferObj);
  // daemon.performTransfer(transferObj1);
  async function getOneAccount(accountId) {
    let incomes = {};

    let history = await getAccountFullHistory(accountId, 5, daemon);
    // console.log("His: ", history);
    let transferOps = history.filter(tx => {
      return tx.op[0] === 0;
    }).map(tx => {
      return tx.op[1]
    }).forEach(op => {
      let { amount, to } = op;
      // console.log("TransferOps: ", op);
      if (!(amount.asset_id in incomes)) {
        incomes[amount.asset_id] = 0;
      }
      if (to === accountId) {
        incomes[amount.asset_id] += amount.amount;
      }
    })
    // console.log("Incomes: ", incomes);
    for (let i in incomes) {
      if (incomes[i] < 0) {
        incomes[i] = 0
      }
    }
    return incomes;
  }

  async function getAccountBalance(accountId, incomes) {
    let bals = await daemon.Apis.instance().db_api().exec("get_account_balances", [accountId, []]);
    bals = bals.filter(bal => bal.asset_id in rate).map(bal => ({
      amount: bal.amount - (incomes[bal.asset_id] || 0),
      asset_id: bal.asset_id
    }));
    return bals;
  }
  const rate = {
    "1.3.664": 1,
    "1.3.659": 8019,
    "1.3.662": 144.75,
    "1.3.660": 806.96,
    "1.3.663": 1.2,
    "1.3.661": 1272,
  };

  async function getValue(accountId) {
    let incomes = await getOneAccount(accountId);
    let bals = (await getAccountBalance(accountId, incomes)).map(bal => ({
      value: bal.amount * rate[bal.asset_id],
      ...bal
    }));
    let account = (await daemon.Apis.instance().db_api().exec("get_accounts", [[accountId]]))[0].name;
    let value = bals.reduce((acc, next) => acc + next.value, 0) / 10000;
    return {
      accountId,
      incomes,
      bals,
      account,
      value
    }
  }
  // let account = (await daemon.Apis.instance().db_api().exec("get_accounts", [["1.2.28018"]]))[0].name;
  // console.log("Account: ", account)  

  let res = [];
  try {
    for (let i = 28264; i < 28265; i++) {
      try {
        let one = await getValue("1.2." + i);
        res.push(one);
      } catch (e) {
        throw Error(i);
      }
      console.log("Got ", i);
    }
  } catch (e) {
    console.log("broke on ", i);
  }
  // fs.writeFile(path.resolve(__dirname, "./result_raw.json"), JSON.stringify(res));

  let result = res.sort((a, b) => b.value - a.value);

  fs.writeFile(path.resolve(__dirname, "./result.json"), JSON.stringify(result), e => console.log("DONE"));

  // let root = createCli({
  //   prompt: "Cybex>"
  // }, {
  //     test: async () => new Promise(resolve => setTimeout(() => { console.log("TESTING"); resolve(2) }, 2000)),
  //     // next: async () => createCli({ prompt: "SubCmd:", isSubCmd: true, supCmd: root }).prompt(),
  //     gah: async (accountId) => await daemon.Apis.instance().history_api().exec("get_account_history", [accountId, 100])
  //   });
  // root.prompt();
}

transferDemo();