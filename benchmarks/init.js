const { CybexDaemon, KEY_MODE } = require("./../CybexDaemon");
const { argv } = process;
const assert = require("assert");

const DEFAULT_ARGS = {
  api: "wss://shenzhen.51nebula.com/",
  user: "owner1",
  seed: "qwer1234qwer1234",
  times: "5",
  interval: "0",
  mode: 0
};

const MODE_PAIR = {
  "0": 0,
  "1": 1
};
const cliArgs = argv.splice(2).reduce((all, arg) => {
  let [argName, argValue] = arg.replace(/--/g, "").split("=");
  console.log("ARG: ", argName, argValue);
  return {
    ...all,
    [argName]: argValue
  };
}, DEFAULT_ARGS);
console.log("ARGS: ", cliArgs);

const NODE_URL = cliArgs.api;
const DAEMON_USER = cliArgs.user;
const DAEMON_PASSWORD = cliArgs.seed;
const MODE = cliArgs.mode;

exports.init = (requiredArgs = []) =>
  (async () => {
    assert(
      requiredArgs.every(argName => argName in cliArgs),
      `Too few args passed in, "${requiredArgs.join(" ,")}" are required params`
    );
    let daemon = (this.daemon = new CybexDaemon(
      NODE_URL,
      DAEMON_USER,
      DAEMON_PASSWORD,
      parseInt(MODE)
    ));
    console.log("Daemon Created");
    await daemon.init(); // 配置守护链接的初始化
    console.log(`Daemon Setup: User: ${DAEMON_USER}`);
    console.log(`=============== Init Done ==============`);
    return { daemon, args: cliArgs };
  })().catch(err => console.error("Uncaught Error: ", err));
