q = require 'q'
net = require 'net'
{EventEmitter} = require 'events'

EVENTS = ['close', 'data', 'drain', 'end', 'error']
METHODS = [
  'setEncoding', 'write', 'end', 'destroy', 'pause', 'resume',
  'setTimeout', 'setNoDelay', 'setKeepAlive', 'address', 'unref', 'ref'
]
PROPERTIES = ['bufferSize', 'remoteAddress', 'remotePort', 'localAddress', 'localPort', 'bytesRead', 'bytesWritten']

class Connection extends EventEmitter
  constructor: (@opts) ->
    @connected_ = false
    @__defineGetter__ 'connected', -> @connected_
    @__defineSetter__ 'connected', (v) ->
      if @connected_ isnt v
        @connected_ = v
        if v
          @emit('connected')
        else
          @emit('disconnected')
    
    @reconnecting_ = false
    @__defineGetter__ 'reconnecting', -> @reconnecting_
    @__defineSetter__ 'reconnecting', (v) ->
      if @reconnecting_ isnt v
        @reconnecting_ = v
        @emit('reconnecting') if v
    
    @events_ = {}
    EVENTS.forEach (event) =>
      @events_[event] = => @emit(event, arguments...)
    
    PROPERTIES.forEach (prop) =>
      @__defineGetter__ prop, -> @connection[prop]
  
  onConnect_: (connection) ->
    @connection = connection
    EVENTS.forEach (event) => @connection.on(event, @events_[event])
    @reconnecting = false
    @connected = true
    if @connectDeferred_?
      @connectDeferred_.resolve(@)
      delete @connectDeferred_
  
  onDisconnect_: ->
    if @connection?
      EVENTS.forEach (event) => @connection.removeListener(event, @events_[event])
      delete @connection
    @connected = false
  
  onReconnect_: (err) ->
    @reconnecting = true
  
  connect: ->
    return q(@) if @connected
    
    unless @connector?
      @connector = require('reconnect-net')(@onConnect_.bind(@))
      @connector.on('disconnect', @onDisconnect_.bind(@))
      @connector.on('reconnect', @onReconnect_.bind(@))
      @connector.connect(@opts)
    
    @connectDeferred_ = q.defer() unless @connectDeferred_?
    @connectDeferred_.promise
  
  disconnect: ->
    @reconnecting = false
    @connector.disconnect()
  
  write: ->
    @connection.write(arguments...)

METHODS.forEach (method) ->
  Connection::method = ->
    @connection[method](arguments...)

module.exports = Connection
