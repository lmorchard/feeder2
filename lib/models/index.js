var crypto = require('crypto');
var util = require('util');
var events = require('events');
var _ = require('lodash');
var requireDir = require('require-dir');
var mongo = require('mongodb');

var models = module.exports = {};

models.db = function (config) {
  config = _.defaults(config || {}, {
    host: 'localhost',
    port: 27017,
    name: 'feeder',
    serverOpts: { auto_reconnect: true },
    dbOpts: { w: 0 }
  });
  return new mongo.Db(
    config.name,
    new mongo.Server(config.host, config.port, config.serverOpts),
    config.dbOpts
  );
}

models.md5 = function md5 (/*...*/) {
  var hash = crypto.createHash('md5');
  for (var i=0; i<arguments.length; i++) {
    hash.update('' + arguments[i]);
  }
  return hash.digest('hex');
}

var baseClass = {

  getOne: function baseGetOne (db, query, next) {
    var cls = this;
    if ('string' == typeof query) {
      query = {_id: query};
    }
    var collection = db.collection(cls.collection);
    collection.findOne(query, function (err, doc) {
      if (err || !doc) {
        return next(err, null);
      } else {
        return next(null, new cls(doc));
      }
    });
  }

};

var baseProto = function (cls) {
  return {

    init: function baseInit (attrs) {
      attrs = _.defaults(attrs || {}, cls.defaults);
      for (var n in attrs) {
        this[n] = attrs[n];
      }
      if (!this._id) { this._id = cls.id(this); }
    },

    getClass: function () { return cls; },

    save: function baseSave (db, next) {
      var $this = this;

      this.updated = Date.now();

      var opts = {upsert: true, fullResult: true, w: 1};
      db.collection(cls.collection, function (err, coll) {
        coll.update({_id: $this._id}, $this, opts, next);
      });

      return this;
    },

    update: function baseUpdate (db, attrs, next) {
      var $this = this;

      attrs.updated = Date.now();

      var opts = {upsert: true, w: 1, new: true};
      db.collection(cls.collection, function (err, coll) {
        coll.findAndModify({_id: $this._id}, {$set: attrs}, opts, next);
      });

      return this;
    }

  };
};

var mods = requireDir();
for (name in mods) {
  models[name] = mods[name](models, baseClass, baseProto);
}
