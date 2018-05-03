var express = require('express');
var passport = require('passport');
var Strategy = require('passport-twitter').Strategy;
var MongoClient = require("mongodb").MongoClient;
var OAuth= require('oauth').OAuth;
var oa;
passport.use(new Strategy({
    consumerKey: process.env.CONSUMER_KEY,
    consumerSecret: process.env.CONSUMER_SECRET,
    callbackURL: 'https://voting-application-fcc.glitch.me/login/twitter/return'
  },
  function(token, tokenSecret, profile, cb) {
    
    return cb(null, profile);
  }));

passport.serializeUser(function(user, cb) {
  cb(null, user);
});

passport.deserializeUser(function(obj, cb) {
  cb(null, obj);
});


// Create a new Express application.
var app = express();

// Configure view engine to render EJS templates.
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

// Use application-level middleware for common functionality, including
// logging, parsing, and session handling.
app.use(require('morgan')('combined')); 
app.use(require('cookie-parser')());
app.use(require('body-parser').urlencoded({ extended: true }));
app.use(require('express-session')({ secret: 'keyboard cat', resave: true, saveUninitialized: true, cookie: { maxAge: 60000000 } }));

// Initialize Passport and restore authentication state, if any, from the
// session.
app.use(passport.initialize());
app.use(passport.session());


// Define routes.
app.get('/',
  function(req, res) 
  {
    res.redirect("/AllPolls");
    //res.render('index', { user: req.user , success: null, data:null, error:false});
  });

app.get('/login',
  function(req, res){
    res.redirect('/login/twitter');
  });

app.get('/login/twitter',
  passport.authenticate('twitter'));

app.get('/login/twitter/return', 
  passport.authenticate('twitter', { failureRedirect: '/' }),
  function(req, res) {
    res.redirect('/');
  });

app.get('/profile',
  require('connect-ensure-login').ensureLoggedIn(),
  function(req, res){   
    res.render('index', { user: req.user.displayName });
  });

app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

app.post("/CreatePoll",function(request, response)
{
  var Poll = {
    userId:"",
    displayName:"",
    pollId:"",
    pollName:"",
    pollMembers:[], 
    votes:[],
    netVotes:0,
    voterList:[]
  };
  Poll.userId = request.user.id;
  Poll.displayName = request.user.displayName;
  Poll.pollName = request.body.pollname;
  Poll.pollMembers = request.body.competitor.split("\r\n");
  Poll.pollId = generateID(12);
  for(let i=0;i<Poll.pollMembers.length;i++)
  {
    //Keeping this stuff static as of now
    Poll.votes.push(0);
  }
  if(
      Poll.userId !=null && Poll.userId!=undefined 
   && Poll.displayName !=null && Poll.displayName!=undefined 
   && Poll.pollName !=null && Poll.pollName!=undefined 
   && Poll.pollMembers !=null && Poll.pollMembers!=undefined 
   && Poll.pollId !=null && Poll.pollId!=undefined 
    )
  {
    insertPromisedNewRecordInDB(Poll).then(function (fulfilled) 
    {
      getUserPolls(request.user.Id).then(function (fulfilledData) 
      {
        response.render('index', { user: request.user , success: "yes", error:false, data:fulfilledData, message:"Successfully created a new Poll!!"});
      }, function (error) 
      {
        response.render('index', { user: request.user , success: "no", data:fulfilled, error:true, message:"Oops! Could not create a new Poll!"});
      });
    }, function (error) 
    {
      response.render('index', { user: request.user , success: "no", error:false,data:null,message:"Could not create a new Poll!"});
    });
  }
});

app.get("/UserPolls", function(request, response)
{
    getUserPolls(request.user.Id).then(function (fulfilled) 
    {
      response.render('index', { user: request.user , success: null, data:fulfilled, error:false});
    }, function (error) 
    {
      response.render('index', { user: request.user , success: null, data:null, error:true});
    });
});

app.get("/Tweet", function(request, response)
{
   var consumerKey = passport._strategies.twitter._oauth._consumerKey;
   var consumerSecret = passport._strategies.twitter._oauth._consumerSecret;
   app.post
   (
    "https://api.twitter.com/1.1/statuses/update.json",consumerKey,consumerSecret, 
     { 
       "status": "Hello There" 
     }, function()
     {
       console.log("done");
     }
   );
});


app.get("/deletePoll", function(request, response)
{
    require('connect-ensure-login').ensureLoggedIn(), deletePoll(request.query.pollId).then(function (fulfilled) 
    {
      getUserPolls().then(function (fulfilledData) 
      {
        response.json({success:"Yes", message:"Successfully Deleted!"});
      }, function (error) 
      {
        response.json({success:"Yes", message:"Successfully Deleted! No polls left"});
      });
          
    }, function (error) 
    {
      getUserPolls().then(function (fulfilledData) 
      {
        response.json({success:"Yes", message:"Error! Could not delete."});
      }, function (error) 
      {
        response.json({success:"Yes", message:"Could not delete as there were no polls!"});
      });
    });
});


app.get("/AllPolls", function(request, response)
{
    getUserPolls().then(function (fulfilled) 
    {
      response.render('index', { user: request.user , success: null, data:fulfilled, error:false});
    }, function (error) 
    {
      response.render('index', { user: request.user , success: null, data:null, error:true});
    });
});

app.get("/renderPoll", function(request, response)
{
    renderPoll(request.query.pollId).then(function (fulfilled) 
    {
       response.send(fulfilled);
    }, function (error) 
    {
      response.send("Oops");
    });
});

app.post("/vote",function(request, response)
{
  var voterIp;
  require('getmac').getMac(function(err,macAddress)
  {
    if (err)  throw err;
    voterIp = macAddress;   
    //console.log(request.body);
    
    getSinglePoll(request.body.voteForId).then(function (fulfilled) 
    {
      var voteIndex = fulfilled.pollMembers.indexOf(request.body.voteMember);
      if(fulfilled.voterList.indexOf(voterIp)==-1)//
      {
        fulfilled.votes[voteIndex] = fulfilled.votes[voteIndex]+1;
        fulfilled.voterList.push(voterIp);
        updatePoll(fulfilled).then(function (fulfilledData) 
        {
          //response.json(fulfilledData);
          //var allData = getUserPolls(request.user.userId);===============================
          getUserPolls(request.user.Id).then(function (fulfilledData) 
          {
            response.render('index', { user: request.user , success: "yes", error:false,data:fulfilledData,message:"Thankyou for your vote!! you can always go to the poll and have a look at the status!!"});
          }, function (error) 
          {
            //response.render('index', { user: request.user , success: "Yes", error:false,data:fulfilledData,message:"Thankyou for your vote!! you can always go to the poll and have a look at the status!!"});
          });
          
          
        }, function (error) 
        {
          //response.json(error);
          getUserPolls(request.user.Id).then(function (fulfilledData) 
          {
            response.render('index', { user: request.user , success: "no", error:false,data:fulfilledData,message:"You cannot revote with the same account on the same poll!"});
          }, function (error) 
          {
            //response.render('index', { user: request.user , success: "Yes", error:false,data:fulfilledData,message:"Thankyou for your vote!! you can always go to the poll and have a look at the status!!"});
          });
          
        });
      }
      else
      {
        
        getUserPolls(request.user.Id).then(function (fulfilledData) 
        {
             response.render('index', { user: request.user , success: "no", error:false,data:fulfilledData,message:"You cannot revote with the same account on the same poll!"});
        }, function (error) 
        {
            //response.render('index', { user: request.user , success: "Yes", error:false,data:fulfilledData,message:"Thankyou for your vote!! you can always go to the poll and have a look at the status!!"});
        });
        //response.json({Error:"You cannot revote with the same account on the same poll!"});
      }
    }, function (error) 
    {
        getUserPolls(request.user.Id).then(function (fulfilledData) 
        {
            response.render('index', { user: request.user , success: "no", error:false,data:fulfilledData,message:"You cannot revote with the same account on the same poll!"});
        }, function (error) 
        {
            //response.render('index', { user: request.user , success: "Yes", error:false,data:fulfilledData,message:"Thankyou for your vote!! you can always go to the poll and have a look at the status!!"});
        });
        
       //response.json({Error:"You cannot revote with the same account on the same poll!"});
    });
    
  });
  ;
});

app.listen(8000);

//Inserting a new Poll into the database
function insertPromisedNewRecordInDB(newRecord)
{
  return new Promise(
      function(resolve, reject)
      {
            MongoClient.connect(process.env.MONGODB_URL,function(error, database)
            {
              if(error) throw error;
              else
              {
                var databaseObject = database.db("fcc_node_challenge_one");
                databaseObject.collection("VotingApplication").insertOne(newRecord, function(err, result)
                {
                  if(err) reject(err);
                  else
                  {
                    database.close();
                    resolve(newRecord);
                  }
                });
              }
            });
      }
    );
}


//Get A User's Polls
function getUserPolls(userId)
{
  return new Promise(
      function(resolve, reject)
      {
            MongoClient.connect(process.env.MONGODB_URL,function(error, database)
            {
              if(error) throw error;
              else
              {
                var databaseObject = database.db("fcc_node_challenge_one");
                if(userId!=undefined && userId!=null && userId!="")
                {
                    databaseObject.collection("VotingApplication").find({}, {userId: userId }).toArray(function(err, result) {
                    if(err) reject(err);
                    else
                    {
                      database.close();
                      resolve(result);
                    }
                  });
                }
                else
                {
                    databaseObject.collection("VotingApplication").find({}).toArray(function(err, result) {
                    if(err) reject(err);
                    else
                    {
                      database.close();
                      resolve(result);
                    }
                  });
                }
              }
            });
      }
    );
}

//Get One  Single Poll
function getSinglePoll(pollId)
{
  return new Promise(
      function(resolve, reject)
      {
            MongoClient.connect(process.env.MONGODB_URL,function(error, database)
            {
              if(error) throw error;
              else
              {
                var databaseObject = database.db("fcc_node_challenge_one");
                databaseObject.collection("VotingApplication").findOne({pollId:pollId}, function(err, result) {
                  if(err) reject(err);
                  else
                  {
                    database.close();
                    resolve(result);
                  }
                });
              }
            });
      }
    );
}

//Update poll by voting
function updatePoll(data)
{
   return new Promise(
      function(resolve, reject)
      {
            MongoClient.connect(process.env.MONGODB_URL,function(error, database)
            {
              if(error) throw error;
              else
              {
                var databaseObject = database.db("fcc_node_challenge_one");
                var newvalues = { $set: { votes: data.votes, voterList: data.voterList } };
                databaseObject.collection("VotingApplication").updateOne({pollId:data.pollId}, newvalues, function(error, result) {
                  if(error) reject(error);
                  else
                  {
                    database.close();
                    resolve(result);
                  }
                });
              }
            });
      }
    );
}

//Get All User Polls
function getAllPolls()
{
  return new Promise(
      function(resolve, reject)
      {
            MongoClient.connect(process.env.MONGODB_URL,function(error, database)
            {
              if(error) throw error;
              else
              {
                var databaseObject = database.db("fcc_node_challenge_one");
                databaseObject.collection("VotingApplication").find({}).toArray(function(err, result) {
                  if(err) reject(err);
                  else
                  {
                    database.close();
                    resolve(result);
                  }
                });
              }
            });
      }
    );
}

function deletePoll(pollId)
{
  return new Promise(
      function(resolve, reject)
      {
            MongoClient.connect(process.env.MONGODB_URL,function(error, database)
            {
              if(error) throw error;
              else
              {
                var databaseObject = database.db("fcc_node_challenge_one");
                databaseObject.collection("VotingApplication").deleteOne({pollId: pollId}, function(err, result)
                {
                  if(err) reject(err);
                  else
                  {
                    database.close();
                    resolve(result);
                  }
                });
              }
            });
      }
    );
}

function renderPoll(pollId)
{
  return new Promise(
      function(resolve, reject)
      {
            MongoClient.connect(process.env.MONGODB_URL,function(error, database)
            {
              if(error) throw error;
              else
              {
                console.log(pollId);
                var databaseObject = database.db("fcc_node_challenge_one");
                databaseObject.collection("VotingApplication").findOne({pollId: pollId}, function(err, result)
                {
                  if(err) reject(err);
                  else
                  {
                    database.close();
                    resolve(result);
                  }
                });
              }
            });
      }
    );
}

function generateID(length) 
{
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for(let i = 0; i < length; i++)  
    {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}