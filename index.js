var async = require('async');
var _ = require('lodash');
var cuid = require('cuid');
var expressBearerToken = require('express-bearer-token');
var cors = require('cors');

module.exports = {

  moogBundle: {
    directory: 'lib/modules',
    modules: [ 'apostrophe-pieces-headless', 'apostrophe-pages-headless' ]
  },

  afterConstruct: function(self, callback) {
    self.addRoutes();
    if (self.options.bearerTokens || self.options.apiKeys) {
      self.apos.on('csrfExceptions', self.addCsrfException);
    }
    return self.enableCollection(callback);
  },

  construct: function(self, options) {

    self.endpoint = '/api/v' + (options.version || 1);
    self.registeredModules = [];

    // Exclude the REST APIs from CSRF protection. However,
    // this module will call the CSRF protection middleware
    // itself if a user is not present based on a bearer token
    // or api key
    self.addCsrfException = function(exceptions) {
      exceptions.push(self.endpoint + '/**');
    };

    self.enableCollection = function(callback) {
      self.bearerTokensCollection = self.apos.db.collection('aposBearerTokens');
      return self.bearerTokensCollection.ensureIndex({ expires: 1 }, { expireAfterSeconds: 0 }, callback);
    };

    self.enableCorsHeaders = function() {
      const corsConfig = (typeof self.options.cors === 'object' && self.options.cors) || {};
      self.apos.app.use(self.endpoint, cors(corsConfig));
    };

    self.addRoutes = function() {

      self.enableCorsHeaders();

      if (self.options.bearerTokens) {
        self.apos.app.use(self.bearerMiddleware);
        self.apos.app.post(self.endpoint + '/login', function(req, res) {
          var bearer;
          var user;
          return async.series([
            emitEventBeforeLogin,
            checkCredentials,
            insertToken
          ], function(err) {
            if (err) {
              return res.status((typeof (err) !== 'object') ? err : 500).send({ error: 'error' });
            } else {
              return res.send({ bearer: bearer });
            }
          });
          // In the case of an async function, async.series will await
          // the resolution of the promise (including handling rejection)
          // and does not pass a callback
          async function emitEventBeforeLogin() {
            await self.emit('beforeLogin', req);
          }
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
            return self.bearerTokensCollection.insert({
              _id: bearer,
              userId: user._id,
              expires: new Date(new Date().getTime() + (self.options.bearerTokens.lifetime || (86400 * 7 * 2)) * 1000)
            }, callback);
          }
        });
        self.apos.app.post(self.endpoint + '/logout', function(req, res) {
          if (!req.user) {
            return res.status(403).send({ forbidden: 'forbidden' });
          }
          return self.bearerTokensCollection.remove({
            userId: req.user._id,
            _id: req.token
          }, function(err) {
            if (err) {
              return res.status(500).send({ error: 'error' });
            }
            return res.send({});
          });
        });
      }

      if (self.options.apiKeys) {
        self.apos.app.use(self.apiKeyMiddleware);
      }

      self.apos.app.use(self.endpoint, self.applyCsrfUnlessExemptMiddleware);

      self.apos.app.post(self.endpoint + '/attachments', self.apos.attachments.middleware.canUpload, self.apos.middleware.files, function(req, res) {
        var userAgent = req.headers['user-agent'];
        var matches = userAgent && userAgent.match(/MSIE (\d+)/);
        if (matches && (matches[1] <= 9)) {
          // Must use text/plain for file upload responses in IE <= 9,
          // don't do that to other browsers
          res.header('Content-Type', 'text/plain');
        }
        // The name attribute could be anything because of how fileupload
        // controls work; we don't really care.
        var file = _.values(req.files || {})[0];
        if (!file) {
          return res.status(400).send({ error: 'no file sent, did you forget to use multipart/form-data encoding?' });
        }
        return self.apos.attachments.accept(req, file, function(err, file) {
          if (err) {
            self.apos.utils.error(err);
            return res.status(500).send({ status: 'error' });
          }
          return res.send(file);
        });
      });

    };

    self.applyCsrfUnlessExemptMiddleware = function(req, res, next) {
      if (req.csrfExempt) {
        return next();
      }
      return self.apos.modules['apostrophe-express'].csrfWithoutExceptions(req, res, next);
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
    //
    // If a user is not assigned via a bearer token,
    // Apostrophe's standard CSRF middleware is invoked
    // to ensure that API accesses by logged-in website users
    // are not vulnerable to CSRF attacks.

    self.bearerMiddleware = function(req, res, next) {
      if (req.url.substr(0, self.endpoint.length + 1) !== (self.endpoint + '/')) {
        return next();
      }
      const exceptions = self.apos.modules['apostrophe-express'].options.csrf && self.apos.modules['apostrophe-express'].options.csrf.exceptions
        ? self.apos.modules['apostrophe-express'].options.csrf.exceptions
        : [];
      const isLogin = (req.url === self.endpoint + '/login');
      const isCsrfException = exceptions.includes(req.url);

      if (isLogin || isCsrfException) {
        // Login is exempt, chicken and egg
        req.csrfExempt = true;
        return next();
      }

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
            self.apos.utils.error(err);
            return res.status(500).send({ error: 'error' });
          }
          if (!user) {
            return res.status(401).send({ error: 'bearer token invalid' });
          }
          req.csrfExempt = true;
          req.user = user;
          return next();
        });

        function getBearer(callback) {
          // The expireAfterSeconds feature of mongodb
          // is not instantaneous so we should check
          // "expires" ourselves too
          return self.bearerTokensCollection.findOne({
            _id: req.token,
            expires: { $gte: new Date() }
          }, function(err, bearer) {
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

    // Modules supporting the REST API call this method to register themselves
    // so that, for instance, module specific api keys can be checked
    self.registerModule = function(module) {
      self.registeredModules.push(module);
    };

    self.apiKeyMiddleware = function(req, res, next) {

      if (req.url.substr(0, self.endpoint.length + 1) !== (self.endpoint + '/')) {
        return next();
      }

      var key = req.query.apikey || req.query.apiKey || getAuthorizationApiKey();
      var taskReq;
      if (!key) {
        return next();
      }

      if (_.includes(self.options.apiKeys, key)) {
        taskReq = self.apos.tasks.getReq();
        req.user = taskReq.user;
        req.csrfExempt = true;
        return next();
      } else {
        var module = _.find(self.registeredModules, function(module) {
          return _.includes(module.options.apiKeys, key);
        });
        if (module) {
          taskReq = self.apos.tasks.getReq();
          req.user = taskReq.user;
          req.user._permissions = { 'edit-attachment': true };
          // TODO this check would be better factored as a method
          // we call on the modules to get their effective type name
          if (module.__meta.name === 'apostrophe-pages') {
            req.user._permissions['admin-apostrophe-page'] = true;
          } else {
            req.user._permissions['admin-' + module.name] = true;
          }
          req.csrfExempt = true;
          return next();
        }
      }

      return res.status(403).send({ error: 'invalid api key' });

      function getAuthorizationApiKey() {
        var header = req.headers.authorization;
        if (!header) {
          return null;
        }
        var matches = header.match(/^ApiKey\s+(\S+)$/i);
        if (!matches) {
          return null;
        }
        return matches[1];
      }

    };

    // Given a module and API result object so far, render the doc
    // with the appropriate `api/` template of that module.
    // The template is called with `data.page` or `data.piece`
    // beig available depending on whether `name` is `page` or `piece`.

    self.apiRender = function(req, module, doc, name, callback) {
      var render = req.query.render;
      if (!render) {
        return callback(null);
      }
      // remove edit flags from widgets as that markup is
      // completely extraneous in an API response
      removeEditFlags(doc);
      if (!Array.isArray(render)) {
        render = [ render ];
      }
      doc.rendered = {};
      var bad = false;
      _.each(render, function(template) {
        template = self.apos.launder.string(template);
        if (!_.includes(module.options.apiTemplates, template)) {
          bad = true;
          return false;
        }
        var data = {};
        data[name] = doc;
        doc.rendered[template] = module.render(req, 'api/' + template, data);
      });
      if (bad) {
        return callback('badrequest');
      }
      return callback(null);

      function removeEditFlags(doc) {
        if (Array.isArray(doc)) {
          _.each(doc, iterator);
        } else {
          _.forOwn(doc, iterator);
        }
        function iterator(val, key) {
          if (key === '_edit') {
            doc[key] = false;
          }
          if (typeof (val) === 'object') {
            removeEditFlags(val);
          }
        }
      }

    };

    // Implementation detail, called for you by the PATCH route.
    // Applies changes in patch operators found in `patch` to set ordinary
    // properties of `patch`, referring to the doc `existing` to fill in
    // information like existing elements of arrays, etc. Then you call
    // convert normally with `patch ` as input and the schema indicated by
    // subsetSchemaForPatch.
    //
    // Includes support for the `$push`, `$pullAll`, and `$pullAllById` operators.

    self.implementPatchOperators = function(existing, patch) {
      if (patch.$push) {
        append(existing, patch.$push);
      } else if (patch.$pullAll) {
        _.each(patch.$pullAll, function(val, key) {
          _.set(patch, key, _.differenceWith(_.get(existing, key) || [], _.get(patch.$pullAll, key) || [], function(a, b) {
            return _.isEqual(a, b);
          }));
        });
      } else if (patch.$pullAllById) {
        _.each(patch.$pullAllById, function(val, key) {
          _.set(patch, key, _.get(existing, key) || []);
          if (!Array.isArray(val)) {
            val = [ val ];
          }
          _.set(patch, key, _.differenceWith(_.get(existing, key) || [], _.get(patch.$pullAllById, key), function(a, b) {
            return (a._id || a.id) === b;
          }));
        });
      }
      function append(existing, data) {
        _.each(data, function(val, key) {
          _.set(patch, key, _.get(existing, key) || []);
          if (val && val.$each) {
            _.set(patch, key, (_.get(patch, key) || []).concat(val.$each));
          } else {
            var _existing = _.get(patch, key) || [];
            _existing.push(val);
            _.set(patch, key, _existing);
          }
        });
      }
    };

    // Given a `doc` containing patch operators like `$push`, return a subset
    // of `schema` containing the root fields that would ultimately be updated by
    // those operations.

    self.subsetSchemaForPatch = function(schema, doc) {
      var idFields = {};
      schema.forEach(function(field) {
        if ((field.type === 'joinByOne') || (field.type === 'joinByArray')) {
          idFields[field.idField || field.idsField] = field.name;
        }
      });
      return self.apos.schemas.subset(schema, _.map(_.keys(doc).concat(operatorKeys()), idFieldToSchemaField));
      function operatorKeys() {
        return _.uniq(_.flatten(
          _.map([ '$push', '$pullAll', '$pullAllById' ], function(o) {
            return _.map(_.keys(doc[o] || {}), function(key) {
              return key.toString().split(/\./)[0];
            });
          })
        ));
      }
      function idFieldToSchemaField(name) {
        return idFields[name] || name;
      }
    };

  }

};
