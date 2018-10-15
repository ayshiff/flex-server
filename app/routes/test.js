var crypto = require('crypto'),
    algorithm = 'aes-256-ctr';

exports.encrypt = function(text, password){
  var cipher = crypto.createCipher(algorithm, password)
  var crypted = cipher.update(text,'utf8','hex')
  crypted += cipher.final('hex');
  return crypted;
}

exports.decrypt = function(text, password){
  var decipher = crypto.createDecipher(algorithm, password)
  var dec = decipher.update(text,'hex','utf8')
  dec += decipher.final('utf8');
  return dec;
}

// var crypto = require('crypto'),
//     algorithm = 'aes-256-ctr';

// var randomBytes = require('randombytes');

// exports.encrypt = function(text, password){
//   const iv = new Buffer(randomBytes(16));
//   let key = crypto.createHash('sha256').update(String(iv)).digest('base64').substr(0, 32);
//   var cipher = crypto.createCipheriv(algorithm, key, iv)
//   var crypted = cipher.update(text,'utf8','hex')
//   crypted += cipher.final('hex');
//   return crypted;
// }

// exports.decrypt = function(text, password){
//   const iv = new Buffer(randomBytes(16));
//   let key = crypto.createHash('sha256').update(String(iv)).digest('base64').substr(0, 32);
//   var decipher = crypto.createDecipheriv(algorithm, key, iv)
//   var dec = decipher.update(text,'hex','utf8')
//   dec += decipher.final('utf8');
//   return dec;
// }
