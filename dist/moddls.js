(function() {
  var BSON, Connection, EventEmitter, LAST_ID, Moddls, augmentPromise, betturl, mirror, q, setValue,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    __slice = [].slice;

  q = require('q');

  betturl = require('betturl');

  BSON = require('bson').BSONPure.BSON;

  EventEmitter = require('events').EventEmitter;

  Connection = require('./connection');

  mirror = function(obj) {
    var k, o, v;
    o = {};
    for (k in obj) {
      v = obj[k];
      o[k] = v;
      o[v] = k;
    }
    return o;
  };

  setValue = function(obj, key, value) {
    var k, keys, o, _i, _len, _ref;
    o = obj;
    keys = key.split('.');
    _ref = keys.slice(0, -1);
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      k = _ref[_i];
      if (o[k] == null) {
        o[k] = {};
      }
      o = o[k];
    }
    return o[keys.slice(-1)[0]] = value;
  };

  augmentPromise = function(promise) {
    promise.storeIn = function(obj, key) {
      return promise.then(function(data) {
        return setValue(obj, key, data);
      });
    };
    return promise;
  };

  LAST_ID = Math.floor(Math.random() * 999999);

  Moddls = (function(_super) {
    __extends(Moddls, _super);

    Moddls.TYPE = mirror({
      CREATE: 'c',
      READ: 'r',
      UPDATE: 'u',
      DELETE: 'd'
    });

    function Moddls(opts) {
      var parsed,
        _this = this;
      this.opts = opts != null ? opts : {};
      this.__defineGetter__('connected', function() {
        return this.connection.connected;
      });
      parsed = betturl.parse(this.opts.url);
      this.connection = new Connection({
        host: parsed.host,
        port: parsed.port
      });
      this.connection.on('data', this.onData_.bind(this));
      this.connection.on('error', this.onError_.bind(this));
      this.connection.on('drain', this.onDrain_.bind(this));
      this.connection.on('end', this.onEnd_.bind(this));
      this.connection.on('close', this.onClose_.bind(this));
      this.connection.on('connected', this.onConnected_.bind(this));
      this.connection.on('disconnected', this.onDisconnected_.bind(this));
      this.incomingBuffer_ = new Buffer(0);
      this.packets_ = {};
      this.packets = {};
      this.packets.__defineGetter__('unsent', function() {
        return Object.keys(_this.packets_).map(function(k) {
          return _this.packets_[k];
        }).filter(function(p) {
          return p.sent == null;
        }).sort(function(l, r) {
          return l.id - r.id;
        });
      });
      this.packets.__defineGetter__('sent', function() {
        return Object.keys(_this.packets_).map(function(k) {
          return _this.packets_[k];
        }).filter(function(p) {
          return p.sent != null;
        }).sort(function(l, r) {
          return l.id - r.id;
        });
      });
    }

    Moddls.prototype.connect = function() {
      return this.connection.connect();
    };

    Moddls.prototype.disconnect = function() {
      return this.connection.disconnect();
    };

    Moddls.prototype.onConnected_ = function() {
      setTimeout(this.sendPackets_.bind(this));
      return this.emit('connected');
    };

    Moddls.prototype.onDisconnected_ = function() {
      return this.emit('disconnected');
    };

    Moddls.prototype.onData_ = function(data) {
      var err, length, p, packet, _results;
      this.incomingBuffer_ = Buffer.concat([this.incomingBuffer_, data]);
      _results = [];
      while (true) {
        if (!(this.incomingBuffer_.length > 5)) {
          break;
        }
        length = this.incomingBuffer_.readUInt32BE(1);
        if (!(this.incomingBuffer_.length - 5 >= length)) {
          break;
        }
        try {
          packet = BSON.deserialize(this.incomingBuffer_.slice(5, length + 5));
          this.incomingBuffer_ = this.incomingBuffer_.slice(length + 5);
          p = this.packets_[packet.i];
          if (p != null) {
            p.responded = new Date();
            if (packet.d !== void 0) {
              _results.push(p.deferred.resolve(packet.d));
            } else if (packet.e !== void 0) {
              err = new Error(packet.e.message);
              err.code = packet.e.code;
              _results.push(p.deferred.reject(err));
            } else {
              _results.push(void 0);
            }
          } else {
            _results.push(console.log('COULD NOT FIND PACKET ID', packet.i));
          }
        } catch (_error) {
          err = _error;
          _results.push(console.log(err.stack));
        }
      }
      return _results;
    };

    Moddls.prototype.onError_ = function(err) {
      console.log('onError_', err.stack);
      return this.emit('error', err);
    };

    Moddls.prototype.onDrain_ = function() {
      return console.log('onDrain_', arguments);
    };

    Moddls.prototype.onEnd_ = function(data) {
      return this.onDisconnected_();
    };

    Moddls.prototype.onClose_ = function(had_error) {
      this.onDisconnected_();
      if (had_error) {
        return console.log('SOCKET CLOSED BECAUSE OF AN ERROR');
      }
    };

    Moddls.prototype.sendPackets_ = function() {
      var _this = this;
      if (this.sendingPackets_) {
        return;
      }
      this.sendingPackets_ = true;
      if (this.connected) {
        this.packets.unsent.forEach(function(p) {
          if (_this.connection.write(p.packet)) {
            p.flushed = new Date();
          }
          return p.sent = new Date();
        });
      }
      if (this.packets.unsent.length > 0) {
        setTimeout(this.sendPackets_.bind(this));
      }
      return this.sendingPackets_ = false;
    };

    Moddls.prototype.send = function(type, model, data) {
      var d, header, packet, packetBuffer, realPacket;
      packet = this.buildPacket(type, model, data);
      packetBuffer = BSON.serialize(packet, false, true, false);
      header = new Buffer(5);
      header.writeUInt8(1, 0);
      header.writeUInt32BE(packetBuffer.length, 1);
      realPacket = Buffer.concat([header, packetBuffer]);
      d = q.defer();
      this.packets_[packet.i] = {
        id: packet.i,
        deferred: d,
        packet: realPacket,
        created: new Date()
      };
      setTimeout(this.sendPackets_.bind(this));
      return augmentPromise(d.promise);
    };

    Moddls.prototype.buildPacket = function(type, model, data) {
      return {
        i: LAST_ID++,
        t: type,
        m: model,
        d: data
      };
    };

    Moddls.prototype.create = function(model, data, opts) {
      return this.send(Moddls.TYPE.CREATE, model, data);
    };

    Moddls.prototype.read = function(model, query, opts) {
      if (opts == null) {
        opts = {};
      }
      return this.send(Moddls.TYPE.READ, model, {
        q: query,
        o: opts
      });
    };

    Moddls.prototype.readFirst = function(model, query, opts) {
      if (opts == null) {
        opts = {};
      }
      opts.first = true;
      return this.read(model, query, opts);
    };

    Moddls.prototype.readLast = function(model, query, opts) {
      if (opts == null) {
        opts = {};
      }
      opts.last = true;
      return this.read(model, query, opts);
    };

    Moddls.prototype.update = function(model, query, update, opts) {
      if (opts == null) {
        opts = {};
      }
      return this.send(Moddls.TYPE.UPDATE, model, {
        q: query,
        u: update,
        o: opts
      });
    };

    Moddls.prototype["delete"] = function(model, query, opts) {
      if (opts == null) {
        opts = {};
      }
      return this.send(Moddls.TYPE.DELETE, model, {
        q: query,
        o: opts
      });
    };

    Moddls.prototype.deleteFirst = function(model, query, opts) {
      if (opts == null) {
        opts = {};
      }
      opts.first = true;
      return this.send(Moddls.TYPE.DELETE, model, {
        q: query,
        o: opts
      });
    };

    Moddls.prototype.model = function(modelName) {
      var client, model;
      client = this;
      model = {
        name: modelName
      };
      ['create', 'read', 'readFirst', 'readLast', 'update', 'delete', 'deleteFirst'].forEach(function(k) {
        return model[k] = function() {
          return client[k].apply(client, [modelName].concat(__slice.call(arguments)));
        };
      });
      return model;
    };

    return Moddls;

  })(EventEmitter);

  module.exports = Moddls;

}).call(this);
