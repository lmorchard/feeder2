var util = require('util');
var _ = require('lodash');
var async = require('async');

var models = require(__dirname + '/../models');

module.exports = function (program, init) {
  program
    .command('list')
    .description('list resource subscriptions')
    .action(init(cmd));
};

function cmd (options, s) {
  s.db.collection(models.Resource.collection, function (err, coll) {
    var query = {};
    var opts = {
      fields: { url: 1 }
    };
    coll.find(query, opts).each(function (err, doc) {
      if (doc) {
        var r = new models.Resource(doc);
        s.logger.info(r.url);
      } else {
        return s.done();
      }
    });
  });
}
