/**
 * Created by rstruthers on 4/22/17.
 */
var http = require('http');
var request = require('request')
var async = require("async");
var fs = require('fs');
var host = 'jira.concur.com'
var JiraUsersDb = require('./JiraUsersDb')
var jiraUsersDb = new JiraUsersDb()
var User = require('./User')
var DevWorklogOneDay = require('./models/DevWorklogOneDay')
var WorklogDevEntry = require('./models/WorklogDevEntry')
var Jira = require('./models/Jira')
var EncryptDecrypt = require('./EncryptDecrypt')
var encryptDecrypt = new EncryptDecrypt(process.env.CRYPTO_PASSWORD, "aes256")
const querystring = require('querystring');
var Sprint = require("./models/Sprint")


function JiraTool() {

}

module.exports = JiraTool;

JiraTool.prototype.authenticate = function (username, password, callback) {
    var encryptedPassword = encryptDecrypt.encrypt(password)
    makeJiraRestCall(username, encryptedPassword, '/jira/rest/api/2/myself', function (response, str) {
        if (response.statusCode != 200) {
            callback("Access Denied", null);
        } else {
            var reply = JSON.parse(str)
            var user = new User(username,  encryptedPassword, reply.name);
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


JiraTool.prototype.fetchSprintsInDateRange = function(user, boardId, startDate, endDate, callback) {
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

                    if (sprintStartDate >= startDate && sprintStartDate <= endDate) {
                        sprints.push(sprint);
                    }
                }
                sprints.sort(function(a, b) {return new Date(a.startDate) - new Date(b.startDate)})
            }
            callback(null, sprints);
        }
    });
}

JiraTool.prototype.fetchSprintOverheadWorklogsForAllDevs = function(user, boardId, sprintId, sprintStart, callback) {
    var jql = 'sprint=' + sprintId + ' AND issueFunction in subtasksOf(\'summary~"Matrix Overhead" AND project in (EXP, INV)\')'
    var query = querystring.escape(jql)
    console.log("fetchSprintOverheadWorklogsForAllDevs")
    console.log("sprintId: " + sprintId)
    console.log("sprintStart: " + sprintStart)

    var endpoint = '/jira/rest/agile/1.0/board/' + boardId + '/sprint/' + sprintId + '/issue?jql=' + query + '&fields=worklog,summary'
    makeJiraRestCall(user.username, user.password, endpoint, function (response, str) {
        if (response.statusCode != 200) {
            callback("error: " + str, null);
        } else {
            var searchReply = JSON.parse(str);
            var worklogs = extractWorklogsFromIssues(null, searchReply.issues, new Date(sprintStart))
            worklogs.sort(function(a, b) {return new Date(a.created) - new Date(b.created)})
            callback(null, worklogs);
        }
    });
}

function aggregateWorklogsBySummary(worklogs) {
    var aggOverheadWorklogs = []
    for (var i = 0; i < worklogs.length; i++) {
        var worklog = worklogs[i]
        var worklogSummary = worklog.summary
        var aggMatch = null;
        for (j = 0; j < aggOverheadWorklogs.length; j++) {
            var aggOverheadWorklog = aggOverheadWorklogs[j]
            if (aggOverheadWorklog.summary == worklogSummary) {
                aggMatch = aggOverheadWorklog
                break;
            }
        }
        if (aggMatch) {
            aggMatch.seconds += worklog.seconds;
        } else {
            var newAgg = new WorklogDevEntry("agg", null, worklog.summary, worklog.seconds, null, null, null)
            aggOverheadWorklogs.push(newAgg)
        }
    }
    aggOverheadWorklogs.sort(function (a, b) {
        return (a.summary > b.summary) ? 1 : ((b.summary > a.summary) ? -1 : 0);
    });
    return aggOverheadWorklogs;
}

function getUniqueListOfSummariesForWorklogsInSprints(sprints) {
    var uniqueSummaries = []
    for (var i = 0; i < sprints.length; i++) {
        var sprint = sprints[i]
        for (var j = 0; j < sprint.worklogDevEntries.length; j++) {
            var worklog = sprint.worklogDevEntries[j];
            var matchSummary = null;
            for (var k = 0; k < uniqueSummaries.length; k++) {
                if (worklog.summary == uniqueSummaries[k]) {
                    matchSummary = worklog.summary;
                    break;
                }
            }
            if (!matchSummary) {
                uniqueSummaries.push(worklog.summary);
            }
        }
    }
    console.log("unique summaries")
    for (var i = 0; i < uniqueSummaries.length; i++) {
        console.log(i + ": " + uniqueSummaries[i])
    }
    return uniqueSummaries;
}

function addMissingWorklogWithSummaryIfNeeded(sprint, uniqueSummaries) {
    var worklogs = sprint.worklogDevEntries;
    var newWorklogs = []

    for (j = 0; j < uniqueSummaries.length; j++) {

        var uniqueSummary = uniqueSummaries[j]
        var worklogMatch = null;
        for (var k = 0; k < worklogs.length; k++) {
            var worklog = worklogs[k]
            if (worklog.summary == uniqueSummary) {
                worklogMatch = worklog
                break;
            }
        }
        if (!worklogMatch) {
            var newWorklog = new WorklogDevEntry("agg", null, uniqueSummary, 0, null, null, null)
            newWorklogs.push(newWorklog)
        } else {
            newWorklogs.push(worklogMatch)
        }
    }
    sprint.worklogDevEntries = newWorklogs
}

function makeEachSprintHaveSameWorklogs(sprintsWithWorklogs) {

    var uniqueSummaries = getUniqueListOfSummariesForWorklogsInSprints(sprintsWithWorklogs);

    for (var i = 0; i < sprintsWithWorklogs.length; i++) {
        var sprint = sprintsWithWorklogs[i]
        addMissingWorklogWithSummaryIfNeeded(sprint, uniqueSummaries);
    }
}

JiraTool.prototype.fetchOverheadWorkInDateRangeForBoard = function(user, boardId, startDate, endDate, callback) {
    var jiraTool = this;
    this.fetchSprintsInDateRange(user, boardId, startDate, endDate, function(err, sprints) {
        if (err) {
            callback(err, null);
            return;
        }
        var sprintsWithWorklogs = []
        if (!sprints) {
            callback(null, sprintsWithWorklogs)
            return;
        }
        async.each(sprints,
            // 2nd param is the function that each item is passed to
            function(sprint, callback) {

                jiraTool.fetchSprintOverheadWorklogsForAllDevs(user, boardId, sprint.id, new Date(sprint.startDate), function(err, worklogs) {
                    var aggOverheadWorklogs = aggregateWorklogsBySummary(worklogs);
                    var sprintWithWorklogs = new Sprint(sprint.id, sprint.name, sprint.startDate, sprint.endDate, sprint.completeDate, aggOverheadWorklogs)
                    sprintsWithWorklogs.push(sprintWithWorklogs)
                    callback();
                })
            },
            // 3rd param is the function to call when everything's done
            function(err){
                // All tasks are done now
                sprintsWithWorklogs.sort(function (a, b) {
                    return new Date(a.startDate) - new Date(b.startDate)
                });
                makeEachSprintHaveSameWorklogs(sprintsWithWorklogs);
                callback(err, sprintsWithWorklogs)
            }
        );


    })

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
            if (usernameToMatch && username != usernameToMatch) {
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

JiraTool.prototype.fetchSprintWorklogsForAllDevs = function(user, sprintId, sprintStart, callback) {
    var endpoint = '/jira/rest/api/2/search?jql=sprint=' + sprintId + '&fields=worklog,summary'
    makeJiraRestCall(user.username, user.password, endpoint, function (response, str) {
        if (response.statusCode != 200) {
            callback("error: " + str, null);
        } else {
            var searchReply = JSON.parse(str);
            var worklogs = extractWorklogsFromIssues(null, searchReply.issues, new Date(sprintStart))
            worklogs.sort(function(a, b) {return new Date(a.created) - new Date(b.created)})
            callback(null, worklogs);
        }
    });
}

JiraTool.prototype.fetchJira = function(user, jiraKey, callback) {
    var endpoint = '/jira/rest/api/2/issue/' + jiraKey
    makeJiraRestCall(user.username, user.password, endpoint, function (response, str) {
        if (response.statusCode != 200) {
            callback(str, null);
        } else {
            var reply = JSON.parse(str);
            callback(null, reply);
        }
    });
}

JiraTool.prototype.fetchSkeletonJiras = function(user, callback) {
    var query = '(project = "EXP" OR project = "INV") AND summary~"Skeleton to clone"'
    query = querystring.escape(query)
    var endpoint = '/jira/rest/api/2/search?jql=' + query
    console.log(">>>> endpoint: " + endpoint)

    makeJiraRestCall(user.username, user.password, endpoint, function (response, str) {
        if (response.statusCode != 200) {
            callback(str, null);
        } else {
            var reply = JSON.parse(str);
            var jiras = []
            var issues = reply.issues;
            if (issues) {
                for (var i = 0; i < issues.length; i++) {
                    var issue = issues[i]
                    var jira = new Jira(issue.key, issue.fields.summary)
                    jiras.push(jira)
                }
            }
            jiras.sort(function(a, b) {
                var summaryA = a.summary;
                var summaryB = b.summary;
                if (summaryA < summaryB) {
                    return -1;
                }
                if (summaryA > summaryB) {
                    return 1;
                }

                // names must be equal
                return 0;
            })
            callback(null, jiras);
        }
    });
}

function getNewJiraJson(jiraToClone, summary, jiraLabel, user) {
    if (!summary) {
        summary = jiraToClone.fields.summary
    }
    summary = summary.replace(' - Skeleton to clone', '')
    var fields = jiraToClone.fields;

    var newJiraJson= {
        "fields": {
            "project": {
                "id": fields.project.id
            },
            "issuetype": {
                "id": fields.issuetype.id
            },
            "assignee": {
                "name": fields.assignee.name
            },
            "reporter": {
                "name": user.name
            },
            "priority": {
                "id": fields.priority.id
            },
            "fixVersions": fields.fixVersions,
            "description": fields.description,
            "components": fields.components,
            "customfield_10310": {
                "id": fields.customfield_10310.id
            },
            "customfield_10572": fields.customfield_10572,
            "customfield_12301": fields.customfield_12301,
            "summary": summary
        }
    }

    if (jiraLabel) {
        newJiraJson.fields.labels = [jiraLabel]
    }

    return newJiraJson;
}

function fetchSubtasks(jiraTool, user, jira, callback) {
    var subtasks = []
    // 1st para in async.each() is the array of items
    async.each(jira.fields.subtasks,
        // 2nd param is the function that each item is passed to
        function(subtask, callback) {
            jiraTool.fetchJira(user, subtask.key, function(err, fetchedSubtask) {
                subtasks.push(fetchedSubtask)
                // Async call is done, alert via callback
                callback();
            })
        },
        // 3rd param is the function to call when everything's done
        function(err){
            // All tasks are done now
            callback(err, subtasks)
        }
    );
}

function createJiraSubtasks(jiraTool, user, newJira, subtasks, callback) {
    var newSubtasks = []
    // 1st para in async.each() is the array of items
    async.each(subtasks,
        // 2nd param is the function that each item is passed to
        function(subtask, callback) {
            var subtaskNewJiraJson = getNewJiraJson(subtask, subtask.summary, null, user)

            subtaskNewJiraJson.fields.parent = {
                "id": newJira.id}

            if (subtask.fields.timetracking) {
                subtaskNewJiraJson.fields.timetracking = subtask.fields.timetracking;
            }


            var endpoint = '/jira/rest/api/2/issue'
            var body = JSON.stringify(subtaskNewJiraJson)
            postJiraRestCall(user.username, user.password, endpoint, body, function (response, str) {
                if (response.statusCode >= 299) {
                    console.log(">>>> THERE WAS AN ERROR!")
                    console.log("status code: " + response.statusCode)
                    console.log(str)
                    callback("error: " + str);
                } else {
                    console.log(">>>>> NEW JIRA reply")
                    console.log(str)
                    console.log(">>>>> End new JIRA reply")
                    var reply = {};
                    try {
                        reply = JSON.parse(str);
                        subtaskNewJiraJson.self = reply.self;
                        subtaskNewJiraJson.key = reply.key;
                        subtaskNewJiraJson.id = reply.id;
                    } catch(exc) {
                        console.log(exc)
                    }
                    newSubtasks.push(subtaskNewJiraJson)
                    callback();
                }
            })
        },
        // 3rd param is the function to call when everything's done
        function(err){
            // All tasks are done now
            console.log("All done creating new subtasks!")
            callback(err, newSubtasks)
        }
    );
}

JiraTool.prototype.cloneJira = function(user, jiraCloneKey, summary, jiraLabel, callback) {
    var jiraTool = this;
    this.fetchJira(user, jiraCloneKey, function(err, jiraToClone){
        if (err) {
            callback(err, null)
            return
        }
        var newJiraJson = getNewJiraJson(jiraToClone, summary, jiraLabel, user);

        var endpoint = '/jira/rest/api/2/issue'
        var body = JSON.stringify(newJiraJson)
        console.log(">>>>> body: " + body)
        postJiraRestCall(user.username, user.password, endpoint, body, function (response, str) {
            if (response.statusCode >= 299) {
                console.log(">>>> THERE WAS AN ERROR!")
                console.log("status code: " + response.statusCode)
                console.log(str)
                callback("error: " + JSON.stringify(jiraToClone), null);
            } else {
                console.log(">>>>> NEW JIRA reply")
                console.log(str)
                console.log(">>>>> End new JIRA reply")
                var reply = {};
                try {
                     reply = JSON.parse(str);
                     newJiraJson.self = reply.self;
                     newJiraJson.key = reply.key;
                     newJiraJson.id = reply.id;
                     var newJiraJsonString = JSON.stringify(newJiraJson);
                     // console.log("Writing new JIRA to file: " + newJiraJson.key)
                     // fs.writeFileSync('./output/' + newJiraJson.key + ".json", newJiraJsonString)
                } catch(exc) {
                    console.log(exc)
                }
                if (jiraToClone.fields.subtasks) {
                   fetchSubtasks(jiraTool, user, jiraToClone, function(err, subtasks){
                       if (subtasks) {
                           createJiraSubtasks(jiraTool, user, newJiraJson, subtasks, function(err, newSubtasks) {
                               // if (newSubtasks) {
                               //     for (var i = 0; i < newSubtasks.length; i++) {
                               //         var newSubtask = newSubtasks[i]
                               //         var newSubtaskString = JSON.stringify(newSubtask)
                               //         console.log("Writing new subtask to file: " + newSubtask.key)
                               //         fs.writeFileSync('./output/' + newSubtask.key + ".json", newSubtaskString)
                               //     }
                               // }
                               callback(err, newJiraJson)
                           })
                       } else {
                           callback(err, newJiraJson)
                       }
                   });
                } else {
                    callback(null, newJiraJson)
                }
            }
        });

    })
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

function postJiraRestCall(username, encryptedPassword, endpoint, body, passedInCallback) {
    console.log("Post JIRA Rest Call!!!")

    // if (true) {
    //     var response = {}
    //     response.statusCode = 200;
    //     passedInCallback(response, '{"id":"1843432","key":"EXP-15703","self":"https://jira.concur.com/jira/rest/api/2/issue/1843432"}');
    //     return;
    // }

    var password = encryptDecrypt.decrypt(encryptedPassword)

    var auth = 'Basic ' + new Buffer(username + ':' + password).toString('base64');
    console.log(auth)
    var headers = {'Authorization': auth,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Content-Length": body.length
    };
    var options = {
        host: host,
        path: endpoint,
        headers: headers,
        method: 'POST'
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

    var postReq = http.request(options, callback);
    console.log(">>>> writing body!: " + body)
    postReq.write(body);
    postReq.end();


}
