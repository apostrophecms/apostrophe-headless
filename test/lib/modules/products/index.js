module.exports = {
  construct: function(self, options) {
    self.apos.app.post('/excepted-post-route', function(req, res) {
      return res.send('ok');
    });
    self.apos.app.post('/non-excepted-post-route', function(req, res) {
      // Should not get here due to CSRF middleware
      return res.send('ok');
    });
  }
};
