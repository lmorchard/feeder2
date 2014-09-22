var util = require('util');
var requireDir = require('require-dir');
var package_json = require(__dirname + '/../../package.json');
var program = require('commander');
var winston = require('winston');

var models = require(__dirname + '/../models');

program.version(package_json.version)
  .option('-D, --debug', 'enable debugging and debug output')
  .option('-q, --quiet', 'quiet output, except for errors')
  .option('-v, --verbose', 'enable verbose output');

var config = {
};

function init (next) {
  return function () {
    var args = Array.prototype.slice.call(arguments, 0);
    var options = args[args.length - 1];

    var shared = { config: config };

    var log_level = options.parent.debug ? 'debug' :
      options.parent.verbose ? 'verbose' :
      options.parent.quiet ? 'error' : 'info';

    shared.logger = new (winston.Logger)({
      transports: [
        new (winston.transports.Console)({
          level: log_level,
          colorize: true
        })
      ]
    });

    shared.logger.setLevels({
      silly: 0, debug: 1, verbose: 2,
      info: 3, warn: 4, error: 5
    });

    var db = models.db();
    db.open(function (err, db) {
      shared.db = db;
      shared.done = function () {
        db.close();
      };
      args.push(shared);
      next.apply(this, args);
    });
  }
}

var cmds = requireDir();
for (name in cmds) {
  cmds[name](program, init);
}

module.exports = function () {
  program.parse(process.argv);
};
