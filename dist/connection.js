(function() {
  var Connection, EVENTS, EventEmitter, METHODS, PROPERTIES, net, q,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    __slice = [].slice;

  q = require('q');

  net = require('net');

  EventEmitter = require('events').EventEmitter;

  EVENTS = ['close', 'data', 'drain', 'end', 'error'];

  METHODS = ['setEncoding', 'write', 'end', 'destroy', 'pause', 'resume', 'setTimeout', 'setNoDelay', 'setKeepAlive', 'address', 'unref', 'ref'];

  PROPERTIES = ['bufferSize', 'remoteAddress', 'remotePort', 'localAddress', 'localPort', 'bytesRead', 'bytesWritten'];

  Connection = (function(_super) {
    __extends(Connection, _super);

    function Connection(opts) {
      var _this = this;
      this.opts = opts;
      this.connected_ = false;
      this.__defineGetter__('connected', function() {
        return this.connected_;
      });
      this.__defineSetter__('connected', function(v) {
        if (this.connected_ !== v) {
          this.connected_ = v;
          if (v) {
            return this.emit('connected');
          } else {
            return this.emit('disconnected');
          }
        }
      });
      this.reconnecting_ = false;
      this.__defineGetter__('reconnecting', function() {
        return this.reconnecting_;
      });
      this.__defineSetter__('reconnecting', function(v) {
        if (this.reconnecting_ !== v) {
          this.reconnecting_ = v;
          if (v) {
            return this.emit('reconnecting');
          }
        }
      });
      this.events_ = {};
      EVENTS.forEach(function(event) {
        return _this.events_[event] = function() {
          return _this.emit.apply(_this, [event].concat(__slice.call(arguments)));
        };
      });
      PROPERTIES.forEach(function(prop) {
        return _this.__defineGetter__(prop, function() {
          return this.connection[prop];
        });
      });
    }

    Connection.prototype.onConnect_ = function(connection) {
      var _this = this;
      this.connection = connection;
      EVENTS.forEach(function(event) {
        return _this.connection.on(event, _this.events_[event]);
      });
      this.reconnecting = false;
      this.connected = true;
      if (this.connectDeferred_ != null) {
        this.connectDeferred_.resolve(this);
        return delete this.connectDeferred_;
      }
    };

    Connection.prototype.onDisconnect_ = function() {
      var _this = this;
      if (this.connection != null) {
        EVENTS.forEach(function(event) {
          return _this.connection.removeListener(event, _this.events_[event]);
        });
        delete this.connection;
      }
      return this.connected = false;
    };

    Connection.prototype.onReconnect_ = function(err) {
      return this.reconnecting = true;
    };

    Connection.prototype.connect = function() {
      if (this.connected) {
        return q(this);
      }
      if (this.connector == null) {
        this.connector = require('reconnect-net')(this.onConnect_.bind(this));
        this.connector.on('disconnect', this.onDisconnect_.bind(this));
        this.connector.on('reconnect', this.onReconnect_.bind(this));
        this.connector.connect(this.opts);
      }
      if (this.connectDeferred_ == null) {
        this.connectDeferred_ = q.defer();
      }
      return this.connectDeferred_.promise;
    };

    Connection.prototype.disconnect = function() {
      this.reconnecting = false;
      return this.connector.disconnect();
    };

    Connection.prototype.write = function() {
      var _ref;
      return (_ref = this.connection).write.apply(_ref, arguments);
    };

    return Connection;

  })(EventEmitter);

  METHODS.forEach(function(method) {
    return Connection.prototype.method = function() {
      var _ref;
      return (_ref = this.connection)[method].apply(_ref, arguments);
    };
  });

  module.exports = Connection;

}).call(this);
