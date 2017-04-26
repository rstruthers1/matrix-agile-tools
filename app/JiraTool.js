/**
 * Created by rstruthers on 4/22/17.
 */
var http = require('http');
var request = require('request')
var host = 'jira.concur.com'
var JiraUsersDb = require('./JiraUsersDb')
var jiraUsersDb = new JiraUsersDb()
var User = require('./User')
var DevWorklogOneDay = require('./models/DevWorklogOneDay')
var WorklogDevEntry = require('./models/WorklogDevEntry')
var EncryptDecrypt = require('./EncryptDecrypt')
var encryptDecrypt = new EncryptDecrypt("Matrix4$", "aes256")

function JiraTool() {

}

module.exports = JiraTool;

JiraTool.prototype.authenticate = function (username, password, callback) {
    var encryptedPassword = encryptDecrypt.encrypt(password)
    makeJiraRestCall(username, encryptedPassword, '/jira/rest/api/2/myself', function (response, str) {
        if (response.statusCode != 200) {
            callback("Access Denied", null);
        } else {
            var user = new User(username,  encryptedPassword);
            jiraUsersDb.addUser(user, function(err) {
                callback(err, user);

            })

        }
    });
};

JiraTool.prototype.fetchBoards = function(user, callback) {
    makeJiraRestCall(user.username, user.password, '/jira/rest/agile/1.0/board?name=Matrix', function (response, str) {
        if (response.statusCode != 200) {
            callback("error: " + str, null);
        } else {
            var boards = [];
            callback(null, boards);
        }
    });
}


JiraTool.prototype.fetchSprints = function(user, boardId, callback) {
    var endpoint = '/jira/rest/agile/1.0/board/' + boardId + '/sprint'
    makeJiraRestCall(user.username, user.password, endpoint, function (response, str) {
        if (response.statusCode != 200) {
            callback("error: " + str, null);
        } else {
            var sprintReply = JSON.parse(str);
            var sprints = [];
            var allSprints = sprintReply.values;
            if (allSprints != null) {
                for (var i = 0; i < allSprints.length; i++) {
                    var sprint = allSprints[i];
                    if (sprint.state === 'future') {
                        continue;
                    }
                    var sprintStartDate = new Date(sprint.startDate);
                    var now = new Date();
                    var diffMillis = Math.abs(now - sprintStartDate);
                    var days =  (diffMillis / (1000*60*60*24));
                    if (days > 300) {
                        continue;
                    }
                    sprints.push(sprint);
                }
                sprints.sort(function(a, b) {return new Date(b.startDate) - new Date(a.startDate)})
            }
            callback(null, sprints);
        }
    });
}

JiraTool.prototype.fetchSprintWorklogs = function(user, sprintId, callback) {
    var endpoint = '/jira/rest/api/2/search?jql=sprint=' + sprintId + '&fields=worklog'
    makeJiraRestCall(user.username, user.password, endpoint, function (response, str) {
        if (response.statusCode != 200) {
            callback("error: " + str, null);
        } else {
            var searchReply = JSON.parse(str);

            var issues = searchReply.issues;
            var worklogs = [];
            if (issues) {
                for (var i = 0; i < issues.length; i++) {
                    var issue = issues[i];
                    if (!issue.fields || !issue.fields.worklog || !issue.fields.worklog.worklogs) {
                        continue;
                    }

                    for (var j = 0; j < issue.fields.worklog.worklogs.length; j++) {
                        var worklog = issue.fields.worklog.worklogs[j];
                        worklogs.push(worklog);
                    }
                }
            }

            callback(null, worklogs);
        }
    });
}

function extractWorklogsFromIssues(usernameToMatch, issues, sprintStart) {
    var worklogs = [];
    if (!issues) {
        return worklogs;
    }
    for (var i = 0; i < issues.length; i++) {
        var issue = issues[i];
        var jiraKey = issue.key;
        var summary = issue.fields.summary;
        if (!issue.fields.worklog) {
            continue;
        }
        for (var j = 0; j < issue.fields.worklog.worklogs.length; j++) {
            var worklog = issue.fields.worklog.worklogs[j];
            var comment = worklog.comment;
            var created = new Date(worklog.created);
            // if (created < sprintStart) {
            //     continue;
            // }
            var started = new Date(worklog.started);
            if (started < sprintStart) {
                continue;
            }
            var username = worklog.author.key;
            if (username != usernameToMatch) {
                continue;
            }
            var seconds = worklog.timeSpentSeconds;

            var worklogDevEntry = new WorklogDevEntry(username, jiraKey, summary, seconds, created, started, comment);
            worklogs.push(worklogDevEntry)
        }
    }
    return worklogs
}

JiraTool.prototype.fetchSprintWorklogsForDev = function(user, sprintId, sprintStart, username, callback) {
    var endpoint = '/jira/rest/api/2/search?jql=sprint=' + sprintId + '&fields=worklog,summary'
    makeJiraRestCall(user.username, user.password, endpoint, function (response, str) {
        if (response.statusCode != 200) {
            callback("error: " + str, null);
        } else {
            var searchReply = JSON.parse(str);
            var worklogs = extractWorklogsFromIssues(username, searchReply.issues, new Date(sprintStart))
            worklogs.sort(function(a, b) {return new Date(a.created) - new Date(b.created)})
            callback(null, worklogs);
        }
    });
}


function makeJiraRestCall(username, encryptedPassword, endpoint, passedInCallback) {

    var password = encryptDecrypt.decrypt(encryptedPassword)

    var auth = 'Basic ' + new Buffer(username + ':' + password).toString('base64');
    var headers = {'Authorization': auth};
    var options = {
        host: host,
        path: endpoint,
        headers: headers
    }


    callback = function (response) {
        var str = '';
        //another chunk of data has been recieved, so append it to `str`
        response.on('data', function (chunk) {
            str += chunk;
        });

        //the whole response has been recieved, so we just print it out here
        response.on('end', function () {
            passedInCallback(response, str)
        });
    }

    http.request(options, callback).end();

}
