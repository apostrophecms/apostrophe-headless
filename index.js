var async = require('async');
var _ = require('lodash');
var cuid = require('cuid');
var expressBearerToken = require('express-bearer-token');

module.exports = {

  moogBundle: {
    directory: 'lib/modules',
    modules: [ 'apostrophe-pieces-rest-api-improvement' ]
  },

  afterConstruct: function(self) {
    self.enableCollection();
    self.addRoutes();
  },
  
  construct: function(self, options) {

    var baseEndpoint = '/api/v' + (options.version || 1);
    self.endpoint = baseEndpoint;
    
    self.enableCollection = function() {
      self.db = self.apos.db.collection('aposBearerTokens');
    };
    
    self.addRoutes = function() {
      if (self.options.bearerTokens) {
        self.apos.app.use(baseEndpoint, self.bearerMiddleware);
        self.apos.app.post(baseEndpoint + '/login', function(req, res) {
          var bearer;
          var user;
          return async.series([
            checkCredentials,
            insertToken
          ], function(err) {
            if (err) {
              return res.status((typeof(err) !== 'object') ? err : 500).send('error');
            } else {
              return res.send({ bearer: bearer });
            }
          });
          function checkCredentials(callback) {
            var username = self.apos.launder.string(req.body.username);
            var password = self.apos.launder.string(req.body.password);
            if (!(username && password)) {
              return callback(400);
            }
            return self.apos.login.verifyLogin(username, password, function(err, _user) {
              if (err) {
                return callback(err);
              }
              if (!_user) {
                return callback(401);
              }
              user = _user;
              return callback(null);
            });
          }
          function insertToken(callback) {
            bearer = cuid();
            return self.db.insert({
              _id: bearer,
              userId: user._id,
              createdAt: new Date()
            }, callback);
          }
        });
        self.apos.app.post(baseEndpoint + '/logout', function(req, res) {
          if (!req.user) {
            return res.status(403).send('forbidden');
          }
          return self.db.remove({
            userId: req.user._id,
            _id: req.token
          }, function(err) {
            if (err) {
              return res.status(500).send('error');
            }
            return res.send({});
          });
        });
      }
    };
    
    // Instantiate the express-bearer-token middleware for use
    // in parsing bearer tokens. Configuration may be passed to it via
    // the `expressBearerToken` option.
    self.bearerTokenMiddleware = expressBearerToken(self.options.expressBearerToken || {});
    
    // The `bearerMiddleware` method is Express middleware
    // that detects a bearer token per RFC6750 and
    // sets `req.user` exactly as the `apostrophe-login`
    // module would. Extends the `express-bearer-token`
    // middleware to actually set `req.user`. If there
    // is no token or it is invalid we just don't set
    // `req.user` (it's an anonymous access).
    
    self.bearerMiddleware = function(req, res, next) {
      self.bearerTokenMiddleware(req, res, function() {
        var userId, user;
        if (!req.token) {
          return next();
        }
        return async.series([
          getBearer,
          deserializeUser
        ], function(err) {
          if (err) {
            console.error('error from async series:');
            console.error(err);
            return next();
          }
          if (!user) {
            return next();
          }
          req.user = user;
          return next();
        });
        
        function getBearer(callback) {
          return self.db.findOne({ _id: req.token }, function(err, bearer) {
            if (err) {
              return callback(err);
            }
            userId = bearer && bearer.userId;
            return callback(null);
          });
        }
        function deserializeUser(callback) {
          if (!userId) {
            return callback(null);
          }
          return self.apos.login.deserializeUser(userId, function(err, _user) {
            if (err) {
              return callback(err);
            }
            user = _user;
            return callback(null);
          });
        }
      });
    };
  }

};
