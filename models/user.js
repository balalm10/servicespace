var mongoose = require("mongoose");
var passportLocalMongoose = require("passport-local-mongoose");

var UserSchema = new mongoose.Schema({
    username: String,
    password: String,
    name: String,
    dob: Date,
    utype: {
        type: String,
        enum: ['Service Provider', 'Customer'],
        default: 'Customer'
    },
    avatar: { type: Number, default: 0 },
    spdetails : {
        type: {
            services: [{
                type:mongoose.Schema.Types.ObjectId,
                ref :"Service"
            }],
            phone: String,
            email: String
        },
        
        // Service Provider details only required if user is a service provider.
        required: function() {
            return this.utype === 'Service Provider';
        }
    },
    watchlist: {
        type: {
            services: [{
                type:mongoose.Schema.Types.ObjectId,
                ref :"Service"
            }]
        },
        
        // Watchlist feature only available to cusomers.
        required: function() {
            return this.utype === 'Customer';
        }
    },
    social_media: {
        website: String,
        facebook: String,
        twitter: String,
        linkedin: String,
        instagram: String
    }
});

UserSchema.plugin(passportLocalMongoose);

module.exports = mongoose.model("User", UserSchema);