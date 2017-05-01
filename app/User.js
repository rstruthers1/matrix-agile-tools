/**
 * Created by rstruthers on 4/22/17.
 */


function User(username, password, name) {

    this.username = username;
    this.password = password;
    this.id = username;
    this.name = name;
}

module.exports = User;