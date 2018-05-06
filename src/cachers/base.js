/*
 * moleculer
 * Copyright (c) 2018 MoleculerJS (https://github.com/moleculerjs/moleculer)
 * MIT Licensed
 */

"use strict";

const _ 		= require("lodash");
const crypto	= require("crypto");

/**
 * Abstract cacher class
 *
 * @class Cacher
 */
class Cacher {

	/**
	 * Creates an instance of Cacher.
	 *
	 * @param {object} opts
	 *
	 * @memberof Cacher
	 */
	constructor(opts) {
		this.opts = _.defaultsDeep(opts, {
			ttl: null,
			keygen: null,
			maxKeyLength: 44
		});
	}

	/**
	 * Initialize cacher
	 *
	 * @param {any} broker
	 *
	 * @memberof Cacher
	 */
	init(broker) {
		this.broker = broker;
		if (this.broker) {
			this.logger = broker.getLogger("cacher");

			if (this.opts.prefix) {
				this.prefix = this.opts.prefix + "-";
			} else {
				this.prefix = "MOL-";
				if (this.broker.namespace)
					this.prefix += this.broker.namespace + "-";
			}

			broker.use(this.middleware());
		}
	}

	/**
	 * Close cacher
	 *
	 * @memberof Cacher
	 */
	close() {
		/* istanbul ignore next */
		return Promise.resolve();
	}

	/**
	 * Get a cached content by key
	 *
	 * @param {any} key
	 *
	 * @memberof Cacher
	 */
	get(/*key*/) {
		/* istanbul ignore next */
		throw new Error("Not implemented method!");
	}

	/**
	 * Set a content by key to cache
	 *
	 * @param {any} key
	 * @param {any} data
	 * @param {Number?} ttl
	 *
	 * @memberof Cacher
	 */
	set(/*key, data, ttl*/) {
		/* istanbul ignore next */
		throw new Error("Not implemented method!");
	}

	/**
	 * Delete a content by key from cache
	 *
	 * @param {any} key
	 *
	 * @memberof Cacher
	 */
	del(/*key*/) {
		/* istanbul ignore next */
		throw new Error("Not implemented method!");
	}


	/**
	 * Clean cache. Remove every key by match
	 * @param {any} match string. Default is "**"
	 * @returns {Promise}
	 *
	 * @memberof Cacher
	 */
	clean(/*match = "**"*/) {
		/* istanbul ignore next */
		throw new Error("Not implemented method!");
	}

	/**
	 * Get a value from params or meta by `key`.
	 * If the key starts with `#` it reads from `meta`, otherwise from `params`.
	 *
	 * @param {String} key
	 * @param {Object} params
	 * @param {Object} meta
	 * @returns {any}
	 * @memberof Cacher
	 */
	getParamMetaValue(key, params, meta) {
		if (key.startsWith("#") && meta != null)
			return _.get(meta, key.slice(1));
		else if (params != null)
			return _.get(params, key);
	}

	/**
	 * Default cache key generator
	 *
	 * @param {String} actionName
	 * @param {Object} params
	 * @param {Object} meta
	 * @param {Array|null} keys
	 * @returns {String}
	 * @memberof Cacher
	 */
	defaultKeygen(actionName, params, meta, keys) {
		if (params || meta) {
			const keyPrefix = actionName + ":";
			if (keys) {
				if (keys.length == 1) {
					// Fast solution for ['id'] key
					const val = this.getParamMetaValue(keys[0], params, meta);
					return keyPrefix + (_.isObject(val) ? this._hashObj(val) : val);
				}

				if (keys.length > 0) {
					return keys.reduce((a, key, i) => {
						const val = this.getParamMetaValue(key, params, meta);
						return a + (i ? "|" : "") + (_.isObject(val) || Array.isArray(val) ? this._hashObj(val) : val);
					}, keyPrefix);
				}
			}
			else {
				return keyPrefix + this._hashObj(params);
			}
		}
		return actionName;
	}

	_hashObj(obj) {
		const maxKeyLength = this.opts.maxKeyLength || 44;
		const key = this._generateKeyFromObject(obj);

		if (maxKeyLength < 44 || key.length <= maxKeyLength)
			return key;

		const prefixLength = maxKeyLength - 44;

		const base64Hash = crypto.createHash("sha256").update(key).digest("base64");
		if (prefixLength < 1)
			return base64Hash;

		return key.substring(0, prefixLength) + base64Hash;
	}

	_generateKeyFromObject(obj) {
		if (Array.isArray(obj)) {
			return obj.map(o => this._generateKeyFromObject(o)).join("|");
		}
		else if (_.isObject(obj)) {
			return Object.keys(obj).map(key => [key, this._generateKeyFromObject(obj[key])].join("|")).join("|");
		}
		else if (obj != null) {
			return obj.toString();
		} else {
			return "null";
		}
	}

	/**
	 * Get a cache key by name and params.
	 * Concatenate the name and the hashed params object
	 *
	 * @param {String} name
	 * @param {Object} params
	 * @param {Object} meta
	 * @param {Array|null} keys
	 * @returns {String}
	 */
	getCacheKey(actionName, params, meta, keys) {
		if (_.isFunction(this.opts.keygen))
			return this.opts.keygen.call(this, actionName, params, meta, keys);
		else
			return this.defaultKeygen(actionName, params, meta, keys);
	}

	/**
	 * Register cacher as a middleware
	 *
	 * @memberof Cacher
	 */
	middleware() {
		return (handler, action) => {
			if (action.cache) {
				return function cacherMiddleware(ctx) {
					const cacheKey = this.getCacheKey(action.name, ctx.params, ctx.meta, action.cache.keys);
					return this.get(cacheKey).then(content => {
						if (content != null) {
							// Found in the cache! Don't call handler, return with the content
							ctx.cachedResult = true;
							return content;
						}

						// Call the handler
						return handler(ctx).then(result => {
							// Save the result to the cache
							this.set(cacheKey, result, action.cache.ttl);

							return result;
						});
					});
				}.bind(this);
			}

			return handler;
		};
	}

}

module.exports = Cacher;
