# moddls

moddls client for node.js

## Installation
```
npm install moddls
```

## Usage

```javascript
var Moddls = require('moddls');
var client = new Moddls({url: 'moddls://54.164.201.37:31002'});

// create a model for more a more fluent API
var User = client.model('User');

client.on('reconnecting', function() { console.log('Moddls reconnecting'); });
client.on('connected',    function() { console.log('Moddls connected'); });
client.on('disconnected', function() { console.log('Moddls disconnected'); });

client.connect().then(function() {
  User.read({email: 'matt.insler@gmail.com'}).then(function(users) {
    console.log(users);
  });
  
  User.readFirst({group: 'users'}, {sort: {email: 1}}).then(function(user) {
    console.log(user);
  });
  
  User.readLast({group: 'users'}, {sort: {email: 1}}).then(function(user) {
    console.log(user);
  });
  
  User.create({
    name: 'Matt Insler',
    email: 'matt.insler@gmail.com',
    group: 'users'
  }).then(function(user) {
    // the created user, with id and any computed fields
    console.log(user);
  });
  
  User.update({email: 'matt.insler@gmail.com'}, {group: 'admin'}).then(function(user) {
    // the updated user
    console.log(user);
  });
  
  // deletes all users
  User.delete().then(function(count) {
    console.log('Deleted', count, 'users');
  });
});
```

## License
Copyright (c) 2014 Matt Insler  
Licensed under the MIT license.
