const express = require('express');
const mongoose = require('mongoose');
const flash = require('connect-flash');
const session = require('express-session');
const passport = require('passport');
const user = require('./models/user');
const service = require('./models/service');
const waterfall = require('async-waterfall');
const LocalStrategy = require('passport-local');
const bodyParser = require('body-parser');
const multer = require('multer')
const { Router } = require('express');
const { imageFilter, storage } = require('./config/multer')
const upload = multer({storage: storage, fileFilter: imageFilter})
const serviceRouter = Router()
const app = express();

// DB config
mongoose.connect('mongodb://127.0.0.1/servicespace', { useNewUrlParser: true, useUnifiedTopology: true, useCreateIndex: true, useFindAndModify: false });

// EJS
app.set('view engine', 'ejs');

// Static Files
app.use(express.static(__dirname + '/public'))
app.use('/uploads', express.static(__dirname + '/uploads'))

// BodyParser
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ 'extended': true }));

// Express Session middleware
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

// Connect flash middleware
app.use(flash());

passport.use(new LocalStrategy(user.authenticate()));
passport.serializeUser(user.serializeUser());
passport.deserializeUser(user.deserializeUser());

/*------------------------------------------------------------------------------*/
/*-------------------------- Authentication Middleware -------------------------*/
/*------------------------------------------------------------------------------*/

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

/*------------------------------------------------------------------------------*/

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
const PAGE_SIZE = 4

/*------------------------------------------------------------------------------*/
/*---------------------------------- Website Routes ----------------------------*/
/*------------------------------------------------------------------------------*/

app.get('/', (req, res) => {
    console.log('Welcome')
    res.render('home', { user: req.user, iLog: req.isAuthenticated() })
});

app.get('/signin', isNotLoggedIn, (req, res) => {
    res.set('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
    res.render('signin', { user: req.user, iLog: req.isAuthenticated() })
});

app.get('/profile', isLoggedIn, (req, res) => {
    console.log(req.user)
    res.set('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
    res.render('profile', { user: req.user, user_org: req.user, iLog: req.isAuthenticated(), read_only: false })
})

app.post('/login', isNotLoggedIn, passport.authenticate('local', {
    successRedirect: '/profile',
    failureRedirect: '/signin',
    successFlash: 'Welcome Back!',
    failureFlash: true
}));

//Logout handle
app.get('/logout', isLoggedIn, (req, res) => {
    req.logout();
    req.flash('info', 'You are logged out');
    res.redirect('/signin');
});

app.get('/feed', (req, res) => {
    res.render('feed', { user: req.user, iLog: req.isAuthenticated() })
})

app.get('/search', (req, res) => {
    res.render('search', { user: req.user, iLog: req.isAuthenticated() })
})

app.get('/serviceprovider/:sp_id', (req, res) => {
    user.findById(req.params.sp_id).populate({path: 'spdetails.services', model: 'Service'}).exec((err, user_obj) => {
        if(err) {
            console.log('Error while fetching service provider details')
        } else {
            res.render('profile', { user: user_obj, user_org: req.user, iLog: req.isAuthenticated(), read_only: true })
        }
    })
})

/*-------------------------------------------------------------------------------*/
/*-------------------------------- Stateless Routes -----------------------------*/
/*-------------------------------------------------------------------------------*/

app.post('/signup', (req, res) => {

    console.log('Received request')
    console.log(req.body)

    user.register(new user({
        username: req.body.username,
        name: req.body.name,
        dob: req.body.dob,
        utype: req.body.utype,
        avatar: (req.body.avatar) ? req.body.avatar : 0,
        spdetails: (req.body.utype === UTYPE.CUSTOMER) ? {} : {
            services: [],
            phone: req.body.phone,
            email: req.body.email
        },
        watchlist: (req.body.utype === UTYPE.SERVICE_PROVIDER) ? {} : {
            services: [],
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

/*--------------------------------- Services CRUD ----------------------------*/

serviceRouter.get('/feed/:order/:page', (req, res) => {

    if (req.params.order === 'personalized') {
        // Call ML API to get data
        res.json({'error': true, 'message': 'API not yet implemented'})
    } else {      
        // If order is 'highestRated', sort by avg_rating, else sort by watchlisted (trending)  
        let field = (req.params.order === 'highestRated') ? 'avg_rating' : 'watchlisted';
        service.find( { $or: [ { avg_rating: { $gte: 2 } }, { 'ratings.2': { $exists: false } } ] } )
        .sort( { [field]: -1 } ).skip((req.params.page - 1) * PAGE_SIZE).limit(PAGE_SIZE)
        .populate({path: 'provider', model: 'User'}).exec((err, services) => {
            if(err) {
                res.json({'error': true, 'message': err.message})
            } else {
                res.json({'error': false, 'message': services})
            }
        })
    }
})

serviceRouter.get('/search/:key', (req, res) => { 

    console.log('Search for', req.params.key)

    service.find(
        { $text : { $search : req.params.key } }, 
        { score : { $meta: "textScore" } }
    )
    .sort({ score : { $meta : 'textScore' } })
    .populate({path: 'provider', model: 'User'}).exec((err, services) => {
        if(err) {
            res.json({'error': true, 'message': err.message})
        } else {
            res.json({'error': false, 'message': services})
        }
    })
        
})

serviceRouter.post('/create', upload.single('serviceImg'), (req, res) => {

    console.log(req.body)
    console.log(req.file)

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
                image: (req.file) ? req.file.path : 'uploads/default.png',
                fee: req.body.fee,
                fee_t: req.body.fee_t,
                ratings: [],
                avg_rating: 0,
                watchlisted: 0,
                provider: req.user._id
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
                    console.log('Created Service', created_service);
                    cb(null, created_service)
                }
            });
        },
        function linkServiceToServiceProvider(created_service, cb) {
            console.log('Linking Service to SP');
            user.findByIdAndUpdate(req.user._id, 
            { $addToSet: { 'spdetails.services': created_service._id} }, { new: true })
            .populate({path: 'spdetails.services', model: 'Service', populate: {path: 'provider', model: 'User'}}).exec((err, user_obj) => {
                if (err) {
                    console.log(err);
                    cb('Could not add service')
                }
                else {
                    console.log('Added Service to List', user_obj);
                    cb(null, user_obj.spdetails.services)
                }
            });
        }
    ];

    waterfall(createService, function (err, services) {
        if (err) {
            console.log('Error in waterfall:', err);
            res.json({ 'error': true, 'message': err })
            return;
        }
        console.log('Success :', 'Added Service successfully');
        res.json({ 'error': false, 'message': services })
        return;
    });

});

serviceRouter.delete('/remove', (req, res) => {

    console.log(req.body)

    // If stateless call (no session)
    if (!req.user) {
        req.user = req.body.user
    }

    const deleteService = [
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
        function removeFromWatchlists(cb) {
            user.aggregate([
                { 
                    $addFields: {
                        'watchlist.services': { 
                            $filter: {
                                input: "$watchlist.services",
                                as: "service",
                                cond: { $ne: ["$$service", mongoose.Types.ObjectId(req.body.service_id)] }
                            } 
                        }
                    } 
                },
                { 
                    $out: { db: "servicespace", coll: "users" } 
                }
            ]).exec((err, users) => {
                if (err) {
                    console.log(err)
                    cb(err.message)
                } else {
                    user.updateMany({ utype: UTYPE.SERVICE_PROVIDER }, { $unset: {'watchlist': ""}}, (err, users) => {
                        if (err) {
                            console.log(err)
                            cb(err.message)
                        } else {
                            console.log('Removed Service from watchlists successfully')
                            cb(null)
                        }
                    })
                }
            })
        },
        function removeFromServiceProvider(cb) {
            user.findByIdAndUpdate(req.user._id, 
            { $pull: { 'spdetails.services': mongoose.Types.ObjectId(req.body.service_id)} }, { new: true })
            .populate({path: 'spdetails.services', model: 'Service', populate: {path: 'provider', model: 'User'}}).exec((err, user_obj) => {
                if (err) {
                    console.log(err);
                    cb(err.message)
                }
                else {
                    console.log('Removed Service from List', user_obj);
                    cb(null, user_obj.spdetails.services)
                }
            });
        },
        function removeFromServiceDb(services, cb) {
            console.log('In remove service');
            service.deleteOne({'_id': req.body.service_id}, (err, del_service) => {
                if(err) {
                    console.log("Error",err)
                    cb(err.message)
                } else {
                    console.log("Deleted Service", del_service)
                    cb(null, services)
                }
            })
        }
    ];

    waterfall(deleteService, function (err, services) {
        if (err) {
            console.log('Error in waterfall:', err);
            res.json({ 'error': true, 'message': err })
            return;
        }
        console.log('Success :', 'Removed Service successfully');
        res.json({ 'error': false, 'message': services })
        return;
    });

});

serviceRouter.put('/rate', (req, res) => {

    console.log(req.body)

    // If stateless call (no session)
    if (!req.user) {
        req.user = req.body.user
    }

    const addRating = [
        function verifyUserIsCustomer(cb) {
            if (req.user.utype === UTYPE.CUSTOMER) {
                console.log('User is Customer')
                cb(null);
            }
            else {
                // err: true  (String evaluates to true)
                cb('Only customers can rate services')
            }
        },
        function checkIfAlreadyRated(cb) {
            service.find({_id: req.body.service_id, 'ratings.userid': req.user._id}).countDocuments((err, count) => {
                    if (err) {
                        console.log(err);
                        cb(err.message)
                    }
                    else {
                        console.log(count)
                        if(count === 1) {
                            cb('User has already rated this service')
                        } else {
                            cb(null)
                        }
                    }
                });
        },
        function addRatingInArray(cb) {
            service.findByIdAndUpdate(req.body.service_id, 
                { $addToSet: { 'ratings': {userid:  req.user._id, rating: req.body.rating}} }, { new: true }, (err, service_obj) => {
                    if (err) {
                        console.log(err);
                        cb(err.message)
                    }
                    else {
                        let no_of_ratings = service_obj.ratings.length
                        service_obj.avg_rating = (no_of_ratings === 0) ? 0 : service_obj.ratings.reduce((total, next) => total + next.rating, 0) / no_of_ratings
                        // req.body.rating = parseInt(req.body.rating)
                        // service_obj.avg_rating = (service_obj.avg_rating * (no_of_ratings - 1) + req.body.rating) / no_of_ratings
                        
                        console.log(`Rating of ${req.body.rating} added to service: ${service_obj.name}`);
                        console.log(`Average rating: ${service_obj.avg_rating}`)

                        service_obj.save((err, service_obj) => {
                            if(err) {
                                console.log(err);
                                cb(err.message)
                            } else {
                                console.log('Updated average rating successfully')
                                cb(null, service_obj.avg_rating)
                            }
                        })
                    }
                });
        }
    ];

    waterfall(addRating, function (err, avg_rating) {
        if (err) {
            console.log('Error in waterfall:', err);
            res.json({ 'error': true, 'message': err })
            return;
        }
        console.log('Success :', 'Added Rating successfully');
        res.json({ 'error': false, 'message': avg_rating })
        return;
    });
})

serviceRouter.delete('/rate', (req, res) => {

    console.log(req.body)

    // If stateless call (no session)
    if (!req.user) {
        req.user = req.body.user
    }

    const removeRating = [
        function verifyUserIsCustomer(cb) {
            if (req.user.utype === UTYPE.CUSTOMER) {
                console.log('User is Customer')
                cb(null);
            }
            else {
                // err: true  (String evaluates to true)
                cb('Only customers can rate services')
            }
        },
        function checkIfAlreadyRated(cb) {
            service.find({_id: req.body.service_id, 'ratings.userid': req.user._id}).countDocuments((err, count) => {
                    if (err) {
                        console.log(err);
                        cb(err.message)
                    }
                    else {
                        console.log(count)
                        if(count === 0) {
                            cb('User has not rated this service')
                        } else {
                            cb(null)
                        }
                    }
                });
        },
        function removeRatingFromArray(cb) {
            service.findByIdAndUpdate(req.body.service_id, 
                { $pull: { 'ratings': {userid:  mongoose.Types.ObjectId(req.user._id)}} }, { new: true }, (err, service_obj) => {
                    if (err) {
                        console.log(err);
                        cb(err.message)
                    }
                    else {
                        let no_of_ratings = service_obj.ratings.length
                        service_obj.avg_rating = (no_of_ratings === 0) ? 0 : service_obj.ratings.reduce((total, next) => total + next.rating, 0) / no_of_ratings
                        console.log(`New Average Rating: ${service_obj.avg_rating}`)

                        service_obj.save((err, service_obj) => {
                            if(err) {
                                console.log(err);
                                cb(err.message)
                            } else {
                                console.log('Updated average rating successfully')
                                cb(null, service_obj.avg_rating)
                            }
                        })
                    }
                });
        }
    ];

    waterfall(removeRating, function (err, avg_rating) {
        if (err) {
            console.log('Error in waterfall:', err);
            res.json({ 'error': true, 'message': err })
            return;
        }
        console.log('Success :', 'Removed Rating successfully');
        res.json({ 'error': false, 'message': avg_rating })
        return;
    });
})

serviceRouter.get('/rating/:service_id/:user_id', (req, res) => {

    service.findOne({_id: req.params.service_id, 'ratings.userid': req.params.user_id}, (err, service_obj) => {
        if(err) {
            console.log(err.message)
            res.json({"error": true, "message": err.message})
        } else {
            if(!service_obj) {
                res.json({"error": true, "message": 'User has not rated this service'})
            } else {
                console.log('User has rated this service')
                res.json({"error": false, "message": service_obj.ratings.find(rating => rating.userid == req.params.user_id).rating})
            }
        }
    })
});

serviceRouter.get('/getservices/:user_id', (req, res) => {

    // fetches services offered for Service Providers and watchlisted services for Customers (According to user type)

    user.findById(req.params.user_id)
    .populate({path: 'spdetails.services', model: 'Service', populate: {path: 'provider', model: 'User'}})
    .populate({path: 'watchlist.services', model: 'Service', populate: {path: 'provider', model: 'User'}})
        .exec((err, user_obj) => {
            if(err) {
                console.log(err)
                res.json({'error': true, 'message': err.message})
            } else {
                if(user_obj.utype === UTYPE.SERVICE_PROVIDER) {
                    res.json({'error': false, 'message': user_obj.spdetails.services})
                } else {
                    res.json({ 'error': false, 'message': user_obj.watchlist.services })
                }
            }
        });
});

/*------------------------------- Watchlist -----------------------------*/

serviceRouter.put('/addtowl', (req, res) => {

    console.log(req.body)

    // If stateless call (no session)
    if (!req.user) {
        req.user = req.body.user
    }

    const addToWatchList = [
        function verifyUserIsCustomer(cb) {
            if (req.user.utype === UTYPE.CUSTOMER) {
                console.log('User is Customer')
                cb(null);
            }
            else {
                // err: true  (String evaluates to true)
                cb('User is not a Customer')
            }
        },
        function addServiceToWatchList(cb) {
            user.findByIdAndUpdate(req.user._id, 
                { $addToSet: { 'watchlist.services': mongoose.Types.ObjectId(req.body.service_id)} }, {new: true},
                (err, user_obj) => {
                if (err) {
                    console.log(err);
                    cb(err.message)
                }
                else {
                    console.log('Added Service to Watchlist', user_obj.watchlist.services);
                    req.user.watchlist = user_obj.watchlist
                    cb(null, 'Added Service to Watchlist')
                }
            });
        },
        function incrementWatchlistedCount(message, cb) {
            service.findByIdAndUpdate(req.body.service_id, { $inc: { 'watchlisted': 1 } }, {new: true}, (err, inc_service) => {
                if(err) {
                    console.log("Error",err)
                    cb(err.message)
                } else {
                    console.log(`Watchlisted service: ${inc_service.name}`)
                    cb(null, message)
                }
            })
        }
    ];

    waterfall(addToWatchList, function (err, message) {
        if (err) {
            console.log('Error in waterfall:', err);
            res.json({ 'error': true, 'message': err })
            return;
        }
        console.log('Success :', 'Added Service to watchlist successfully');
        res.json({ 'error': false, 'message': message })
        return;
    });
});

serviceRouter.delete('/removefromwl', (req, res) => {

    console.log(req.body)

    // If stateless call (no session)
    if (!req.user) {
        req.user = req.body.user
    }

    const addToWatchList = [
        function verifyUserIsCustomer(cb) {
            if (req.user.utype === UTYPE.CUSTOMER) {
                console.log('User is Customer')
                cb(null);
            }
            else {
                // err: true  (String evaluates to true)
                cb('User is not a Customer')
            }
        },
        function RemoveServiceFromWatchList(cb) {
            user.findByIdAndUpdate(req.user._id, 
                { $pull: { 'watchlist.services': mongoose.Types.ObjectId(req.body.service_id)} }, {new: true})
                .populate({path: 'watchlist.services', model: 'Service'}).exec((err, user_obj) => {
                    if (err) {
                        console.log(err);
                        cb(err.message)
                    }
                    else {
                        console.log('Removed Service from Watchlist');
                        req.user.watchlist = user_obj.watchlist
                        cb(null, user_obj.watchlist.services)
                    }
                });
        },
        function decrementWatchlistedCount(services, cb) {
            service.findByIdAndUpdate(req.body.service_id, { $inc: { 'watchlisted': -1 } }, {new: true}, (err, dec_service) => {
                if(err) {
                    console.log("Error",err)
                    cb(err.message)
                } else {
                    console.log(`Removed from watchlist, service: ${dec_service.name}`)
                    cb(null, services)
                }
            })
        }
    ];

    waterfall(addToWatchList, function (err, services) {
        if (err) {
            console.log('Error in waterfall:', err);
            res.json({ 'error': true, 'message': err })
            return;
        }
        console.log('Success :', 'Removed Service from watchlist successfully');
        res.json({ 'error': false, 'message': services })
        return;
    });
});

/*------------------------------ Social Media ----------------------------*/

app.put('/socialmedia/:name', (req, res) => {

    console.log(req.body)

    // If stateless call (no session)
    if (!req.user) {
        req.user = req.body.user
    }

    let social_media_name = `social_media.${req.params.name}`

    user.findByIdAndUpdate(req.user._id, { $set: { 
            [social_media_name] : req.body.handle
        }
    }, (err, user_obj) => {
        if(err) {
            console.log(err)
            res.json({'error': true, 'message': err.message})
        } else {
            // Update session with new social media handles
            req.user.social_media = user_obj.social_media
            res.json({ 'error': false, 'message': user_obj.social_media })
        }
    });
})

/*-------------------------------- Avatar -------------------------------*/

app.put('/avatar', (req, res) => {

    console.log(req.body)

    // If stateless call (no session)
    if (!req.user) {
        req.user = req.body.user
    }

    req.body.avatar = parseInt(req.body.avatar)

    console.log(req.body.avatar)

    user.findByIdAndUpdate(req.user._id, 
        { $set: { avatar : req.body.avatar } }, 
        { new: true }, (err, user_obj) => {
        if(err) {
            console.log(err)
            res.json({'error': true, 'message': err.message})
        } else {
            // Update session with new avatar
            req.user.avatar = user_obj.avatar
            res.json({ 'error': false, 'message': user_obj.avatar })
        }
    });
})

/*-----------------------------------------------------------------------*/

app.use('/service', serviceRouter)

const PORT = process.env.PORT || 3000;

app.listen(PORT, console.log(`Server started on ${PORT}`));
