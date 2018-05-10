const napa = require("napajs");

class Bencher {
  constructor(workers) {
    this.zone = napa.zone.create("Bench", { workers });
  }

  setupContext(setupFn, args?) {
    return this.zone.broadcast(setupFn, args);
  }

  execute(fn, ...args) {
    return zone.execute(fn, [...args]);
  }
}

let bencher;

exports.getBencher = (workers = 1) => {
  if (!bencher) {
    bencher = new Bencher(workers);
  }
  return bencher;
};
