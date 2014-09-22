var util = require('util');
var _ = require('lodash');
var async = require('async');

var models = require(__dirname + '/../models');

module.exports = function (program, init) {
  program
    .command('list [url]')
    .description('list resource subscriptions')
    .action(init(cmd));
};

function cmd (url, options, s) {
  if (url) {

    models.Resource.getOne(s.db, {url: url}, function (err, resource) {
      s.logger.info(resource);
      return s.done();
    });

  } else {

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
}
