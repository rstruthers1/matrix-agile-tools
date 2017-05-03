var express = require('express');
var router = express.Router();
var JiraTool = require('./../app/JiraTool')
var jiraTool = new JiraTool()
var DevWorklogOneDay = require('./../app/models/DevWorklogOneDay')


module.exports = function (app, passport) {
  /* GET home page. */
  app.get('/', function(req, res) {
    var message = '';
    var loginMessage = req.flash('message');
    if (loginMessage) {
      message = loginMessage;
    }

    res.render('index', { title: 'Jira Reporting Tool', message: message});
  });

  app.post('/login', function (req, res, next) {
    passport.authenticate('local-login', function (err, user, info) {
      req.flash("username", null);
      req.flash("username", req.body.username);
      if (err) {
        req.flash("message", err)
        return res.redirect('/' );
      }
      if (!user) {
        return res.redirect('/' );
      }
      req.logIn(user, function (err) {
        if (err) {
          return next(err);
        }
        return res.redirect('/');
      });
    })(req, res, next);
  });

  // =====================================
  // LOGOUT ==============================
  // =====================================
  app.get('/logout', function (req, res) {
    req.logout();
    res.redirect('/');
  });

  app.get('/sprint-worklog-assignee', function (req, res) {
    var user = req.user;
    if (user == null) {
      return res.redirect('/');
    }
    res.render('sprint-worklog-assignee', { title: 'Jira Reporting Tool'});
  });

  app.get('/your-worklog', function (req, res) {
    var user = req.user;
    if (user == null) {
      return res.redirect('/');
    }
    res.render('your-worklog', { title: 'Jira Reporting Tool'});
  });

  app.get('/all-devs-worklog', function (req, res) {
    var user = req.user;
    if (user == null) {
      return res.redirect('/');
    }
    res.render('all-devs-worklog', { title: 'Jira Reporting Tool'});
  });

  app.get('/your-daily-worklog', function (req, res) {
    var user = req.user;
    if (user == null) {
      return res.redirect('/');
    }
    res.render('your-daily-worklog', { title: 'Jira Reporting Tool'});
  });


  app.get('/overhead-by-sprint', function (req, res) {
    var user = req.user;
    if (user == null) {
      return res.redirect('/');
    }
    res.render('overhead-by-sprint', { title: 'Jira Reporting Tool'});
  });

  app.get('/clone-jira', function (req, res) {
    var user = req.user;
    if (user == null) {
      return res.redirect('/');
    }
    var message = '';
    var cloneJiraMessage = req.flash('message');
    if (cloneJiraMessage) {
      message = cloneJiraMessage;
    }
    res.render('clone-jira', { title: 'Jira Reporting Tool', message: message, newJira:{}});
  });

  app.post('/clone-jira', function (req, res) {
    var user = req.user;
    if (user == null) {
      return res.redirect('/');
    }
    var message = '';
    var cloneJiraMessage = req.flash('message');
    if (cloneJiraMessage) {
      message = cloneJiraMessage;
    }
    var jiraKey = req.body.jiraKey
    if (!jiraKey) {
      res.render('clone-jira', {title: 'Jira Reporting Tool', message: "You must enter a JIRA key"});
      return;
    }
    var summary = req.body.summary
    var jiraLabel = req.body.jiraLabel
    setTimeout(function() {
      jiraTool.cloneJira(user, jiraKey, summary, jiraLabel, function(err, newJira) {
        if (err) {
          message = err;
          try {
            var errObject = JSON.parse(err);
            if (errObject.errorMessages && errObject.errorMessages.length > 0) {
              message = "";
              for (var i = 0; i < errObject.errorMessages.length; i++) {
                message += errObject.errorMessages[i];
                if (i < errObject.errorMessages.length - 1) {
                  message += ", "
                }
              }
            }
          } catch(ex) {

          }
          res.render('clone-jira', { title: 'Jira Reporting Tool', message: message, newJira:{}});
        } else {
          console.log(">>>>>> new jira: " + newJira)

          res.render('clone-jira', {title: 'Jira Reporting Tool', message: null, newJira: newJira});
        }

      })
    }, 10000)

  });

  app.get("/sprint/board/:boardId", function(req, res, next) {
    var boardId = req.params.boardId;
    jiraTool.fetchSprints(req.user, boardId, function(err, sprints) {
      if (err) {
        console.log(error.toString());
        res.statusCode = 500;
        res.send({error_message: error.toString()});
        return;
      }
      res.statusCode = 200;
      var data = {};
      data.sprints = sprints;
      res.send(data);
    });
  });

  app.get("/sprint/board/:boardId/start/:startDateString/end/:endDateString", function(req, res, next) {
    var boardId = req.params.boardId;
    var startDateString = req.params.startDateString;
    var endDateString = req.params.endDateString;

    var startDate = new Date(startDateString)
    var endDate = new Date(endDateString)

    jiraTool.fetchSprintsInDateRange(req.user, boardId, startDate, endDate, function(err, sprints) {
      if (err) {
        console.log(error.toString());
        res.statusCode = 500;
        res.send({error_message: error.toString()});
        return;
      }
      res.statusCode = 200;
      var data = {};
      data.sprints = sprints;
      res.send(data);
    });
  });

  app.get("/work/overhead/board/:boardId/start/:startDateString/end/:endDateString", function(req, res, next) {
    var boardId = req.params.boardId;
    var startDateString = req.params.startDateString;
    var endDateString = req.params.endDateString;

    var startDate = new Date(startDateString)
    var endDate = new Date(endDateString)

    jiraTool.fetchOverheadWorkInDateRangeForBoard(req.user, boardId, startDate, endDate, function(err, sprints) {
      if (err) {
        console.log(error.toString());
        res.statusCode = 500;
        res.send({error_message: error.toString()});
        return;
      }
      res.statusCode = 200;
      var data = {};
      for (var j = 0; j < sprints.length; j++) {
        var worklogs =  sprints[j].worklogDevEntries;
        console.log(">>> sprint: " + sprints[j].name)
        for (var i = 0; i < worklogs.length; i++) {
          var worklog = worklogs[i]
          console.log(worklog.username + ", " + worklog.jiraKey + ", " + worklog.summary + ", " + worklog.comment)
        }
      }
      data.sprints = sprints;
      res.send(data);
    });
  });



  app.get("/jira/skeleton", function(req, res, next) {

    jiraTool.fetchSkeletonJiras(req.user, function(err, jiras) {
      if (err) {
        console.log(err.toString());
        res.statusCode = 500;
        res.send({error_message: err.toString()});
        return;
      }
      res.statusCode = 200;
      var data = {};
      data.jiras = jiras;

      res.send(data);
    });
  });

  function findMatchingDevWorklogOneDay(devWorklogOneDays, devWorklogOneDay) {
    var match = null;
    for (var i = 0; i < devWorklogOneDays.length; i++) {
        var tryMatch = devWorklogOneDays[i];
        var datesMatch = tryMatch.date.toDateString() === devWorklogOneDay.date.toDateString();
        if (tryMatch.username === devWorklogOneDay.username && datesMatch) {
          match = tryMatch;
          break;
        }
    }

    return match;
  }

  app.get("/sprint/:sprintId/devdayworklog", function(req, res, next) {
    var sprintId = req.params.sprintId;
    jiraTool.fetchSprintWorklogs(req.user, sprintId, function(err, worklogs) {
      if (err) {
        console.log(error.toString());
        res.statusCode = 500;
        res.send({error_message: error.toString()});
        return;
      }
      res.statusCode = 200;
      var data = {};
      var devWorklogOneDays = []
      for (var i = 0; i < worklogs.length; i++) {
        var worklog = worklogs[i];
        var devWorklogOneDay = new DevWorklogOneDay(worklog.author.key, worklog.timeSpentSeconds, new Date(worklog.created));
        var match = findMatchingDevWorklogOneDay(devWorklogOneDays, devWorklogOneDay)
        if (!match) {
          devWorklogOneDays.push(devWorklogOneDay)
        } else {
          match.seconds += devWorklogOneDay.seconds;
        }
      }
      data.worklogs = devWorklogOneDays;
      res.send(data);
    });
  });

  app.get("/sprint/:sprintId/start/:sprintStart/myworklog", function(req, res, next) {
    var sprintId = req.params.sprintId;
    var sprintStart = req.params.sprintStart;
    jiraTool.fetchSprintWorklogsForDev(req.user, sprintId, sprintStart, req.user.username, function(err, worklogs) {
      if (err) {
        console.log(error.toString());
        res.statusCode = 500;
        res.send({error_message: error.toString()});
        return;
      }
      res.statusCode = 200;
      var data = {};
      data.worklogs = worklogs;
      for (var i = 0; i < worklogs.length; i++) {
        var worklog = worklogs[i]
      }
      res.send(data);
    });
  });

  app.get("/sprint/:sprintId/start/:sprintStart/alldevsworklog", function(req, res, next) {
    var sprintId = req.params.sprintId;
    var sprintStart = req.params.sprintStart;
    jiraTool.fetchSprintWorklogsForAllDevs(req.user, sprintId, sprintStart, function(err, worklogs) {
      if (err) {
        console.log(error.toString());
        res.statusCode = 500;
        res.send({error_message: error.toString()});
        return;
      }
      res.statusCode = 200;
      var data = {};
      data.worklogs = worklogs;
      for (var i = 0; i < worklogs.length; i++) {
        var worklog = worklogs[i]
      }
      res.send(data);
    });
  });

  app.get("/jira/:key", function(req, res, next) {
    var jiraKey = req.params.key;

    jiraTool.fetchJira(req.user, jiraKey, function(err, jira) {
      if (err) {
        console.log(err.toString());
        res.statusCode = 500;
        res.send({error_message: err.toString()});
        return;
      }
      res.statusCode = 200;
      var data = {};
      data.jira = jira;

      res.send(data);
    });

  });

}
