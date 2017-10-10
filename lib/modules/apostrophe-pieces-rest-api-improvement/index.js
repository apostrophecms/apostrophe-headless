var async = require('async');
var _ = require('lodash');

module.exports = {

  improve: 'apostrophe-pieces',

  afterConstruct: function(self) {
    if (!self.options.restApi) {
      return;
    }
    self.addRestApiRoutes();
  },

  construct: function(self, options) {

    self.addRestApiRoutes = function() {
      var restApi = self.apos.modules['apostrophe-pieces-rest-api'];
      if ((!options.restApi) || (options.restApi.enabled === false)) {
        return;
      }
      var baseEndpoint = restApi.endpoint;
      var endpoint = baseEndpoint + '/' + (options.restApi.name || self.__meta.name);
      
      // GET many
      self.apos.app.get(endpoint, function(req, res) {
        var cursor = self.findForRestApi(req);
        var result = {};
        return async.series([ countPieces, findPieces ], function(err) {
          if (err) {
            return res.status(500).send({ error: 'error' });
          }
          return res.send(result);
        });
        
        function countPieces(callback) {
          return cursor.toCount(function(err, count) {
            if (err) {
              return callback(err);
            }
            result.total = count;
            result.pages = cursor.get('totalPages');
            result.perPage = cursor.get('perPage');
            return callback(null);
          });
        }

        function findPieces(callback) {
          return cursor.toArray(function(err, pieces) {
            if (err) {
              return callback(err);
            }
            // Attach `_url` and `_urls` properties
            self.apos.attachments.all(pieces, { annotate: true });
            result.results = pieces;
            return callback(null);
          });
        }
        
      });

      // GET one
      self.apos.app.get(endpoint + '/:id', function(req, res) {
        var id = self.apos.launder.id(req.params.id);
        if (!id) {
          return res.status(400).send({ error: 'bad request' });
        }
        return self.findForRestApi(req).and({ _id: id }).toObject(function(err, piece) {
          if (err) {
            return res.status(500).send({ 'error': 'error' });
          }
          if (!piece) {
            return res.status(404).send({ 'error': 'notfound' });
          }
          return res.send(piece);
        });
      });
      
      // POST one
      self.apos.app.post(endpoint, function(req, res) {
        return self.convertInsertAndRefresh(req, function(req, res, err, piece) {
          if (err) {
            return res.status(500).send({ error: 'error' });
          }
          return res.send(piece);
        });
      });

      // UPDATE one
      self.apos.app.put(endpoint + '/:id', function(req, res) {
        var id = self.apos.launder.id(req.params.id);

        return self.findForEditing(req, { _id: id })
          .toObject(function(err, _piece) {
            if (err) {
              return res.status(500).send({ error: 'error' });
            }
            if (!_piece) {
              return res.status(404).send({ error: 'notfound' });
            }
            req.piece = _piece;
            return self.convertUpdateAndRefresh(req, function(req, res, err, piece) {
              if (err) {
                return res.status(500).send({ error: 'error' });
              }
              return res.send(piece);
            });
          }
        );

      });

      // DELETE one
      self.apos.app.delete(endpoint + '/:id', function(req, res) {
        var id = self.apos.launder.id(req.params.id);
        return async.series({
          before: function(callback) {
            return self.beforeTrash(req, id, callback);
          },
          trash: function(callback) {
            return self.trash(req, id, callback);
          },
          after: function(callback) {
            return self.afterTrash(req, id, callback)
          }
        }, function(err) {
          if (err) {
            return res.status(500).send({ error: 'error' });
          }
          return res.send({});
        });
      });

    };
    
    self.findForRestApi = function(req) {
      var which = 'public';
      if (self.apos.permissions.can(req, 'edit-' + self.name)) {
        which = 'manage';
      }
      var cursor = self.find(req, {}).queryToFilters(req.query, which);
      var perPage = cursor.get('perPage');
      var maxPerPage = options.restApi.maxPerPage || 50;
      if ((!perPage) || (perPage > maxPerPage)) {
        cursor.perPage(maxPerPage);
      }
      return cursor;
    };
  }
};
