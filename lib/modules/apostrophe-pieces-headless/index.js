var async = require('async');
var _ = require('lodash');

module.exports = {

  improve: 'apostrophe-pieces',

  construct: function(self, options) {

    self.addRestApiRoutes = function() {
      var restApi = self.apos.modules['apostrophe-headless'];
      if ((!options.restApi) || (options.restApi.enabled === false)) {
        return;
      }
      var baseEndpoint = restApi.endpoint;
      var endpoint = baseEndpoint + '/' + (options.restApi.name || self.__meta.name);

      // GET many
      self.apos.app.get(endpoint, function(req, res) {
        var cursor = self.findForRestApi(req);
        var result = {};
        return async.series([ distinct, countPieces, findPieces, renderPieces ], function(err) {
          if (err) {
            self.apos.utils.error(err);
            return res.status(500).send({ error: 'error' });
          }
          return res.send(result);
        });

        function distinct(callback) {
          var distinct = self.apos.launder.string(req.query.distinct).split(',');
          var counts = self.apos.launder.string(req.query['distinct-counts']).split(',');
          if (distinct[0] === '') {
            distinct = [];
          }
          if (counts[0] === '') {
            counts = [];
          }
          return async.eachSeries(_.uniq(distinct.concat(counts)), function(filter, callback) {
            if (!_.includes(self.options.restApi.safeDistinct || [], filter)) {
              return callback(null);
            }
            var counted = _.includes(counts, filter);
            var _cursor = cursor.clone();
            _cursor[filter](undefined);
            return _cursor.toChoices(filter, { counts: counted }, function(err, choices) {
              if (err) {
                return callback(err);
              }
              result.distinct = result.distinct || {};
              result.distinct[filter] = choices;
              return callback(null);
            });
          }, callback);
        }

        function countPieces(callback) {
          return cursor.toCount(function(err, count) {
            if (err) {
              return callback(err);
            }
            result.total = count;
            result.pages = cursor.get('totalPages');
            result.perPage = cursor.get('perPage');
            result.currentPage = cursor.get('page') || 1;
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
            pieces.forEach(function(piece) {
              self.restFilterFields(req, piece);
            });
            result.results = pieces;
            return callback(null);
          });
        }

        function renderPieces(callback) {
          return async.eachSeries(result.results, function(piece, callback) {
            var restApi = self.apos.modules['apostrophe-headless'];
            return restApi.apiRender(req, self, piece, 'piece', callback);
          }, callback);
        }

      });

      // GET one
      self.apos.app.get(endpoint + '/:id', function(req, res) {
        var id = self.apos.launder.id(req.params.id);
        if (!id) {
          return res.status(400).send({ error: 'bad request' });
        }
        var piece;
        return async.series([ find, render ], function(err) {
          if (err) {
            if (err === 'notfound') {
              return res.status(404).send({ error: 'notfound' });
            } else {
              self.apos.utils.error(err);
              return res.status(500).send({ error: 'error' });
            }
          }
          return res.send(piece);
        });
        function find(callback) {
          return self.findForRestApi(req).and({ _id: id }).toObject(function(err, _piece) {
            if (err) {
              return callback('error');
            }
            if (!_piece) {
              return callback('notfound');
            }
            piece = _piece;
            self.restFilterFields(req, piece);
            // Attach `_url` and `_urls` properties
            self.apos.attachments.all(piece, { annotate: true });
            return callback(null);
          });
        }
        function render(callback) {
          var restApi = self.apos.modules['apostrophe-headless'];
          return restApi.apiRender(req, self, piece, 'piece', callback);
        }
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

      // Update (PUT) one piece. The body must contain all of the properties
      // of the document as found in the schema otherwise they are
      // set blank. If this is not what you want, use the PATCH method.

      self.apos.app.put(endpoint + '/:id', function(req, res) {
        var id = self.apos.launder.id(req.params.id);
        return self.restPutOrPatch(req, id, 'put');
      });

      // PATCH one piece. Only touches properties present in the request;
      // also supports MongoDB-style `$push`, `$pullAll` and `$pullAllById` operators,
      // with a subset of the features found in MongoDB.
      //
      // PATCH operations are atomic with respect to other PATCH operations.
      //
      // PATCH operations may append to arrays using the
      // following syntax:
      //
      // `$push: { addresses: { street: '123 Wiggle Street' } }`
      //
      // The value given for `addresses` is appended to the existing
      // `addresses` schema field as a single element, even if it is itself
      // an array. This can be changed using the `$each` option:
      //
      // `$push: { addresses: { $each: [ { street: '123 Wiggle Street' }, { street: '101 Wacky Lane' } ] } }`
      //
      // Dot notation may be used to access arrays in subproperties with this
      // syntax.
      //
      // `$pullAll` may be used to remove all matching values present
      // for the array in question:
      //
      // `$pullAll: { addresses: { [ { street: '101 Wacky Lane', id: 'abcdef' } ] } }`
      //
      // If the array property in question is an
      // area's `items` property or an array schema field's value, it is more
      // convenient to remove array elements by their `id` or `_id` property:
      //
      // `$pullAllById`: 'abcdef'
      // `$pullAllById`: [ 'abcdef', 'qwerty' ]
      //
      // Note that this will match on either an `_id` property or an `-id` property.
      //
      // These operators can also be used to update the `idsField`
      // of a join. For instance, if a `joinByArray` field is named
      // `_people`, and `idsField` has not been set to the contrary,
      // you can append the `_id`s of additional people
      // to the `peopleIds` property using `$addToSet`.
      //
      // `patch` calls are guaranteed to be atomic with regard to
      // other `patch` operations. That is, if two `patch` operations
      // run concurrently updating different properties, all of the
      // property updates are guaranteed to make it through. If
      // two `patch` operations attempt to `$push` to the same
      // array, the first to begin will append its items first.

      self.apos.app.patch(endpoint + '/:id', function(req, res) {
        var id = self.apos.launder.id(req.params.id);
        return self.restPutOrPatch(req, id, 'patch');
      });

      self.restFilterFields = function(req, piece) {
        if (!piece._edit) {
          // Filter out editPermissions properties, where appropriate
          self.schema.forEach(function(field) {
            if (field.api === 'editPermissionRequired') {
              delete piece[field.name];
            }
          });
          // If you can't edit, it is none of your business who else can
          delete piece.docPermissions;
        }
        // To avoid situations that confuse developers, such as joins not
        // working or _url not populating, some fields like tags or type are
        // not excluded at the mongo level. Instead, delete them before
        // transmission
        _.each(req.excludeFields, function(field) {
          delete piece[field];
        });
      };

      // Implementation detail of the PUT and PATCH methods
      // (see above).
      //
      // Patch or put the given piece. The new data should be in `req.body` and
      // will be applied to the existing piece specified by `id` if
      // the permissions of `req` permit. If `action` is `patch`, only the
      // schema fields actually present in the `piece` object are touched,
      // otherwise all schema fields are touched, with absence treated
      // as an attempt to set an empty value for that property.

      self.restPutOrPatch = function(req, id, action) {
        if (action === 'patch') {
          return self.apos.locks.withLock('apostrophe-headless-' + id, body, respond);
        } else {
          return body(respond);
        }

        function respond(err) {
          if (err) {
            if (err === 'notfound') {
              return req.res.status(404).send({ error: err });
            } else if (err === 'invalid') {
              return req.res.status(400).send({ error: err });
            } else {
              return req.res.status(500).send({ error: 'error' });
            }
          }
          return req.res.send(req.piece);
        }

        function body(callback) {
          return self.findForEditing(req, { _id: id })
            .toObject(function(err, _piece) {
              if (err) {
                return callback(err);
              }
              if (!_piece) {
                return callback('notfound');
              }
              req.piece = _piece;
              if (action === 'patch') {
                var restApi = self.apos.modules['apostrophe-headless'];
                restApi.implementPatchOperators(_piece, req.body);
                req.restApiPatchSchema = restApi.subsetSchemaForPatch(self.schema, req.body);
              }
              return self.convertUpdateAndRefresh(req, function(req, res, err, _piece) {
                return callback(err);
              });
            }
            );
        }

      };

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
            return self.afterTrash(req, id, callback);
          }
        }, function(err) {
          if (err) {
            return res.status(500).send({ error: 'error' });
          }
          return res.send({});
        });
      });

    };

    var superAllowedSchema = self.allowedSchema;
    self.allowedSchema = function(req) {
      var schema = superAllowedSchema(req);
      if (req.restApiPatchSchema) {
        schema = _.intersectionBy(schema, req.restApiPatchSchema, 'name');
      }
      return schema;
    };

    self.findForRestApi = function(req) {
      var which = 'public';
      var projection = {};
      var includeFromQuery = false;
      var joins = [];
      var joinsToExclude = [];

      if (req.query._workflowLocale) {
        // We don't use req.query.workflowLocale because that is caught by the
        // workflow middleware and would cause a redirect that is not useful here
        req.locale = req.query._workflowLocale;
      }

      if (req.query.includeFields) {
        // Always retrieve information necessary to annotate
        // what is editable and what is not, calculate _url, etc.
        projection.docPermissions = 1;
        projection.type = 1;
        projection.slug = 1;
        projection._id = 1;
        projection.tags = 1;
        var includeFields = self.apos.launder.string(req.query.includeFields).split(',');
        includeFields.forEach(function(field) {
          projection[field] = 1;
          includeFromQuery = true;
        });
      }

      if (self.apos.permissions.can(req, 'edit-' + self.name)) {
        which = 'manage';
      }

      self.schema.forEach(function(field) {
        if (field.api === false) {
          removeKey(field);
        }
        if (field.type.match(/join/)) {
          joins.push(field.name);
        } else if (field.schema) {
          field.schema.forEach(function(subField) {
            if (subField.type.match(/join/)) {
              joins.push(field.name + '.' + subField.name);
            }
          });
        }
      });

      if (!includeFromQuery && req.query.excludeFields) {
        req.excludeFields = self.apos.launder.string(req.query.excludeFields).split(',');
        req.excludeFields.forEach(function(field) {
          // Excluding these fields via mongodb has side effects on joins and _url that are
          // rarely anticipated by developers. We will delete them after the fetch
          if ((field !== 'type') && (field !== '_id') && (field !== 'tags') && (field !== 'slug')) {
            projection[field] = 0;
          }
        });
      }

      // add "exclude" fields only if "includeFields" fields are not required,
      // because Mongo cannot handle both at the same time
      function removeKey(field) {
        if (includeFromQuery || projection.hasOwnProperty(field.name)) {
          delete projection[field.name];
          if (field.type.match(/join/)) {
            joinsToExclude.push(field.name);
          }
        } else {
          projection[field.name] = 0;
          if (field.type.match(/join/)) {
            if (field.relationship) {
              projection[field.relationshipsField] = 0;
            }
            if (field.idsField) {
              projection[field.idsField] = 0;
            }
            if (field.idField) {
              projection[field.idField] = 0;
            }
          }
        }

        return projection;
      }

      var joinsToInclude = _.difference(joins, joinsToExclude);
      var cursor = self.find(req, {})
        .projection(projection)
        .joins(joinsToInclude)
        .safeFilters((options.restApi.safeFilters || []).concat(options.restApi.safeDistinct || []))
        .queryToFilters(req.query, which);

      if (options.restApi.getRequiresEditPermission) {
        cursor.permission('edit');
      }

      var perPage = cursor.get('perPage');
      var maxPerPage = options.restApi.maxPerPage || 50;
      if ((!perPage) || (perPage > maxPerPage)) {
        cursor.perPage(maxPerPage);
      }
      return cursor;
    };

    self.modulesReady = function() {
      var restApi = self.apos.modules['apostrophe-headless'];
      self.addRestApiRoutes();
      restApi.registerModule(self);
    };
  }
};
