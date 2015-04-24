
/**
 * Module dependencies.
 */

var express = require('express'),
    routes  = require('./routes'),
    redis   = require('redis'),
    chance   = require('chance').Chance(),
    _       = require('underscore'),
    publisherClient = redis.createClient();

var app = module.exports = express.createServer();

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.use(express.errorHandler()); 
});

// Routes

app.get('/', function(req, res){
  res.render('index');
});

app.get('/snapshot', function(req, res) {
  var snapshot = _(77000).times(function(n){
  	return {
  		author : chance.name(),
  		text   : chance.paragraph()
  	};
  })
  _.map(snapshot, function(num, key){publisherClient.publish( 'events', key);})
  res.json(snapshot);
});

app.get('/stream', function(req, res) {
  // let request last as long as possible
  req.socket.setTimeout(Infinity);

  var messageCount = 0;
  var subscriber = redis.createClient();

  subscriber.subscribe("events");

  // In case we encounter an error...print it out to the console
  subscriber.on("error", function(err) {
    console.log("Redis Error: " + err);
  });

  // When we receive a message from the redis connection
  subscriber.on("message", function(channel, message) {
    messageCount++; // Increment our message count

    res.write('id: ' + messageCount + '\n');
    res.write("data: " + message + '\n\n'); // Note the extra newline
  });

  //send headers for event-stream connection
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.write('\n');

  // The 'close' event is fired when a user closes their browser window.
  // In that situation we want to make sure our redis channel subscription
  // is properly shut down to prevent memory leaks...and incorrect subscriber
  // counts to the channel.
  req.on("close", function() {
    subscriber.unsubscribe();
    subscriber.quit();
  });
});

app.get('/raise/:event', function(req, res) {
  publisherClient.publish( 'events', ('"' + req.params.event + '" raised!') );
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.write('All clients have received "' + req.params.event + '"');
  res.end();
});

app.listen(8000);
console.log("Listening on port %d in %s mode", app.address().port, app.settings.env);
