/**
 * Created by rstruthers on 4/25/17.
 */
var crypto = require('crypto');

function EncryptDecrypt(password, algorithm) {
    this.algorithm = algorithm;
    this.password = password;

}

EncryptDecrypt.prototype.encrypt = function(text) {
    var cipher = crypto.createCipher(this.algorithm, this.password)
    var crypted = cipher.update(text,'utf8','hex')
    crypted += cipher.final('hex');
    return crypted;
}

EncryptDecrypt.prototype.decrypt = function(text) {
    var decipher = crypto.createDecipher(this.algorithm, this.password)
    var dec = decipher.update(text,'hex','utf8')
    dec += decipher.final('utf8');
    return dec;
}

module.exports = EncryptDecrypt;

