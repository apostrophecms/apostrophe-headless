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
      if ((!options.restApi) || (options.restApi.enabled === false)) {
        return;
      }
      var baseEndpoint = '/api/v' + (options.restApi.version || 1);
      var endpoint = options.restApi.endpoint || (baseEndpoint + '/' + (options.restApi.name || self.__meta.name));
      
      // GET many
      self.apos.app.get(endpoint, function(req, res) {
        var cursor = self.findForRestApi(req);
        var result = {};
        return async.series([ countPieces, findPieces ], function(err) {
          if (err) {
            return res.status(500).send('error');
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
          return res.status(400).send('bad request');
        }
        return self.findForRestApi(req).and({ _id: id }).toObject(function(err, piece) {
          if (err) {
            return res.status(500).send('error');
          }
          return res.send(piece);
        });
      });
      
      // POST one
      self.apos.app.post(endpoint, function(req, res) {
        return self.convertInsertAndRefresh(req, function(req, res, err, piece) {
          if (err) {
            return res.status(500).send('error');
          }
          return res.send(piece);
        });
      });

      // UPDATE one
      self.apos.app.update(endpoint + '/:id', function(req, res) {
        var id = self.apos.launder.id(req.params.id);

        return self.findForEditing(req, { _id: id })
          .toObject(function(err, _piece) {
            if (err) {
              return res.status(500).send('error');
            }
            if (!_piece) {
              return res.status(404).send('notfound');
            }
            req.piece = _piece;
            return self.convertUpdateAndRefresh(req, function(req, res, err, piece) {
              if (err) {
                return res.status(500).send('error');
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
            return res.status(500).send('error');
          }
          return res.send('ok');
        });
      });

    };
    
    self.findForRestApi = function(req) {
      var cursor = self.find(req, {}).queryToFilters(req.query, 'public');
      var perPage = cursor.get('perPage');
      var maxPerPage = options.restApi.maxPerPage || 5;
      if ((!perPage) || (perPage > maxPerPage)) {
        cursor.perPage(maxPerPage);
      }
      return cursor;
    };
  }
};
