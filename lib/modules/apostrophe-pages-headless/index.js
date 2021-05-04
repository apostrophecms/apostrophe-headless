var async = require('async');
var _ = require('lodash');

module.exports = {

  improve: 'apostrophe-pages',

  construct: function(self, options) {

    self.addRestApiRoutes = function() {
      const restApi = self.apos.modules['apostrophe-headless'];
      if ((!options.restApi) || (options.restApi.enabled === false)) {
        return;
      }
      const baseEndpoint = restApi.endpoint;
      const endpoint = baseEndpoint + '/' + (options.restApi.name || self.__meta.name);

      // GET home or tree
      self.apos.app.get(endpoint, async function(req, res) {
        const all = self.apos.launder.boolean(req.query.all);
        const flat = self.apos.launder.boolean(req.query.flat);

        const childrenOptions = {
          depth: 1000,
          published: null,
          trash: false,
          orphan: null,
          joins: false,
          areas: false,
          permission: false
        };

        try {
          const home = all
            ? await self.findForRestApi(req).and({ level: 0 }).children(childrenOptions).toObject()
            : await self.findForRestApi(req).and({ level: 0 }).toObject();

          if (!home) {
            return res.status(404).send({ error: 'notfound' });
          }

          // const data = options.apiKeys ? [ page ] : clean([ page ]);
          const data = all ? clean([ home ]) : [ home ];

          const dataTosend = (all && flat) ? flatten(data[0]) : data[0];

          if (all) {
            return res.send(dataTosend);
          }

          // Attach `_url` and `_urls` properties
          self.apos.attachments.all(dataTosend, { annotate: true });

          render(dataTosend, (err) => {
            if (err) {
              self.apos.utils.error(err);
              return res.status(500).send({ error: 'error' });
            }
            return res.send(dataTosend);
          });
        } catch (err) {
          self.apos.utils.error(err);
          return res.status(500).send({ error: 'error' });
        }

        function clean(nodes) {
          mark(nodes, []);
          return prune(nodes);
          function mark(nodes, ancestors) {
            _.each(nodes, function(node) {
              if (node._publish) {
                node.good = true;
                _.each(ancestors, function(ancestor) {
                  ancestor.good = true;
                });
              }
              mark(node._children || [], ancestors.concat([ node ]));
            });
          }

          function prune(nodes) {
            var newNodes = [];
            _.each(nodes, function(node) {
              node._children = prune(node._children || []);
              if (node.good) {
                newNodes.push(_.pick(node, 'title', 'slug', '_id', 'type', 'tags', '_url', '_children'));
              }
            });
            return newNodes;
          }
        }

        function flatten(node) {
          return parseChildren([], node);

          function parseChildren (result, item) {
            const children = item._children || [];
            const data = {
              ...item,
              _children: children.map((child) => child._id)
            };
            result.push(data);
            children.reduce(parseChildren, result);

            return result;
          }
        }

        function render(result, callback) {
          return self.apos.modules['apostrophe-headless']
            .apiRender(req, self, result, 'page', callback);
        }
      });

      // GET one
      self.apos.app.get(endpoint + '/:id', function(req, res) {
        var id = self.apos.launder.id(req.params.id);
        if (!id) {
          return res.status(400).send({ error: 'invalid' });
        }
        var page;
        return async.series([ find, render ], function(err) {
          if (err === 'notfound') {
            return res.status(404).send({ error: 'notfound' });
          } else if (err === 'badrequest') {
            return res.status(400).send({ error: 'badrequest' });
          } else if (err) {
            return res.status(500).send({ error: 'error' });
          }
          return res.send(page);
        });
        function find(callback) {
          return self.findForRestApi(req).and({ _id: id }).toObject(function(err, _page) {
            if (err) {
              return callback(err);
            }
            if (!_page) {
              return callback('notfound');
            }
            page = _page;
            // Attach `_url` and `_urls` properties
            self.apos.attachments.all(page, { annotate: true });
            return callback(null);
          });
        }
        function render(callback) {
          var restApi = self.apos.modules['apostrophe-headless'];
          return restApi.apiRender(req, self, page, 'page', callback);
        }
      });

      // POST one
      self.apos.app.post(endpoint, function(req, res) {
        // Derived from the implementation of the insert route.
        // TODO: refactor in core so they share as much of this code as
        // possible
        var parentId = self.apos.launder.id(req.body._parentId);
        var page = _.omit(req.body, 'parentId');
        if (typeof (page) !== 'object') {
          // cheeky
          return res.status(400).send({ error: 'bad request' });
        }
        var parentPage;
        var safePage;
        return async.series({
          findParent: function(callback) {
            return self.find(req, { _id: parentId }).permission('publish-apostrophe-page').toObject(function(err, _parentPage) {
              if (err) {
                return callback(err);
              }
              if (!_parentPage) {
                return callback('notfound');
              }
              parentPage = _parentPage;
              safePage = self.newChild(parentPage);
              return callback(null);
            });
          },
          convert: function(callback) {
            var manager = self.apos.docs.getManager(self.apos.launder.string(page.type));
            if (!manager) {
              // sneaky
              return callback('notfound');
            }
            // Base the allowed schema on a generic new child of the parent page, not
            // random untrusted stuff from the browser
            var schema = manager.allowedSchema(req);
            var keys = Object.keys(page);
            if (_.includes(keys, 'title') && (!_.includes(keys, 'slug'))) {
              // Let the slug be inferred from the title properly
              keys.push('slug');
            }
            schema = self.apos.schemas.subset(schema, keys);
            return self.apos.schemas.convert(req, schema, 'form', page, safePage, callback);
          },
          insert: function(callback) {
            return self.insert(req, parentPage, safePage, callback);
          },
          find: function(callback) {
            // Fetch the page. Yes, we already have it, but this way all the cursor
            // filters run and we have access to ._url
            return self.find(req, { _id: safePage._id }).published(null).toObject(function(err, _safePage) {
              if (err) {
                return callback(err);
              }
              if (!_safePage) {
                return callback('notfound');
              }
              safePage = _safePage;
              self.apos.attachments.all(safePage, { annotate: true });
              return callback(null);
            });
          }
        }, function(err) {
          if (err) {
            self.apos.utils.error(err);
            if (err === 'notfound') {
              return res.status(404).send({ error: err });
            } else if (err === 'invalid') {
              return res.status(400).send({ error: err });
            } else {
              return res.status(500).send({ error: 'error' });
            }
          }
          return res.send(safePage);
        });
      });

      // Update (PUT) one page. The body must contain all of the properties
      // of the document as found in the schema otherwise they are
      // set blank. If this is not what you want, use the PATCH method.

      self.apos.app.put(endpoint + '/:id', function(req, res) {
        // TODO: too much code borrowed from core update route,
        // refactor to share most of it
        var id = self.apos.launder.id(req.params.id);
        var page = req.body || {};
        if (typeof (page) !== 'object') {
          // cheeky
          return res.status(400).send({ error: 'invalid' });
        }
        return self.restPutOrPatch(req, id, page, 'put');
      });

      // PATCH one page. Only touches properties present in the request;
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
      // to the `peopleIds` property using `$push`.
      //
      // `patch` calls are guaranteed to be atomic with regard to
      // other `patch` operations. That is, if two `patch` operations
      // run concurrently updating different properties, all of the
      // property updates are guaranteed to make it through. If
      // two `patch` operations attempt to `$push` to the same
      // array, the first to begin will append its items first.

      self.apos.app.patch(endpoint + '/:id', function(req, res) {
        // TODO: too much code borrowed from core update route,
        // refactor to share most of it
        var id = self.apos.launder.id(req.params.id);
        var page = req.body || {};
        if (typeof (page) !== 'object') {
          // cheeky
          return res.status(400).send({ error: 'invalid' });
        }
        return self.restPutOrPatch(req, id, page, 'patch');
      });

      // Implementation detail of the PUT and PATCH methods
      // (see above).
      //
      // Patch or update the given page. `page` is the data from the browser,
      // which will be applied to the existing page specified by `id` if
      // the permissions of `req` permit. If `action` is `patch`, only the
      // schema fields actually present in the `page` object are touched,
      // otherwise all schema fields are touched, with absence created
      // as an attempt to set an empty value for that property.

      self.restPutOrPatch = function(req, id, page, action) {
        var existingPage;

        if (action === 'patch') {
          return self.apos.locks.withLock('apostrophe-headless-' + id, body, respond);
        } else {
          return body(respond);
        }

        function respond(err) {
          if (err) {
            self.apos.utils.error(err);
            if (err === 'notfound') {
              return req.res.status(404).send({ error: err });
            } else if (err === 'invalid') {
              return req.res.status(400).send({ error: err });
            } else {
              return req.res.status(500).send({ error: 'error' });
            }
          }
          return req.res.send(existingPage);
        }

        function body(callback) {
          return async.series({
            find: function(callback) {
              return self.find(req, { _id: id }).permission('edit-apostrophe-page').trash(self.apos.docs.trashInSchema ? null : false).toObject(function(err, _page) {
                if (err) {
                  return callback(err);
                }
                if (!_page) {
                  return callback('notfound');
                }
                existingPage = _page;
                return callback(null);
              });
            },
            convert: function(callback) {
              var restApi = self.apos.modules['apostrophe-headless'];
              var manager = self.apos.docs.getManager(self.apos.launder.string(page.type || existingPage.type));
              if (!manager) {
                // sneaky
                return callback('notfound');
              }
              var schema = manager.allowedSchema(req);
              schema = self.addApplyToSubpagesToSchema(schema);
              schema = self.removeParkedPropertiesFromSchema(existingPage, schema);
              if (action === 'patch') {
                schema = restApi.subsetSchemaForPatch(schema, page);
                restApi.implementPatchOperators(existingPage, page);
              } else {
                // overwrite only fields that are in the schema
                schema = self.apos.schemas.subset(schema, Object.keys(page));
              }
              return self.apos.schemas.convert(req, schema, 'form', page, existingPage, callback);
            },
            update: function(callback) {
              return self.update(req, existingPage, callback);
            },
            findAgain: function(callback) {
              // Fetch the page. Yes, we already have it, but this way all the cursor
              // filters run and we have access to ._url
              return self.find(req, { _id: existingPage._id }).published(null).trash(self.apos.docs.trashInSchema ? null : false).toObject(function(err, _page) {
                if (err) {
                  return callback(err);
                }
                if (!_page) {
                  return callback('notfound');
                }
                existingPage = _page;
                return callback(null);
              });
            }
          }, callback);
        }
      };

      // DELETE one
      self.apos.app.delete(endpoint + '/:id', function(req, res) {
        var id = self.apos.launder.id(req.params.id);
        return self.moveToTrash(req, id, function(err, parentSlug, changed) {
          if (err) {
            if (err === 'notfound') {
              return res.status(404).send({ error: 'notfound' });
            } else if (err === 'forbidden') {
              return res.status(403).send({ error: 'notfound' });
            } else {
              return res.status(500).send({ error: 'error' });
            }
          }
          return res.send({});
        });
      });

      // Move page
      self.apos.app.post(endpoint + '/:id/move', function(req, res) {
        var id = self.apos.launder.id(req.params.id);
        var targetId = self.apos.launder.id(req.body.targetId);
        var position = self.apos.launder.string(req.body.position);
        return self.move(req, id, targetId, position, function(err, parentSlug, changed) {
          if (err) {
            self.apos.utils.error(err);
            if (err === 'notfound') {
              return res.status(404).send({ error: 'notfound' });
            } else if (err === 'forbidden') {
              return res.status(403).send({ error: 'notfound' });
            } else {
              return res.status(500).send({ error: 'error' });
            }
          }
          return res.send({});
        });
      });

    };

    self.findForRestApi = function(req) {
      if (req.query._workflowLocale) {
        // We don't use req.query.workflowLocale because that is caught by the
        // workflow middleware and would cause a redirect that is not useful here
        req.locale = req.query._workflowLocale;
      }
      // Allow children and ancestors to be optional.
      var includeChildren = self.apos.launder.boolean(req.query.children, true);
      var includeAncestors = self.apos.launder.boolean(req.query.ancestors, true);

      var cursor = self
        .find(req)
        .ancestors(includeAncestors)
        .children(includeChildren)
        .published(null);

      if (options.restApi.getRequiresEditPermission) {
        cursor.permission('edit');
      }
      return cursor;
    };

    var superModulesReady = self.modulesReady;
    self.modulesReady = function(callback) {
      return superModulesReady(function(err) {
        if (err) {
          return callback(err);
        }
        var restApi = self.apos.modules['apostrophe-headless'];
        self.addRestApiRoutes();
        restApi.registerModule(self);
        return callback(null);
      });
    };
  }
};
