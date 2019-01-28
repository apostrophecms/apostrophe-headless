## 2.7.1

* The `PATCH` method works properly with `joinByOne` and `joinByArray`. You should send the appropriate `idField` or `idsField`. If these are not explicitly configured, the names map as follows: `_joinName` maps to `joinNameIdField` or `joinNameIdsField` (note there is no `_`), depending on whether it is a `joinByOne` or `joinByArray` field. Thanks to Giuseppe Monteleone for flagging the issue.
* In certain cases, a crash occurred when attempting to report a 500 error to the browser. Thanks to Giuseppe Monteleone for fixing the issue.

## 2.7.0

* `distinct` and `distinct-counts` query parameters added. You must also configure `safeDistinct`.

Thanks to Michelin for making this work possible via [Apostrophe Enterprise Support](https://apostrophecms.org/support/enterprise-support).

## 2.6.0

* `includeFields` and `excludeFields` now work properly for joins. Thanks to Anthony Tarlao.

## 2.5.0

* You may now specify just certain fields to be fetched with `includeFields` in your query string, or exclude certain fields with `excludeFields`. Thanks to `falkodev`.

## 2.4.0

* You may now exclude a field from the GET method of the API entirely by setting `api: false` in its schema field definition. You may also set `api: 'editPermissionRequired'` to restrict access to that field to those who can edit the doc in question. Thanks to Anthony Tarlao.
* If you would like to restrict GET access completely to those with edit permissions for the doc in question, you may now set the `getRequiresEditPermission` sub-option of `restApi` to `true`. Thanks again to Anthony Tarlao.

## 2.3.0

* Support for the `PATCH` method, which allows you to send just the fields you want to change, with support for simple array operators as well. Thanks to Paul Grieselhuber for his support.

## 2.2.0

* New `restApi.safeFilters` option (thanks to Marjan Georgiev), and documentation of the `restApi.maxPerPage` option.

## 2.1.2

* Documentation changes only. Clarified that areas must be present in the schema to be inserted or updated via the API.

## 2.1.1

* Fixed bug impacting the data provided by the `GET` route for pages when `all=1` is present. The data was incomplete due to missing query criteria.

## 2.1.0

* Support for API keys, as a lightweight alternative to bearer tokens for server-to-server communication. These should not be compiled into mobile apps, i.e. anywhere users might be able to obtain them by decompiling, etc.
* Support for pages, both reading and writing.
* Support for fragment rendering, and documentation on how to get fully rendered versions.

## 2.0.4

Documentation changes only. Gave some simple examples of query parameters that can be used to filter the results.

## 2.0.3

`apostrophe-headless` no longer has to be configured before modules it adds APIs to, and it is possible to add APIs to `apostrophe-images` or `apostrophe-files` if desired. Thanks to Stephen Walsh for pointing out the issue.

## 2.0.2

Documentation improvements. No code changes.

## 2.0.1

Added CORS headers. This resolves any issues you may be having accessing the APIs from webpages served from a different host or port number. All modern and even not-so-modern browsers back to IE8 support this solution.

## 2.0.0

Initial release.
