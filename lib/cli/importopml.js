var fs = require('fs');
var util = require('util');
var _ = require('lodash');
var async = require('async');
var OpmlParser = require('opmlparser');

var models = require(__dirname + '/../models');

module.exports = function (program, init) {
  program
    .command('importopml [filename.opml]')
    .description('import resource subscriptions from an OPML file')
    .action(init(cmd));
};

function cmd (filename, options, s) {
  var ct = 0;

  var queue = models.Resource.upsertQueue(s.db);
  queue.drain = finished;

  var parser = new OpmlParser();
  parser.on('readable', function () {
    while (outline = this.read()) {
      if ('feed' == outline['#type']) {
        queue.push({
          url: outline.xmlurl,
          description: outline.text
        }, function (err, resource) {
          ct++;
          s.logger.debug(resource.url);
        });
      }
    }
  });
  parser.on('error', finished);
  parser.on('end', finished);

  function finished (err) {
    if (err) s.logger.error(err);
    if (queue.length() !== 0) { return; }
    s.logger.info("Imported " + ct + " resources");
    return s.done();
  }

  fs.createReadStream(filename, {encoding: 'utf8'}).pipe(parser);
}
