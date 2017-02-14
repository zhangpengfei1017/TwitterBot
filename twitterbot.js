// Some necessary lib
var Twit = require('twit');
var fs = require('fs');

// Read some files to initialize data
var eventsfile = '\events.json';
var configfile = '\config.json';
var usersfile = '\signedusers.json';
var logfile = '\log.txt';
var events = JSON.parse(fs.readFileSync(eventsfile));
var config = JSON.parse(fs.readFileSync(configfile));
var signUpUser = JSON.parse(fs.readFileSync(usersfile));
fs.writeFileSync(logfile, '');

// Initialize twitter connection
var T = new Twit({
    consumer_key: config.consumer_key,
    consumer_secret: config.consumer_secret,
    access_token: config.access_token,
    access_token_secret: config.access_token_secret
});
var selfid = config.access_token.match(/([0-9]+)/)[0];
var stream = T.stream('user');

// This is a twitter streaming API. Emitted when someone DMs you
stream.on('direct_message', function (msg) {
    if (msg.direct_message.sender.id_str !== selfid) {
        var message = msg.direct_message.text;

        // Here is a regular expression which is used to check whether the user sent correct sign up message.
        var regExp = /sign up, start:[0-9][0-9] [0-9][0-9] [0-9][0-9][0-9][0-9] [0-9][0-9]:[0-9][0-9], end:[0-9][0-9] [0-9][0-9] [0-9][0-9][0-9][0-9] [0-9][0-9]:[0-9][0-9]/;
        if (regExp.test(message)) {

            // Check has the user already signed up
            var isSigned = false;
            for (i = 0; i < signUpUser.length; i++) {
                if (msg.direct_message.sender.screen_name == signUpUser[i].name) {
                    isSigned = true;
                    break;
                }
            }
            if (isSigned) {
                DM('You have already signed up! Please do not sign up twice!', msg.direct_message.sender.screen_name);
            } else {

                // If the user hasn't signed up, parse his message and store it in array signUpUser.
                var sM = parseInt(message.substr(15, 2));
                var sD = parseInt(message.substr(18, 2));
                var sY = parseInt(message.substr(21, 4));
                var sHH = parseInt(message.substr(26, 2));
                var sMM = parseInt(message.substr(29, 2));
                var startTime = new Date(sY, sM - 1, sD, sHH, sMM);
                var eM = parseInt(message.substr(37, 2));
                var eD = parseInt(message.substr(40, 2));
                var eY = parseInt(message.substr(43, 4));
                var eHH = parseInt(message.substr(48, 2));
                var eMM = parseInt(message.substr(51, 2));
                var endTime = new Date(eY, eM - 1, eD, eHH, eMM);
                signUpUser.push({ "name": msg.direct_message.sender.screen_name, "startTime": startTime, "endTime": endTime });
                Log("User " + msg.direct_message.sender.screen_name + " signed up");
                SaveUserData();
                DM('Sign up successfully!', msg.direct_message.sender.screen_name);
            }
        } else {

            // Make a response when the user sent unrelevant message
            DM('Unknown request. Please excaltly follow the format!', msg.direct_message.sender.screen_name);
        }
    }
})

// Emitted when someone follows you
stream.on('follow', function (msg) {
    if (msg.target.id_str == selfid) {
        Log(msg.source.screen_name + ' followed me');
        T.post('friendships/create', { user_id: msg.source.id_str }, function (err, reply) {
            if (err) Log(err);
            else Log('followed ' + msg.source.screen_name);
        })

        // Send first DM to the new follower
        DM('Welcome to use this bot! If you want to sign up please follow this format:sign up, start:02 13 2017 18:00, end:02 15 2017 21:00', msg.source.screen_name);
    }
})

// A function which can be used to send direct message
function DM(text, screen_name) {
    T.post('direct_messages/new', { text: text, screen_name: screen_name }, function (err, reply) {
        if (err) Log(err);
        else Log('Sent direct message to '+screen_name+' successfully');
    })
}

// A function which can be used to tweet new twitter (We didn't use this function)
function Tweet(content) {
    T.post('statuses/update', { status: content }, function (err, reply) {
        if (err)
            Log("error: " + err);
        else
            Log("reply: " + reply);
    });
}

// A function used to calculate how many minutes is different between two dates.
function GetTimeDifference(time1, time2) {
    return parseInt(time1 / 60000) - parseInt(time2 / 60000);
}

// A function which saves the information of signed up users from memory to a JSON file (allusers.json)
// In case of the situation that the server crashes then we lose all user data
function SaveUserData() {
    fs.writeFileSync(usersfile, JSON.stringify(signUpUser));
    Log("Saved user data");
}

// Log something on console and save it in log file
function Log(content) {
    var now = new Date(Date.now());
    var time_str = "["+(now.getMonth()+1).toString() + "/" + now.getDate().toString() +"/"+ now.getFullYear().toString() + " " + now.getHours().toString() + ":" + now.getMinutes().toString() + ":" + now.getSeconds().toString() + "] ";
    console.log(time_str+content);
    fs.appendFileSync(logfile, time_str+content + '\r\n');
}

// Set up a time-based loop which runs every minute
setInterval(function () {
    try {
        var now = new Date(Date.now());

        // Loop through every signed up user
        for (i = 0; i < signUpUser.length; i++) {
            var user = signUpUser[i];
            var timeFromStart = GetTimeDifference(Date.now(), user.startTime);
            var timeToEnd = GetTimeDifference(user.endTime, Date.now());
            var timePassedPercent = parseInt((timeFromStart / GetTimeDifference(user.endTime, user.startTime)) * 100);

            // Loop through every event in the json file and check whether the user trigger the event. If yes, send him the pre-scripted message
            for (j = 0; j < events.length; j++) {
                var type = events[j].eventTime.substr(0, 1);
                if (type == "+") {
                    var eTime = parseInt(events[j].eventTime.substr(1, 2)) * 60 + parseInt(events[j].eventTime.substr(4, 2));
                    if (eTime == timeFromStart) {
                        Log("User " + user.name + " triggered event " + events[j].eventName);
                        DM(events[j].message, user.name);
                    }
                } else if (type == "-") {
                    var eTime = parseInt(events[j].eventTime.substr(1, 2)) * 60 + parseInt(events[j].eventTime.substr(4, 2));
                    if (eTime == timeToEnd) {
                        Log("User " + user.name + " triggered event " + events[j].eventName);
                        DM(events[j].message, user.name);
                        if (events[j].eventName == "end") {
                            signUpUser.splice(i, 1);
                            SaveUserData();
                            i--;
                            break;
                        }
                    }
                } else if (type == "%") {
                    var eTime = parseInt(events[j].eventTime.substr(1, 2));
                    if (eTime == timePassedPercent) {
                        Log("User " + user.name + " triggered event " + events[j].eventName);
                        DM(events[j].message, user.name);
                    }
                }
            }
        }
    }
    catch (e) {
        Log(e);
    }
}, 60000);
