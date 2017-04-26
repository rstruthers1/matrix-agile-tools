/**
 * Created by rstruthers on 4/22/17.
 */

// For more information on sqlite3 for node, see: https://github.com/mapbox/node-sqlite3
var sqlite3 = require("sqlite3").verbose();
// Should initialize db at application startup by calling createDb.
var db = null;
var User = require("./User")

function JiraUsersDb() {
    if (db == null) {
        createDb();
    }
}

/**
 * This call should be called just once, at application start up.
 * The db variable is static and is reused for all subsequent calls.
 * The special file name of ':memory:' means that the database is stored in memory only. The user table is recreated
 * each time the server is restarted.
 */
function createDb() {
    db = new sqlite3.Database(':memory:');

    // Perform the database operations in a serial manner. That way, we ensure that the User table is created
    // before we start doing inserts.
    db.serialize(function () {

        // Create the User table
        db.run("CREATE TABLE user (" +
            "username TEXT PRIMARY KEY, " +
            "firstname TEXT, " +
            "lastname TEXT, " +
            "password" +
            ")");

    });

};

JiraUsersDb.prototype.addUser = function(user, callback) {
    var sql =
        "INSERT or REPLACE INTO user (password, username) " +
        "VALUES ( '" + user.password + "', '" + user.username + "')";
    db.all(sql, function (err, rows) {
        callback(err);
    });
}

JiraUsersDb.prototype.fetchUsers = function(callback) {
    var users = [];
    db.all("SELECT * from user", function(err, rows) {
       if (rows) {
           for (var i = 0; i < rows.length; i++) {
               var user = userFromDbRow(rows[i]);
               users.push(user);
           }
       }
       callback(err, users);
    });
}

JiraUsersDb.prototype.fetchUserByUsername = function(username, callback) {
    db.all("SELECT * from user where username = '" + username + "'",
        function(err, rows) {
            var user = null;
            if (rows && rows.length == 1) {
                user = userFromDbRow(rows[0]);
            }
            callback(err, user);
        });
}

function userFromDbRow(row) {
    return new User(row.username, row.password);
}

module.exports = JiraUsersDb;
