const { CybexDaemon, KEY_MODE } = require("./CybexDaemon");
const { EVENT_ON_NEW_HISTORY } = require("./constants");
const { TransactionBuilder } = require("cybexjs");
const { execSync } = require("child_process");
const { inspect } = require("util");
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
  let res = await daemon.Apis.instance().history_api().exec("get_account_history", ["1.2.27965", "1.11.0", numOfRecord, "1.11.0"]);
  // let history = await daemon.Apis.instance().history_api().exec("get_account_history", ["1.2.27965", "1.11.0", 5, "1.11.4908018"]);
  if (res.length < numOfRecord) {
    return res;
  }
  let then;
  do {
    let lastId = parseInt(res[res.length - 1].id.split(".")[2]) - 1;
    then = await daemon.Apis.instance().history_api().exec("get_account_history", ["1.2.27965", "1.11.0", numOfRecord, "1.11." + lastId]);
    res = [...res, ...then];
  } while (then.length)
  return res;
}

async function getBlocks(start, numOfBlock = 1) {
  console.log(`Get ${numOfBlock} blocks info from ` + start);
  if (!numOfBlock || numOfBlock <= 0) {
    throw Error("The num of block and start num must greater than 0!");
  }
  numOfBlock = parseInt(numOfBlock);
  let numArray = (new Array(numOfBlock)).fill(1).map((v, i) => (parseInt(start) + i));
  let pArray = numArray.map(blockNum => this.daemon.Apis.instance().db_api().exec("get_block", [blockNum]));
  return await Promise.all(pArray);
}

function getPrintFn(fn, splitter = "--") {
  return async function (...args) {
    let bashArgs;
    let splitIndex = args.indexOf(splitter);
    if (splitIndex !== -1) {
      bashArgs = args.splice(splitIndex).splice(1);
    }
    try {
      let res = await fn.apply(this, args);
      if (bashArgs) {
        let resOfExec = execSync(`echo "${inspect(res, { depth: null, maxArrayLength: null })}" ${bashArgs.join(" ")}`)
        console.log(resOfExec.toString());
      } else {
        console.log(res);
      }
    } catch (e) {
      console.error("Error: ", e.message);
    }
  }
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


  // daemon.performTransfer(transferObj);
  // daemon.performTransfer(transferObj1);
  async function getOneAccount(accountId) {
    let incomes = {};

    let history = await getAccountFullHistory(accountId, 2, daemon);
    let transferOps = history.filter(tx => {
      return tx.op[0] === 0;
    }).map(tx => {
      return tx.op[1]
    }).forEach(op => {
      let { amount, to } = op;
      if (!(amount.asset_id in incomes)) {
        incomes[amount.asset_id] = 0;
      }
      if (to === accountId) {
        incomes[amount.asset_id] += amount.amount;
      }
    })
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

  let root = createCli({
    prompt: "Cybex>",
    context: {
      daemon
    }
  }, {
      test: async () => new Promise(resolve => setTimeout(() => { console.log("TESTING"); resolve(2) }, 2000)),
      next: async () => createCli({ prompt: "SubCmd:", isSubCmd: true, supCmd: root }).prompt(),
      gah: async (accountId) => await daemon.Apis.instance().history_api().exec("get_account_history", [accountId, 100]),
      block: getPrintFn(getBlocks)
    });
  root.on("SIGINT", () => {
    root.close();
    console.log("\nBye~~");
    process.exit()
  });
  root.prompt();
}

transferDemo();