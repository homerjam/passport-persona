/**
 * Module dependencies.
 */
var AbstractStrategy = require('passport-strategy'),
  https = require('https'),
  querystring = require('querystring'),
  util = require('util'),
  browseridVerify = require('browserid-verify')(),
  BadRequestError = require('./errors/badrequesterror'),
  VerificationError = require('./errors/verificationerror');

/**
 * `Strategy` constructor.
 *
 * The Persona authentication strategy authenticates requests using the
 * navigator.id JavaScript API and BrowserID, by using Mozilla's Remote
 * Verification API.
 *
 * BrowserID provides a federated and decentralized universal login system for
 * the web, based on email addresses as an identity token.  Authenticating in
 * this this manner involves a sequence of events, including prompting the user,
 * via their user agent, for an assertion of email address ownership.  Once this
 * assertion is obtained, it can be verified and the user can be authenticated.
 *
 * Applications must supply a `verify` callback which accepts an `email`
 * address, and then calls the `done` callback supplying a `user`, which should
 * be set to `false` if the credentials are not valid.  If an exception occured,
 * `err` should be set.
 *
 * Options:
 *   - `audience`        the website requesting and verifying an identity assertion
 *   - `assertionField`  field name where the assertion is found, defaults to 'assertion'
 *   - `passReqToCallback`     when `true`, `req` is the first argument to the verify callback (default: `false`)
 *
 * Examples:
 *
 *     passport.use(new PersonaStrategy({
 *         audience: 'http://www.example.com'
 *       },
 *       function(email, done) {
 *         User.findByEmail(email, function (err, user) {
 *           done(err, user);
 *         });
 *       }
 *     ));
 *
 * @param {Object} options
 * @param {Function} verify
 * @api public
 */
function Strategy(options, verify) {
  if (!options.audience) throw new Error('Persona authentication requires an audience option');
  if (!verify) throw new Error('Persona authentication strategy requires a verify function');

  AbstractStrategy.call(this);
  this.name = 'persona';
  this._verify = verify;
  this._passReqToCallback = options.passReqToCallback;

  this._audience = options.audience;
  this._assertionField = options.assertionField || 'assertion';
  this._checkAudience = options.checkAudience !== undefined ? options.checkAudience : true;

  // options used to inject mock objects for testing purposes
  this._https = options.transport || https;
}

/**
 * Inherit from `AbstractStrategy`.
 */
util.inherits(Strategy, AbstractStrategy);

/**
 * Authenticate request by using login.persona.org as a trusted secondary authority
 * for verifying email assertions.
 *
 * @param {Object} req
 * @api protected
 */
Strategy.prototype.authenticate = function(req) {
  var self = this;

  if (!req.body || !req.body[this._assertionField]) {
    return this.fail(new BadRequestError('Missing assertion'));
  }

  var assertion = req.body[this._assertionField];

  if (typeof this._checkAudience === 'boolean' && !this._checkAudience) {
    this._audience = req.headers.host;
  }

  browseridVerify(assertion, this._audience, function(err, email, response) {
    if (err) {
      return self.error(err);
    }

    if (response) {
      return verified(response);
    }

    return self.error(new VerificationError(response.reason));
  });

  function verified(result) {
    if (self._audience !== result.audience && self._checkAudience) {
      return self.error(new Error('audience mismatch in verification result'));
    }

    function done(err, user, info) {
      if (err) {
        return self.error(err);
      }
      if (!user) {
        return self.fail(info);
      }
      self.success(user, info);
    }

    if (self._passReqToCallback) {
      var arity = self._verify.length;
      if (arity == 4) {
        self._verify(req, result.email, result.issuer, done);
      } else {
        self._verify(req, result.email, done);
      }
    } else {
      var arity = self._verify.length;
      if (arity == 3) {
        self._verify(result.email, result.issuer, done);
      } else {
        self._verify(result.email, done);
      }
    }
  }
}

/**
 * Expose `Strategy`.
 */
module.exports = Strategy;

