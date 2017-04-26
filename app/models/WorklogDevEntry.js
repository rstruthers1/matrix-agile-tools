/**
 * Created by rstruthers on 4/24/17.
 */

function WorklogDevEntry(username, jiraKey, summary, seconds, created, started, comment) {

    this.username = username;
    this.jiraKey = jiraKey;
    this.summary = summary;
    this.seconds = seconds;
    this.created = created;
    this.started = started;
    this.comment = comment;
}

module.exports = WorklogDevEntry;
