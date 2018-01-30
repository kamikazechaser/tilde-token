const { createHash } = require('crypto')
const querystring = require('querystring')
const ed25519 = require('ed25519')

function serialize (data) {
  if (typeof data === 'string') {
    return querystring.escape(data)
  }
  if (Array.isArray(data)) {
    return querystring.stringify(data)
  }
  return querystring.stringify(
    Object.keys(data)
      .filter((key) => typeof data[key] !== 'undefined')
      .sort()
      .reduce((acc, key) => Object.assign(acc, { [key]: data[key] }), {})
  )
}

function deserialize (payload) {
  return payload.includes('=')
    ? querystring.parse(payload)
    : querystring.unescape(payload)
}

function makeKeypair (secret) {
  const seed = createHash('sha256').update(secret).digest()
  return ed25519.MakeKeypair(seed)
}

function signer (secret) {
  if (!secret) {
    throw new Error('Missing secret')
  }
  const keypair = makeKeypair(secret)
  return (data) => {
    if (!data) {
      throw new Error('Missing data')
    }
    const payload = serialize(data)
    const signature = ed25519.Sign(Buffer.from(payload, 'utf8'), keypair)
      .toString('base64')
      .replace(/=/g, '')
    return `~${signature}${payload}`
  }
}

function sign (data, secret) {
  return signer(secret)(data)
}

function decode (token) {
  if (typeof token !== 'string' || token[0] !== '~' || token.length < 88) {
    return { ok: false, err: new Error('Mailformed token') }
  }
  const payload = token.slice(87)
  return {
    ok: true,
    payload,
    data: deserialize(payload),
    signature: Buffer.from(token.slice(1, 87), 'base64')
  }
}

function verifier (secret) {
  if (!secret) {
    throw new Error('Missing verification key')
  }
  const pubKey = Buffer.isBuffer(secret) ? secret : makeKeypair(secret).publicKey
  return (token) => {
    try {
      const { signature, payload, data } = decode(token)
      return ed25519.Verify(Buffer.from(payload, 'utf8'), signature, pubKey)
        ? { ok: true, data }
        : { ok: false, err: new Error('Invalid signature') }
    } catch (err) {
      return { ok: false, error: err }
    }
  }
}

function verify (token, secret) {
  return verifier(secret)(token)
}

module.exports = {
  signer,
  sign,
  verifier,
  verify,
  decode,
  makeKeypair
}
