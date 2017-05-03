/**
 * Created by rstruthers on 5/2/17.
 */

function Sprint(id, name, startDate, endDate, completeDate, worklogDevEntries) {
    this.id = id;
    this.name = name;
    this.startDate = startDate;
    this.endDate = endDate;
    this.completeDate = completeDate
    this.worklogDevEntries = worklogDevEntries;
}

module.exports = Sprint;
