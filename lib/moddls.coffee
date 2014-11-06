q = require 'q'
betturl = require 'betturl'
{BSON} = require('bson').BSONPure
{EventEmitter} = require 'events'
Connection = require './connection'

mirror = (obj) ->
  o = {}
  for k, v of obj
    o[k] = v
    o[v] = k
  o

setValue = (obj, key, value) ->
  o = obj
  keys = key.split('.')
  
  for k in keys[0...-1]
    o[k] = {} unless o[k]?
    o = o[k]
  o[keys.slice(-1)[0]] = value

augmentPromise = (promise) ->
  promise.storeIn = (obj, key) ->
    promise.then (data) ->
      setValue(obj, key, data)
  
  promise

LAST_ID = Math.floor(Math.random() * 999999)

class Moddls extends EventEmitter
  @TYPE: mirror(
    CREATE: 'c'
    READ: 'r'
    UPDATE: 'u'
    DELETE: 'd'
  )
  
  constructor: (@opts = {}) ->
    # assert opts
    
    @__defineGetter__ 'connected', -> @connection.connected
    
    parsed = betturl.parse(@opts.url)
    # validate?
    @connection = new Connection(host: parsed.host, port: parsed.port)
    
    @connection.on('data', @onData_.bind(@))
    @connection.on('error', @onError_.bind(@))
    @connection.on('drain', @onDrain_.bind(@))
    @connection.on('end', @onEnd_.bind(@))
    @connection.on('close', @onClose_.bind(@))
    
    @connection.on('connected', @onConnected_.bind(@))
    @connection.on('disconnected', @onDisconnected_.bind(@))
    
    @incomingBuffer_ = new Buffer(0)
    
    @packets_ = {}
    @packets = {}
    @packets.__defineGetter__ 'unsent', =>
      Object.keys(@packets_)
      .map((k) => @packets_[k])
      .filter((p) -> not p.sent?)
      .sort((l, r) -> l.id - r.id)
    
    @packets.__defineGetter__ 'sent', =>
      Object.keys(@packets_)
      .map((k) => @packets_[k])
      .filter((p) -> p.sent?)
      .sort((l, r) -> l.id - r.id)
  
  connect: ->
    @connection.connect()
  
  disconnect: ->
    @connection.disconnect()
  
  onConnected_: ->
    setTimeout(@sendPackets_.bind(@))
    @emit('connected')

  onDisconnected_: ->
    @emit('disconnected')
  
  onData_: (data) ->
    @incomingBuffer_ = Buffer.concat([@incomingBuffer_, data])
    
    while true
      break unless @incomingBuffer_.length > 5
      length = @incomingBuffer_.readUInt32BE(1)
      break unless @incomingBuffer_.length - 5 >= length
      
      try
        packet = BSON.deserialize(@incomingBuffer_.slice(5, length + 5))
        @incomingBuffer_ = @incomingBuffer_.slice(length + 5)
        
        p = @packets_[packet.i]
        if p?
          p.responded = new Date()
          if packet.d isnt undefined
            p.deferred.resolve(packet.d)
          else if packet.e isnt undefined
            err = new Error(packet.e.message)
            err.code = packet.e.code
            p.deferred.reject(err)
        else
          console.log 'COULD NOT FIND PACKET ID', packet.i
      
      catch err
        console.log err.stack
        # maybe skip packet?
  
  onError_: (err) ->
    console.log 'onError_', err.stack
    @emit('error', err)
  
  onDrain_: ->
    console.log 'onDrain_', arguments
  
  onEnd_: (data) ->
    @onDisconnected_()
    # console.log 'onEnd_', arguments
  
  onClose_: (had_error) ->
    @onDisconnected_()
    console.log 'SOCKET CLOSED BECAUSE OF AN ERROR' if had_error
  
  sendPackets_: ->
    return if @sendingPackets_
    @sendingPackets_ = true
    
    if @connected
      @packets.unsent.forEach (p) =>
        p.flushed = new Date() if @connection.write(p.packet)
        p.sent = new Date()
    
    setTimeout(@sendPackets_.bind(@)) if @packets.unsent.length > 0
    
    @sendingPackets_ = false
  
  send: (type, model, data) ->
    packet = @buildPacket(type, model, data)
    packetBuffer = BSON.serialize(packet, false, true, false)
    
    header = new Buffer(5)
    # cloud-models version
    header.writeUInt8(1, 0)
    # packet length
    header.writeUInt32BE(packetBuffer.length, 1)
    
    realPacket = Buffer.concat([header, packetBuffer])
    
    d = q.defer()
    
    @packets_[packet.i] =
      id: packet.i
      deferred: d
      packet: realPacket
      created: new Date()
    
    setTimeout(@sendPackets_.bind(@))
    
    augmentPromise(d.promise)
  
  buildPacket: (type, model, data) ->
    {
      i: LAST_ID++
      t: type
      m: model
      d: data
    }
  
  create: (model, data, opts) ->
    @send(Moddls.TYPE.CREATE, model, data)
  
  read: (model, query, opts = {}) ->
    @send(Moddls.TYPE.READ, model, {q: query, o: opts})
  
  readFirst: (model, query, opts = {}) ->
    opts.first = true
    @read(model, query, opts)
  
  readLast: (model, query, opts = {}) ->
    opts.last = true
    @read(model, query, opts)
  
  update: (model, query, update, opts = {}) ->
    @send(Moddls.TYPE.UPDATE, model, {q: query, u: update, o: opts})
  
  # updateFirst: (model, query, update, opts = {}) ->
  #   opts.first = true
  #   @update(model, query, update, opts)
  #
  # updateLast: (model, query, update, opts = {}) ->
  #   opts.last = true
  #   @update(model, query, update, opts)
  
  delete: (model, query, opts = {}) ->
    @send(Moddls.TYPE.DELETE, model, {q: query, o: opts})
  
  deleteFirst: (model, query, opts = {}) ->
    opts.first = true
    @send(Moddls.TYPE.DELETE, model, {q: query, o: opts})
  
  # batch: (operations) ->
  #   # builder = new BatchBuilder()
  #   @send(Moddls.TYPE.BATCH, operations)
  
  model: (modelName) ->
    client = @
    model = {name: modelName}
    ['create', 'read', 'readFirst', 'readLast', 'update', 'delete', 'deleteFirst'].forEach (k) ->
      model[k] = ->
        client[k](modelName, arguments...)
    model

# class BatchBuilder
#   constructor: ->
#     @operations = []
#     ['create', 'read', 'readFirst', 'readLast', 'update', 'delete', 'deleteFirst'].forEach (m) =>
#       @[m] = =>
#         args =
#         @operations.push()

module.exports = Moddls
