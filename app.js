const express = require('express');
//const expressLayouts = require('express-ejs-layouts');
const mongoose = require('mongoose');
const flash = require('connect-flash');
const session = require('express-session');
const passport = require('passport');
const user = require('./models/user');
const service = require('./models/service');
const waterfall = require('async-waterfall');
const path = require('path')
const LocalStrategy = require('passport-local');
const bodyParser = require('body-parser');
const app = express();

//DB config
mongoose.connect('mongodb://127.0.0.1/servicespace', { useNewUrlParser: true, useUnifiedTopology: true, useCreateIndex: true, useFindAndModify: false });

//EJS
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'))

//BodyParser
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ 'extended': true }));


//Express Session middleware
app.use(session({
    secret: 'ServiceSpace',
    resave: true,
    saveUninitialized: true,
    cookie: {
        maxAge: 1000 * 3600 * 12        // 12 Hours
    }
}));

app.use(passport.initialize());
app.use(passport.session());

// connect flash middleware
app.use(flash());

passport.use(new LocalStrategy(user.authenticate()));
passport.serializeUser(user.serializeUser());
passport.deserializeUser(user.deserializeUser());


/*------------------------ Authentication Middleware -----------------------*/

function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    req.flash('warning', 'Please log in first');
    res.redirect('/signin');
}

function isNotLoggedIn(req, res, next) {
    if (!req.isAuthenticated()) {
        return next();
    }
    req.flash('warning', 'You are Logged In');
    res.redirect('/profile');
}

/*-------------------------------------------------------------------------*/

// GLOBAL VARS APP SCOPE
app.use((req, res, next) => {
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    res.locals.warning = req.flash('warning');
    res.locals.info = req.flash('info');
    next();
});

// GLOBAL VARS LOCAL SCOPE
const UTYPE = {
    SERVICE_PROVIDER: 'Service Provider',
    CUSTOMER: 'Customer'
}

/*---------------------------------- Website Routes ----------------------------*/

app.get('/', (req, res) => {
    console.log('Welcome')
    res.render('home', { user: req.user, iLog: req.isAuthenticated() })
});

app.get('/signin', isNotLoggedIn, (req, res) => {
    res.set('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
    res.render('signin', { user: req.user, iLog: req.isAuthenticated() })
    //res.render('login', {default: 'login'});
});

app.get('/profile', isLoggedIn, (req, res) => {
    res.set('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
    res.render('profile', { user: req.user, iLog: req.isAuthenticated() })
    // res.send(`<h1>Welcome ${req.user.name}</h1><hr><br>
    // <p>User Object retrieved from session : ${req.user}<br><br>
    // <a href='/logout'>Logout</a></p>`)
})

app.post('/login', isNotLoggedIn, passport.authenticate('local', {
    successRedirect: '/profile',
    failureRedirect: '/signin',
    successFlash: true,
    failureFlash: true
}), (req, res) => {
    console.log(req.user)
    req.flash('success', `Logged In. Welcome ${req.user.name}!`);
});

//Logout handle
app.get('/logout', isLoggedIn, (req, res) => {
    req.logout();
    req.flash('info', 'You are logged out');
    res.redirect('/signin');
});

/*-------------------------------- Stateless Routes -----------------------------*/


app.post('/signup', (req, res) => {

    console.log('Received request')
    console.log(req.body)

    user.register(new user({
        username: req.body.username,
        name: req.body.name,
        dob: req.body.dob,
        utype: req.body.utype,
        spdetails: (req.body.utype === UTYPE.CUSTOMER) ? {} : {
            services: [],
            phone: req.body.phone,
            email: req.body.email
        }
    }),
        req.body.password,
        (err, user) => {
            if (err) {
                console.log(err)
                req.flash('error', `Could not create account: ${err.message}`);
                res.redirect('/signin');
                return;
            }
            else {
                console.log('Created User', user)
                passport.authenticate('local')(req, res, function () {
                    req.flash('success', `Account Created. Welcome ${req.user.name}!`);
                    res.redirect('/profile');
                });
            };
        });
});

app.post('/createservice', (req, res) => {

    console.log(req.body)

    // If stateless call (no session)
    if (!req.user) {
        req.user = req.body.user
    }

    const createService = [
        function verifyUserIsServiceProvider(cb) {
            if (req.user.utype === UTYPE.SERVICE_PROVIDER) {
                console.log('User is service Provider')
                cb(null);
            }
            else {
                // err: true  (String evaluates to true)
                cb('User is not a Service Provider')
            }
        },
        function createNewService(cb) {
            console.log('In create service');
            let service_obj = new service({
                name: req.body.name,
                desc: req.body.desc,
                fee: req.body.fee,
                fee_t: req.body.fee_t,
                ratings: [],
                avg_rating: 0,
                sp_name: req.user.name
            });
            return cb(null, service_obj);
        },
        function addServiceToDB(service_obj, cb) {
            console.log('Saving service');
            service_obj.save((err, created_service) => {
                if (err) {
                    console.log(err);
                    cb('Error while creating service')
                }
                else {
                    console.log('Created Service');
                    cb(null, created_service)
                }
            });
        },
        function linkServiceToServiceProvider(created_service, cb) {
            console.log('Linking Service to SP');
            user.findOneAndUpdate({ '_id': req.user._id }, { $addToSet: { 'spdetails.services': created_service._id } }, function (err, user) {
                if (err) {
                    console.log(err);
                    cb('Could not add service')
                }
                else {
                    console.log('Added Service to List');
                    cb(null, created_service)
                }
            });
        }
    ];

    waterfall(createService, function (err, created_service) {
        if (err) {
            req.flash('error', err);
            console.log('Error in waterfall', err);
            res.json({ 'error': true, 'message': err })
            return;
        }
        req.flash('info', 'Added Service successfully');
        console.log('Success :', 'Added Service successfully');
        res.json({ 'error': false, 'message': created_service })
        return;
    });

});


const PORT = 3000;

app.listen(PORT, console.log(`Server started on ${PORT}`));
